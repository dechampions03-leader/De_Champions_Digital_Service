import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://dechampions03-leader.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

function respond(data: unknown, status: number = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function envTrue(name: string): boolean {
  return Deno.env.get(name) === "true";
}

function getReadiness() {
  const checks = {
    providerSecretConfigured: Boolean(Deno.env.get("FLW_SECRET_KEY")),
    payoutEncryptionKeyConfigured: Boolean(Deno.env.get("DCDS_PAYOUT_ENCRYPTION_KEY")),
    merchantKycApproved: envTrue("DCDS_FLW_INTL_KYC_APPROVED"),
    transfersApiEnabled: envTrue("DCDS_FLW_TRANSFER_API_ENABLED"),
    serverIpWhitelisted: envTrue("DCDS_FLW_IP_WHITELISTED"),
    destinationWalletsFunded: envTrue("DCDS_FLW_DESTINATION_WALLETS_FUNDED"),
    sandboxVerified: envTrue("DCDS_INTL_SANDBOX_VERIFIED"),
    liveTransferVerified: envTrue("DCDS_INTL_LIVE_TRANSFER_VERIFIED"),
    globalSwitchEnabled: envTrue("DCDS_INTL_PAYOUTS_ENABLED"),
  };
  return { checks, ready: Object.values(checks).every(Boolean) };
}

function decodeHex(value: string): ArrayBuffer {
  const normalized = String(value || "").replace(/\s/g, "");
  if (!/^[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new Error("Payout encryption key is not configured.");
  }
  const buffer = new ArrayBuffer(32);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < 32; i++) bytes[i] = parseInt(normalized.slice(i * 2, i * 2 + 2), 16);
  return buffer;
}

async function encryptPayload(value: Record<string, string>, keyHex: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", decodeHex(keyHex), { name: "AES-GCM" }, false, ["encrypt"]);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(JSON.stringify(value));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext);
  const combined = new Uint8Array(iv.length + encrypted.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(encrypted), iv.length);
  return btoa(String.fromCharCode(...combined));
}

function sanitizeFieldValue(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const clean = String(value).trim();
  if (!clean || clean.length > 300) return null;
  return clean;
}

async function isAdmin(db: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await db.from("dcds_admins").select("user_id").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return Boolean(data);
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
    if (!supabaseUrl || !serviceKey) {
      return respond({ success: false, error: "International payout service is not configured." }, 503);
    }

    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return respond({ success: false, error: "Please log in first." }, 401);

    const db = createClient(supabaseUrl, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await db.auth.getUser(authorization.slice(7));
    if (authError || !authData.user) return respond({ success: false, error: "Your login session is invalid." }, 401);

    let body: Record<string, unknown>;
    try { body = await req.json(); } catch { return respond({ success: false, error: "Invalid request." }, 400); }
    const action = String(body.action || "");
    const readiness = getReadiness();

    if (action === "readiness") {
      if (!(await isAdmin(db, authData.user.id))) return respond({ success: false, error: "Administrator access required." }, 403);
      const { data: routes, error } = await db.from("dcds_international_payout_routes")
        .select("id,route_code,country_code,country_name,currency,payout_method,status,provider_approved,sandbox_verified_at,live_verified_at,enabled_at,internal_notes")
        .order("country_name", { ascending: true });
      if (error) throw error;
      const { count: beneficiaryCount, error: countError } = await db.from("dcds_international_payout_accounts")
        .select("id", { count: "exact", head: true });
      if (countError) throw countError;
      return respond({
        success: true,
        enabled: readiness.ready,
        readiness: readiness.checks,
        ready: readiness.ready,
        beneficiaryCount: beneficiaryCount || 0,
        routes: routes || [],
        message: readiness.ready
          ? "Provider configuration gates are satisfied. Individual corridors still require an enabled route record."
          : "International transfers remain disabled. Complete every provider, compliance, funding and verification gate before activating a route.",
      });
    }

    if (action === "routes") {
      if (!readiness.ready) return respond({ success: true, enabled: false, routes: [], message: "International withdrawals are not enabled yet." });
      const { data: routes, error } = await db.from("dcds_international_payout_routes")
        .select("id,route_code,country_code,country_name,currency,payout_method,required_fields,optional_fields")
        .eq("status", "enabled").order("country_name", { ascending: true });
      if (error) throw error;
      return respond({ success: true, enabled: Boolean(routes?.length), routes: routes || [] });
    }

    if (action === "get_accounts") {
      const { data: accounts, error } = await db.from("dcds_international_payout_accounts")
        .select("id,route_id,beneficiary_name,account_hint_last4,verification_status,verified_at,created_at")
        .eq("user_id", authData.user.id).order("created_at", { ascending: false });
      if (error) throw error;
      const routeIds = [...new Set((accounts || []).map((item) => item.route_id))];
      const { data: routes, error: routeError } = routeIds.length
        ? await db.from("dcds_international_payout_routes").select("id,country_name,currency,payout_method").in("id", routeIds)
        : { data: [], error: null };
      if (routeError) throw routeError;
      const byId = new Map((routes || []).map((route) => [route.id, route]));
      return respond({ success: true, accounts: (accounts || []).map((item) => ({ ...item, route: byId.get(item.route_id) || null })) });
    }

    if (action === "save_account") {
      if (!readiness.ready) return respond({ success: false, error: "International beneficiary setup is not enabled yet." }, 423);
      const routeId = String(body.route_id || "");
      if (!/^[0-9a-f-]{36}$/i.test(routeId)) return respond({ success: false, error: "Select a valid payout route." }, 400);
      const { data: route, error: routeError } = await db.from("dcds_international_payout_routes")
        .select("id,status,required_fields,optional_fields").eq("id", routeId).maybeSingle();
      if (routeError) throw routeError;
      if (!route || route.status !== "enabled") return respond({ success: false, error: "This international route is not currently available." }, 409);

      const { data: ambassador, error: ambassadorError } = await db.from("dcds_ambassadors")
        .select("status").eq("user_id", authData.user.id).maybeSingle();
      if (ambassadorError) throw ambassadorError;
      if (!ambassador || ambassador.status !== "active") return respond({ success: false, error: "Active ambassador status is required." }, 403);

      const source = body.beneficiary_data && typeof body.beneficiary_data === "object" && !Array.isArray(body.beneficiary_data)
        ? body.beneficiary_data : null;
      if (!source) return respond({ success: false, error: "Enter the required beneficiary details." }, 400);
      const required = Array.isArray(route.required_fields) ? route.required_fields : [];
      const optional = Array.isArray(route.optional_fields) ? route.optional_fields : [];
      const allowed = new Set(["beneficiary_name", ...required, ...optional]);
      const data: Record<string, string> = {};
      for (const [key, value] of Object.entries(source)) {
        if (!allowed.has(key)) return respond({ success: false, error: "An unsupported beneficiary field was supplied." }, 400);
        const clean = sanitizeFieldValue(value);
        if (!clean) return respond({ success: false, error: "One of the beneficiary fields is invalid." }, 400);
        data[key] = clean;
      }
      for (const key of required) {
        if (key !== "beneficiary_name" && !data[key]) return respond({ success: false, error: "Complete all required bank details." }, 400);
      }
      const beneficiaryName = sanitizeFieldValue(data.beneficiary_name || body.beneficiary_name);
      if (!beneficiaryName) return respond({ success: false, error: "Enter the beneficiary's full name." }, 400);
      data.beneficiary_name = beneficiaryName;
      const identifier = data.account_number || data.iban || data.mobile_number || data.wallet_number;
      if (!identifier || identifier.length < 4) return respond({ success: false, error: "A valid destination account identifier is required." }, 400);

      const encryptionKey = Deno.env.get("DCDS_PAYOUT_ENCRYPTION_KEY");
      if (!encryptionKey) return respond({ success: false, error: "Secure beneficiary storage is not configured." }, 503);
      const ciphertext = await encryptPayload(data, encryptionKey);
      const { data: saved, error: saveError } = await db.from("dcds_international_payout_accounts")
        .upsert({
          user_id: authData.user.id,
          route_id: routeId,
          beneficiary_name: beneficiaryName,
          beneficiary_data_ciphertext: ciphertext,
          account_hint_last4: identifier.slice(-4),
          verification_status: "pending",
          verified_at: null,
          provider_beneficiary_id: null,
          verification_note: "Awaiting country-specific provider beneficiary verification.",
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id,route_id" })
        .select("id,route_id,beneficiary_name,account_hint_last4,verification_status,created_at,updated_at")
        .single();
      if (saveError) throw saveError;
      return respond({
        success: true,
        account: saved,
        message: "Beneficiary details were encrypted and saved. They are pending provider verification; no payout has been requested or sent.",
      });
    }

    return respond({ success: false, error: "Unsupported action." }, 400);
  } catch (error: unknown) {
    console.error("DCDS international payout service error:", error instanceof Error ? error.message : "Unknown error");
    return respond({ success: false, error: "The international payout request could not be completed. Please try again later." }, 500);
  }
});
