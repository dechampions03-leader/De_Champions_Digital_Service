import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "https://dechampions03-leader.github.io",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Vary": "Origin",
};

type JsonObject = Record<string, unknown>;
type PayoutRoute = {
  id: string;
  route_code: string;
  country_code: string;
  country_name: string;
  currency: string;
  status: string;
  required_fields: string[];
  optional_fields: string[];
  route_config: JsonObject;
  internal_notes?: string | null;
};
type PayoutRequest = {
  id: string;
  user_id: string;
  payout_account_id: string;
  source_amount_ngn: number;
  destination_amount: number;
  destination_currency: string;
  fx_rate: number;
  provider_fee_amount: number;
  provider_fee_currency: string;
  status: string;
  transfer_reference: string;
  provider_transfer_id: string | null;
  failure_reason: string | null;
};

function respond(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}

function envTrue(name: string): boolean {
  return Deno.env.get(name) === "true";
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

function getReadiness() {
  const checks = {
    providerSecretConfigured: Boolean(Deno.env.get("FLW_SECRET_KEY")),
    payoutEncryptionKeyConfigured: Boolean(Deno.env.get("DCDS_PAYOUT_ENCRYPTION_KEY")),
    serviceRoleConfigured: Boolean(serviceKey()),
    merchantKycApproved: envTrue("DCDS_FLW_INTL_KYC_APPROVED"),
    transfersApiEnabled: envTrue("DCDS_FLW_TRANSFER_API_ENABLED"),
    serverIpWhitelisted: envTrue("DCDS_FLW_IP_WHITELISTED"),
    destinationWalletsFunded: envTrue("DCDS_FLW_DESTINATION_WALLETS_FUNDED"),
    sandboxVerified: envTrue("DCDS_INTL_SANDBOX_VERIFIED"),
    liveTransferVerified: envTrue("DCDS_INTL_LIVE_TRANSFER_VERIFIED"),
    webhookConfigured: Boolean(Deno.env.get("FLW_SECRET_HASH")),
    globalSwitchEnabled: envTrue("DCDS_INTL_PAYOUTS_ENABLED"),
  };
  return { checks, ready: Object.values(checks).every(Boolean) };
}

function decodeHex(value: string): ArrayBuffer {
  const normalized = String(value || "").replace(/\s/g, "");
  if (!/^[0-9a-fA-F]{64}$/.test(normalized)) throw new Error("Payout encryption key is not configured.");
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

async function decryptPayload(value: string, keyHex: string): Promise<Record<string, string>> {
  const raw = Uint8Array.from(atob(value), c => c.charCodeAt(0));
  if (raw.length < 29) throw new Error("Stored beneficiary ciphertext is invalid.");
  const key = await crypto.subtle.importKey("raw", decodeHex(keyHex), { name: "AES-GCM" }, false, ["decrypt"]);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv: raw.slice(0, 12) }, key, raw.slice(12));
  const parsed = JSON.parse(new TextDecoder().decode(plain));
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Stored beneficiary payload is invalid.");
  return parsed as Record<string, string>;
}

function cleanText(value: unknown, max = 300): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const clean = String(value).trim();
  if (!clean || clean.length > max || /[\u0000-\u001f\u007f]/.test(clean)) return null;
  return clean;
}

function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function safeAmount(value: unknown): number | null {
  const amount = Number(value);
  // Flutterwave's cross-border transfer API documents destination amount as an integer.
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 100000000) return null;
  return amount;
}

async function isAdmin(db: SupabaseClient, userId: string): Promise<boolean> {
  const { data, error } = await db.from("dcds_admins").select("user_id").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  return Boolean(data);
}

function requireFlutterwaveSecret(): string {
  const secret = Deno.env.get("FLW_SECRET_KEY");
  if (!secret) throw new Error("Flutterwave transfer API is not configured.");
  return secret;
}

