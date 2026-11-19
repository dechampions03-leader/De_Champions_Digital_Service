import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { validateFlutterwaveCourseTransaction } from "../_shared/flutterwave-course-payment.ts";

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
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("DCDS_SERVICE_ROLE_KEY");
    const flutterwaveKey = Deno.env.get("FLW_SECRET_KEY");
    if (!supabaseUrl || !serviceKey || !flutterwaveKey) {
      return respond({ success: false, error: "Payment verification configuration is incomplete." }, 503);
    }

    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) {
      return respond({ success: false, error: "Please log in first." }, 401);
    }

    const token = authorization.slice(7);
    const supabase = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await supabase.auth.getUser(token);
    if (authError || !authData.user) {
      return respond({ success: false, error: "Your login session is invalid. Please sign in again." }, 401);
    }

    let body: Record<string, unknown>;
    try {
      body = await req.json();
    } catch {
      return respond({ success: false, error: "Invalid verification request." }, 400);
    }

    const transactionId = String(body.transaction_id ?? "").trim();
    const txRef = String(body.tx_ref ?? "").trim();
    if (!/^[0-9]{1,30}$/.test(transactionId) || !/^DCDS-[0-9a-f-]{36}$/i.test(txRef)) {
      return respond({ success: false, error: "Flutterwave transaction details are invalid." }, 400);
    }

    const { data: order, error: orderError } = await supabase
      .from("orders")
      .select("id,user_id,course_id,amount,currency,status,tx_ref")
      .eq("tx_ref", txRef)
      .eq("user_id", authData.user.id)
      .maybeSingle();

    if (orderError) {
      console.error("DCDS course checkout order lookup failed:", orderError.message);
      return respond({ success: false, error: "We could not locate your DCDS order. Please contact support." }, 500);
    }
    if (!order) {
      return respond({ success: false, error: "No matching DCDS order was found for this account." }, 404);
    }
    if (String(order.tx_ref || "").startsWith("DCDS-MANUAL-")) {
      return respond({ success: false, error: "This order uses the manual receipt review process." }, 409);
    }
    if (!["pending", "successful"].includes(String(order.status))) {
      return respond({ success: false, error: "This order is not eligible for payment verification." }, 409);
    }

    const providerResponse = await fetch(
      "https://api.flutterwave.com/v3/transactions/" + encodeURIComponent(transactionId) + "/verify",
      {
        method: "GET",
        headers: {
          Authorization: "Bearer " + flutterwaveKey,
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(15000),
      },
    );
    const verification = await providerResponse.json().catch(() => null);
    const transaction = verification?.data;

    if (!providerResponse.ok || verification?.status !== "success" || !transaction) {
      return respond({
        success: false,
        error: "Flutterwave has not confirmed this payment. Your order remains unchanged; do not pay again yet.",
      }, 409);
    }

    const mismatch = validateFlutterwaveCourseTransaction({
      transactionId,
      txRef: String(order.tx_ref),
      amount: Number(order.amount),
      currency: String(order.currency),
    }, transaction);

    if (mismatch) {
      console.warn("DCDS student checkout verification did not match the order.", {
        orderId: order.id,
        txRef,
        transactionId,
      });
      return respond({
        success: false,
        error: mismatch + " Your order remains unchanged. Contact DCDS support if you believe you were charged.",
      }, 409);
    }

    // Persist only the minimum provider fields needed for later reconciliation.
    // Do not retain card numbers, customer contact data or raw payment credentials.
    const safeProviderResponse = {
      status: verification.status,
      message: String(verification.message ?? "").slice(0, 180),
      data: {
        id: String(transaction.id),
        tx_ref: String(transaction.tx_ref),
        amount: Number(transaction.amount),
        currency: String(transaction.currency).toUpperCase(),
        status: String(transaction.status).toLowerCase(),
        payment_type: String(transaction.payment_type ?? "").slice(0, 40),
        created_at: String(transaction.created_at ?? "").slice(0, 40),
      },
    };

    const { data: finalized, error: finalizeError } = await supabase.rpc(
      "dcds_finalize_flutterwave_checkout",
      {
        p_order_id: order.id,
        p_user_id: authData.user.id,
        p_transaction_id: transactionId,
        p_tx_ref: String(transaction.tx_ref),
        p_amount: Number(transaction.amount),
        p_currency: String(transaction.currency).toUpperCase(),
        p_raw_response: safeProviderResponse,
      },
    );

    if (finalizeError || !finalized?.success) {
      console.error("DCDS atomic course payment finalization failed:", finalizeError?.message);
      return respond({
        success: false,
        error: "Flutterwave returned a result, but DCDS could not safely complete the order. Do not pay again; contact support.",
      }, 409);
    }

    const slug = String(finalized.learning_slug ?? "");
    const learningUrl = slug.toLowerCase() === "general-course"
      ? "general-course.html"
      : slug
        ? "learn.html?course=" + encodeURIComponent(slug)
        : "student-dashboard.html";

    return respond({
      success: true,
      order_id: order.id,
      status: "successful",
      learning_url: learningUrl,
      message: "Your payment is verified and your course access is active.",
    });
  } catch (error) {
    console.error("DCDS student payment verification failed:", error instanceof Error ? error.message : "Unknown error");
    return respond({
      success: false,
      error: "We could not complete payment verification. Do not retry payment until your order has been checked.",
    }, 500);
  }
});
