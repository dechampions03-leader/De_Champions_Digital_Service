import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function adminKey(): string {
  if (Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")) return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  if (Deno.env.get("DCDS_SERVICE_ROLE_KEY")) return Deno.env.get("DCDS_SERVICE_ROLE_KEY")!;
  try {
    const keys = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    return typeof keys.default === "string" ? keys.default : "";
  } catch {
    return "";
  }
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
function maskPhone(phone: string): string {
  return phone.replace(/^(\d{3})\d{4}(\d{4})$/, "$1****$2");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return reply(req, { success: false, error: "POST required." }, 405);
  if (!allowedOrigin(req.headers.get("Origin"))) return reply(req, { success: false, error: "Origin not allowed." }, 403);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const serviceRoleKey = adminKey();
    if (!supabaseUrl || !serviceRoleKey) {
      return reply(req, { success: false, error: "Purchase history is temporarily unavailable." }, 503);
    }
    const authorization = req.headers.get("Authorization") || "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!token) return reply(req, { success: false, error: "Sign in to view your purchase history." }, 401);

    const db = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await db.auth.getUser(token);
    if (authError || !authData.user) {
      return reply(req, { success: false, error: "Your DCDS session has expired. Please sign in again." }, 401);
    }

    const { data, error } = await db.from("dcds_vtu_orders")
      .select("tx_ref,service_type,network,recipient_phone,data_plan_name,provider_metadata,amount,currency,status,provider_status,flutterwave_transaction_id,created_at,paid_at,fulfilled_at")
      .eq("user_id", authData.user.id)
      .order("created_at", { ascending: false })
      .limit(50);
    if (error) throw error;

    const orders = (data || []).map((order: Record<string, unknown>) => ({
      reference: String(order.tx_ref || ""),
      service_type: String(order.service_type || ""),
      network: String(order.network || ""),
      recipient: maskPhone(String(order.recipient_phone || "")),
      plan: order.data_plan_name ? String(order.data_plan_name) : (order.provider_metadata && typeof order.provider_metadata === "object" ? String((order.provider_metadata as Record<string, unknown>).plan_name || "") || null : null),
      amount: Number(order.amount || 0),
      currency: String(order.currency || "NGN"),
      status: String(order.status || "needs_review"),
      provider_status: String(order.provider_status || ""),
      transaction_id: order.flutterwave_transaction_id ? String(order.flutterwave_transaction_id) : null,
      created_at: order.created_at ? String(order.created_at) : null,
      paid_at: order.paid_at ? String(order.paid_at) : null,
      fulfilled_at: order.fulfilled_at ? String(order.fulfilled_at) : null,
    }));
    return reply(req, { success: true, orders });
  } catch (error) {
    console.error("DCDS VTU history failed:", error instanceof Error ? error.message : "Unknown error");
    return reply(req, { success: false, error: "Could not load your purchase history right now." }, 500);
  }
});
