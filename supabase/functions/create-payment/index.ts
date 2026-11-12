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
      return respond({ success: false, error: "Payment configuration is incomplete." }, 503);
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
      return respond({ success: false, error: "Your login session is invalid." }, 401);
    }

    const user = authData.user;
    if (!user.email) return respond({ success: false, error: "Your account has no email address." }, 400);
    if (!user.email_confirmed_at && !user.phone_confirmed_at) {
      return respond({ success: false, error: "Please verify your email address or mobile number before making a payment." }, 403);
    }

    const body = await req.json();
    const courseId = body?.course_id;
    const requestedCurrency = typeof body?.currency === "string" ? body.currency.trim().toUpperCase() : "NGN";
    if (typeof courseId !== "string" || !/^[0-9a-f-]{36}$/i.test(courseId)) {
      return respond({ success: false, error: "A valid course is required." }, 400);
    }
    if (!/^[A-Z]{3}$/.test(requestedCurrency)) {
      return respond({ success: false, error: "Please select a valid payment currency." }, 400);
    }

    // The database selects the authoritative active regional price and creates
    // the order with its expiry atomically. The browser never supplies a payment amount.
    const txRef = `DCDS-${crypto.randomUUID()}`;
    const checkoutExpiresAt = new Date(Date.now() + 60 * 60 * 1000);
    const { data: checkout, error: checkoutError } = await supabase.rpc("dcds_create_checkout_order", {
      p_user_id: user.id,
      p_course_id: courseId,
      p_tx_ref: txRef,
      p_currency: requestedCurrency,
      p_checkout_expires_at: checkoutExpiresAt.toISOString(),
    });

    if (checkoutError || !checkout) {
      const message = checkoutError?.message || "Could not create your order.";
      const conflict = /already enrolled|checkout is already pending/i.test(message);
      return respond({ success: false, error: message }, conflict ? 409 : 400);
    }

    const siteUrl = "https://dechampions03-leader.github.io/De_Champions_Digital_Service";
    const flutterwaveResponse = await fetch("https://api.flutterwave.com/v3/payments", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${flutterwaveKey}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        tx_ref: checkout.tx_ref,
        amount: Number(checkout.amount),
        currency: checkout.currency || "NGN",
        redirect_url: `${siteUrl}/payment-return.html`,
        configuration: {
          session_duration: 60,
          max_retry_attempt: 3,
        },
        link_expiration: checkoutExpiresAt.toISOString(),
        customer: {
          email: user.email,
          name: user.user_metadata?.full_name || user.email,
        },
        meta: {
          order_id: checkout.id,
          course_id: courseId,
          user_id: user.id,
        },
        customizations: {
          title: "De Champions Digital Service",
          description: `Payment for ${checkout.course_title}`,
          logo: `${siteUrl}/logo.png`,
        },
      }),
    });

    const result = await flutterwaveResponse.json();
    if (!flutterwaveResponse.ok || result.status !== "success" || !result.data?.link) {
      // Mark only this order failed when Flutterwave explicitly rejects checkout creation.
      // Network ambiguity must be reconciled rather than assumed to be a definite failure.
      if (flutterwaveResponse.status >= 400 && flutterwaveResponse.status < 500) {
        await supabase.from("orders").update({ status: "failed" }).eq("id", checkout.id).eq("status", "pending");
      }
      return respond({
        success: false,
        error: result.message || "Flutterwave checkout could not be confirmed. Contact support before retrying.",
        tx_ref: checkout.tx_ref,
      }, 502);
    }

    return respond({
      success: true,
      payment_link: result.data.link,
      tx_ref: checkout.tx_ref,
    });
  } catch (error) {
    console.error("DCDS payment error:", error);
    return respond({
      success: false,
      error: "Unable to start payment. If you were charged or the page timed out, contact support before retrying.",
    }, 500);
  }
});
