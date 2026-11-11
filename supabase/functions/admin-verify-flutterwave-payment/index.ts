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
    if (!verificationResponse.ok || verification?.status !== "success" || !payment) {
      return respond({
        success: false,
        error: transactionId
          ? "Flutterwave could not find or verify that transaction ID. No payment has been approved."
          : "Flutterwave could not find a transaction for this DCDS order reference. No payment has been approved; the order remains pending.",
      }, 404);
    }

    const verifiedTransactionId = String(payment.id ?? transactionId).trim();
    if (!/^\d{1,30}$/.test(verifiedTransactionId)) {
      return respond({ success: false, error: "Flutterwave did not return a valid transaction ID. No payment has been approved." }, 409);
    }
    const amountMatches = Number(payment.amount) === Number(order.amount);
    const currencyMatches = String(payment.currency ?? "").toUpperCase() === String(order.currency).toUpperCase();
    const referenceMatches = String(payment.tx_ref ?? "") === String(order.tx_ref ?? "");
    const idMatches = !transactionId || verifiedTransactionId === transactionId;
    if (
      String(payment.status ?? "").toLowerCase() !== "successful" ||
      !amountMatches || !currencyMatches || !referenceMatches || !idMatches
    ) {
      return respond({
        success: false,
        error: "The Flutterwave transaction is not successful or its amount, currency, reference or transaction ID does not match this DCDS order.",
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