async function flutterwave(path: string, method = "GET", body?: JsonObject) {
  const response = await fetch("https://api.flutterwave.com/v3" + path, {
    method,
    headers: {
      Authorization: "Bearer " + requireFlutterwaveSecret(),
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let payload: JsonObject;
  try {
    payload = await response.json() as JsonObject;
  } catch {
    throw new Error("Flutterwave returned an unreadable response.");
  }
  if (!response.ok) {
    const message = cleanText(payload.message, 250) || "Flutterwave did not accept the request.";
    throw new Error(message);
  }
  return payload;
}

async function getUserBalance(db: SupabaseClient, userId: string) {
  const { data: rows, error } = await db.from("dcds_reward_ledger")
    .select("id,amount,status,payout_request_id")
    .eq("ambassador_user_id", userId)
    .eq("currency", "NGN")
    .in("status", ["available", "held"]);
  if (error) throw error;
  const ids = (rows || []).map((row: any) => row.id);
  const { data: allocations, error: allocationError } = ids.length
    ? await db.from("dcds_international_payout_allocations")
      .select("reward_ledger_id,amount_ngn,status").in("reward_ledger_id", ids)
    : { data: [], error: null };
  if (allocationError) throw allocationError;

  const paid = new Map<string, number>();
  let reservedInternational = 0;
  for (const allocation of allocations || []) {
    if (allocation.status === "paid") {
      paid.set(allocation.reward_ledger_id, (paid.get(allocation.reward_ledger_id) || 0) + Number(allocation.amount_ngn));
    } else if (allocation.status === "reserved") {
      reservedInternational += Number(allocation.amount_ngn);
    }
  }
  let available = 0;
  let reservedLocal = 0;
  for (const row of rows || []) {
    if (row.status === "available" && !row.payout_request_id) {
      available += Math.max(Number(row.amount) - (paid.get(row.id) || 0), 0);
    } else if (row.status === "held" && row.payout_request_id) {
      reservedLocal += Math.max(Number(row.amount) - (paid.get(row.id) || 0), 0);
    }
  }
  return {
    available_ngn: roundMoney(available),
    reserved_international_ngn: roundMoney(reservedInternational),
    reserved_local_ngn: roundMoney(reservedLocal),
  };
}

async function getOwnedAmbassador(db: SupabaseClient, userId: string) {
  const { data, error } = await db.from("dcds_ambassadors")
    .select("user_id,status,referral_code").eq("user_id", userId).maybeSingle();
  if (error) throw error;
  if (!data || data.status !== "active") throw new Error("Active ambassador status is required.");
  return data;
}

async function getRoute(db: SupabaseClient, routeId: string, requireEnabled = true): Promise<PayoutRoute> {
  if (!/^[0-9a-f-]{36}$/i.test(routeId)) throw new Error("Select a valid payout corridor.");
  const { data, error } = await db.from("dcds_international_payout_routes")
    .select("id,route_code,country_code,country_name,currency,status,required_fields,optional_fields,route_config,internal_notes")
    .eq("id", routeId).maybeSingle();
  if (error) throw error;
  if (!data || (requireEnabled && data.status !== "enabled")) throw new Error("This international payout corridor is not currently enabled.");
  return data as PayoutRoute;
}

function providerStatus(payload: JsonObject): string {
  const data = payload.data && typeof payload.data === "object" ? payload.data as JsonObject : {};
  return String(data.status || "").toLowerCase();
}

function transferData(payload: JsonObject): JsonObject {
  return payload.data && typeof payload.data === "object" ? payload.data as JsonObject : {};
}

function sameAmount(a: unknown, b: number): boolean {
  const n = Number(a);
  return Number.isFinite(n) && Math.abs(n - b) <= 0.02;
}

async function applyVerifiedTransfer(
  db: SupabaseClient,
  request: PayoutRequest,
  payload: JsonObject,
  actorUserId: string | null,
) {
  const data = transferData(payload);
  const transferId = String(data.id || request.provider_transfer_id || "");
  const reference = String(data.reference || "");
  const currency = String(data.currency || "").toUpperCase();
  const status = providerStatus(payload);
  if (!transferId || (request.provider_transfer_id && transferId !== request.provider_transfer_id)) {
    await db.rpc("dcds_internal_transition_international_payout", {
      p_request_id: request.id, p_new_status: "manual_review",
      p_actor_user_id: actorUserId, p_failure_reason: "Provider transfer identity could not be confirmed.",
      p_details: { stage: "transfer_identity_mismatch" },
    });
    return { success: false, status: "manual_review", message: "Transfer identity could not be confirmed. Rewards remain reserved for manual review." };
  }
  if (reference !== request.transfer_reference || currency !== request.destination_currency ||
      !sameAmount(data.amount, Number(request.destination_amount))) {
    await db.rpc("dcds_internal_transition_international_payout", {
      p_request_id: request.id, p_new_status: "manual_review", p_provider_transfer_id: transferId,
      p_actor_user_id: actorUserId, p_failure_reason: "Provider transfer details do not match the DCDS withdrawal request.",
      p_details: { stage: "transfer_details_mismatch", provider_reference: reference, provider_currency: currency },
    });
    return { success: false, status: "manual_review", message: "Transfer details did not match the request. Rewards remain reserved for manual review." };
  }

  if (["successful", "success", "completed"].includes(status)) {
    const { error } = await db.rpc("dcds_internal_transition_international_payout", {
      p_request_id: request.id, p_new_status: "paid", p_provider_transfer_id: transferId,
      p_actor_user_id: actorUserId, p_details: {
        provider_status: status, provider_fee: data.fee ?? null, verified_from_provider: true,
      },
    });
    if (error) throw error;
    return { success: true, status: "paid", message: "Flutterwave confirms the international transfer was successful." };
  }
  if (["failed", "reversed"].includes(status)) {
    const { error } = await db.rpc("dcds_internal_transition_international_payout", {
      p_request_id: request.id, p_new_status: "failed", p_provider_transfer_id: transferId,
      p_actor_user_id: actorUserId, p_failure_reason: "Flutterwave reports the transfer as " + status + ".",
      p_details: { provider_status: status, verified_from_provider: true },
    });
    if (error) throw error;
    return { success: false, status: "failed", message: "Flutterwave reports that the transfer failed. Reserved rewards have been released." };
  }
  if (request.status === "manual_review") {
    return { success: false, status: "manual_review", message: "The transfer is still pending. No repeat transfer has been sent." };
  }
  return { success: true, status: "processing", message: "The transfer is still pending at Flutterwave. It remains locked and will not be sent again." };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return respond({ success: false, error: "Method not allowed." }, 405);

  try {
    const origin = req.headers.get("Origin");
    if (origin && origin !== "https://dechampions03-leader.github.io") return respond({ success: false, error: "Origin not allowed." }, 403);

    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const elevatedKey = serviceKey();
    if (!supabaseUrl || !elevatedKey) return respond({ success: false, error: "International payout service is not configured." }, 503);

    const authorization = req.headers.get("Authorization");
    if (!authorization?.startsWith("Bearer ")) return respond({ success: false, error: "Please log in first." }, 401);
    const db = createClient(supabaseUrl, elevatedKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: authData, error: authError } = await db.auth.getUser(authorization.slice(7));
    if (authError || !authData.user) return respond({ success: false, error: "Your login session is invalid." }, 401);
    const userId = authData.user.id;

    let body: Record<string, unknown>;
    try {
      const parsed = await req.json();
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return respond({ success: false, error: "Invalid request." }, 400);
      body = parsed as Record<string, unknown>;
    } catch {
      return respond({ success: false, error: "Invalid request." }, 400);
    }

    const action = String(body.action || "");
    const readiness = getReadiness();
    const admin = await isAdmin(db, userId);

    if (action === "readiness") {
      if (!admin) return respond({ success: false, error: "Administrator access required." }, 403);
      const { data: routes, error } = await db.from("dcds_international_payout_routes")
        .select("id,route_code,country_code,country_name,currency,payout_method,status,provider_approved,sandbox_verified_at,live_verified_at,enabled_at,internal_notes,required_fields,route_config")
        .order("country_name", { ascending: true });
      if (error) throw error;
      const { count: beneficiaryCount, error: countError } = await db.from("dcds_international_payout_accounts")
        .select("id", { count: "exact", head: true });
      if (countError) throw countError;
      const { data: requests, error: requestError } = await db.from("dcds_international_payout_requests")
        .select("id,user_id,payout_account_id,source_amount_ngn,destination_amount,destination_currency,fx_rate,provider_fee_amount,provider_fee_currency,status,transfer_reference,provider_transfer_id,failure_reason,requested_at,processed_at")
        .order("requested_at", { ascending: false }).limit(100);
      if (requestError) throw requestError;
      const accountIds = [...new Set((requests || []).map((item: any) => item.payout_account_id))];
      const { data: accounts, error: accountError } = accountIds.length
        ? await db.from("dcds_international_payout_accounts")
          .select("id,route_id,beneficiary_name,account_hint_last4,verification_status")
          .in("id", accountIds)
        : { data: [], error: null };
      if (accountError) throw accountError;
      const routeIds = [...new Set((routes || []).map((route: any) => route.id))];
      const routeMap = new Map((routes || []).map((route: any) => [route.id, route]));
      const accountMap = new Map((accounts || []).map((account: any) => [account.id, account]));
      return respond({
        success: true, enabled: readiness.ready, readiness: readiness.checks,
        ready: readiness.ready, beneficiaryCount: beneficiaryCount || 0,
        routes: routes || [],
        requests: (requests || []).map((item: any) => ({
          ...item,
          account: accountMap.get(item.payout_account_id) || null,
          route: routeMap.get((accountMap.get(item.payout_account_id) || {}).route_id) || null,
        })),
        message: readiness.ready
          ? "Provider readiness flags are present. Each destination still requires its own approval, sandbox and live verification."
          : "International withdrawals are disabled. Complete all provider, compliance, wallet funding, encryption, webhook and live-verification gates before enabling any corridor.",
      });
    }

    if (action === "routes") {
      if (!readiness.ready) return respond({ success: true, enabled: false, routes: [], message: "International withdrawals are not enabled yet." });
      const { data: routes, error } = await db.from("dcds_international_payout_routes")
        .select("id,route_code,country_code,country_name,currency,payout_method,required_fields,optional_fields,route_config")
        .eq("status", "enabled").order("country_name", { ascending: true });
      if (error) throw error;
      return respond({ success: true, enabled: Boolean(routes?.length), routes: routes || [] });
    }

    if (action === "balance") {
      const balance = await getUserBalance(db, userId);
      return respond({ success: true, balance });
    }

    if (action === "get_accounts") {
      const { data: accounts, error } = await db.from("dcds_international_payout_accounts")
        .select("id,route_id,beneficiary_name,account_hint_last4,verification_status,verified_at,verification_note,created_at")
        .eq("user_id", userId).order("created_at", { ascending: false });
      if (error) throw error;
      const routeIds = [...new Set((accounts || []).map((item: any) => item.route_id))];
      const { data: routes, error: routeError } = routeIds.length
        ? await db.from("dcds_international_payout_routes").select("id,country_name,currency,route_code").in("id", routeIds)
        : { data: [], error: null };
      if (routeError) throw routeError;
      const byId = new Map((routes || []).map((route: any) => [route.id, route]));
      return respond({ success: true, accounts: (accounts || []).map((item: any) => ({ ...item, route: byId.get(item.route_id) || null })) });
    }

    if (action === "get_requests") {
      const { data: requests, error } = await db.from("dcds_international_payout_requests")
        .select("id,source_amount_ngn,destination_amount,destination_currency,provider_fee_amount,provider_fee_currency,status,transfer_reference,failure_reason,requested_at,processed_at")
        .eq("user_id", userId).order("requested_at", { ascending: false }).limit(20);
      if (error) throw error;
      return respond({ success: true, requests: requests || [] });
    }

    if (action === "banks") {
      if (!readiness.ready) return respond({ success: false, error: "International withdrawals are not enabled yet." }, 423);
      const route = await getRoute(db, String(body.route_id || ""));
      let country = route.country_code;
      if (route.country_code === "EU") {
        country = String(body.beneficiary_country || "").toUpperCase();
        const sepa = new Set(["AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","HU","IS","IE","IT","LV","LI","LT","LU","MT","MC","NL","NO","PL","PT","RO","SM","SK","SI","ES","SE","CH","GB"]);
        if (!sepa.has(country)) return respond({ success: false, error: "Select a supported SEPA destination country." }, 400);
      }
      const bankPayload = await flutterwave("/banks/" + encodeURIComponent(country) + "?include_provider_type=1");
      const data = Array.isArray(bankPayload.data) ? bankPayload.data : [];
      const banks = data.filter((bank: any) => bank && (bank.code || bank.id))
        .map((bank: any) => ({ code: String(bank.code || bank.id), name: String(bank.name || bank.bank_name || "Bank") }));
      return respond({ success: true, banks, country_code: country });
    }

    if (action === "save_account") {
      if (!readiness.ready) return respond({ success: false, error: "International beneficiary setup is not enabled yet." }, 423);
      await getOwnedAmbassador(db, userId);
      const route = await getRoute(db, String(body.route_id || ""));
      const source = body.beneficiary_data && typeof body.beneficiary_data === "object" && !Array.isArray(body.beneficiary_data)
        ? body.beneficiary_data as Record<string, unknown> : null;
      if (!source) return respond({ success: false, error: "Enter the required beneficiary details." }, 400);

      const allowed = new Set(["beneficiary_name", ...route.required_fields, ...route.optional_fields]);
      const details: Record<string, string> = {};
      for (const [key, value] of Object.entries(source)) {
        if (!allowed.has(key)) return respond({ success: false, error: "An unsupported beneficiary field was supplied." }, 400);
        const clean = cleanText(value);
        if (!clean) return respond({ success: false, error: "One of the beneficiary fields is invalid." }, 400);
        details[key] = clean;
      }
      for (const field of route.required_fields) {
        if (!details[field]) return respond({ success: false, error: "Complete all required bank details: " + field.replaceAll("_", " ") + "." }, 400);
      }
      const beneficiaryName = cleanText(details.beneficiary_name || body.beneficiary_name, 160);
      if (!beneficiaryName) return respond({ success: false, error: "Enter the beneficiary's full name." }, 400);
      details.beneficiary_name = beneficiaryName;
      const fixedBeneficiaryCountry = cleanText(route.route_config?.beneficiary_country_value, 8);
      if (fixedBeneficiaryCountry && details.beneficiary_country !== fixedBeneficiaryCountry) {
        return respond({ success: false, error: "The beneficiary country does not match this payout corridor." }, 400);
      }
      if (route.country_code === "EU") {
        const destinationCountry = details.beneficiary_country || String(body.beneficiary_country || "").toUpperCase();
        const sepa = new Set(["AT","BE","BG","HR","CY","CZ","DK","EE","FI","FR","DE","GR","HU","IS","IE","IT","LV","LI","LT","LU","MT","MC","NL","NO","PL","PT","RO","SM","SK","SI","ES","SE","CH","GB"]);
        if (!sepa.has(destinationCountry)) return respond({ success: false, error: "A valid SEPA beneficiary country is required." }, 400);
        details.beneficiary_country = destinationCountry;
      }
      const identifier = details.account_number || details.iban;
      if (!identifier || identifier.length < 4) return respond({ success: false, error: "A valid account number or IBAN is required." }, 400);
      if (route.currency === "USD" && !["checking","depository"].includes(String(details.account_type || "").toLowerCase())) {
        return respond({ success: false, error: "For a USD beneficiary, select checking or depository as the account type." }, 400);
      }
      if (route.currency === "GBP") {
        const accountType = String(details.account_type || "").toLowerCase();
        if (!["personal","corporate"].includes(accountType)) {
          return respond({ success: false, error: "For a GBP beneficiary, select personal or corporate as the account type." }, 400);
        }
        if (accountType === "personal") {
          const parts = beneficiaryName.toLowerCase().split(/\\s+/).filter(Boolean);
          if (!details.first_name || !details.last_name ||
              String(details.first_name).toLowerCase() !== parts[0] ||
              String(details.last_name).toLowerCase() !== parts[parts.length - 1]) {
            return respond({ success: false, error: "For a personal GBP account, first and last names must match the beneficiary name." }, 400);
          }
        }
        if (accountType === "corporate" && !details.beneficiary_merchant_name) {
          return respond({ success: false, error: "For a corporate GBP account, enter the beneficiary business name." }, 400);
        }
      }

      const encryptionKey = Deno.env.get("DCDS_PAYOUT_ENCRYPTION_KEY");
      if (!encryptionKey) return respond({ success: false, error: "Secure beneficiary storage is not configured." }, 503);
      const ciphertext = await encryptPayload(details, encryptionKey);
      const { data: saved, error: saveError } = await db.from("dcds_international_payout_accounts")
        .upsert({
          user_id: userId, route_id: route.id, beneficiary_name: beneficiaryName,
          beneficiary_data_ciphertext: ciphertext, account_hint_last4: identifier.slice(-4),
          verification_status: "pending", verified_at: null, provider_beneficiary_id: null,
          verification_note: "Awaiting authorised DCDS beneficiary review.", updated_at: new Date().toISOString(),
        }, { onConflict: "user_id,route_id" })
        .select("id,route_id,beneficiary_name,account_hint_last4,verification_status,created_at,updated_at")
        .single();
      if (saveError) throw saveError;
      return respond({
        success: true, account: saved,
        message: "Beneficiary details were encrypted and saved. DCDS must verify the beneficiary before a payout quote can be accepted.",
      });
    }

    if (action === "create_quote") {
      if (!readiness.ready) return respond({ success: false, error: "International payouts are not enabled yet." }, 423);
      await getOwnedAmbassador(db, userId);
      const route = await getRoute(db, String(body.route_id || ""));
      const accountId = String(body.account_id || "");
      const { data: account, error: accountError } = await db.from("dcds_international_payout_accounts")
        .select("id,user_id,route_id,verification_status").eq("id", accountId).eq("user_id", userId).maybeSingle();
      if (accountError) throw accountError;
      if (!account || account.verification_status !== "verified" || account.route_id !== route.id) {
        return respond({ success: false, error: "Select a DCDS-verified beneficiary for this payout corridor." }, 409);
      }
      const destinationAmount = safeAmount(body.destination_amount);
      if (!destinationAmount || destinationAmount < 1) return respond({ success: false, error: "Enter a whole-number destination amount. Flutterwave's transfer API accepts integer transfer amounts." }, 400);
      const balance = await getUserBalance(db, userId);
      const url = "/transfers/rates?amount=" + encodeURIComponent(String(destinationAmount)) +
        "&destination_currency=" + encodeURIComponent(route.currency) + "&source_currency=NGN";
      const ratePayload = await flutterwave(url);
      const rateData = transferData(ratePayload);
      const sourceData = rateData.source && typeof rateData.source === "object" ? rateData.source as JsonObject : {};
      const destinationData = rateData.destination && typeof rateData.destination === "object" ? rateData.destination as JsonObject : {};
      const sourceAmount = roundMoney(Number(sourceData.amount));
      const fxRate = Number(rateData.rate);
      if (!Number.isFinite(sourceAmount) || sourceAmount < 5000 || !Number.isFinite(fxRate) || fxRate <= 0 ||
          String(sourceData.currency || "NGN").toUpperCase() !== "NGN") {
        return respond({ success: false, error: "This destination amount does not meet the ₦5,000 minimum or the provider did not return a valid NGN quote." }, 422);
      }
      if (sourceAmount > balance.available_ngn) {
        return respond({ success: false, error: "This payout needs " + sourceAmount.toLocaleString("en-NG") +
          " NGN, but your available balance is " + balance.available_ngn.toLocaleString("en-NG") + " NGN." }, 422);
      }

      const feePayload = await flutterwave("/transfers/fee?type=account&amount=" +
        encodeURIComponent(String(destinationAmount)) + "&currency=" + encodeURIComponent(route.currency));
      const feeSource = Array.isArray(feePayload.data) ? feePayload.data[0] : feePayload.data;
      if (!feeSource || typeof feeSource !== "object") return respond({ success: false, error: "Flutterwave did not return a verifiable transfer fee. No quote was created." }, 502);
      const feeCurrency = String((feeSource as JsonObject).currency || route.currency).toUpperCase();
      let feeAmount = Number((feeSource as JsonObject).fee);
      if (!Number.isFinite(feeAmount) || feeAmount < 0) return respond({ success: false, error: "Flutterwave returned an invalid transfer fee." }, 502);
      if (String((feeSource as JsonObject).fee_type || "").toLowerCase() === "percentage") feeAmount = destinationAmount * feeAmount / 100;
      feeAmount = roundMoney(feeAmount);

      const actualDestinationAmount = Number(destinationData.amount || destinationAmount);
      if (!Number.isSafeInteger(actualDestinationAmount) || actualDestinationAmount <= 0) return respond({ success: false, error: "Flutterwave returned a non-integer destination amount. No quote was created." }, 502);
      const quoteId = crypto.randomUUID();
      const now = new Date();
      const expiresAt = new Date(now.getTime() + 5 * 60 * 1000).toISOString();
      const { data: quote, error: quoteError } = await db.from("dcds_international_payout_quotes").insert({
        id: quoteId, user_id: userId, route_id: route.id,
        source_amount_ngn: sourceAmount, destination_amount: actualDestinationAmount,
        destination_currency: route.currency, fx_rate: fxRate,
        provider_fee_amount: feeAmount, provider_fee_currency: feeCurrency,
        provider_quote_reference: cleanText(rateData.reference, 120),
        idempotency_key: "DCDS-INTL-QUOTE-" + quoteId.replaceAll("-", "").toUpperCase(),
        status: "quoted", quoted_at: now.toISOString(), expires_at: expiresAt,
      }).select("id,source_amount_ngn,destination_amount,destination_currency,fx_rate,provider_fee_amount,provider_fee_currency,quoted_at,expires_at").single();
      if (quoteError) throw quoteError;

      return respond({
        success: true, quote,
        message: "Review the NGN debit, destination amount, FX rate and provider fee. This quote expires in five minutes and does not submit a transfer.",
      });
    }

    if (action === "accept_quote") {
      if (!readiness.ready) return respond({ success: false, error: "International payouts are not enabled yet." }, 423);
      await getOwnedAmbassador(db, userId);
      const quoteId = String(body.quote_id || "");
      if (!/^[0-9a-f-]{36}$/i.test(quoteId)) return respond({ success: false, error: "Select a valid payout quote." }, 400);
      const { data: savedQuote, error: quoteLookupError } = await db.from("dcds_international_payout_quotes")
        .select("id,status,expires_at").eq("id", quoteId).eq("user_id", userId).maybeSingle();
      if (quoteLookupError) throw quoteLookupError;
      if (!savedQuote || savedQuote.status !== "quoted") return respond({ success: false, error: "This FX quote has already been used or is no longer available." }, 409);
      if (new Date(savedQuote.expires_at).getTime() <= Date.now()) {
        await db.from("dcds_international_payout_quotes").update({ status: "expired" }).eq("id", quoteId).eq("user_id", userId);
        return respond({ success: false, error: "This FX quote has expired. Request a fresh quote." }, 410);
      }
      const { data: request, error } = await db.rpc("dcds_internal_create_international_payout_request", {
        p_user_id: userId, p_quote_id: quoteId, p_payout_account_id: String(body.account_id || ""),
      });
      if (error || !request?.success) return respond({ success: false, error: cleanText(error?.message || request?.error, 300) || "Your payout request could not be reserved." }, 409);
      return respond({ success: true, request, message: "Your international withdrawal request has been reserved for DCDS review. No transfer has been sent yet." });
    }

    if (action === "cancel_request") {
      const requestId = String(body.request_id || "");
      if (!/^[0-9a-f-]{36}$/i.test(requestId)) return respond({ success: false, error: "Invalid withdrawal request." }, 400);
      const { data: request, error: requestError } = await db.from("dcds_international_payout_requests")
        .select("id,user_id,status,provider_transfer_id").eq("id", requestId).eq("user_id", userId).maybeSingle();
      if (requestError) throw requestError;
      if (!request || request.status !== "requested" || request.provider_transfer_id) return respond({ success: false, error: "This withdrawal can no longer be cancelled online. Contact DCDS support." }, 409);
      const { error } = await db.rpc("dcds_internal_transition_international_payout", {
        p_request_id: requestId, p_new_status: "cancelled", p_actor_user_id: userId,
        p_failure_reason: "Ambassador cancelled before provider transfer submission.",
        p_details: { cancelled_by: "ambassador" },
      });
      if (error) throw error;
      return respond({ success: true, message: "Withdrawal request cancelled. Reserved rewards have been released." });
    }

    if (action === "record_route_stage") {
      if (!admin) return respond({ success: false, error: "Administrator access required." }, 403);
      const route = await getRoute(db, String(body.route_id || ""), false);
      const stage = String(body.stage || "");
      const evidence = cleanText(body.evidence_note, 500);
      if (!evidence || evidence.length < 12 || body.confirm !== true) return respond({ success: false, error: "Confirm the action and provide an evidence note of at least 12 characters." }, 400);
      const previousEvidence = Array.isArray((route.route_config || {}).verification_evidence)
        ? (route.route_config as any).verification_evidence as JsonObject[] : [];
      const evidenceHistory = [...previousEvidence, {
        stage, evidence_note: evidence, actor_user_id: userId, recorded_at: new Date().toISOString(),
      }].slice(-25);
      const priorNote = cleanText(route.internal_notes, 2000);
      const patch: JsonObject = {
        internal_notes: [priorNote, stage + ": " + evidence].filter(Boolean).join("\\n").slice(-2000),
        route_config: { ...(route.route_config || {}), verification_evidence: evidenceHistory },
        updated_at: new Date().toISOString(),
      };
      if (stage === "provider_approved") patch.provider_approved = true;
      else if (stage === "sandbox_verified") patch.sandbox_verified_at = new Date().toISOString();
      else if (stage === "live_verified") patch.live_verified_at = new Date().toISOString();
      else if (stage === "suspend") patch.status = "suspended";
      else if (stage === "disable") patch.status = "disabled";
      else if (stage === "enable") {
        const { data: current, error } = await db.from("dcds_international_payout_routes")
          .select("provider_approved,sandbox_verified_at,live_verified_at").eq("id", route.id).single();
        if (error) throw error;
        if (!readiness.ready || !current.provider_approved || !current.sandbox_verified_at || !current.live_verified_at) {
          return respond({ success: false, error: "Provider, compliance, wallet, encryption, webhook, sandbox and live verification gates are not all complete." }, 423);
        }
        patch.status = "enabled";
        patch.enabled_at = new Date().toISOString();
      } else return respond({ success: false, error: "Unsupported route verification stage." }, 400);
      const { data: updated, error } = await db.from("dcds_international_payout_routes")
        .update(patch).eq("id", route.id)
        .select("id,route_code,country_name,currency,status,provider_approved,sandbox_verified_at,live_verified_at,enabled_at,internal_notes").single();
      if (error) throw error;
      return respond({ success: true, route: updated, message: "The route verification record was updated. A route is only available to ambassadors when every global and route-specific gate is satisfied." });
    }

    if (action === "admin_list") {
      if (!admin) return respond({ success: false, error: "Administrator access required." }, 403);
      const { data: requests, error } = await db.from("dcds_international_payout_requests")
        .select("id,user_id,payout_account_id,source_amount_ngn,destination_amount,destination_currency,fx_rate,provider_fee_amount,provider_fee_currency,status,transfer_reference,provider_transfer_id,failure_reason,requested_at,processed_at")
        .order("requested_at", { ascending: false }).limit(100);
      if (error) throw error;
      const accountIds = [...new Set((requests || []).map((item: any) => item.payout_account_id))];
      const { data: accounts, error: accountError } = accountIds.length
        ? await db.from("dcds_international_payout_accounts").select("id,route_id,beneficiary_name,account_hint_last4,verification_status").in("id", accountIds)
        : { data: [], error: null };
      if (accountError) throw accountError;
      const routeIds = [...new Set((accounts || []).map((item: any) => item.route_id))];
      const { data: routes, error: routeError } = routeIds.length
        ? await db.from("dcds_international_payout_routes").select("id,country_name,currency,route_code").in("id", routeIds)
        : { data: [], error: null };
      if (routeError) throw routeError;
      const accountsById = new Map((accounts || []).map((item: any) => [item.id, item]));
      const routesById = new Map((routes || []).map((item: any) => [item.id, item]));
      return respond({ success: true, requests: (requests || []).map((item: any) => {
        const account: any = accountsById.get(item.payout_account_id) || null;
        return { ...item, account, route: account ? routesById.get(account.route_id) || null : null };
      }) });
    }

    if (action === "reveal_account_details") {
      if (!admin) return respond({ success: false, error: "Administrator access required." }, 403);
      const accountId = String(body.account_id || "");
      if (!/^[0-9a-f-]{36}$/i.test(accountId)) return respond({ success: false, error: "Invalid beneficiary record." }, 400);
      const { data: account, error } = await db.from("dcds_international_payout_accounts")
        .select("id,user_id,route_id,beneficiary_name,beneficiary_data_ciphertext,account_hint_last4,verification_status")
        .eq("id", accountId).maybeSingle();
      if (error) throw error;
      if (!account) return respond({ success: false, error: "Beneficiary record not found." }, 404);
      const key = Deno.env.get("DCDS_PAYOUT_ENCRYPTION_KEY");
      if (!key) return respond({ success: false, error: "Beneficiary encryption key is not configured." }, 503);
      const details = await decryptPayload(account.beneficiary_data_ciphertext, key);
      return respond({ success: true, account: {
        id: account.id, user_id: account.user_id, route_id: account.route_id,
        beneficiary_name: account.beneficiary_name, account_hint_last4: account.account_hint_last4,
        verification_status: account.verification_status, details,
      } });
    }

    if (action === "verify_account") {
      if (!admin) return respond({ success: false, error: "Administrator access required." }, 403);
      const accountId = String(body.account_id || "");
      const note = cleanText(body.verification_note, 500);
      if (!/^[0-9a-f-]{36}$/i.test(accountId) || body.confirm !== true || !note || note.length < 12) {
        return respond({ success: false, error: "Confirm the beneficiary review and provide an evidence note of at least 12 characters." }, 400);
      }
      const { data: account, error: accountError } = await db.from("dcds_international_payout_accounts")
        .select("id,user_id,route_id,verification_status").eq("id", accountId).maybeSingle();
      if (accountError) throw accountError;
      if (!account || account.verification_status === "disabled") return respond({ success: false, error: "Beneficiary is unavailable for verification." }, 404);
      const { data: updated, error } = await db.from("dcds_international_payout_accounts")
        .update({ verification_status: "verified", verified_at: new Date().toISOString(), verification_note: note, updated_at: new Date().toISOString() })
        .eq("id", accountId)
        .select("id,user_id,route_id,beneficiary_name,account_hint_last4,verification_status,verified_at,verification_note").single();
      if (error) throw error;
      const { error: auditError } = await db.from("dcds_international_payout_beneficiary_events").insert({
        account_id: accountId, user_id: account.user_id, event_type: "beneficiary_verified",
        actor_user_id: userId,
        details: { verification_method: "authorised_admin_review", evidence_note: note },
      });
      if (auditError) throw auditError;
      return respond({ success: true, account: updated, message: "Beneficiary marked verified by authorised DCDS administrator review." });
    }

    if (action === "process" || action === "reconcile") {
      if (!admin) return respond({ success: false, error: "Administrator access required." }, 403);
      const requestId = String(body.request_id || "");
      if (!/^[0-9a-f-]{36}$/i.test(requestId)) return respond({ success: false, error: "Invalid international withdrawal request." }, 400);
      const { data: request, error: requestError } = await db.from("dcds_international_payout_requests")
        .select("*").eq("id", requestId).maybeSingle();
      if (requestError) throw requestError;
      if (!request) return respond({ success: false, error: "International withdrawal request not found." }, 404);
      const payoutRequest = request as PayoutRequest;
      if (action === "process") {
        if (!readiness.ready || body.confirm_send !== true) return respond({ success: false, error: "Confirm the transfer. All provider and live-verification gates must be complete." }, 423);
        if (payoutRequest.status !== "requested" || payoutRequest.provider_transfer_id) return respond({ success: false, error: "Only a new request can be sent. Reconcile any request with a provider ID; never resend it." }, 409);
        const { data: account, error: accountError } = await db.from("dcds_international_payout_accounts")
          .select("id,user_id,route_id,beneficiary_name,beneficiary_data_ciphertext,verification_status,provider_beneficiary_id")
          .eq("id", payoutRequest.payout_account_id).maybeSingle();
        if (accountError) throw accountError;
        if (!account || account.verification_status !== "verified" || account.user_id !== payoutRequest.user_id) {
          return respond({ success: false, error: "The verified beneficiary for this request is unavailable." }, 409);
        }
        const route = await getRoute(db, account.route_id);
        const routeConfig = route.route_config || {};
        const encryptionKey = Deno.env.get("DCDS_PAYOUT_ENCRYPTION_KEY");
        if (!encryptionKey) return respond({ success: false, error: "Payout encryption key is not configured." }, 503);
        const details = await decryptPayload(account.beneficiary_data_ciphertext, encryptionKey);
        const metadataFields = Array.isArray(routeConfig.transfer_meta_fields) ? routeConfig.transfer_meta_fields as string[] : [];
        const meta: JsonObject = {};
        for (const field of metadataFields) if (details[field]) meta[field] = details[field];
        const transferBody: JsonObject = {
          account_number: details.account_number || details.iban,
          amount: Number(payoutRequest.destination_amount),
          currency: payoutRequest.destination_currency,
          debit_currency: "NGN",
          beneficiary_name: account.beneficiary_name,
          reference: payoutRequest.transfer_reference,
          narration: "DCDS Global Ambassador Reward",
        };
        if (details.account_bank) transferBody.account_bank = details.account_bank;
        if (Object.keys(meta).length) transferBody.meta = [meta];

        const { data: lock, error: lockError } = await db.rpc("dcds_internal_transition_international_payout", {
          p_request_id: requestId, p_new_status: "processing", p_actor_user_id: userId,
          p_details: { stage: "provider_submission_started", route_code: route.route_code },
        });
        if (lockError || !lock?.success) return respond({ success: false, error: "This withdrawal could not be locked for transfer processing." }, 409);

        let created: JsonObject;
        try {
          created = await flutterwave("/transfers", "POST", transferBody);
        } catch (error) {
          await db.rpc("dcds_internal_transition_international_payout", {
            p_request_id: requestId, p_new_status: "manual_review", p_actor_user_id: userId,
            p_failure_reason: "Transfer submission returned an uncertain provider response. Check Flutterwave by the unique reference before taking further action.",
            p_details: { stage: "provider_submission_uncertain", provider_error: cleanText(error instanceof Error ? error.message : "Unknown provider error", 200) },
          });
          return respond({ success: false, status: "manual_review", error: "Flutterwave did not confirm whether the transfer was accepted. The request remains locked; do not send it again. Reconcile the unique transfer reference." }, 202);
        }
        const createdData = transferData(created);
        const transferId = String(createdData.id || "");
        if (String(created.status || "").toLowerCase() !== "success" || !transferId) {
          await db.rpc("dcds_internal_transition_international_payout", {
            p_request_id: requestId, p_new_status: "manual_review", p_actor_user_id: userId,
            p_failure_reason: "Provider response did not include a verifiable transfer ID. Manual reconciliation is required.",
            p_details: { stage: "provider_transfer_id_missing", response_status: created.status || null },
          });
          return respond({ success: false, status: "manual_review", error: "Flutterwave did not return a verifiable transfer ID. The request remains locked. Do not resubmit." }, 202);
        }
        const { error: attachError } = await db.rpc("dcds_internal_transition_international_payout", {
          p_request_id: requestId, p_new_status: "processing", p_provider_transfer_id: transferId,
          p_actor_user_id: userId, p_details: { stage: "provider_transfer_id_attached" },
        });
        if (attachError) {
          await db.from("dcds_international_payout_events").insert({
            request_id: requestId, user_id: payoutRequest.user_id, event_type: "manual_review",
            actor_user_id: userId, details: { stage: "provider_id_persistence_failed", provider_transfer_id: transferId },
          });
          return respond({ success: false, status: "manual_review", message: "Flutterwave accepted the transfer, but its ID could not be attached. The request remains locked. Do not resubmit." }, 202);
        }
        try {
          const verified = await flutterwave("/transfers/" + encodeURIComponent(transferId));
          const result = await applyVerifiedTransfer(db, payoutRequest, verified, userId);
          return respond(result, result.status === "paid" ? 200 : 202);
        } catch {
          return respond({ success: false, status: "processing", message: "Flutterwave accepted the transfer, but its final status could not be verified. The request remains locked for reconciliation." }, 202);
        }
      }

      if (!["processing","manual_review"].includes(payoutRequest.status) || !payoutRequest.provider_transfer_id) {
        return respond({ success: false, error: "This request has no stored provider transfer ID. Do not retry it; use manual reference investigation." }, 409);
      }
      const verified = await flutterwave("/transfers/" + encodeURIComponent(payoutRequest.provider_transfer_id));
      const result = await applyVerifiedTransfer(db, payoutRequest, verified, userId);
      return respond(result, result.status === "paid" ? 200 : 202);
    }

    return respond({ success: false, error: "Unsupported action." }, 400);
  } catch (error: unknown) {
    console.error("DCDS international payout service error:", error instanceof Error ? error.message : "Unknown error");
    return respond({ success: false, error: cleanText(error instanceof Error ? error.message : null, 300) || "The international payout request could not be completed." }, 500);
  }
});
