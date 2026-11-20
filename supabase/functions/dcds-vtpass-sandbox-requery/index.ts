import { createClient } from "npm:@supabase/supabase-js@2";

const EXISTING_REQUEST_ID = "202611200735e1909d65096b";

function response(req: Request, body: unknown, status = 200) {
  const origin = req.headers.get("Origin") || "";
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
  if (origin === "https://dechampions03-leader.github.io" ||
      /^https:\/\/[a-z0-9-]+\.dcds-dev-auth-preview\.pages\.dev$/i.test(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return new Response(JSON.stringify(body), { status, headers });
}

async function adminCheck(req: Request) {
  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return false;
  const url = Deno.env.get("SUPABASE_URL") || "";
  const anon = Deno.env.get("SUPABASE_ANON_KEY") || "";
  if (!url || !anon) return false;
  const client = createClient(url, anon, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: { user }, error } = await client.auth.getUser();
  if (error || !user) return false;
  const { data, error: roleError } = await client.rpc("is_dcds_admin");
  return !roleError && data === true;
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
  if (req.method !== "POST") return response(req, { success: false, error: "POST required." }, 405);
  if (!await adminCheck(req)) return response(req, { success: false, error: "DCDS root administrator sign-in is required." }, 403);

  const baseValue = (Deno.env.get("VTPASS_API_BASE_URL") || "").trim();
  let base: string;
  try {
    const u = new URL(baseValue);
    if (u.protocol !== "https:" || u.hostname !== "sandbox.vtpass.com" ||
        !["/api", "/api/"].includes(u.pathname) || u.username || u.password || u.search || u.hash) {
      throw new Error("Only the official VTpass Sandbox endpoint is permitted.");
    }
    base = "https://sandbox.vtpass.com/api";
  } catch (e) {
    return response(req, { success: false, error: e instanceof Error ? e.message : "Invalid Sandbox URL." }, 400);
  }

  const apiKey = Deno.env.get("VTPASS_API_KEY") || "";
  const secretKey = Deno.env.get("VTPASS_SECRET_KEY") || "";
  if (!apiKey || !secretKey) return response(req, { success: false, error: "Sandbox API Key and Secret Key must be configured." }, 503);

  try {
    // This endpoint ONLY queries the existing reference. It contains no /pay call.
    const res = await fetch(base + "/requery", {
      method: "POST",
      headers: {
        "api-key": apiKey,
        "secret-key": secretKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({ request_id: EXISTING_REQUEST_ID }),
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => null);
    const status = String(data?.content?.transactions?.status || "unknown").toLowerCase();
    const code = String(data?.code || "");
    return response(req, {
      success: code === "000" && status === "delivered",
      request_id: EXISTING_REQUEST_ID,
      provider_code: code || null,
      transaction_status: status,
      provider_http_status: res.status,
      message: code === "087"
        ? "VTpass still rejects the Sandbox authentication credentials. No new purchase was made."
        : code === "000" && status === "delivered"
        ? "VTpass confirms the original sandbox transaction was delivered."
        : "The original transaction is not confirmed as delivered. No new purchase was made.",
    }, 200);
  } catch (e) {
    return response(req, {
      success: false,
      request_id: EXISTING_REQUEST_ID,
      error: e instanceof Error ? e.message : "Requery failed.",
      message: "Only the original reference was queried; no new purchase was submitted.",
    }, 503);
  }
});
