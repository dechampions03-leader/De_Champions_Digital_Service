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
    const vtpassApiKey = Deno.env.get("VTPASS_API_KEY") || "";
    const vtpassPublicKey = Deno.env.get("VTPASS_PUBLIC_KEY") || "";
    const vtpassBase = (Deno.env.get("VTPASS_API_BASE_URL") || "https://sandbox.vtpass.com/api").replace(/\/+$/, "");
    const vtpassHost = new URL(vtpassBase);
    if (vtpassHost.protocol !== "https:" || !["sandbox.vtpass.com", "vtpass.com"].includes(vtpassHost.hostname)) {
      return reply(req, { success: false, error: "VTpass API base URL is not valid." }, 503);
    }
    if (!supabaseUrl || !adminKey || !flutterwaveKey || !vtpassApiKey || !vtpassPublicKey) {
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

    if (serviceType === "data") {
      const requestedPlanId = clean(body.plan_id, 100);
      if (!requestedPlanId) return reply(req, { success: false, error: "Select a data bundle first." }, 400);
      const serviceID = ({ mtn: "mtn-data", airtel: "airtel-data", glo: "glo-data", "9mobile": "etisalat-data" } as Record<string, string>)[network];
      const catalogueResponse = await fetch(vtpassBase + "/service-variations?serviceID=" + encodeURIComponent(serviceID), {
        headers: { "api-key": vtpassApiKey, "public-key": vtpassPublicKey, Accept: "application/json" },
        signal: AbortSignal.timeout(12000),
      });
      const catalogue = await catalogueResponse.json().catch(() => null);
      const variations = catalogue?.content?.variations ?? catalogue?.content?.varations;
      if (!catalogueResponse.ok || catalogue?.response_description !== "000" || !Array.isArray(variations)) {
        return reply(req, { success: false, error: "The VTpass data catalogue is temporarily unavailable. No payment has been started." }, 502);
      }
      const plan = variations.find((item: Record<string, unknown>) => String(item.variation_code) === requestedPlanId);
      if (!plan) return reply(req, { success: false, error: "That bundle is no longer available on this network. Refresh the catalogue and select another plan." }, 409);
      amount = money(plan.variation_amount);
      providerCost = amount;
      dataPlanId = requestedPlanId;
      dataPlanName = clean(plan.name, 120);
      dataPlanType = "Data bundle";
      const matchValidity = dataPlanName.match(/(?:\d+\s*(?:hours?|hrs?|days?|weeks?|months?))/i);
      dataValidity = matchValidity?.[0] || null;
      if (!amount || !dataPlanName) return reply(req, { success: false, error: "VTpass returned an invalid price for this bundle." }, 502);
    } else {
      const requestedAmount = money(body.amount);
      if (!Number.isInteger(requestedAmount) || requestedAmount < 50 || requestedAmount > 50000) {
        return reply(req, { success: false, error: "Airtime must be between ₦50 and ₦50,000." }, 400);
      }
      amount = requestedAmount;
      airtimeAmount = requestedAmount;
      providerCost = requestedAmount;
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

    // Prevent a fresh request-id from creating another charge while this user
    // has an existing unpaid, paid, processing or unresolved order.
    const { data: openOrder, error: openOrderError } = await db
      .from("dcds_vtu_orders")
      .select("service_type,network,recipient_phone,data_plan_id,airtime_amount,amount,tx_ref,payment_link,status")
      .eq("user_id", user.id)
      .in("status", ["pending_payment", "paid", "processing", "needs_review"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (openOrderError) throw openOrderError;
    if (openOrder) {
      const sameOrder = openOrder.service_type === serviceType &&
        openOrder.network === network &&
        openOrder.recipient_phone === phone &&
        openOrder.data_plan_id === dataPlanId &&
        Number(openOrder.amount) === amount &&
        (serviceType !== "airtime" || Number(openOrder.airtime_amount) === airtimeAmount);
      if (openOrder.status === "pending_payment" && sameOrder && openOrder.payment_link) {
        return reply(req, {
          success: true,
          payment_link: openOrder.payment_link,
          tx_ref: openOrder.tx_ref,
          reused: true,
          message: "Your existing Flutterwave checkout has been reopened. Do not create another payment.",
        });
      }
      return reply(req, {
        success: false,
        error: "You already have an Airtime & Data order awaiting payment or delivery. Check that order before starting another purchase.",
        tx_ref: openOrder.tx_ref,
        status: openOrder.status,
      }, 409);
    }

    const suffix = crypto.randomUUID().replaceAll("-", "").toUpperCase();
    const txRef = "DCDSVTU" + suffix;
    const lagos = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
    const part = (type: string) => lagos.find((item) => item.type === type)?.value || "";
    const vtpassRequestId = part("year") + part("month") + part("day") + part("hour") + part("minute") + crypto.randomUUID().replaceAll("-", "").slice(0, 12);
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
      oplug_request_id: vtpassRequestId, // Legacy column retained for compatibility; stores the VTpass request ID.
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
          configuration: {
            session_duration: 60,
            max_retry_attempt: 3,
          },
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
