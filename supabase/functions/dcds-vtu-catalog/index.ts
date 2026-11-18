const corsHeaders = {
  "Access-Control-Allow-Origin": "https://dechampions03-leader.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};
const json=(body:Record<string,unknown>,status=200)=>new Response(JSON.stringify(body),{status,headers:{...corsHeaders,"Content-Type":"application/json","Cache-Control":"no-store"}});
const NETWORKS=new Set(["mtn","airtel","glo","9mobile"]);
function cleanText(value:unknown,max=90):string{return typeof value==="string"?value.replace(/[<>\u0000-\u001f]/g,"").trim().slice(0,max):"";}
Deno.serve(async(req:Request)=>{
 if(req.method==="OPTIONS")return new Response("ok",{headers:corsHeaders});
 if(req.method!=="POST")return json({success:false,error:"Method not allowed."},405);
 const origin=req.headers.get("Origin");
 if(origin&&origin!=="https://dechampions03-leader.github.io")return json({success:false,error:"Origin not allowed."},403);
 try{
  const body=await req.json().catch(()=>({}));
  if(body?.action!=="catalog")return json({success:false,error:"Unsupported catalogue action."},400);
  const key=Deno.env.get("DCDS_VTU_PROVIDER_API_KEY")||"";
  const headers=new Headers({"Accept":"application/json"});
  if(key)headers.set("Authorization","Token "+key);
  const [plansResponse,networksResponse]=await Promise.all([
   fetch("https://www.oplug.com.ng/api/v1/data_plans",{headers,signal:AbortSignal.timeout(10000)}),
   fetch("https://www.oplug.com.ng/api/v1/get-networks",{headers,signal:AbortSignal.timeout(10000)}),
  ]);
  if(!plansResponse.ok)throw new Error("The supplier plan catalogue returned HTTP "+plansResponse.status+".");
  const rawPlans=await plansResponse.json();
  const rawNetworks=networksResponse.ok?await networksResponse.json().catch(()=>null):null;
  if(String(rawPlans?.status||"").toLowerCase()!=="success"||!Array.isArray(rawPlans?.plans))throw new Error("The supplier returned an unexpected plan catalogue.");
  const plans=rawPlans.plans.slice(0,1500).map((p:Record<string,unknown>)=>{
   const network=cleanText(p.network,20).toLowerCase();
   return {id:cleanText(p.id,80),network,plan:cleanText(p.plan,100),amount:Number(p.amount),validity:cleanText(p.validity,50),days:Number(p.days)||null,type:cleanText(p.type,50)};
  }).filter((p:Record<string,unknown>)=>NETWORKS.has(String(p.network))&&p.id&&p.plan&&Number.isFinite(p.amount)&&Number(p.amount)>0);
  const airtimeDiscounts:Record<string,number>={};
  if(Array.isArray(rawNetworks?.networks))for(const n of rawNetworks.networks){
   const name=cleanText(n.name,20).toLowerCase();
   const keyName=name==="9mobile"?"9mobile":name;
   const pct=Number(String(n.airtime_discount||"").replace("%",""));
   if(NETWORKS.has(keyName)&&Number.isFinite(pct)&&pct>=0&&pct<=10)airtimeDiscounts[keyName]=pct;
  }
  return json({success:true,provider:"Oplug",plans,airtimeDiscounts,updatedAt:new Date().toISOString(),checkoutEnabled:false});
 }catch(error){
  console.error("DCDS VTU catalogue error:",error instanceof Error?error.message:"Unknown error");
  return json({success:false,error:"Live airtime and data plans are temporarily unavailable."},503);
 }
});