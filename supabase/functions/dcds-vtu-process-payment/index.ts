import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function secretDefault(): string {
  try {
    const values = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    return typeof values.default === "string" ? values.default : "";
  } catch {
    return "";
  }
}
function adminKey(): string {
  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    Deno.env.get("DCDS_SERVICE_ROLE_KEY") ||
    secretDefault();
}
function allowedOrigin(origin: string | null): boolean {
  if (!origin) return true;
  return origin === "https://dechampions03-leader.github.io" ||
    origin === "https://dechampionsdigital.com" ||
    origin === "https://www.dechampionsdigital.com" ||
    /^https:\/\/[a-z0-9-]+\.dcds-dev-auth-preview\.pages\.dev$/i.test(origin);
}
function cors(req: Request): HeadersInit {
  const origin = req.headers.get("Origin");
  return {
    ...(origin && allowedOrigin(origin) ? { "Access-Control-Allow-Origin": origin, "Vary": "Origin" } : {}),
    "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };
}
function reply(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: cors(req) });
}
function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length || !a.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}
function safeText(value: unknown, max = 180): string {
  return typeof value === "string" ? value.replace(/[<>\u0000-\u001f]/g, "").trim().slice(0, max) : "";
}
function resultStatus(data: Record<string, unknown> | null): string {
  return safeText(data?.transaction_status || data?.status, 30).toUpperCase();
}
function successResponse(req: Request, order: Record<string, unknown>, status: string, message: string): Response {
  return reply(req, {
    success: status === "successful",
    status,
    message,
    order: {
      reference: order.tx_ref,
      service_type: order.service_type,
      network: String(order.network || "").toUpperCase(),
      recipient: (() => { const phone = String(order.recipient_phone || "").replace(/\s/g, ""); return phone.length >= 7 ? phone.slice(0, 3) + "****" + phone.slice(-3) : ""; })(),
      plan: order.data_plan_name || (order.provider_metadata && typeof order.provider_metadata === "object" ? (order.provider_metadata as Record<string, unknown>).plan_name || null : null),
      amount: order.amount,
      currency: order.currency || "NGN",
      provider_reference: order.provider_reference || null,
    },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return reply(req, { success: false, error: "POST required." }, 405);
  if (!allowedOrigin(req.headers.get("Origin"))) return reply(req, { success: false, error: "Origin not allowed." }, 403);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const adminSecret = adminKey();
    const flwSecret = Deno.env.get("FLW_SECRET_KEY") || "";
    const vtpassApiKey = Deno.env.get("VTPASS_API_KEY") || "";
    const vtpassSecretKey = Deno.env.get("VTPASS_SECRET_KEY") || "";
    if (!supabaseUrl || !adminSecret || !flwSecret || !vtpassApiKey || !vtpassSecretKey) {
      return reply(req, { success: false, error: "Airtime & Data processing is not fully configured. Please contact DCDS support." }, 503);
    }

    const authorization = req.headers.get("Authorization") || "";
    const bearer = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    const internalCall = constantTimeEqual(bearer, adminSecret);
    let callerId: string | null = null;
    const db = createClient(supabaseUrl, adminSecret, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    if (!internalCall) {
      if (!bearer) return reply(req, { success: false, error: "Sign in to view your order confirmation." }, 401);
      const { data: authData, error: authError } = await db.auth.getUser(bearer);
      if (authError || !authData.user) return reply(req, { success: false, error: "Your sign-in session has expired." }, 401);
      callerId = authData.user.id;
    }

    const body = await req.json().catch(() => null);
    const transactionId = safeText(body?.transaction_id, 100);
    const txRef = safeText(body?.tx_ref, 120);
    if (!transactionId || !txRef) return reply(req, { success: false, error: "Flutterwave transaction details are missing." }, 400);

    const { data: order, error: orderError } = await db.from("dcds_vtu_orders")
      .select("*").eq("tx_ref", txRef).maybeSingle();
    if (orderError) throw orderError;
    if (!order) return reply(req, { success: false, error: "Matching Airtime & Data order not found." }, 404);
    if (callerId && order.user_id !== callerId) return reply(req, { success: false, error: "This purchase belongs to another DCDS account." }, 403);

    if (order.status === "successful") return successResponse(req, order, "successful", "Your top-up has already been completed.");
    if (order.status === "refund_required") return successResponse(req, order, "refund_required", "Payment was received but the provider did not complete the top-up. DCDS support must arrange a refund.");
    if (order.status === "failed" || order.status === "cancelled") {
      return successResponse(req, order, order.status, "This checkout was not completed. No top-up was sent.");
    }

    // Never trust the redirect query string or webhook payload alone.
    const verifyResponse = await fetch(
      "https://api.flutterwave.com/v3/transactions/" + encodeURIComponent(transactionId) + "/verify",
      { headers: { Authorization: "Bearer " + flwSecret, Accept: "application/json" }, signal: AbortSignal.timeout(15000) },
    );
    const verification = await verifyResponse.json().catch(() => null);
    const tx = verification?.data as Record<string, unknown> | undefined;
    if (!verifyResponse.ok || verification?.status !== "success" || !tx) {
      return reply(req, { success: false, status: "pending_payment", error: "Flutterwave has not confirmed this payment yet. Do not pay again; check this order again shortly." }, 202);
    }

    const providerStatus = safeText(tx.status, 30).toLowerCase();
    const verifiedRef = safeText(tx.tx_ref, 120);
    const verifiedId = String(tx.id ?? "").trim();
    const paidAmount = Number(tx.amount);
    const currency = safeText(tx.currency, 8).toUpperCase();
    if (verifiedRef !== txRef || verifiedId !== transactionId || currency !== String(order.currency || "NGN").toUpperCase() ||
      !Number.isFinite(paidAmount) || Math.abs(paidAmount - Number(order.amount)) > 0.02) {
      await db.from("dcds_vtu_orders").update({
        status: "needs_review",
        last_error: "Flutterwave verification details did not match the VTU order.",
        flutterwave_verification: { status: providerStatus, tx_ref: verifiedRef, currency, amount: paidAmount, transaction_id: verifiedId },
        updated_at: new Date().toISOString(),
      }).eq("id", order.id).in("status", ["pending_payment", "paid", "processing"]);
      return reply(req, { success: false, status: "needs_review", error: "Payment details require a DCDS support review. No duplicate top-up will be sent." }, 409);
    }

    if (order.flutterwave_transaction_id &&
      String(order.flutterwave_transaction_id) !== verifiedId) {
      await db.from("dcds_vtu_orders").update({
        status: "needs_review",
        last_error: "A different Flutterwave transaction ID was already attached to this order.",
        updated_at: new Date().toISOString(),
      }).eq("id", order.id).in("status", ["pending_payment", "paid", "processing"]);
      return reply(req, { success: false, status: "needs_review", error: "A different payment transaction is already recorded for this order. DCDS support must review it; do not pay again." }, 409);
    }

    if (providerStatus !== "successful") {
      if (["failed", "cancelled", "canceled", "reversed"].includes(providerStatus)) {
        await db.from("dcds_vtu_orders").update({
          status: "failed",
          flutterwave_transaction_id: verifiedId,
          flutterwave_verification: { status: providerStatus, tx_ref: verifiedRef, amount: paidAmount, currency },
          last_error: "Flutterwave reports that this payment did not succeed.",
          updated_at: new Date().toISOString(),
        }).eq("id", order.id).eq("status", "pending_payment");
        return reply(req, { success: false, status: "failed", error: "Flutterwave reports that this payment did not succeed." });
      }
      return reply(req, { success: false, status: "pending_payment", error: "Flutterwave is still processing this payment. Please check again shortly." }, 202);
    }

    let current = order;
    if (order.status === "pending_payment") {
      const { data: paidOrder, error: paidError } = await db.from("dcds_vtu_orders").update({
        status: "paid",
        flutterwave_transaction_id: verifiedId,
        flutterwave_verification: { status: providerStatus, tx_ref: verifiedRef, amount: paidAmount, currency },
        paid_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_error: null,
      }).eq("id", order.id).eq("status", "pending_payment").select("*").maybeSingle();
      if (paidError) throw paidError;
      if (paidOrder) current = paidOrder;
      else {
        const { data: refreshed, error: refreshError } = await db.from("dcds_vtu_orders").select("*").eq("id", order.id).single();
        if (refreshError) throw refreshError;
        current = refreshed;
      }
    }

    if (current.status === "successful") return successResponse(req, current, "successful", "Your top-up has already been completed.");
    if (current.status === "refund_required") return successResponse(req, current, "refund_required", "A refund review is required.");
    if (current.status === "needs_review") return successResponse(req, current, "needs_review", "DCDS support is reviewing this transaction.");
    if (current.status === "failed" || current.status === "cancelled") return successResponse(req, current, current.status, "This checkout was not completed.");

    // This legacy column stores the VTpass request_id. A single paid -> processing
    // claim may submit /pay; every subsequent invocation performs /requery only.
    const DEFAULT_DATA_SERVICES: Record<string, string> = {
      mtn: "mtn-data", airtel: "airtel-data", glo: "glo-data", "9mobile": "etisalat-data", spectranet: "spectranet", smile: "smile-direct", international: "foreign-airtime",
    };
    const ALLOWED_DATA_SERVICES: Record<string, string[]> = {
      mtn: ["mtn-data"],
      airtel: ["airtel-data"],
      glo: ["glo-data", "glo-sme-data"],
      "9mobile": ["etisalat-data", "9mobile-sme-data"],
      spectranet: ["spectranet"],
      smile: ["smile-direct"],
    };
    const AIRTIME_SERVICES: Record<string, string> = {
      mtn: "mtn",
      airtel: "airtel",
      glo: "glo",
      "9mobile": "etisalat",
      international: "foreign-airtime",
    };
    const vtpassBaseValue = (Deno.env.get("VTPASS_API_BASE_URL") || "").trim();
    if (!vtpassBaseValue) {
      return reply(req, { success: false, status: "needs_review", error: "VTpass is not configured. Do not pay again; DCDS must set the explicit live provider URL and reconcile this order." }, 503);
    }
    let vtpassHost: URL;
    try {
      vtpassHost = new URL(vtpassBaseValue);
    } catch {
      return reply(req, { success: false, status: "needs_review", error: "VTpass API base URL is invalid. Do not pay again; contact DCDS support." }, 503);
    }
    if (
      vtpassHost.protocol !== "https:" ||
      !["sandbox.vtpass.com", "vtpass.com"].includes(vtpassHost.hostname) ||
      !["/api", "/api/"].includes(vtpassHost.pathname) ||
      vtpassHost.username || vtpassHost.password || vtpassHost.search || vtpassHost.hash
    ) {
      return reply(req, { success: false, status: "needs_review", error: "VTpass API base URL must be the official HTTPS /api endpoint. Do not pay again; contact DCDS support." }, 503);
    }
    const vtpassBase = vtpassHost.origin + "/api";
    const storedProviderCost = Number(current.provider_cost);
    if (!Number.isFinite(storedProviderCost) || storedProviderCost <= 0) {
      await db.from("dcds_vtu_orders").update({
        status: "needs_review",
        last_error: "Stored VTpass provider cost is missing or invalid.",
        updated_at: new Date().toISOString(),
      }).eq("id", current.id).in("status", ["paid", "processing"]);
      return reply(req, { success: false, status: "needs_review", error: "The provider charge requires support review. Do not pay again." }, 409);
    }

    const providerCostNgn = Number(current.provider_cost);
    if (!Number.isFinite(providerCostNgn) || providerCostNgn <= 0 ||
      String(current.provider_cost_currency || "NGN").toUpperCase() !== "NGN") {
      await db.from("dcds_vtu_orders").update({
        status: "needs_review",
        last_error: "Stored VTpass NGN provider cost is missing or invalid.",
        updated_at: new Date().toISOString(),
      }).eq("id", current.id).in("status", ["paid", "processing"]);
      return reply(req, { success: false, status: "needs_review", error: "The provider charge requires support review. Do not pay again." }, 409);
    }

    const requestId = String(current.oplug_request_id || "");
    if (!/^\d{12}[A-Za-z0-9]+$/.test(requestId)) {
      await db.from("dcds_vtu_orders").update({
        status: "needs_review",
        last_error: "Stored VTpass request ID is not in the required format.",
        updated_at: new Date().toISOString(),
      }).eq("id", current.id).in("status", ["paid", "processing"]);
      return reply(req, { success: false, status: "needs_review", error: "The transaction reference requires support review. Do not pay again." }, 409);
    }

    let shouldSubmitPurchase = false;
    if (current.status === "paid") {
      const { data: claimed, error: claimError } = await db.from("dcds_vtu_orders").update({
        status: "processing",
        purchase_started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", current.id).eq("status", "paid").select("*").maybeSingle();
      if (claimError) throw claimError;
      if (claimed) {
        current = claimed;
        shouldSubmitPurchase = true;
      } else {
        const { data: refreshed, error: refreshError } = await db.from("dcds_vtu_orders").select("*").eq("id", current.id).single();
        if (refreshError) throw refreshError;
        current = refreshed;
      }
    }
    if (current.status === "successful") return successResponse(req, current, "successful", "Your top-up has already been completed.");
    if (current.status === "refund_required") return successResponse(req, current, "refund_required", "Payment was received but VTpass did not complete the top-up. DCDS support must arrange your refund.");
    if (current.status === "needs_review") return successResponse(req, current, "needs_review", "DCDS support is reviewing this transaction.");
    if (current.status === "failed" || current.status === "cancelled") return successResponse(req, current, current.status, "This checkout was not completed.");
    if (current.status !== "processing") return successResponse(req, current, current.status, "Your order is being checked.");

    const postHeaders: HeadersInit = current.network === "smile"
      ? (() => {
          const email = Deno.env.get("VTPASS_EMAIL") || "";
          const password = Deno.env.get("VTPASS_PASSWORD") || "";
          if (!email || !password) throw new Error("VTpass Smile Basic Authentication credentials are not configured.");
          return { Authorization: "Basic " + btoa(email + ":" + password), "Content-Type": "application/json", Accept: "application/json" };
        })()
      : {
          "api-key": vtpassApiKey,
          "secret-key": vtpassSecretKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        };
    const storedPlanId = String(current.data_plan_id || "");
    const [storedServiceID, storedVariationCode] = storedPlanId.includes("::")
      ? storedPlanId.split("::", 2)
      : [DEFAULT_DATA_SERVICES[String(current.network)] || "", storedPlanId];
    const serviceID = current.service_type === "data" ? storedServiceID : AIRTIME_SERVICES[String(current.network)];
    if (!serviceID || (current.service_type === "data" && !ALLOWED_DATA_SERVICES[String(current.network)]?.includes(serviceID))) {
      throw new Error("Unsupported VTpass service for this purchase.");
    }

    let providerResponse: Response | null = null;
    let providerData: Record<string, unknown> | null = null;
    if (shouldSubmitPurchase) {
      const payload: Record<string, unknown> = {
        request_id: requestId,
        serviceID,
        phone: String(current.recipient_phone),
        // VTpass is priced and settled in NGN. Never send the customer's
        // Flutterwave display/checkout amount to the provider.
        amount: Number(current.provider_cost),
      };
      if (current.service_type === "data") {
        payload.billersCode = current.network === "smile"
          ? String(current.provider_billers_code || "")
          : String(current.recipient_phone);
        payload.variation_code = storedVariationCode;
      } else if (current.network === "international") {
        const meta = (current.provider_metadata || {}) as Record<string, unknown>;
        payload.billersCode = String(current.recipient_phone);
        payload.variation_code = String(meta.variation_code || "");
        payload.operator_id = String(meta.operator_id || "");
        payload.country_code = String(meta.country_code || "");
        payload.product_type_id = String(meta.product_type_id || "");
        payload.email = String(current.provider_email || "");
        payload.phone = String(meta.customer_phone || "");
      }
      providerResponse = await fetch(vtpassBase + "/pay", {
        method: "POST",
        headers: postHeaders,
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(20000),
      }).catch(() => null);
      providerData = providerResponse ? await providerResponse.json().catch(() => null) : null;
    } else {
      // Never submit /pay a second time after the first request may have reached VTpass.
      providerResponse = await fetch(vtpassBase + "/requery", {
        method: "POST",
        headers: postHeaders,
        body: JSON.stringify({ request_id: requestId }),
        signal: AbortSignal.timeout(15000),
      }).catch(() => null);
      providerData = providerResponse ? await providerResponse.json().catch(() => null) : null;
    }

    const providerCode = safeText(providerData?.code, 8);
    const txContent = providerData?.content && typeof providerData.content === "object"
      ? (providerData.content as Record<string, unknown>).transactions as Record<string, unknown> | undefined
      : undefined;
    const transactionStatus = safeText(txContent?.status, 30).toLowerCase();
    const transactionReference = safeText(String(txContent?.transactionId || providerData?.requestId || ""), 120) || requestId;
    // Only VTpass's documented terminal purchase outcomes trigger the refund-review path.
    // Other codes and unclear outcomes remain pending for requery/support review.
    // Terminal VTpass purchase failures require refund handling after customer payment.
    const explicitFailureCodes = new Set(["010", "011", "012", "013", "016", "017", "018", "023", "027", "028", "034", "035", "040", "091"]);
    const updateFields = {
      provider_status: providerCode + (transactionStatus ? ":" + transactionStatus : ""),
      provider_reference: transactionReference,
      provider_response: providerData || { http_status: providerResponse?.status || null, response_received: false },
      updated_at: new Date().toISOString(),
    };

    if (providerData && ["000", "001"].includes(providerCode) && transactionStatus === "delivered") {
      const { data: fulfilled, error: fulfilledError } = await db.from("dcds_vtu_orders").update({
        ...updateFields,
        status: "successful",
        fulfilled_at: new Date().toISOString(),
        last_error: null,
      }).eq("id", current.id).eq("status", "processing").select("*").maybeSingle();
      if (fulfilledError) throw fulfilledError;
      return successResponse(req, fulfilled || current, "successful", "Payment confirmed. VTpass reports that your top-up was delivered.");
    }

    if (providerCode && explicitFailureCodes.has(providerCode)) {
      const { data: refundOrder, error: refundError } = await db.from("dcds_vtu_orders").update({
        ...updateFields,
        status: "refund_required",
        last_error: "VTpass returned a terminal purchase failure (code " + providerCode + "). Customer payment is confirmed; DCDS support must arrange a refund.",
      }).eq("id", current.id).eq("status", "processing").select("*").maybeSingle();
      if (refundError) throw refundError;
      return successResponse(req, refundOrder || current, "refund_required", "Payment was received, but VTpass did not complete the top-up. DCDS support must arrange your refund.");
    }

    const { data: pending, error: pendingError } = await db.from("dcds_vtu_orders").update({
      ...updateFields,
      status: "processing",
      last_error: providerCode === "044"
        ? "VTpass reports this request is resolved and requires supplier/support clarification."
        : "VTpass has not confirmed delivery yet. Retries use requery only and never submit another purchase.",
    }).eq("id", current.id).eq("status", "processing").select("*").maybeSingle();
    if (pendingError) throw pendingError;
    if (providerCode === "044") {
      await db.from("dcds_vtu_orders").update({
        status: "needs_review",
        last_error: "VTpass reports transaction resolved; manual supplier clarification is required.",
        updated_at: new Date().toISOString(),
      }).eq("id", current.id).eq("status", "processing");
      return successResponse(req, pending || current, "needs_review", "VTpass has marked this transaction resolved. DCDS support is reviewing it; please do not pay again.");
    }
    return successResponse(req, pending || current, "processing", "Your payment is confirmed. VTpass has not confirmed delivery yet. Please do not pay again; DCDS will recheck this same transaction.");

  } catch (error) {
    console.error("DCDS VTU payment fulfilment error:", error instanceof Error ? error.message : "Unknown error");
    return reply(req, { success: false, status: "needs_review", error: "Your payment status is being checked. Do not pay again; contact DCDS support if this message remains." }, 500);
  }
});
