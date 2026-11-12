import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://dechampions03-leader.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

function respond(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return respond({ success: false, error: "Method not allowed." }, 405);

  try {
    const origin = req.headers.get("Origin");
    if (origin && origin !== "https://dechampions03-leader.github.io") {
      return respond({ success: false, error: "Origin not allowed." }, 403);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("DCDS_SERVICE_ROLE_KEY");
    const flutterwaveKey = Deno.env.get("FLW_SECRET_KEY");
    if (!supabaseUrl || !serviceKey || !flutterwaveKey) {
      return respond({ success: false, error: "Payment verification configuration is incomplete." }, 503);
    }

    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return respond({ success: false, error: "Administrator login is required." }, 401);
    }

    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const token = authorization.slice(7);
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData.user) return respond({ success: false, error: "Your login session is invalid." }, 401);

    const { data: admin, error: adminError } = await supabase
      .from("dcds_admins")
      .select("user_id")
      .eq("user_id", authData.user.id)
      .maybeSingle();
    if (adminError || !admin) return respond({ success: false, error: "Administrator access required." }, 403);

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return respond({ success: false, error: "Invalid request information." }, 400);
    }

    const orderId = String(body.order_id ?? "").trim();
    const transactionId = String(body.transaction_id ?? "").trim();
    if (!/^[0-9a-f-]{36}$/i.test(orderId) || (transactionId && !/^\d{1,30}$/.test(transactionId))) {
      return respond({ success: false, error: "Enter a valid DCDS order and, when available, a numeric Flutterwave transaction ID." }, 400);
    }

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id,user_id,course_id,amount,currency,status,tx_ref")
      .eq("id", orderId)
      .maybeSingle();
    if (orderError || !order) return respond({ success: false, error: "The selected order could not be found." }, 404);
    if (String(order.tx_ref ?? "").startsWith("DCDS-MANUAL-")) {
      return respond({ success: false, error: "This is a direct bank-transfer order. Use the manual receipt approval workflow." }, 409);
    }
    if (!["pending", "successful"].includes(String(order.status))) {
      return respond({ success: false, error: "This order is not eligible for payment verification." }, 409);
    }

    const action = String(body.action ?? "verify");
    if (action === "release_pending") {
      const confirmationNote = String(body.admin_confirmation_note ?? "").trim();
      if (confirmationNote.length < 20) {
        return respond({ success: false, error: "Add at least 20 characters explaining how you confirmed the hosted payment link is closed." }, 400);
      }
      const confirmLinkDisabled = body.confirm_link_disabled === true;
      const { data: released, error: releaseError } = await supabase.rpc("admin_release_pending_flutterwave_checkout", {
        p_order_id: order.id,
        p_admin_user_id: authData.user.id,
        p_admin_confirmation_note: confirmationNote,
        p_confirm_link_disabled: confirmLinkDisabled,
      });
      if (releaseError || !released?.success) {
        return respond({
          success: false,
          error: releaseError?.message || "The pending checkout could not be safely released.",
        }, 409);
      }
      return respond({
        success: true,
        message: "The unpaid checkout was released. The student can now start a fresh checkout.",
        order_id: order.id,
        status: "failed",
      });
    }
    if (action !== "verify") {
      return respond({ success: false, error: "Unsupported payment reconciliation action." }, 400);
    }

    const verificationUrl = transactionId
      ? `https://api.flutterwave.com/v3/transactions/${encodeURIComponent(transactionId)}/verify`
      : `https://api.flutterwave.com/v3/transactions/verify_by_reference?tx_ref=${encodeURIComponent(String(order.tx_ref))}`;
    const verificationResponse = await fetch(verificationUrl, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${flutterwaveKey}`,
        Accept: "application/json",
      },
    });
    const verification = await verificationResponse.json();
    const payment = verification?.data;

    const recordReconciliationCheck = async (
      outcome: string,
      providerStatus: string | null,
      transaction: Record<string, unknown> | null,
      providerMessage: string,
    ) => {
      const { error: auditError } = await supabase.from("dcds_payment_review_events").insert({
        order_id: order.id,
        actor_user_id: authData.user.id,
        event_type: "flutterwave_reconciliation_checked",
        details: {
          outcome,
          provider_status: providerStatus,
          transaction_id: transaction?.id == null ? null : String(transaction.id).slice(0, 40),
          provider_reference: transaction?.tx_ref == null ? null : String(transaction.tx_ref).slice(0, 120),
          provider_amount: transaction?.amount == null ? null : Number(transaction.amount),
          provider_currency: transaction?.currency == null ? null : String(transaction.currency).toUpperCase().slice(0, 3),
          provider_http_status: verificationResponse.status,
          provider_message: providerMessage.slice(0, 240),
          checked_at: new Date().toISOString(),
          lookup_method: transactionId ? "transaction_id" : "dcds_order_reference",
        },
      });
      if (auditError) {
        console.error("DCDS payment reconciliation audit write failed:", auditError.message);
        return false;
      }
      return true;
    };

    if (!verificationResponse.ok || verification?.status !== "success" || !payment) {
      const providerMessage = String(verification?.message ?? "");
      const referenceNotFound = !transactionId &&
        [400, 404].includes(verificationResponse.status) &&
        String(verification?.status ?? "").toLowerCase() === "error" &&
        /no transaction|transaction.*not found|not found.*transaction/i.test(providerMessage);
      const outcome = referenceNotFound ? "not_found" : "unconfirmed";
      const audited = await recordReconciliationCheck(
        outcome,
        String(verification?.status ?? "unknown").toLowerCase(),
        null,
        providerMessage || "Flutterwave did not return a verifiable transaction.",
      );
      if (!audited) {
        return respond({ success: false, error: "Flutterwave was checked, but DCDS could not save the reconciliation evidence. The order remains unchanged." }, 500);
      }
      return respond({
        success: false,
        outcome,
        order_unchanged: true,
        error: referenceNotFound
          ? "Flutterwave returned no transaction for this DCDS reference. The order remains pending. Check the hosted link in Flutterwave before releasing it."
          : "Flutterwave could not confirm the transaction. The order remains pending and must not be released yet.",
      }, referenceNotFound ? 404 : 502);
    }

    const verifiedTransactionId = String(payment.id ?? transactionId).trim();
    const providerStatus = String(payment.status ?? "").toLowerCase();
    const amountMatches = Number(payment.amount) === Number(order.amount);
    const currencyMatches = String(payment.currency ?? "").toUpperCase() === String(order.currency).toUpperCase();
    const referenceMatches = String(payment.tx_ref ?? "") === String(order.tx_ref ?? "");
    const idMatches = !transactionId || verifiedTransactionId === transactionId;
    const validTransactionId = /^\d{1,30}$/.test(verifiedTransactionId);
    const detailsMatch = amountMatches && currencyMatches && referenceMatches && idMatches && validTransactionId;

    if (providerStatus !== "successful" || !detailsMatch) {
      const terminalFailure = ["failed", "cancelled"].includes(providerStatus) && detailsMatch;
      const outcome = terminalFailure
        ? "failed"
        : ["pending", "processing", "initiated"].includes(providerStatus) && detailsMatch
          ? "processing"
          : "mismatch";
      const audited = await recordReconciliationCheck(
        outcome,
        providerStatus || "unknown",
        payment as Record<string, unknown>,
        String(verification?.message ?? ""),
      );
      if (!audited) {
        return respond({ success: false, error: "Flutterwave returned a result, but DCDS could not save the reconciliation evidence. The order remains unchanged." }, 500);
      }
      return respond({
        success: false,
        outcome,
        provider_status: providerStatus || "unknown",
        order_unchanged: true,
        error: terminalFailure
          ? "Flutterwave reports this transaction as failed. The order remains pending until its hosted payment link has expired or been disabled."
          : outcome === "processing"
            ? "Flutterwave reports that this transaction is still processing. Keep the order pending and check again later."
            : "The provider transaction did not match the DCDS order exactly. The order remains pending for manual investigation.",
      }, 409);
    }

    const { data: finalized, error: finalizeError } = await supabase.rpc("admin_finalize_flutterwave_payment", {
      p_order_id: order.id,
      p_admin_user_id: authData.user.id,
      p_transaction_id: verifiedTransactionId,
      p_tx_ref: String(payment.tx_ref),
      p_amount: Number(payment.amount),
      p_currency: String(payment.currency).toUpperCase(),
      p_raw_response: verification,
    });
    if (finalizeError || !finalized?.success) {
      console.error("DCDS admin payment finalization failed:", finalizeError?.message);
      return respond({ success: false, error: finalizeError?.message || "Payment was verified but could not be recorded. Contact DCDS technical support before retrying." }, 409);
    }

    return respond({
      success: true,
      message: "Flutterwave confirmed the transaction. The order and student enrolment have been updated.",
      order_id: order.id,
      transaction_id: verifiedTransactionId,
      amount: Number(payment.amount),
      currency: String(payment.currency).toUpperCase(),
    });
  } catch (error) {
    console.error("DCDS admin payment verification error:", error);
    return respond({ success: false, error: "Unable to verify this payment. Please retry or contact technical support." }, 500);
  }
});
