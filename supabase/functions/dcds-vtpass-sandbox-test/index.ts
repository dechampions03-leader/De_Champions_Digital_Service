import { createClient } from "npm:@supabase/supabase-js@2";

function json(req: Request, body: unknown, status = 200): Response {
  const origin = req.headers.get("Origin");
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
  if (origin === "https://dechampions03-leader.github.io" || (origin && /^https:\/\/[a-z0-9-]+\.dcds-dev-auth-preview\.pages\.dev$/i.test(origin))) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Vary"] = "Origin";
  }
  return new Response(JSON.stringify(body), { status, headers });
}

function clean(value: unknown, max = 120): string {
  return typeof value === "string" ? value.replace(/[<>\u0000-\u001f]/g, "").trim().slice(0, max) : "";
}

async function requireDcdsAdmin(req: Request): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "Sign in with the DCDS administrator account." };
  }
  const url = Deno.env.get("SUPABASE_URL") || "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || (() => {
    try {
      const keys = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}");
      return typeof keys.default === "string" ? keys.default : "";
    } catch {
      return "";
    }
  })();
  if (!url || !anon) return { ok: false, status: 503, error: "DCDS admin verification is unavailable." };
  const client = createClient(url, anon, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return { ok: false, status: 401, error: "Your DCDS session is invalid or expired." };
  const { data: isAdmin, error: roleError } = await client.rpc("is_dcds_admin");
  if (roleError || isAdmin !== true) return { ok: false, status: 403, error: "Root/admin access is required for this sandbox test." };
  return { ok: true };
}

function sandboxBase(): string {
  const raw = (Deno.env.get("VTPASS_API_BASE_URL") || "").trim();
  if (!raw) throw new Error("Set VTPASS_API_BASE_URL to https://sandbox.vtpass.com/api/ in Development.");
  const url = new URL(raw);
  if (url.protocol !== "https:" || url.hostname !== "sandbox.vtpass.com" ||
      !["/api", "/api/"].includes(url.pathname) || url.username || url.password || url.search || url.hash) {
    throw new Error("Safety stop: this test runner only permits https://sandbox.vtpass.com/api/. Live VTpass is blocked.");
  }
  return "https://sandbox.vtpass.com/api";
}

