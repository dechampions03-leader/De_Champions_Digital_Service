import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function response(status: number, body: unknown = { received: true }) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function serviceKey(): string | null {
  const legacy = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || Deno.env.get("DCDS_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    return typeof keys.default === "string" ? keys.default : null;
  } catch {
    return null;
  }
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

async function verifyProviderTransfer(id: string, secret: string) {
  const res = await fetch("https://api.flutterwave.com/v3/transfers/" + encodeURIComponent(id), {
    headers: { Authorization: "Bearer " + secret, Accept: "application/json" },
  });
  const payload = await res.json();
  if (!res.ok || payload?.status !== "success" || !payload?.data) throw new Error("Provider transfer status could not be verified.");
  return payload.data as Record<string, unknown>;
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") return response(405, { received: false });
  const secretHash = Deno.env.get("FLW_SECRET_HASH") || "";
  const signature = req.headers.get("verif-hash") || "";
  if (!secretHash || !signature || !constantTimeEqual(secretHash, signature)) {
    return response(401, { received: false });
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const elevatedKey = serviceKey();
  const flutterwaveSecret = Deno.env.get("FLW_SECRET_KEY");
  if (!supabaseUrl || !elevatedKey || !flutterwaveSecret) return response(503, { received: false });

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return response(400, { received: false });
    body = parsed as Record<string, unknown>;
  } catch {
    return response(400, { received: false });
  }

  const event = String(body.event || body["event.type"] || "").toLowerCase();
  const data = body.data && typeof body.data === "object" ? body.data as Record<string, unknown> : {};
  const transferId = String(data.id || "");
  if (!transferId || (event && !event.includes("transfer"))) return response(200);

  try {
    const db = createClient(supabaseUrl, elevatedKey, { auth: { persistSession: false, autoRefreshToken: false } });
    let query = db.from("dcds_international_payout_requests").select("*").eq("provider_transfer_id", transferId);
    let { data: request, error } = await query.maybeSingle();
    if (error) throw error;

    if (!request && data.reference) {
      const found = await db.from("dcds_international_payout_requests")
        .select("*").eq("transfer_reference", String(data.reference)).maybeSingle();
      if (found.error) throw found.error;
      request = found.data;
      if (request && ["processing","manual_review"].includes(request.status) && !request.provider_transfer_id) {
        const attached = await db.rpc("dcds_internal_transition_international_payout", {
          p_request_id: request.id,
          p_new_status: request.status,
          p_provider_transfer_id: transferId,
          p_details: { stage: "webhook_transfer_id_attached" },
        });
        if (attached.error) throw attached.error;
        request.provider_transfer_id = transferId;
      }
    }

    if (!request || !["processing","manual_review","paid","failed","cancelled"].includes(request.status)) {
      return response(200);
    }

    const providerData = await verifyProviderTransfer(transferId, flutterwaveSecret);
    const reference = String(providerData.reference || "");
    const currency = String(providerData.currency || "").toUpperCase();
    const amount = Number(providerData.amount);
    const status = String(providerData.status || "").toLowerCase();

    if (reference !== request.transfer_reference || currency !== request.destination_currency ||
        !Number.isFinite(amount) || Math.abs(amount - Number(request.destination_amount)) > 0.02) {
      await db.rpc("dcds_internal_transition_international_payout", {
        p_request_id: request.id, p_new_status: "manual_review",
        p_provider_transfer_id: transferId,
        p_failure_reason: "Webhook transfer details did not match the DCDS request.",
        p_details: { stage: "webhook_verification_mismatch", provider_reference: reference, provider_currency: currency },
      });
      return response(200);
    }

    if (["successful","success","completed"].includes(status)) {
      const result = await db.rpc("dcds_internal_transition_international_payout", {
        p_request_id: request.id, p_new_status: "paid",
        p_provider_transfer_id: transferId,
        p_details: { stage: "verified_webhook", provider_status: status },
      });
      if (result.error) throw result.error;
    } else if (["failed","reversed"].includes(status)) {
      const result = await db.rpc("dcds_internal_transition_international_payout", {
        p_request_id: request.id, p_new_status: "failed",
        p_provider_transfer_id: transferId,
        p_failure_reason: "Flutterwave webhook and transfer lookup report " + status + ".",
        p_details: { stage: "verified_webhook", provider_status: status },
      });
      if (result.error) throw result.error;
    }

    await db.from("dcds_international_payout_events").insert({
      request_id: request.id,
      user_id: request.user_id,
      event_type: "provider_webhook_received",
      provider_event_key: "flutterwave-transfer:" + transferId + ":" + status,
      details: { provider_status: status, verified: true },
    }).then(() => undefined).catch((error) => {
      console.error("DCDS international payout webhook audit insert failed:", error?.message || "Unknown error");
    });

    return response(200);
  } catch (error) {
    console.error("DCDS international payout webhook processing error:", error instanceof Error ? error.message : "Unknown error");
    // The webhook is acknowledged only after provider status verification or safe manual-review fallback.
    return response(500, { received: false });
  }
});
