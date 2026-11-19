const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
    },
  });

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
    },
  });
  if (req.method !== "GET") return json({ ready: false, error: "Method not allowed." }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const secret = Deno.env.get("FLW_SECRET_KEY") || "";
  const webhookHash = Deno.env.get("FLW_TEST_WEBHOOK_HASH") || Deno.env.get("FLW_WEBHOOK_HASH") || "";
  const serviceRole = Deno.env.get("DCDS_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const checks = {
    development_project: supabaseUrl === "https://tjgsxbmkpvktlqulbktv.supabase.co",
    flutterwave_test_secret: secret.startsWith("FLWSECK_TEST-"),
    dedicated_test_webhook_hash: webhookHash.length >= 16,
    service_role_configured: serviceRole.length > 0,
  };
  return json({
    environment: "DCDS-Development",
    checkout_currency: "NGN",
    provider_checkout: "Flutterwave hosted checkout",
    checks,
    ready: Object.values(checks).every(Boolean),
    missing: Object.entries(checks).filter(([, value]) => !value).map(([name]) => name),
  });
});
