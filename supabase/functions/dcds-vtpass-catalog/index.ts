import { createClient } from "npm:@supabase/supabase-js@2";

const BASE = (Deno.env.get("VTPASS_API_BASE_URL") || "https://sandbox.vtpass.com/api").replace(/\/+$/, "");
const NETWORKS = [
  { id: 1, name: "MTN", code: "mtn", airtime_discount: "0" },
  { id: 2, name: "Glo", code: "glo", airtime_discount: "0" },
  { id: 3, name: "9mobile", code: "9mobile", airtime_discount: "0" },
  { id: 4, name: "Airtel", code: "airtel", airtime_discount: "0" },
  { id: 5, name: "Spectranet", code: "spectranet", airtime_discount: "0" },
  { id: 6, name: "Smile", code: "smile", airtime_discount: "0" },
] as const;
const DATA_SERVICES = [
  { network: "mtn", networkId: 1, serviceID: "mtn-data" },
  { network: "airtel", networkId: 4, serviceID: "airtel-data" },
  { network: "glo", networkId: 2, serviceID: "glo-data" },
  { network: "glo", networkId: 2, serviceID: "glo-sme-data" },
  { network: "9mobile", networkId: 3, serviceID: "etisalat-data" },
  { network: "9mobile", networkId: 3, serviceID: "9mobile-sme-data" },
  { network: "spectranet", networkId: 5, serviceID: "spectranet" },
  { network: "smile", networkId: 6, serviceID: "smile-direct" },
] as const;

