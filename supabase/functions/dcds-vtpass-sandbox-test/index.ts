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

  try {
    const base = sandboxBase();

    // Read-only Smile authentication diagnostic. This branch never calls /pay
    // and deliberately does not require purchase confirmation.
    if (body?.action === "SMILE_AUTH_DIAGNOSTIC") {
      const email = Deno.env.get("VTPASS_EMAIL") || "";
      const password = Deno.env.get("VTPASS_PASSWORD") || "";
      if (!email || !password) {
        return json(req, { success: false, stage: "smile-auth-diagnostic", error: "VTPASS_EMAIL and VTPASS_PASSWORD are not both configured in Development." }, 503);
      }
      const auth = "Basic " + btoa(email + ":" + password);
      const response = await fetch(base + "/service-variations?serviceID=smile-direct", {
        method: "GET",
        headers: { Authorization: auth, Accept: "application/json" },
        signal: AbortSignal.timeout(15000),
      });
      const payload = await response.json().catch(() => null);
      const variations = payload?.content?.variations ?? payload?.content?.varations;
      const code = clean(payload?.response_description ?? payload?.code, 12);
      const message = clean(payload?.response_description ?? payload?.message ?? payload?.error, 160);
      return json(req, {
        success: response.ok && code === "000" && Array.isArray(variations),
        stage: "smile-auth-diagnostic",
        provider_http_status: response.status,
        provider_code: code || null,
        provider_message: message || null,
        variations_returned: Array.isArray(variations) ? variations.length : 0,
        note: "Read-only GET service-variations check. No verification or purchase request was submitted.",
      }, 200);
    }

    // Isolated Smile customer-email verification diagnostic. This calls only
    // the documented verification endpoint and never submits /pay.
    if (body?.action === "SMILE_VERIFY_DIAGNOSTIC") {
      const email = Deno.env.get("VTPASS_EMAIL") || "";
      const password = Deno.env.get("VTPASS_PASSWORD") || "";
      const sandboxEmail = Deno.env.get("VTPASS_SMILE_SANDBOX_EMAIL") || "";
      if (!email || !password || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sandboxEmail)) {
        return json(req, { success: false, stage: "smile-email-verification-diagnostic", error: "Check that Development has VTPASS_EMAIL, VTPASS_PASSWORD and a valid VTPASS_SMILE_SANDBOX_EMAIL." }, 503);
      }
      const response = await fetch(base + "/merchant-verify/smile/email", {
        method: "POST",
        headers: {
          Authorization: "Basic " + btoa(email + ":" + password),
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ billersCode: sandboxEmail, serviceID: "smile-direct" }),
        signal: AbortSignal.timeout(15000),
      });
      const rawBody = await response.text();
      let payload: Record<string, any> | null = null;
      try { payload = JSON.parse(rawBody); } catch { payload = null; }
      const accounts = payload?.content?.AccountList?.Account;
      const expectedAccount = Array.isArray(accounts) && accounts.some((x: Record<string, unknown>) => clean(x.AccountId, 30) === "08011111111");
      const providerCode = clean(payload?.code ?? payload?.response_description, 12);
      const providerMessage = clean(payload?.response_description ?? payload?.message ?? payload?.error, 180);
      const safeBody = rawBody.replaceAll(sandboxEmail, "[sandbox-email-redacted]").replaceAll(email, "[merchant-email-redacted]").slice(0, 500);
      return json(req, {
        success: response.ok && providerCode === "000" && expectedAccount,
        stage: "smile-email-verification-diagnostic",
        provider_http_status: response.status,
        provider_content_type: clean(response.headers.get("content-type"), 100),
        provider_code: providerCode || null,
        provider_message: providerMessage || null,
        provider_response_excerpt: safeBody || null,
        verified_accounts_returned: Array.isArray(accounts) ? accounts.length : 0,
        expected_sandbox_account_found: Boolean(expectedAccount),
        note: "Smile customer-email verification only. No /pay request or purchase was submitted.",
      }, 200);
    }

    if (body?.confirm !== "RUN_SANDBOX_TEST") {
      return json(req, { success: false, error: "Explicit confirmation is required. Send confirm=RUN_SANDBOX_TEST." }, 400);
    }

    const apiKey = Deno.env.get("VTPASS_API_KEY") || "";
    const publicKey = Deno.env.get("VTPASS_PUBLIC_KEY") || "";
    const secretKey = Deno.env.get("VTPASS_SECRET_KEY") || "";
    if (!apiKey || !publicKey || !secretKey) {
      return json(req, { success: false, error: "Sandbox API, Public and Secret keys must all be configured in Development Supabase." }, 503);
    }

    // One controlled data simulation per invocation. Only allowlisted data
    // services are accepted; recipient is fixed to VTpass's documented sandbox
    // success number and no customer-supplied phone is accepted.
    const dataServices: Record<string, string> = { "mtn-data": "MTN Data", "airtel-data": "Airtel Data", "etisalat-data": "9mobile Data", "glo-data": "GLO Data", "glo-sme-data": "GLO Data (Best Value)", "spectranet": "Spectranet Internet Data" };
    const airtimeServices: Record<string, string> = { "mtn": "MTN Airtime", "airtel": "Airtel Airtime", "etisalat": "9mobile Airtime", "glo": "GLO Airtime" };
    const specialServices: Record<string, string> = { "smile-direct": "Smile Network Payment", "foreign-airtime": "International Airtime" };
    const serviceType = clean(body?.service_type, 30) || "data";
    const requestedService = clean(body?.service_id, 40);
    const isAirtime = serviceType === "airtime";
    const isSmile = serviceType === "smile";
    const isInternational = serviceType === "international-airtime";
    const isSpectranet = requestedService === "spectranet" && serviceType === "data";
    const allowedServices = isAirtime ? airtimeServices : (isSmile || isInternational) ? specialServices : dataServices;
    if (!Object.hasOwn(allowedServices, requestedService) || (isSmile && requestedService !== "smile-direct") || (isInternational && requestedService !== "foreign-airtime")) return json(req, { success: false, error: "Choose an allowlisted data, airtime, Smile, Spectranet or international airtime service." }, 400);
    const serviceID = requestedService;
    const serviceName = allowedServices[serviceID];
    const recipient = isSpectranet ? "1212121212" : "08011111111";
    let chosen = { code: "", name: serviceName + " N50 top-up", amount: 50 };
    let billersCode = recipient;
    let specialPayload: Record<string, unknown> = {};
    let requestHeaders: Record<string, string> = { "api-key": apiKey, "secret-key": secretKey, "Content-Type": "application/json", Accept: "application/json" };
    let requeryHeaders: Record<string, string> = { "api-key": apiKey, "secret-key": secretKey, "Content-Type": "application/json", Accept: "application/json" };
    if (isSmile) {
      const smileEmail = Deno.env.get("VTPASS_EMAIL") || "";
      const smilePassword = Deno.env.get("VTPASS_PASSWORD") || "";
      const smileSandboxEmail = Deno.env.get("VTPASS_SMILE_SANDBOX_EMAIL") || "";
      if (!smileEmail || !smilePassword) return json(req, { success: false, error: "Smile testing requires VTPASS_EMAIL and VTPASS_PASSWORD in Development Edge Function secrets. Do not send credentials in chat." }, 503);
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(smileSandboxEmail)) return json(req, { success: false, error: "Set VTPASS_SMILE_SANDBOX_EMAIL in Development Edge Function secrets to the exact Smile sandbox verification email published in VTpass documentation. This is separate from the VTpass API login email." }, 503);
      requestHeaders = { Authorization: "Basic " + btoa(smileEmail + ":" + smilePassword), "Content-Type": "application/json", Accept: "application/json" };
      requeryHeaders = { ...requestHeaders };
      const verify = await fetch(base + "/merchant-verify/smile/email", { method: "POST", headers: requestHeaders, body: JSON.stringify({ billersCode: smileSandboxEmail, serviceID: "smile-direct" }), signal: AbortSignal.timeout(15000) });
      const verified = await verify.json().catch(() => null);
      const accounts = verified?.content?.AccountList?.Account;
      const account = Array.isArray(accounts) ? accounts.find((x: Record<string, unknown>) => clean(x.AccountId, 30) === recipient) : null;
      if (!verify.ok || clean(verified?.code, 12) !== "000" || !account) {
        // Surface only safe provider diagnostics; never echo request headers or credentials.
        const providerMessage = clean(
          verified?.response_description ?? verified?.message ?? verified?.error ?? verified?.content?.Customer_Name,
          180,
        );
        return json(req, {
          success: false,
          stage: "smile-email-verification",
          provider_code: clean(verified?.code, 12) || null,
          provider_http_status: verify.status,
          provider_message: providerMessage || null,
          account_count: Array.isArray(accounts) ? accounts.length : 0,
          expected_account_found: Boolean(account),
          error: "VTpass Sandbox did not verify the configured Smile sandbox email/account. Review the provider code/message and Development Basic Auth configuration.",
        }, 200);
      }
      billersCode = clean(account.AccountId, 30);
    }
    if (isInternational) {
      const country = "GH";
      const typesResponse = await fetch(base + "/get-international-airtime-product-types?code=" + country, { headers: { "api-key": apiKey, "public-key": publicKey, Accept: "application/json" }, signal: AbortSignal.timeout(12000) });
      const typesPayload = await typesResponse.json().catch(() => null);
      const mobileType = Array.isArray(typesPayload?.content) ? typesPayload.content.find((x: Record<string, unknown>) => /mobile top up/i.test(clean(x.name, 80))) : null;
      if (!typesResponse.ok || clean(typesPayload?.response_description, 12) !== "000" || !mobileType) return json(req, { success: false, stage: "international-product-types", error: "VTpass Sandbox did not return a mobile top-up product type for Ghana." }, 200);
      const productTypeId = String(mobileType.product_type_id);
      const operatorsResponse = await fetch(base + "/get-international-airtime-operators?code=" + country + "&product_type_id=" + encodeURIComponent(productTypeId), { headers: { "api-key": apiKey, "public-key": publicKey, Accept: "application/json" }, signal: AbortSignal.timeout(12000) });
      const operatorsPayload = await operatorsResponse.json().catch(() => null);
      const operator = Array.isArray(operatorsPayload?.content) ? operatorsPayload.content[0] : null;
      const operatorId = clean(operator?.operator_id, 20);
      if (!operatorsResponse.ok || clean(operatorsPayload?.response_description, 12) !== "000" || !operatorId) return json(req, { success: false, stage: "international-operators", error: "VTpass Sandbox did not return a Ghana mobile top-up operator." }, 200);
      const variationsResponse = await fetch(base + "/service-variations?serviceID=foreign-airtime&operator_id=" + encodeURIComponent(operatorId) + "&product_type_id=" + encodeURIComponent(productTypeId), { headers: { "api-key": apiKey, "public-key": publicKey, Accept: "application/json" }, signal: AbortSignal.timeout(12000) });
      const variationsPayload = await variationsResponse.json().catch(() => null);
      const variations = variationsPayload?.content?.variations;
      const intlVariation = Array.isArray(variations) ? variations.map((v: Record<string, unknown>) => ({ code: clean(v.variation_code, 80), name: clean(v.name, 100), amount: Number(v.variation_amount), fixed: clean(v.fixedPrice, 10) })).find((v: { code: string; name: string; amount: number; fixed: string }) => v.code && /top\s*up/i.test(v.name) && v.fixed.toLowerCase() === "yes" && Number.isFinite(v.amount) && v.amount >= 0) : null;
      if (!variationsResponse.ok || clean(variationsPayload?.response_description, 12) !== "000" || !intlVariation) return json(req, { success: false, stage: "international-variations", error: "No fixed-price Ghana airtime top-up variation is available for a safe Sandbox test." }, 200);
      chosen = { code: intlVariation.code, name: intlVariation.name, amount: intlVariation.amount };
      billersCode = recipient;
      specialPayload = { operator_id: operatorId, country_code: country, product_type_id: productTypeId, email: "sandbox@sandbox.vtpass.com" };
    }
    if (!isAirtime && !isInternational) {
      if (isSpectranet) {
        const email = Deno.env.get("VTPASS_EMAIL") || "";
        const password = Deno.env.get("VTPASS_PASSWORD") || "";
        if (!email || !password) return json(req, { success: false, error: "Spectranet testing requires VTPASS_EMAIL and VTPASS_PASSWORD in Development Edge Function secrets." }, 503);
        requestHeaders = { Authorization: "Basic " + btoa(email + ":" + password), "Content-Type": "application/json", Accept: "application/json" };
        requeryHeaders = { ...requestHeaders };
      }
      const catalogueResponse = await fetch(base + "/service-variations?serviceID=" + serviceID, { headers: (isSmile || isSpectranet) ? requestHeaders : { "api-key": apiKey, "public-key": publicKey, Accept: "application/json" }, signal: AbortSignal.timeout(12000) });
      const catalogue = await catalogueResponse.json().catch(() => null);
      const variations = catalogue?.content?.variations ?? catalogue?.content?.varations;
      if (!catalogueResponse.ok || catalogue?.response_description !== "000" || !Array.isArray(variations)) return json(req, { success: false, stage: "catalogue", error: "VTpass Sandbox did not return a valid data catalogue for the selected service.", provider_code: clean(catalogue?.code, 12) }, 200);
      const selected = variations.map((v: Record<string, unknown>) => ({ code: clean(v.variation_code, 80), name: clean(v.name, 100), amount: Number(v.variation_amount) })).filter((v: { code: string; name: string; amount: number }) => v.code && v.name && Number.isFinite(v.amount) && v.amount > 0 && (isSmile ? /\b(?:gb|mb)\b/i.test(v.name) : !/calls?|minutes?|voice|talk\s*more/i.test(v.name))).sort((a: { amount: number }, b: { amount: number }) => a.amount - b.amount);
      if (!selected.length) return json(req, { success: false, stage: "catalogue", error: "No valid data variation was returned for the selected service." }, 200);
      chosen = selected[0];
    }
    const id = requestId();
    const purchasePayload: Record<string, unknown> = { request_id: id, serviceID, phone: isSpectranet ? "08011111111" : recipient };
    // International fixed-price variations may report variation_amount=0 while
    // VTpass calculates the NGN wallet charge server-side. The amount field is
    // optional in the official API payload; omit zero rather than sending an
    // invalid zero amount (which triggers response code 011).
    if (chosen.amount > 0) purchasePayload.amount = chosen.amount;
    if (!isAirtime) { purchasePayload.billersCode = billersCode; purchasePayload.variation_code = chosen.code; }
    if (isSpectranet) purchasePayload.quantity = 1;
    // Smile's documented purchase payload uses the verified AccountId as
    // billersCode. Do not add an undocumented email field to /pay.
    Object.assign(purchasePayload, specialPayload);
    const purchaseResponse = await fetch(base + "/pay", { method: "POST", headers: requestHeaders, body: JSON.stringify(purchasePayload), signal: AbortSignal.timeout(20000) });
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
        headers: requeryHeaders,
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
      country_code: isInternational ? "GH" : undefined,
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
