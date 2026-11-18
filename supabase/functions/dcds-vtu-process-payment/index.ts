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
      recipient: String(order.recipient_phone || "").replace(/^(\d{3})\d{4}(\d{4})$/, "$1****$2"),
      plan: order.data_plan_name || null,
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
    const oplugKey = Deno.env.get("OPLUG_API_KEY") || "";
    if (!supabaseUrl || !adminSecret || !flwSecret || !oplugKey) {
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
    if (verifiedRef !== txRef || verifiedId !== transactionId || currency !== "NGN" ||
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

    // One worker wins the paid -> processing transition. Other calls can safely
    // replay the same Oplug request-id because Oplug guarantees idempotency for
    // the same request-id and same payload.
    if (current.status === "paid") {
      const { data: claimed, error: claimError } = await db.from("dcds_vtu_orders").update({
        status: "processing",
        purchase_started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }).eq("id", order.id).eq("status", "paid").select("*").maybeSingle();
      if (claimError) throw claimError;
      if (claimed) current = claimed;
      else {
        const { data: refreshed, error: refreshError } = await db.from("dcds_vtu_orders").select("*").eq("id", order.id).single();
        if (refreshError) throw refreshError;
        current = refreshed;
      }
    }
    if (current.status !== "processing") {
      return successResponse(req, current, current.status, "Your order is being checked.");
    }

    const purchasePayload: Record<string, unknown> = {
      network: Number(current.network_id),
      phone: String(current.recipient_phone),
      bypass: false,
      "request-id": String(current.oplug_request_id),
    };
    const endpoint = current.service_type === "data" ? "/data" : "/airtime";
    if (current.service_type === "data") purchasePayload.data_plan = String(current.data_plan_id);
    else {
      purchasePayload.amount = String(current.airtime_amount);
      purchasePayload.type = "VTU";
    }

    const purchaseResponse = await fetch("https://www.oplug.com.ng/api/v1" + endpoint, {
      method: "POST",
      headers: {
        Authorization: "Token " + oplugKey,
        "Content-Type": "application/json",
        Accept: "application/json",
        "Idempotency-Key": String(current.oplug_request_id),
      },
      body: JSON.stringify(purchasePayload),
      signal: AbortSignal.timeout(18000),
    }).catch(() => null);

    let providerData: Record<string, unknown> | null = purchaseResponse
      ? await purchaseResponse.json().catch(() => null)
      : null;
    let providerOutcome = resultStatus(providerData);

    if (providerData && (providerData.status === "success" ||
      ["SUCCESS", "SUCCESSFUL", "COMPLETED"].includes(providerOutcome))) {
      const { data: fulfilled, error: fulfilledError } = await db.from("dcds_vtu_orders").update({
        status: "successful",
        provider_status: providerOutcome || "SUCCESSFUL",
        provider_reference: safeText(providerData["request-id"] || providerData.reference, 120) || String(current.oplug_request_id),
        provider_response: providerData,
        fulfilled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_error: null,
      }).eq("id", current.id).eq("status", "processing").select("*").maybeSingle();
      if (fulfilledError) throw fulfilledError;
      if (fulfilled) return successResponse(req, fulfilled, "successful", "Payment confirmed. Your top-up was sent successfully.");
    }

    if (["FAILED", "FAILURE", "REJECTED"].includes(providerOutcome)) {
      const { data: refundOrder, error: refundError } = await db.from("dcds_vtu_orders").update({
        status: "refund_required",
        provider_status: providerOutcome,
        provider_response: providerData,
        last_error: "The Oplug provider did not complete the purchase after Flutterwave payment.",
        updated_at: new Date().toISOString(),
      }).eq("id", current.id).eq("status", "processing").select("*").maybeSingle();
      if (refundError) throw refundError;
      return successResponse(req, refundOrder || current, "refund_required", "Payment was received, but the network provider did not complete the top-up. DCDS support must arrange your refund.");
    }

    // Resolve timeouts or ambiguous provider responses using Oplug's transaction lookup.
    const verifyUrl = "https://www.oplug.com.ng/api/v1/verify-transaction?request-id=" + encodeURIComponent(String(current.oplug_request_id));
    const statusResponse = await fetch(verifyUrl, {
      headers: { Authorization: "Token " + oplugKey, Accept: "application/json" },
      signal: AbortSignal.timeout(12000),
    }).catch(() => null);
    const statusPayload = statusResponse ? await statusResponse.json().catch(() => null) : null;
    const oplugStatus = resultStatus(statusPayload);
    if (["SUCCESS", "SUCCESSFUL", "COMPLETED"].includes(oplugStatus)) {
      const { data: fulfilled, error: fulfilledError } = await db.from("dcds_vtu_orders").update({
        status: "successful",
        provider_status: oplugStatus,
        provider_reference: safeText(statusPayload["request-id"] || statusPayload.reference, 120) || String(current.oplug_request_id),
        provider_response: statusPayload,
        fulfilled_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        last_error: null,
      }).eq("id", current.id).eq("status", "processing").select("*").maybeSingle();
      if (fulfilledError) throw fulfilledError;
      return successResponse(req, fulfilled || current, "successful", "Payment confirmed. Your top-up was sent successfully.");
    }
    if (["FAILED", "FAILURE", "REJECTED"].includes(oplugStatus)) {
      const { data: refundOrder, error: refundError } = await db.from("dcds_vtu_orders").update({
        status: "refund_required",
        provider_status: oplugStatus,
        provider_response: statusPayload,
        last_error: "Oplug reports that the paid purchase failed.",
        updated_at: new Date().toISOString(),
      }).eq("id", current.id).eq("status", "processing").select("*").maybeSingle();
      if (refundError) throw refundError;
      return successResponse(req, refundOrder || current, "refund_required", "Payment was received, but the provider reports a failed top-up. DCDS support must arrange your refund.");
    }

    // Keep uncertain outcomes in processing. Never tell the customer to pay again.
    const { data: pending, error: pendingError } = await db.from("dcds_vtu_orders").update({
      provider_status: oplugStatus || "UNKNOWN",
      provider_response: statusPayload || providerData,
      last_error: "Provider result is not yet final; reconciliation is required.",
      updated_at: new Date().toISOString(),
    }).eq("id", current.id).eq("status", "processing").select("*").maybeSingle();
    if (pendingError) throw pendingError;
    return successResponse(req, pending || current, "processing", "Your payment is confirmed. Your top-up is still being processed—please do not pay again.");
  } catch (error) {
    console.error("DCDS VTU payment fulfilment error:", error instanceof Error ? error.message : "Unknown error");
    return reply(req, { success: false, status: "needs_review", error: "Your payment status is being checked. Do not pay again; contact DCDS support if this message remains." }, 500);
  }
});