function allowedOrigin(origin: string | null): boolean {
  return !origin ||
    origin === "https://dechampions03-leader.github.io" ||
    origin === "https://dechampionsdigital.com" ||
    origin === "https://www.dechampionsdigital.com" ||
    /^https:\/\/[a-z0-9-]+\.dcds-dev-auth-preview\.pages\.dev$/i.test(origin);
}
function cors(req: Request): HeadersInit {
  const origin = req.headers.get("Origin");
  const allowed = allowedOrigin(origin);
  return {
    ...(origin && allowed ? { "Access-Control-Allow-Origin": origin, "Vary": "Origin" } : {}),
    "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
  };
}
function reply(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: cors(req) });
}
function clean(value: unknown, max = 150): string {
  return typeof value === "string" ? value.replace(/[<>\u0000-\u001f]/g, "").trim().slice(0, max) : "";
}
function getBase(): string {
  const parsed = new URL(BASE);
  if (!["sandbox.vtpass.com", "vtpass.com"].includes(parsed.hostname) || parsed.protocol !== "https:") {
    throw new Error("Invalid VTpass API base URL.");
  }
  return BASE;
}
function apiHeaders(): HeadersInit {
  const apiKey = Deno.env.get("VTPASS_API_KEY") || "";
  const publicKey = Deno.env.get("VTPASS_PUBLIC_KEY") || "";
  if (!apiKey || !publicKey) throw new Error("VTpass GET credentials are not configured.");
  return { "api-key": apiKey, "public-key": publicKey, Accept: "application/json" };
}
function smileBasicHeaders(): HeadersInit {
  const email = Deno.env.get("VTPASS_EMAIL") || "";
  const password = Deno.env.get("VTPASS_PASSWORD") || "";
  if (!email || !password) throw new Error("VTpass Smile Basic Authentication credentials are not configured.");
  return { Authorization: "Basic " + btoa(email + ":" + password), "Content-Type": "application/json", Accept: "application/json" };
}
async function requireSignedIn(req: Request): Promise<{ ok: true } | { error: string; status: number }> {
  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return { error: "Sign in required.", status: 401 };
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || (() => {
    try {
      const values = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}");
      return typeof values.default === "string" ? values.default : "";
    } catch {
      return "";
    }
  })();
  if (!supabaseUrl || !anonKey) return { error: "Account verification is unavailable.", status: 503 };
  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return { error: "Valid DCDS sign-in required.", status: 401 };
  return { ok: true };
}
async function requireAdmin(req: Request): Promise<{ ok: true } | { error: string; status: number }> {
  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return { error: "Sign in required.", status: 401 };
  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || (() => {
    try {
      const values = JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "{}");
      return typeof values.default === "string" ? values.default : "";
    } catch {
      return "";
    }
  })();
  if (!supabaseUrl || !anonKey) return { error: "Supabase admin verification is unavailable.", status: 503 };
  const client = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return { error: "Invalid session.", status: 401 };
  const { data: isAdmin, error: adminError } = await client.rpc("is_dcds_admin");
  if (adminError || isAdmin !== true) return { error: "Admin access required.", status: 403 };
  return { ok: true };
}
async function fetchVariations(service: { network: string; networkId: number; serviceID: string }) {
  const { network, networkId, serviceID } = service;
  const response = await fetch(BASE + "/service-variations?serviceID=" + encodeURIComponent(serviceID), {
    headers: serviceID === "smile-direct" ? smileBasicHeaders() : apiHeaders(),
    signal: AbortSignal.timeout(12000),
  });
  const payload = await response.json().catch(() => null);
  const variations = payload?.content?.variations ?? payload?.content?.varations;
  if (!response.ok || !payload || payload.response_description !== "000" || !Array.isArray(variations)) {
    throw new Error("VTpass " + network + " data catalogue is temporarily unavailable.");
  }
  return variations.map((item: Record<string, unknown>) => {
    const id = clean(item?.variation_code, 100);
    const plan = clean(item?.name, 120);
    const amount = Number(item?.variation_amount);
    const validity = (plan.match(/(?:\d+\s*(?:hours?|hrs?|days?|weeks?|months?))/i) || [""])[0];
    return { id: serviceID + "::" + id, service_id: serviceID, variation_code: id, network, network_id: networkId, plan, amount, validity, type: ["glo-sme-data", "9mobile-sme-data"].includes(serviceID) ? "SME data" : "Data bundle" };
  }).filter((item: { id: string; plan: string; amount: number }) =>
    item.id && item.plan && Number.isFinite(item.amount) && item.amount > 0 &&
    !/\b(?:calls?|minutes?|voice|talk\s*more)\b/i.test(item.plan)
  );
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return reply(req, { success: false, error: "POST required." }, 405);
  const origin = req.headers.get("Origin");
  if (!allowedOrigin(origin)) {
    return reply(req, { success: false, error: "Origin not allowed." }, 403);
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return reply(req, { success: false, error: "Invalid request." }, 400);
    body = parsed as Record<string, unknown>;
  } catch {
    return reply(req, { success: false, error: "Invalid JSON." }, 400);
  }

  try {
    const base = getBase();
    const action = clean(body.action, 30) || "catalog";
    const headers = apiHeaders();
    if (action === "verify_smile") {
      const access = await requireSignedIn(req);
      if (!("ok" in access)) return reply(req, { success: false, error: access.error }, access.status);
      const email = clean(body.email, 180).toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return reply(req, { success: false, error: "Enter a valid Smile account email." }, 400);
      }
      const verifyResponse = await fetch(base + "/merchant-verify/smile/email", {
        method: "POST",
        headers: smileBasicHeaders(),
        body: JSON.stringify({ billersCode: email, serviceID: "smile-direct" }),
        signal: AbortSignal.timeout(12000),
      });
      const verification = await verifyResponse.json().catch(() => null);
      const accounts = verification?.content?.AccountList?.Account;
      if (!verifyResponse.ok || String(verification?.code) !== "000" || !Array.isArray(accounts) || !accounts.length) {
        return reply(req, { success: false, error: "We could not verify that Smile email. Check the email and try again." }, 404);
      }
      return reply(req, {
        success: true,
        customer_name: clean(verification?.content?.Customer_Name, 120),
        accounts: accounts.map((account: Record<string, unknown>) => ({
          account_id: clean(account.AccountId, 40),
          friendly_name: clean(account.FriendlyName, 80),
        })).filter((account: { account_id: string }) => account.account_id),
      });
    }
    if (action === "balance") {
      const access = await requireAdmin(req);
      if (!("ok" in access)) return reply(req, { success: false, error: access.error }, access.status);
      const response = await fetch(base + "/balance", { headers, signal: AbortSignal.timeout(10000) });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload || String(payload.code) !== "1") {
        return reply(req, { success: false, error: "VTpass balance request failed." }, 502);
      }
      return reply(req, { success: true, balance: payload });
    }
    if (action === "international_countries") {
      const response = await fetch(base + "/get-international-airtime-countries", { headers, signal: AbortSignal.timeout(12000) });
      const payload = await response.json().catch(() => null);
      const countries = payload?.content?.countries;
      if (!response.ok || payload?.response_description !== "000" || !Array.isArray(countries)) {
        return reply(req, { success: false, error: "International country list is temporarily unavailable." }, 502);
      }
      return reply(req, { success: true, countries: countries.map((x: Record<string, unknown>) => ({
        code: clean(x.code, 3), name: clean(x.name, 80), currency: clean(x.currency, 8), prefix: clean(x.prefix, 8),
      })).filter((x: { code: string; name: string }) => x.code && x.name) });
    }
    if (action === "international_product_types") {
      const code = clean(body.country_code, 3).toUpperCase();
      if (!/^[A-Z]{2,3}$/.test(code)) return reply(req, { success: false, error: "Choose a valid destination country." }, 400);
      const response = await fetch(base + "/get-international-airtime-product-types?code=" + encodeURIComponent(code), { headers, signal: AbortSignal.timeout(12000) });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.response_description !== "000" || !Array.isArray(payload?.content)) {
        return reply(req, { success: false, error: "International product types are unavailable for this country." }, 502);
      }
      return reply(req, { success: true, product_types: payload.content.map((x: Record<string, unknown>) => ({
        id: Number(x.product_type_id), name: clean(x.name, 80),
      })).filter((x: { id: number; name: string }) => Number.isInteger(x.id) && x.id > 0 && x.name) });
    }
    if (action === "international_operators") {
      const code = clean(body.country_code, 3).toUpperCase();
      const productTypeId = Number(body.product_type_id);
      if (!/^[A-Z]{2,3}$/.test(code) || !Number.isInteger(productTypeId) || productTypeId <= 0) {
        return reply(req, { success: false, error: "Choose a valid country and product type." }, 400);
      }
      const response = await fetch(base + "/get-international-airtime-operators?code=" + encodeURIComponent(code) + "&product_type_id=" + productTypeId, { headers, signal: AbortSignal.timeout(12000) });
      const payload = await response.json().catch(() => null);
      if (!response.ok || payload?.response_description !== "000" || !Array.isArray(payload?.content)) {
        return reply(req, { success: false, error: "International operators are unavailable for this selection." }, 502);
      }
      return reply(req, { success: true, operators: payload.content.map((x: Record<string, unknown>) => ({
        id: clean(String(x.operator_id ?? ""), 30), name: clean(x.name, 100),
      })).filter((x: { id: string; name: string }) => x.id && x.name) });
    }
    if (action === "international_variations") {
      const operatorId = clean(body.operator_id, 30);
      const productTypeId = Number(body.product_type_id);
      if (!/^\d+$/.test(operatorId) || !Number.isInteger(productTypeId) || productTypeId <= 0) {
        return reply(req, { success: false, error: "Choose a valid international operator and product type." }, 400);
      }
      const url = base + "/service-variations?serviceID=foreign-airtime&operator_id=" + encodeURIComponent(operatorId) + "&product_type_id=" + productTypeId;
      const response = await fetch(url, { headers, signal: AbortSignal.timeout(12000) });
      const payload = await response.json().catch(() => null);
      const variations = payload?.content?.variations ?? payload?.content?.varations;
      if (!response.ok || payload?.response_description !== "000" || !Array.isArray(variations)) {
        return reply(req, { success: false, error: "International top-up options are unavailable for this operator." }, 502);
      }
      return reply(req, { success: true, variations: variations.map((x: Record<string, unknown>) => ({
        code: clean(x.variation_code, 80), name: clean(x.name, 120),
        amount: Number(x.charged_amount ?? x.variation_amount),
        charged_amount: Number(x.charged_amount), variation_amount: Number(x.variation_amount),
        fixed_price: clean(x.fixedPrice, 8), rate: Number(x.variation_rate),
      })).filter((x: { code: string; name: string }) => x.code && x.name) });
    }
    if (!["catalog", "data_plans", "networks"].includes(action)) {
      return reply(req, { success: false, error: "Unsupported catalogue action." }, 400);
    }

    const allPlans: Record<string, unknown>[] = [];
    if (action !== "networks") {
      const results = await Promise.allSettled(DATA_SERVICES.map((service) => fetchVariations(service)));
      results.forEach((result, index) => {
        if (result.status === "fulfilled") allPlans.push(...result.value);
        else console.warn("VTpass catalogue service unavailable:", DATA_SERVICES[index].serviceID);
      });
      if (!allPlans.length) return reply(req, { success: false, error: "VTpass returned no active Nigerian data plans." }, 502);
    }
    const data = {
      status: "success",
      network_reference: { MTN: 1, GLO: 2, "9MOBILE": 3, AIRTEL: 4, SPECTRANET: 5, SMILE: 6 },
      plans: allPlans,
      networks: NETWORKS,
    };
    return reply(req, { success: true, action, data });
  } catch (error) {
    console.error("DCDS VTpass catalogue error:", error instanceof Error ? error.message : "Unknown error");
    return reply(req, { success: false, error: error instanceof Error ? error.message : "VTpass catalogue is temporarily unavailable." }, 502);
  }
});
