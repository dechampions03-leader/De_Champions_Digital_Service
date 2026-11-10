import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders={"Access-Control-Allow-Origin":"https://dechampions03-leader.github.io","Access-Control-Allow-Headers":"authorization, x-client-info, apikey, content-type","Access-Control-Allow-Methods":"POST, OPTIONS","Vary":"Origin"};
function respond(data:unknown,status=200){return new Response(JSON.stringify(data),{status,headers:{...corsHeaders,"Content-Type":"application/json","Cache-Control":"no-store"}});}
function fromHex(s:string){if(!/^[0-9a-fA-F]{64}$/.test(s))throw new Error("Encryption key is not configured.");const a=new Uint8Array(32);for(let i=0;i<32;i++)a[i]=parseInt(s.slice(i*2,i*2+2),16);return a;}
async function decryptAccount(value:string,keyHex:string){
 const raw=Uint8Array.from(atob(value),c=>c.charCodeAt(0));if(raw.length<29)throw new Error("Stored bank account ciphertext is invalid.");
 const key=await crypto.subtle.importKey("raw",fromHex(keyHex),{name:"AES-GCM"},false,["decrypt"]);
 const plain=await crypto.subtle.decrypt({name:"AES-GCM",iv:raw.slice(0,12)},key,raw.slice(12));
 return new TextDecoder().decode(plain);
}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
 if(req.method!=="POST")return respond({success:false,error:"Method not allowed."},405);
 try{
  const origin=req.headers.get("Origin");if(origin&&origin!=="https://dechampions03-leader.github.io")return respond({success:false,error:"Origin not allowed."},403);
  const url=Deno.env.get("SUPABASE_URL"),service=Deno.env.get("DCDS_SERVICE_ROLE_KEY"),flw=Deno.env.get("FLW_SECRET_KEY");
  if(!url||!service||!flw)return respond({success:false,error:"Payout processing is not configured."},503);
  const auth=req.headers.get("Authorization");if(!auth?.startsWith("Bearer "))return respond({success:false,error:"Admin sign-in required."},401);
  const db=createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}});
  const {data:authData,error:authError}=await db.auth.getUser(auth.slice(7));
  if(authError||!authData.user)return respond({success:false,error:"Invalid admin session."},401);
  const {data:admin,error:adminError}=await db.from("dcds_admins").select("user_id").eq("user_id",authData.user.id).maybeSingle();
  if(adminError||!admin)return respond({success:false,error:"Only authorized DCDS administrators can process payouts."},403);
  const body=await req.json();
  const action=String(body.action||"process");
  if(action==="list"){
    const {data:requests,error}=await db.from("dcds_payout_requests")
      .select("id,user_id,payout_account_id,amount,currency,status,transfer_reference,provider_transfer_id,failure_reason,requested_at,processed_at")
      .order("requested_at",{ascending:false}).limit(100);
    if(error)throw error;
    const accountIds=[...new Set((requests||[]).map((x:any)=>x.payout_account_id).filter(Boolean))];
    const {data:accounts,error:accountError}=accountIds.length
      ? await db.from("dcds_payout_accounts").select("id,bank_name,account_name,account_number_last4,verification_status").in("id",accountIds)
      : {data:[],error:null};
    if(accountError)throw accountError;
    const byId=new Map((accounts||[]).map((a:any)=>[a.id,a]));
    const items=(requests||[]).map((x:any)=>({...x,account:byId.get(x.payout_account_id)||null}));
    const {data:events,error:eventError}=await db.from("dcds_payout_events")
      .select("id,payout_request_id,event_type,amount,details,created_at").order("created_at",{ascending:false}).limit(250);
    if(eventError)throw eventError;
    return respond({success:true,real_payouts_enabled:Deno.env.get("DCDS_ENABLE_REAL_PAYOUTS")==="true",requests:items,events:events||[]});
  }
  if(action!=="process" && action!=="reconcile")return respond({success:false,error:"Unsupported administrator action."},400);
  if(Deno.env.get("DCDS_ENABLE_REAL_PAYOUTS")!=="true")return respond({success:false,error:"Real bank transfers are disabled. Enable only after sandbox verification and operational approval."},423);
  const key=Deno.env.get("DCDS_PAYOUT_ENCRYPTION_KEY");if(!key)return respond({success:false,error:"Payout encryption key is missing."},503);
  const requestId=String(body.request_id||"").trim();
  if(!/^[0-9a-f-]{36}$/i.test(requestId))return respond({success:false,error:"Invalid payout request ID."},400);
  const {data:r,error:re}=await db.from("dcds_payout_requests").select("id,user_id,payout_account_id,amount,currency,status,transfer_reference,provider_transfer_id").eq("id",requestId).maybeSingle();
  if(re||!r)return respond({success:false,error:"Payout request not found."},404);
  if(action==="reconcile"){
    if(r.status!=="processing" || !r.provider_transfer_id) return respond({success:false,error:"This request has no stored provider transfer ID to reconcile. Do not resend it; investigate the provider reference manually."},409);
    const verifyResponse=await fetch("https://api.flutterwave.com/v3/transfers/"+encodeURIComponent(r.provider_transfer_id),{headers:{Authorization:"Bearer "+flw,Accept:"application/json"}});
    const verified=await verifyResponse.json();
    if(!verifyResponse.ok||verified.status!=="success"||!verified.data) return respond({success:false,status:"processing",message:"Transfer status is still unavailable. The request remains locked; do not retry the transfer."},202);
    const finalStatus=String(verified.data.status||"").toLowerCase();
    if(finalStatus==="successful"||finalStatus==="success"){
      const {error}=await db.rpc("dcds_transition_payout",{p_request_id:requestId,p_new_status:"paid",p_provider_transfer_id:r.provider_transfer_id,p_actor_user_id:authData.user.id,p_details:{provider_status:finalStatus,reconciled:true}});
      if(error)throw new Error("Provider success could not be recorded locally; manual reconciliation required.");
      return respond({success:true,status:"paid",message:"Flutterwave confirms the transfer was successful."});
    }
    if(finalStatus==="failed"||finalStatus==="reversed"){
      const {error}=await db.rpc("dcds_transition_payout",{p_request_id:requestId,p_new_status:"failed",p_failure_reason:"Flutterwave reports the transfer as "+finalStatus+".",p_provider_transfer_id:r.provider_transfer_id,p_actor_user_id:authData.user.id,p_details:{provider_status:finalStatus,reconciled:true}});
      if(error)throw error;
      return respond({success:false,status:"failed",message:"Flutterwave reports that the transfer failed. Reserved rewards have been released."},502);
    }
    return respond({success:true,status:"processing",message:"Transfer remains pending at Flutterwave. No duplicate transfer was sent."},202);
  }
  if(r.status!=="requested")return respond({success:false,error:"Only a new request can be submitted. Use reconciliation for requests already processing."},409);
  const {data:a,error:ae}=await db.from("dcds_payout_accounts").select("bank_code,account_number_ciphertext,account_number_last4,verification_status").eq("id",r.payout_account_id).maybeSingle();
  if(ae||!a||a.verification_status!=="verified")return respond({success:false,error:"Verified payout account not found."},409);
  const accountNumber=await decryptAccount(a.account_number_ciphertext,key);
  if(!/^\d{10}$/.test(accountNumber)||accountNumber.slice(-4)!==a.account_number_last4)throw new Error("Decrypted bank account integrity check failed.");

  const {data:transition,error:te}=await db.rpc("dcds_transition_payout",{p_request_id:requestId,p_new_status:"processing",p_actor_user_id:authData.user.id,p_details:{stage:"transfer_submission_started"}});
  if(te||!transition?.success)return respond({success:false,error:"Could not lock this payout request for processing."},409);

  const transferResponse=await fetch("https://api.flutterwave.com/v3/transfers",{
   method:"POST",headers:{Authorization:"Bearer "+flw,"Content-Type":"application/json",Accept:"application/json"},
   body:JSON.stringify({account_bank:a.bank_code,account_number:accountNumber,amount:Number(r.amount),currency:"NGN",reference:r.transfer_reference,narration:"DCDS Ambassador Reward",debit_currency:"NGN"})
  });
  const transfer=await transferResponse.json();
  if(!transferResponse.ok||transfer.status!=="success"||!transfer.data?.id){
    await db.from("dcds_payout_events").insert({
      payout_request_id:requestId,user_id:r.user_id,event_type:"manual_review",
      amount:r.amount,currency:"NGN",actor_user_id:authData.user.id,
      details:{stage:"transfer_submission_response_uncertain",http_status:transferResponse.status,provider_status:transfer.status||"unknown"}
    });
    return respond({success:false,status:"processing",error:"Flutterwave did not provide a verifiable transfer ID. The request remains locked for manual reconciliation; rewards have not been released and the transfer will not be retried automatically."},202);
  }

  const transferId=String(transfer.data.id);
  const {error:attachError}=await db.rpc("dcds_transition_payout",{p_request_id:requestId,p_new_status:"processing",p_provider_transfer_id:transferId,p_actor_user_id:authData.user.id,p_details:{stage:"provider_transfer_id_attached"}});
  if(attachError){
    await db.from("dcds_payout_events").insert({payout_request_id:requestId,user_id:r.user_id,event_type:"manual_review",amount:r.amount,currency:"NGN",actor_user_id:authData.user.id,details:{stage:"provider_id_persistence_failed",provider_transfer_id:transferId}});
    return respond({success:false,status:"processing",message:"Flutterwave accepted the transfer, but its ID could not be saved. The request remains locked for manual reconciliation; do not retry."},202);
  }
  const verifyResponse=await fetch("https://api.flutterwave.com/v3/transfers/"+encodeURIComponent(transferId),{headers:{Authorization:"Bearer "+flw,Accept:"application/json"}});
  const verified=await verifyResponse.json();
  if(!verifyResponse.ok||verified.status!=="success"||!verified.data){
    return respond({success:false,status:"processing",message:"Flutterwave accepted the transfer, but its final status could not be confirmed. The request remains locked for reconciliation. Do not submit it again."},202);
  }
  const finalStatus=String(verified.data.status||"").toLowerCase();
  if(finalStatus==="successful"||finalStatus==="success"){
    const {error:paidError}=await db.rpc("dcds_transition_payout",{p_request_id:requestId,p_new_status:"paid",p_provider_transfer_id:transferId,p_actor_user_id:authData.user.id,p_details:{provider_status:finalStatus}});
    if(paidError)throw new Error("Transfer succeeded but local settlement update failed; reconcile by transfer reference.");
    return respond({success:true,status:"paid",message:"Flutterwave confirms the transfer was successful."});
  }
  if(finalStatus==="failed"||finalStatus==="reversed"){
    await db.rpc("dcds_transition_payout",{p_request_id:requestId,p_new_status:"failed",p_failure_reason:"Flutterwave reports the transfer as "+finalStatus+".",p_provider_transfer_id:transferId,p_actor_user_id:authData.user.id,p_details:{provider_status:finalStatus}});
    return respond({success:false,status:"failed",message:"Flutterwave reports that the transfer did not complete. Reserved rewards have been released."},502);
  }
  return respond({success:true,status:"processing",message:"Transfer is still pending at Flutterwave. It remains locked and will not be sent again automatically."},202);
 }catch(error){console.error("DCDS transfer processing error:",error);return respond({success:false,error:"Payout processing encountered an issue. Check the transfer reference before retrying."},500);}
});