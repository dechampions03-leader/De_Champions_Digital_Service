import { createClient } from "npm:@supabase/supabase-js@2";

const BASE = (Deno.env.get("VTPASS_API_BASE_URL") || "https://sandbox.vtpass.com/api").replace(/\/+$/, "");
const NETWORKS = [
  { id: 1, name: "MTN", code: "mtn", airtime_discount: "0" },
  { id: 2, name: "Glo", code: "glo", airtime_discount: "0" },
  { id: 3, name: "9mobile", code: "9mobile", airtime_discount: "0" },
  { id: 4, name: "Airtel", code: "airtel", airtime_discount: "0" },
] as const;
const DATA_SERVICES: Record<string, string> = {
  mtn: "mtn-data",
  airtel: "airtel-data",
  glo: "glo-data",
  "9mobile": "etisalat-data",
};

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
async function fetchVariations(network: string, networkId: number) {
  const serviceID = DATA_SERVICES[network];
  if (!serviceID) return [];
  const response = await fetch(BASE + "/service-variations?serviceID=" + encodeURIComponent(serviceID), {
    headers: apiHeaders(),
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
    return { id, network, network_id: networkId, plan, amount, validity, type: "Data bundle" };
  }).filter((item: { id: string; plan: string; amount: number }) =>
    item.id && item.plan && Number.isFinite(item.amount) && item.amount > 0
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
    if (!["catalog", "data_plans", "networks"].includes(action)) {
      return reply(req, { success: false, error: "Unsupported catalogue action." }, 400);
    }

    const allPlans: Record<string, unknown>[] = [];
    if (action !== "networks") {
      const results = await Promise.all(NETWORKS.map((n) => fetchVariations(n.code, n.id)));
      results.forEach((plans) => allPlans.push(...plans));
      if (!allPlans.length) return reply(req, { success: false, error: "VTpass returned no active Nigerian data plans." }, 502);
    }
    const data = {
      status: "success",
      network_reference: { MTN: 1, GLO: 2, "9MOBILE": 3, AIRTEL: 4 },
      plans: allPlans,
      networks: NETWORKS,
    };
    return reply(req, { success: true, action, data });
  } catch (error) {
    console.error("DCDS VTpass catalogue error:", error instanceof Error ? error.message : "Unknown error");
    return reply(req, { success: false, error: error instanceof Error ? error.message : "VTpass catalogue is temporarily unavailable." }, 502);
  }
});