function requestId(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return get("year") + get("month") + get("day") + get("hour") + get("minute") +
    crypto.randomUUID().replaceAll("-", "").slice(0, 12);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    const origin = req.headers.get("Origin") || "";
    const allowed = origin === "https://dechampions03-leader.github.io" ||
      /^https:\/\/[a-z0-9-]+\.dcds-dev-auth-preview\.pages\.dev$/i.test(origin);
    const headers: HeadersInit = {
      "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
    };
    if (allowed) headers["Access-Control-Allow-Origin"] = origin;
    return new Response("ok", { headers });
  }
  if (req.method !== "POST") return json(req, { success: false, error: "POST required." }, 405);

  const access = await requireDcdsAdmin(req);
  if (!access.ok) return json(req, { success: false, error: access.error }, access.status);

  const body = await req.json().catch(() => null);
  if (body?.confirm !== "RUN_SANDBOX_TEST") {
    return json(req, { success: false, error: "Explicit confirmation is required. Send confirm=RUN_SANDBOX_TEST." }, 400);
  }

  try {
    const base = sandboxBase();
    const apiKey = Deno.env.get("VTPASS_API_KEY") || "";
    const publicKey = Deno.env.get("VTPASS_PUBLIC_KEY") || "";
    const secretKey = Deno.env.get("VTPASS_SECRET_KEY") || "";
    if (!apiKey || !publicKey || !secretKey) {
      return json(req, { success: false, error: "Sandbox API, Public and Secret keys must all be configured in Development Supabase." }, 503);
    }

    // One controlled data simulation per invocation. Only allowlisted data
    // services are accepted; recipient is fixed to VTpass's documented sandbox
    // success number and no customer-supplied phone is accepted.
    const dataServices: Record<string, string> = { "airtel-data": "Airtel Data", "etisalat-data": "9mobile Data", "glo-data": "GLO Data", "glo-sme-data": "GLO Data (Best Value)" };
    const airtimeServices: Record<string, string> = { "mtn": "MTN Airtime", "airtel": "Airtel Airtime", "etisalat": "9mobile Airtime", "glo": "GLO Airtime" };
    const serviceType = clean(body?.service_type, 20) || "data";
    const requestedService = clean(body?.service_id, 40);
    const isAirtime = serviceType === "airtime";
    const allowedServices = isAirtime ? airtimeServices : dataServices;
    if (!Object.hasOwn(allowedServices, requestedService)) return json(req, { success: false, error: isAirtime ? "Choose MTN, Airtel, 9mobile or GLO Airtime." : "Choose Airtel Data, 9mobile Data, GLO Data or GLO Data (Best Value)." }, 400);
    const serviceID = requestedService;
    const serviceName = allowedServices[serviceID];
    const recipient = "08011111111";
    let chosen = { code: "", name: serviceName + " N50 top-up", amount: 50 };
    if (!isAirtime) {
      const catalogueResponse = await fetch(base + "/service-variations?serviceID=" + serviceID, { headers: { "api-key": apiKey, "public-key": publicKey, Accept: "application/json" }, signal: AbortSignal.timeout(12000) });
      const catalogue = await catalogueResponse.json().catch(() => null);
      const variations = catalogue?.content?.variations ?? catalogue?.content?.varations;
      if (!catalogueResponse.ok || catalogue?.response_description !== "000" || !Array.isArray(variations)) return json(req, { success: false, stage: "catalogue", error: "VTpass Sandbox did not return a valid data catalogue for the selected service.", provider_code: clean(catalogue?.code, 12) }, 502);
      const selected = variations.map((v: Record<string, unknown>) => ({ code: clean(v.variation_code, 80), name: clean(v.name, 100), amount: Number(v.variation_amount) })).filter((v: { code: string; name: string; amount: number }) => v.code && v.name && Number.isFinite(v.amount) && v.amount > 0 && !/calls?|minutes?|voice|talk\s*more/i.test(v.name)).sort((a: { amount: number }, b: { amount: number }) => a.amount - b.amount);
      if (!selected.length) return json(req, { success: false, stage: "catalogue", error: "No valid data variation was returned for the selected service." }, 502);
      chosen = selected[0];
    }
    const id = requestId();
    const purchasePayload: Record<string, unknown> = { request_id: id, serviceID, amount: chosen.amount, phone: recipient };
    if (!isAirtime) { purchasePayload.billersCode = recipient; purchasePayload.variation_code = chosen.code; }
    const purchaseResponse = await fetch(base + "/pay", { method: "POST", headers: { "api-key": apiKey, "secret-key": secretKey, "Content-Type": "application/json", Accept: "application/json" }, body: JSON.stringify(purchasePayload), signal: AbortSignal.timeout(20000) });
    const purchase = await purchaseResponse.json().catch(() => null);
    const providerCode = clean(purchase?.code, 12);
    let finalPayload = purchase;
    let finalHttpStatus = purchaseResponse.status;
    let stage = "purchase";

    // Never repeat /pay. If the first response is ambiguous, query the exact
    // request_id once; an unresolved result is returned for manual follow-up.
    const purchaseStatus = clean(purchase?.content?.transactions?.status, 30).toLowerCase();
    // Authentication failures are definitive: do not issue a requery with
    // the same rejected credentials. Correct the Sandbox Secret Key first.
    if (providerCode !== "087" && purchaseResponse.ok && purchase &&
      (isAirtime || (providerCode !== "000" && !["delivered", "successful"].includes(purchaseStatus)))) {
      const requeryResponse = await fetch(base + "/requery", {
        method: "POST",
        headers: { "api-key": apiKey, "secret-key": secretKey, "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ request_id: id }),
        signal: AbortSignal.timeout(15000),
      });
      const requery = await requeryResponse.json().catch(() => null);
      finalPayload = requery;
      finalHttpStatus = requeryResponse.status;
      stage = "requery";
    }

    const transactionStatus = clean(finalPayload?.content?.transactions?.status, 30).toLowerCase();
    const code = clean(finalPayload?.code, 12);
    const delivered = code === "000" && transactionStatus === "delivered";
    return json(req, {
      success: delivered,
      stage,
      service_type: serviceType,
      service_id: serviceID,
      service_name: serviceName,
      plan: chosen.name,
      sandbox_amount_ngn: chosen.amount,
      test_recipient: recipient,
      request_id: id,
      provider_code: code || providerCode || null,
      transaction_status: transactionStatus || "unknown",
      provider_http_status: finalHttpStatus,
      message: delivered
        ? "VTpass Sandbox confirms the simulated transaction was delivered."
        : code === "087" || providerCode === "087"
        ? "VTpass rejected the POST authentication credentials (code 087). No further requery was sent. Correct the Sandbox Secret Key/authentication setting before any new test."
        : "No successful delivery was confirmed. Do not submit another /pay for this request ID; inspect/requery this same request.",
    }, delivered ? 200 : 202);
  } catch (error) {
    return json(req, {
      success: false,
      error: error instanceof Error ? error.message : "Sandbox test failed unexpectedly.",
    }, 503);
  }
});
