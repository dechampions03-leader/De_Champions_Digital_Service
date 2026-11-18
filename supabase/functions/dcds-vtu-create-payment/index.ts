import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SITE_URL = "https://dechampions03-leader.github.io/De_Champions_Digital_Service";
const NETWORKS: Record<string, number> = { mtn: 1, glo: 2, "9mobile": 3, airtel: 4 };

function secret(name: string): string {
  const direct = Deno.env.get(name);
  if (direct) return direct;
  try {
    const values = JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") || "{}");
    return typeof values.default === "string" ? values.default : "";
  } catch {
    return "";
  }
}
function serviceKey(): string {
  return Deno.env.get("DCDS_SERVICE_ROLE_KEY") ||
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ||
    secret("SUPABASE_SECRET_KEYS");
}
function allowedOrigin(origin: string | null): boolean {
  if (!origin) return true;
  return origin === "https://dechampions03-leader.github.io" ||
    origin === "https://dechampionsdigital.com" ||
    origin === "https://www.dechampionsdigital.com" ||
    /^https:\/\/[a-z0-9-]+\.dcds-dev-auth-preview\.pages\.dev$/i.test(origin);
}
function headers(req: Request): HeadersInit {
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
  return new Response(JSON.stringify(body), { status, headers: headers(req) });
}
function clean(value: unknown, max = 120): string {
  return typeof value === "string" ? value.replace(/[<>\u0000-\u001f]/g, "").trim().slice(0, max) : "";
}
function normalizePhone(value: unknown): string {
  let phone = String(value ?? "").replace(/[\s()-]/g, "");
  if (phone.startsWith("+234")) phone = "0" + phone.slice(4);
  else if (phone.startsWith("234")) phone = "0" + phone.slice(3);
  return /^0[789][0-9]{9}$/.test(phone) ? phone : "";
}
function normalizeNetwork(value: unknown, id?: unknown): string {
  const name = clean(value, 30).toLowerCase();
  if (name.includes("mtn")) return "mtn";
  if (name.includes("glo")) return "glo";
  if (name.includes("9mobile") || name.includes("9 mobile")) return "9mobile";
  if (name.includes("airtel")) return "airtel";
  return ({ 1: "mtn", 2: "glo", 3: "9mobile", 4: "airtel" } as Record<number, string>)[Number(id)] || "";
}
function money(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: headers(req) });
  if (req.method !== "POST") return reply(req, { success: false, error: "POST required." }, 405);
  if (!allowedOrigin(req.headers.get("Origin"))) return reply(req, { success: false, error: "Origin not allowed." }, 403);

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
    const adminKey = serviceKey();
    const flutterwaveKey = Deno.env.get("FLW_SECRET_KEY") || "";
    const oplugKey = Deno.env.get("OPLUG_API_KEY") || "";
    if (!supabaseUrl || !adminKey || !flutterwaveKey || !oplugKey) {
      return reply(req, { success: false, error: "Airtime & Data checkout is not fully configured yet. Please contact DCDS support." }, 503);
    }

    const authorization = req.headers.get("Authorization") || "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
    if (!token) return reply(req, { success: false, error: "Please sign in before purchasing." }, 401);

    const db = createClient(supabaseUrl, adminKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: authData, error: authError } = await db.auth.getUser(token);
    const user = authData?.user;
    if (authError || !user) return reply(req, { success: false, error: "Your sign-in session is invalid. Please sign in again." }, 401);
    if (!user.email) return reply(req, { success: false, error: "Your DCDS account needs a valid email address for Flutterwave checkout." }, 400);
    if (!user.email_confirmed_at && !user.phone_confirmed_at) {
      return reply(req, { success: false, error: "Verify your email address or mobile number before making a purchase." }, 403);
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object" || Array.isArray(body)) return reply(req, { success: false, error: "Invalid purchase details." }, 400);
    const serviceType = body.service_type === "airtime" ? "airtime" : body.service_type === "data" ? "data" : "";
    const network = clean(body.network, 20).toLowerCase();
    const networkId = NETWORKS[network];
    const phone = normalizePhone(body.phone);
    const clientRequestId = clean(body.request_id, 80);
    if (!serviceType || !networkId || !phone || !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(clientRequestId)) {
      return reply(req, { success: false, error: "Choose a valid service and network, enter a valid Nigerian phone number, and try again." }, 400);
    }

    let amount = 0;
    let providerCost = 0;
    let dataPlanId: string | null = null;
    let dataPlanName: string | null = null;
    let dataPlanType: string | null = null;
    let dataValidity: string | null = null;
    let airtimeAmount: number | null = null;

    const oplugHeaders = {
      Authorization: "Token " + oplugKey,
      Accept: "application/json",
      "Content-Type": "application/json",
    };

    if (serviceType === "data") {
      const requestedPlanId = clean(body.plan_id, 80);
      if (!requestedPlanId) return reply(req, { success: false, error: "Select a data bundle first." }, 400);
      const planResponse = await fetch("https://www.oplug.com.ng/api/v1/data_plans", {
        headers: oplugHeaders,
        signal: AbortSignal.timeout(12000),
      });
      const catalogue = await planResponse.json().catch(() => null);
      if (!planResponse.ok || catalogue?.status !== "success" || !Array.isArray(catalogue.plans)) {
        return reply(req, { success: false, error: "The live data catalogue is temporarily unavailable. No payment has been started." }, 502);
      }
      const plan = catalogue.plans.find((item: Record<string, unknown>) =>
        String(item.id) === requestedPlanId &&
        normalizeNetwork(item.network, item.network_id) === network
      );
      if (!plan) return reply(req, { success: false, error: "That bundle is no longer available on this network. Refresh the catalogue and select another plan." }, 409);
      amount = money(plan.amount);
      providerCost = amount;
      dataPlanId = requestedPlanId;
      dataPlanName = clean(plan.plan, 100);
      dataPlanType = clean(plan.type, 50);
      dataValidity = clean(plan.validity, 50);
      if (!amount || !dataPlanName) return reply(req, { success: false, error: "The provider returned an invalid price for this bundle." }, 502);
    } else {
      const requestedAmount = money(body.amount);
      if (!Number.isInteger(requestedAmount) || requestedAmount < 50 || requestedAmount > 50000) {
        return reply(req, { success: false, error: "Airtime must be between ₦50 and ₦50,000." }, 400);
      }
      amount = requestedAmount;
      airtimeAmount = requestedAmount;

      const netResponse = await fetch("https://www.oplug.com.ng/api/v1/get-networks", {
        headers: oplugHeaders,
        signal: AbortSignal.timeout(12000),
      });
      const networkPayload = await netResponse.json().catch(() => null);
      if (!netResponse.ok || networkPayload?.status !== "success" || !Array.isArray(networkPayload.networks)) {
        return reply(req, { success: false, error: "The live network catalogue is temporarily unavailable. No payment has been started." }, 502);
      }
      const networkItem = networkPayload.networks.find((item: Record<string, unknown>) =>
        Number(item.id) === networkId && normalizeNetwork(item.code || item.name, item.id) === network
      );
      if (!networkItem) return reply(req, { success: false, error: "This network is temporarily unavailable for airtime." }, 409);
      const discount = Number(String(networkItem.airtime_discount || "0").replace("%", ""));
      const safeDiscount = Number.isFinite(discount) && discount >= 0 && discount <= 10 ? discount : 0;
      providerCost = Math.round(amount * (1 - safeDiscount / 100) * 100) / 100;
    }

    // A retry with the same client request key must reuse the original checkout,
    // never create a second payable order.
    const { data: existing, error: existingError } = await db
      .from("dcds_vtu_orders")
      .select("id,user_id,service_type,network,recipient_phone,data_plan_id,airtime_amount,amount,tx_ref,payment_link,status")
      .eq("user_id", user.id)
      .eq("client_request_id", clientRequestId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existing) {
      const samePayload = existing.service_type === serviceType &&
        existing.network === network &&
        existing.recipient_phone === phone &&
        existing.data_plan_id === dataPlanId &&
        Number(existing.amount) === amount &&
        (serviceType !== "airtime" || Number(existing.airtime_amount) === airtimeAmount);
      if (!samePayload) return reply(req, { success: false, error: "This checkout request key was already used for different purchase details." }, 409);
      if (existing.status === "pending_payment" && existing.payment_link) {
        return reply(req, { success: true, payment_link: existing.payment_link, tx_ref: existing.tx_ref, reused: true });
      }
      return reply(req, { success: false, error: "This checkout request is already being processed. Check your order status before trying again.", tx_ref: existing.tx_ref }, 409);
    }

    const suffix = crypto.randomUUID().replaceAll("-", "").toUpperCase();
    const txRef = "DCDSVTU" + suffix;
    const oplugRequestId = "DCDSVTU" + (serviceType === "data" ? "DATA" : "AIR") + suffix;
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();

    const { data: order, error: insertError } = await db.from("dcds_vtu_orders").insert({
      user_id: user.id,
      client_request_id: clientRequestId,
      service_type: serviceType,
      network,
      network_id: networkId,
      recipient_phone: phone,
      data_plan_id: dataPlanId,
      data_plan_name: dataPlanName,
      data_plan_type: dataPlanType,
      data_validity: dataValidity,
      airtime_amount: airtimeAmount,
      amount,
      provider_cost: providerCost,
      currency: "NGN",
      tx_ref: txRef,
      oplug_request_id: oplugRequestId,
      checkout_expires_at: expiresAt,
      status: "pending_payment",
    }).select("id,tx_ref,amount,currency").single();
    if (insertError || !order) throw insertError || new Error("Could not create the VTU order.");

    let flwResponse: Response;
    try {
      flwResponse = await fetch("https://api.flutterwave.com/v3/payments", {
        method: "POST",
        headers: {
          Authorization: "Bearer " + flutterwaveKey,
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          tx_ref: txRef,
          amount: order.amount,
          currency: "NGN",
          redirect_url: SITE_URL + "/vtu-payment-return.html",
          session_duration: 60,
          max_retry_attempt: 3,
          customer: {
            email: user.email,
            name: clean(user.user_metadata?.full_name, 100) || user.email,
            phonenumber: phone,
          },
          meta: {
            dcds_order_type: "airtime_data",
            dcds_vtu_order_id: order.id,
            dcds_user_id: user.id,
            service_type: serviceType,
            network,
          },
          customizations: {
            title: "DCDS Airtime & Data",
            description: serviceType === "data" ? dataPlanName : network.toUpperCase() + " airtime top-up",
            logo: SITE_URL + "/assets/dcds-splash-icon-v4-192.png",
          },
        }),
        signal: AbortSignal.timeout(20000),
      });
    } catch {
      await db.from("dcds_vtu_orders").update({
        status: "needs_review",
        last_error: "Flutterwave checkout creation timed out or could not be confirmed.",
        updated_at: new Date().toISOString(),
      }).eq("id", order.id).eq("status", "pending_payment");
      return reply(req, {
        success: false,
        error: "We could not confirm whether Flutterwave created this checkout. Do not retry or make another payment until DCDS support checks this reference.",
        tx_ref: txRef,
      }, 502);
    }
    const flw = await flwResponse.json().catch(() => null);
    if (!flwResponse.ok || flw?.status !== "success" || typeof flw?.data?.link !== "string") {
      await db.from("dcds_vtu_orders").update({
        status: flwResponse.status >= 400 && flwResponse.status < 500 ? "failed" : "needs_review",
        last_error: "Flutterwave checkout creation could not be confirmed.",
        updated_at: new Date().toISOString(),
      }).eq("id", order.id).eq("status", "pending_payment");
      return reply(req, { success: false, error: flw?.message || "Flutterwave could not create a payment link. No top-up has been sent.", tx_ref: txRef }, 502);
    }

    const { error: linkSaveError } = await db.from("dcds_vtu_orders")
      .update({ payment_link: flw.data.link, updated_at: new Date().toISOString() })
      .eq("id", order.id);
    if (linkSaveError) console.error("Could not persist VTU checkout link:", linkSaveError.message);

    return reply(req, { success: true, payment_link: flw.data.link, tx_ref: txRef, amount: order.amount, currency: "NGN" });
  } catch (error) {
    console.error("DCDS VTU checkout creation failed:", error instanceof Error ? error.message : "Unknown error");
    return reply(req, { success: false, error: "Unable to start checkout. No airtime or data purchase has been submitted." }, 500);
  }
});
