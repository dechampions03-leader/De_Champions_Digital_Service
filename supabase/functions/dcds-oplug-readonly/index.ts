import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
  "Cache-Control": "no-store",
};

const NETWORKS = new Set(["mtn","airtel","glo","9mobile"]);
const NETWORK_BY_ID: Record<number, string> = { 1: "mtn", 2: "glo", 3: "9mobile", 4: "airtel" };

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: cors });
}

function cleanText(value: unknown, max = 100): string {
  return typeof value === "string"
    ? value.replace(/[<>\u0000-\u001f]/g, "").trim().slice(0, max)
    : "";
}

function normalizeNetwork(value: unknown, id?: unknown): string {
  const name = cleanText(value, 30).toLowerCase();
  if (name.includes("mtn")) return "mtn";
  if (name.includes("glo")) return "glo";
  if (name.includes("9mobile") || name.includes("9 mobile")) return "9mobile";
  if (name.includes("airtel")) return "airtel";
  return NETWORK_BY_ID[Number(id)] || "";
}

async function requireAdmin(req: Request): Promise<{ error: string; status: number } | { ok: true }> {
  const authorization = req.headers.get("Authorization");
  if (!authorization?.startsWith("Bearer ")) return { error: "Sign in required.", status: 401 };

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? (() => {
    try { return JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}").default; }
    catch { return undefined; }
  })();
  if (!supabaseUrl || !anonKey) return { error: "Supabase auth configuration unavailable.", status: 503 };

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  if (req.method !== "POST") return reply({ success: false, error: "POST required" }, 405);

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return reply({ success: false, error: "Invalid request." }, 400);
    body = parsed as Record<string, unknown>;
  } catch {
    return reply({ success: false, error: "Invalid JSON." }, 400);
  }

  const action = typeof body.action === "string" ? body.action : "";
  const base = "https://www.oplug.com.ng/api/v1";

  if (action === "balance") {
    const access = await requireAdmin(req);
    if (!("ok" in access)) return reply({ success: false, error: access.error }, access.status);
    const key = Deno.env.get("OPLUG_API_KEY");
    if (!key) return reply({ success: false, error: "Oplug key is not configured." }, 503);
    try {
      const response = await fetch(base + "/balance", {
        headers: { Authorization: "Token " + key, Accept: "application/json" },
        signal: AbortSignal.timeout(10000),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || !data || data.status !== "success") return reply({ success: false, error: "Oplug balance request failed." }, 502);
      return reply({ success: true, balance: data });
    } catch {
      return reply({ success: false, error: "Oplug balance service is temporarily unavailable." }, 502);
    }
  }

  const allowedCatalog = new Map([
    ["networks", "/get-networks"],
    ["data_plans", "/data_plans"],
  ]);
  const path = allowedCatalog.get(action);
  if (!path) return reply({ success: false, error: "Unsupported read-only action." }, 400);

  try {
    const response = await fetch(base + path, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10000),
    });
    const upstream = await response.json().catch(() => null);
    if (!response.ok || !upstream || upstream.status !== "success") {
      return reply({ success: false, error: "Oplug catalogue is temporarily unavailable." }, 502);
    }

    if (action === "data_plans") {
      const rawPlans = Array.isArray(upstream.plans) ? upstream.plans : [];
      const plans = rawPlans.slice(0, 2000).map((item: unknown) => {
        if (!item || typeof item !== "object" || Array.isArray(item)) return null;
        const p = item as Record<string, unknown>;
        const network = normalizeNetwork(p.network, p.network_id);
        return {
          id: cleanText(p.id, 80),
          network,
          network_id: Number(p.network_id) || null,
          plan: cleanText(p.plan, 100),
          amount: Number(p.amount),
          validity: cleanText(p.validity, 50),
          days: Number(p.days) || null,
          type: cleanText(p.type, 50),
        };
      }).filter((p: { id: string; network: string; plan: string; amount: number } | null) =>
        !!p && NETWORKS.has(p.network) && !!p.id && !!p.plan && Number.isFinite(p.amount) && p.amount > 0
      );
      if (!plans.length) return reply({ success: false, error: "No active Nigerian data plans are currently available." }, 502);
      return reply({
        success: true,
        action,
        data: {
          status: "success",
          network_reference: { MTN: 1, GLO: 2, "9MOBILE": 3, AIRTEL: 4 },
          plans,
        },
      });
    }

    const rawNetworks = Array.isArray(upstream.networks) ? upstream.networks : [];
    const networks = rawNetworks.map((item: unknown) => {
      if (!item || typeof item !== "object" || Array.isArray(item)) return null;
      const n = item as Record<string, unknown>;
      const id = Number(n.id);
      const code = normalizeNetwork(n.code || n.name, id);
      if (!NETWORKS.has(code)) return null;
      return {
        id,
        name: code === "9mobile" ? "9MOBILE" : code.toUpperCase(),
        code,
        airtime_discount: cleanText(n.airtime_discount, 12),
      };
    }).filter((n: { id: number; code: string } | null) => !!n && Number.isInteger(n.id) && n.id >= 1 && n.id <= 4);
    return reply({ success: true, action, data: { status: "success", networks } });
  } catch {
    return reply({ success: false, error: "Oplug catalogue is temporarily unavailable." }, 502);
  }
});
