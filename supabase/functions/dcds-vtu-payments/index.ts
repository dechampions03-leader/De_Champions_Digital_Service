import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SITE_URL = "https://dechampions03-leader.github.io/De_Champions_Digital_Service";
const API_BASE = "https://www.oplug.com.ng/api/v1";
const NETWORKS: Record<string, number> = { mtn: 1, glo: 2, "9mobile": 3, airtel: 4 };

function cors(req: Request) {
  const origin = req.headers.get("Origin") || "";
  const allowed = origin === "https://dechampions03-leader.github.io" ||
    origin === "https://dechampionsdigital.com" ||
    origin === "https://www.dechampionsdigital.com" ||
    /\.dcds-dev-auth-preview\.pages\.dev$/i.test(new URL(origin || SITE_URL).hostname);
  const headers: Record<string, string> = {
    "Access-Control-Allow-Headers": "authorization, apikey, x-client-info, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json",
    "Cache-Control": "no-store",
    "Vary": "Origin",
  };
  if (allowed && origin) headers["Access-Control-Allow-Origin"] = origin;
  return headers;
}

function reply(req: Request, body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: cors(req) });
}

function networkCode(value: unknown, id?: unknown): string {
  const name = String(value || "").trim().toLowerCase();
  if (name.includes("mtn")) return "mtn";
  if (name.includes("glo")) return "glo";
  if (name.includes("9mobile") || name.includes("9 mobile")) return "9mobile";
  if (name.includes("airtel")) return "airtel";
  return NETWORKS[Object.keys(NETWORKS).find((key) => NETWORKS[key] === Number(id)) || ""] ? 
    (Object.keys(NETWORKS).find((key) => NETWORKS[key] === Number(id)) || "") : "";
}

function normalizePhone(value: unknown): string {
  let phone = String(value || "").replace(/[\s()-]/g, "");
  if (phone.startsWith("+234")) phone = "0" + phone.slice(4);
  else if (phone.startsWith("234")) phone = "0" + phone.slice(3);
  if (!/^0[789]\d{9}$/.test(phone)) throw new Error("Enter a valid 11-digit Nigerian mobile number.");
  return phone;
}

async function readJson(response: Response) {
  return await response.json().catch(() => null) as Record<string, any> | null;
}

function getServiceConfig() {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("DCDS_SERVICE_ROLE_KEY") || Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const flutterwaveKey = Deno.env.get("FLW_SECRET_KEY");
  const oplugKey = Deno.env.get("OPLUG_API_KEY");
  if (!supabaseUrl || !serviceKey || !flutterwaveKey || !oplugKey) {
    throw new Error("Production payment/provider configuration is incomplete. Contact DCDS support.");
  }
  return { supabaseUrl, serviceKey, flutterwaveKey, oplugKey };
}

async function authenticateUser(req: Request, supabase: ReturnType<typeof createClient>) {
  const authorization = req.headers.get("Authorization") || "";
  if (!authorization.startsWith("Bearer ")) return null;
  const { data, error } = await supabase.auth.getUser(authorization.slice(7));
  if (error || !data.user) return null;
  if (!data.user.email || (!data.user.email_confirmed_at && !data.user.phone_confirmed_at)) {
    throw new Error("Verify your DCDS account email address or mobile number before buying.");
  }
  return data.user;
}

async function oplugRequest(key: string, path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers || {});
  headers.set("Authorization", "Token " + key);
  headers.set("Accept", "application/json");
  if (init.body) headers.set("Content-Type", "application/json");
  const response = await fetch(API_BASE + path, {
    ...init,
    headers,
    signal: init.signal || AbortSignal.timeout(12000),
  });
  const data = await readJson(response);
  return { response, data };
}

async function loadProviderPricing(key: string, service: string, network: string, planId: string | null, airtimeAmount: number | null) {
  const [balanceResult, networksResult, plansResult] = await Promise.all([
    oplugRequest(key, "/balance"),
    oplugRequest(key, "/get-networks"),
    service === "data" ? oplugRequest(key, "/data_plans") : Promise.resolve(null),
  ]);

  const balanceData = balanceResult.data;
  if (!balanceResult.response.ok || balanceData?.status !== "success" ||
      String(balanceData?.user?.status || "").toLowerCase() !== "active") {
    throw new Error("Oplug reseller account is not active or its balance could not be checked.");
  }

  const networkRows = Array.isArray(networksResult.data?.networks) ? networksResult.data.networks : [];
  if (!networksResult.response.ok || networksResult.data?.status !== "success") {
    throw new Error("Oplug network catalogue is temporarily unavailable.");
  }
  const networkRow = networkRows.find((item: Record<string, unknown>) =>
    networkCode(item.name || item.code, item.id) === network
  );
  if (!networkRow || Number(networkRow.id) !== NETWORKS[network]) {
    throw new Error("The selected network is not currently available from Oplug.");
  }

  let customerAmount = 0;
  let providerCost = 0;
  let planName: string | null = null;
  let discountPercent = 0;

  if (service === "data") {
    const plans = Array.isArray(plansResult?.data?.plans) ? plansResult.data.plans : [];
    if (!plansResult?.response.ok || plansResult.data?.status !== "success") {
      throw new Error("Oplug data plans are temporarily unavailable.");
    }
    const plan = plans.find((item: Record<string, unknown>) =>
      String(item.id || "") === String(planId || "") &&
      networkCode(item.network, item.network_id) === network
    );
    if (!plan || !Number.isFinite(Number(plan.amount)) || Number(plan.amount) <= 0) {
      throw new Error("That data plan is no longer available. Refresh the catalogue and choose again.");
    }
    providerCost = Number(plan.amount);
    customerAmount = providerCost;
    planName = String(plan.plan || "Data bundle").slice(0, 100);
  } else {
    if (!airtimeAmount || !Number.isInteger(airtimeAmount) || airtimeAmount < 50 || airtimeAmount > 50000) {
      throw new Error("Airtime must be between ₦50 and ₦50,000.");
    }
    customerAmount = airtimeAmount;
    const discountRaw = String(networkRow.airtime_discount || "").replace("%", "").trim();
    const discount = Number(discountRaw);
    discountPercent = Number.isFinite(discount) && discount >= 0 && discount <= 50 ? discount : 0;
    providerCost = Math.round(customerAmount * (1 - discountPercent / 100) * 100) / 100;
  }

  const providerBalance = Number(balanceData?.user?.balance);
  if (!Number.isFinite(providerBalance) || providerBalance < providerCost) {
    throw new Error("DCDS airtime/data fulfilment is temporarily unavailable. Please try again later.");
  }

  return {
    networkId: Number(networkRow.id),
    providerCost,
    customerAmount,
    planName,
    discountPercent,
    providerBalance,
  };
}

async function verifyFlutterwave(transactionId: string, txRef: string, expectedAmount: number, key: string) {
  const response = await fetch(
    "https://api.flutterwave.com/v3/transactions/" + encodeURIComponent(transactionId) + "/verify",
    { method: "GET", headers: { Authorization: "Bearer " + key, Accept: "application/json" }, signal: AbortSignal.timeout(12000) },
  );
  const body = await readJson(response);
  const tx = body?.data;
  if (!response.ok || body?.status !== "success" || !tx ||
      String(tx.status || "").toLowerCase() !== "successful" ||
      String(tx.tx_ref || "") !== txRef ||
      String(tx.id || "") !== transactionId ||
      String(tx.currency || "").toUpperCase() !== "NGN" ||
      !Number.isFinite(Number(tx.amount)) ||
      Math.abs(Number(tx.amount) - expectedAmount) > 0.01) {
    throw new Error("Flutterwave has not verified the exact amount for this DCDS order.");
  }
  return body;
}

async function getOrder(db: ReturnType<typeof createClient>, txRef: string, userId?: string) {
  let query = db.from("dcds_vtu_orders").select("*").eq("tx_ref", txRef);
  if (userId) query = query.eq("user_id", userId);
  const { data, error } = await query.maybeSingle();
  if (error) throw new Error("Could not retrieve this DCDS top-up order.");
  if (!data) throw new Error("DCDS top-up order not found.");
  return data;
}

async function updateProviderStatus(db: ReturnType<typeof createClient>, order: Record<string, any>, status: string, providerData: unknown) {
  const now = new Date().toISOString();
  const updates: Record<string, unknown> = {
    fulfillment_status: status,
    provider_response: providerData,
    updated_at: now,
  };
  if (status === "successful") updates.fulfilled_at = now;
  const { error } = await db.from("dcds_vtu_orders").update(updates).eq("id", order.id);
  if (error) throw new Error("Could not save the Oplug delivery status.");
  return { ...order, ...updates };
}

async function reconcileOplug(db: ReturnType<typeof createClient>, order: Record<string, any>, key: string) {
  try {
    const query = "/verify-transaction?request-id=" + encodeURIComponent(String(order.provider_request_id));
    const result = await oplugRequest(key, query);
    const providerStatus = String(result.data?.transaction_status || "").toUpperCase();
    if (result.response.ok && result.data?.status === "success" && ["SUCCESS", "SUCCESSFUL"].includes(providerStatus)) {
      const updated = await updateProviderStatus(db, order, "successful", result.data);
      return { order: updated, status: "successful", providerReference: String(result.data["request-id"] || order.provider_reference || "") };
    }
    if (result.response.ok && result.data?.status === "success" && providerStatus === "FAILED") {
      const updated = await updateProviderStatus(db, order, "failed", result.data);
      return { order: updated, status: "failed", providerReference: String(result.data["request-id"] || order.provider_reference || "") };
    }
    if (result.response.ok && result.data?.status === "success" && providerStatus === "PROCESSING") {
      const updated = await updateProviderStatus(db, order, "processing", result.data);
      return { order: updated, status: "processing", providerReference: String(result.data["request-id"] || order.provider_reference || "") };
    }
    const updated = await updateProviderStatus(db, order, "uncertain", result.data || { message: "Oplug has not returned a final status." });
    return { order: updated, status: "uncertain", providerReference: "" };
  } catch {
    const updated = await updateProviderStatus(db, order, "uncertain", { message: "Provider status lookup is temporarily unavailable. Do not submit another purchase." });
    return { order: updated, status: "uncertain", providerReference: "" };
  }
}

async function fulfilOrder(db: ReturnType<typeof createClient>, initialOrder: Record<string, any>, key: string) {
  let order = initialOrder;
  if (order.fulfillment_status === "successful" || order.fulfillment_status === "failed") {
    return { order, status: order.fulfillment_status, providerReference: order.provider_reference || "" };
  }
  if (order.fulfillment_status === "processing" || order.fulfillment_status === "uncertain") {
    return await reconcileOplug(db, order, key);
  }

  const { data: claimed, error: claimError } = await db.from("dcds_vtu_orders")
    .update({ fulfillment_status: "processing", fulfillment_started_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("id", order.id)
    .eq("payment_status", "successful")
    .eq("fulfillment_status", "not_started")
    .select("*")
    .maybeSingle();
  if (claimError) throw new Error("Could not safely start top-up delivery.");
  if (!claimed) {
    const latest = await getOrder(db, String(order.tx_ref), String(order.user_id));
    return await reconcileOplug(db, latest, key);
  }
  order = claimed;

  const requestBody: Record<string, unknown> = {
    network: Number(order.network_id),
    phone: String(order.phone),
    bypass: false,
    "request-id": String(order.provider_request_id),
  };
  const route = order.service_type === "data" ? "/data" : "/airtime";
  if (order.service_type === "data") {
    requestBody.data_plan = String(order.data_plan_id);
  } else {
    requestBody.amount = String(Number(order.customer_amount));
    requestBody.type = "VTU";
  }

  let purchaseResponse: Response | null = null;
  let purchaseData: Record<string, any> | null = null;
  try {
    const result = await oplugRequest(key, route, { method: "POST", body: JSON.stringify(requestBody), signal: AbortSignal.timeout(15000) });
    purchaseResponse = result.response;
    purchaseData = result.data;
  } catch {
    // A timeout is not proof that Oplug rejected the purchase. Check the same
    // provider request-id and never issue a second POST from this code path.
    return await reconcileOplug(db, order, key);
  }

  const providerRef = String(purchaseData?.["request-id"] || "");
  if (purchaseResponse.ok && purchaseData?.status === "success") {
    const stored = { ...order, provider_reference: providerRef || null };
    if (providerRef) {
      await db.from("dcds_vtu_orders").update({ provider_reference: providerRef, provider_response: purchaseData, updated_at: new Date().toISOString() }).eq("id", order.id);
    }
    return await reconcileOplug(db, stored, key);
  }

  if (purchaseResponse.status === 400 || purchaseResponse.status === 422 || purchaseResponse.status === 401 || purchaseResponse.status === 403) {
    const failed = await updateProviderStatus(db, order, "failed", purchaseData || { message: "Oplug rejected the purchase request." });
    return { order: failed, status: "failed", providerReference: providerRef };
  }

  // Server errors, idempotency conflicts, and ambiguous results are reconciled
  // by request-id, never by blindly resending a live purchase.
  return await reconcileOplug(db, order, key);
}

async function confirmPaidOrder(db: ReturnType<typeof createClient>, order: Record<string, any>, transactionId: string, flutterwaveKey: string, oplugKey: string) {
  const verification = await verifyFlutterwave(transactionId, String(order.tx_ref), Number(order.customer_amount), flutterwaveKey);
  if (order.payment_status === "successful") {
    if (String(order.flutterwave_transaction_id) !== transactionId) throw new Error("A different Flutterwave transaction is already attached to this order.");
  } else {
    const { data: reused, error: reuseError } = await db.from("dcds_vtu_orders")
      .select("id").eq("flutterwave_transaction_id", transactionId).neq("id", order.id).maybeSingle();
    if (reuseError) throw new Error("Could not check whether this Flutterwave transaction was already used.");
    if (reused) throw new Error("This Flutterwave transaction has already been used for another order.");

    const { data: updated, error: updateError } = await db.from("dcds_vtu_orders")
      .update({
        payment_status: "successful",
        flutterwave_transaction_id: transactionId,
        payment_verified_at: new Date().toISOString(),
        payment_response: verification,
        updated_at: new Date().toISOString(),
      })
      .eq("id", order.id)
      .eq("payment_status", "pending")
      .select("*")
      .maybeSingle();
    if (updateError) throw new Error("Payment was verified but the DCDS order could not be updated.");
    if (updated) order = updated;
    else {
      order = await getOrder(db, String(order.tx_ref), String(order.user_id));
      if (order.payment_status !== "successful" || String(order.flutterwave_transaction_id) !== transactionId) {
        throw new Error("Payment verification is awaiting reconciliation. Please do not pay again.");
      }
    }
  }
  const result = await fulfilOrder(db, order, oplugKey);
  return {
    success: true,
    order_id: order.id,
    payment_status: "successful",
    fulfillment_status: result.status,
    provider_reference: result.providerReference || null,
    message: result.status === "successful"
      ? "Payment confirmed and your top-up was delivered."
      : result.status === "processing"
      ? "Payment confirmed. Your top-up is still processing; check this page again shortly."
      : result.status === "failed"
      ? "Payment was confirmed, but Oplug did not complete the top-up. Contact DCDS support for a refund review."
      : "Payment was confirmed. Delivery status is being reconciled. Do not make another payment or submit another top-up.",
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors(req) });
  if (req.method !== "POST") return reply(req, { success: false, error: "POST required." }, 405);

  let body: Record<string, any>;
  try {
    body = await req.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) throw new Error("Invalid JSON.");
  } catch {
    return reply(req, { success: false, error: "Invalid request body." }, 400);
  }

  try {
    const config = getServiceConfig();
    const db = createClient(config.supabaseUrl, config.serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const action = String(body.action || "");

    if (action === "confirm_webhook") {
      const authorization = req.headers.get("Authorization") || "";
      const allowedKeys = [Deno.env.get("DCDS_SERVICE_ROLE_KEY"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")].filter(Boolean);
      if (!allowedKeys.some((key) => authorization === "Bearer " + key)) {
        return reply(req, { success: false, error: "Unauthorized." }, 401);
      }
      const txRef = String(body.tx_ref || "");
      const transactionId = String(body.transaction_id || "");
      if (!/^DCDSVTU[A-F0-9]{32}$/.test(txRef) || !transactionId) {
        return reply(req, { success: false, error: "Invalid DCDS top-up reference." }, 400);
      }
      const order = await getOrder(db, txRef);
      const result = await confirmPaidOrder(db, order, transactionId, config.flutterwaveKey, config.oplugKey);
      return reply(req, result);
    }

    const user = await authenticateUser(req, db);
    if (!user) return reply(req, { success: false, error: "Sign in to your verified DCDS student account first." }, 401);

    if (action === "create_checkout") {
      const service = String(body.service || "");
      if (!["airtime", "data"].includes(service)) return reply(req, { success: false, error: "Choose airtime or data." }, 400);
      const network = String(body.network || "").toLowerCase();
      if (!(network in NETWORKS)) return reply(req, { success: false, error: "Select a supported Nigerian network." }, 400);
      const phone = normalizePhone(body.phone);
      const planId = service === "data" ? String(body.plan_id || "").slice(0, 80) : null;
      const amount = service === "airtime" ? Number(body.amount) : null;
      const pricing = await loadProviderPricing(config.oplugKey, service, network, planId, amount);

      const now = new Date();
      const { data: pending, error: pendingError } = await db.from("dcds_vtu_orders")
        .select("tx_ref,payment_link,checkout_expires_at")
        .eq("user_id", user.id)
        .eq("payment_status", "pending")
        .gt("checkout_expires_at", now.toISOString())
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (pendingError) throw new Error("Could not check your existing checkout.");
      if (pending) {
        if (pending.payment_link) return reply(req, {
          success: true,
          payment_link: pending.payment_link,
          tx_ref: pending.tx_ref,
          reused_checkout: true,
          message: "You already have a pending checkout. Reopen it to avoid paying twice.",
        });
        return reply(req, { success: false, error: "A checkout is already being created for your account. Refresh in a moment before trying again." }, 409);
      }

      const txRef = "DCDSVTU" + crypto.randomUUID().replaceAll("-", "").toUpperCase();
      const expires = new Date(Date.now() + 30 * 60 * 1000);
      const insert = {
        user_id: user.id,
        service_type: service,
        network_code: network,
        network_id: pricing.networkId,
        phone,
        data_plan_id: planId,
        data_plan_name: pricing.planName,
        customer_amount: pricing.customerAmount,
        provider_cost: pricing.providerCost,
        provider_discount_percent: pricing.discountPercent,
        currency: "NGN",
        tx_ref: txRef,
        provider_request_id: txRef,
        payment_status: "pending",
        fulfillment_status: "not_started",
        checkout_expires_at: expires.toISOString(),
      };
      const { data: order, error: insertError } = await db.from("dcds_vtu_orders").insert(insert).select("*").single();
      if (insertError || !order) {
        return reply(req, { success: false, error: "Could not create your top-up order. Please try again." }, 500);
      }

      let flwResponse: Response;
      let flwData: Record<string, any> | null;
      try {
        const response = await fetch("https://api.flutterwave.com/v3/payments", {
          method: "POST",
          headers: { Authorization: "Bearer " + config.flutterwaveKey, "Content-Type": "application/json", Accept: "application/json" },
          body: JSON.stringify({
            tx_ref: txRef,
            amount: pricing.customerAmount,
            currency: "NGN",
            redirect_url: SITE_URL + "/airtime-return.html",
            payment_options: "card",
            configuration: { session_duration: 30, max_retry_attempt: 3 },
            link_expiration: expires.toISOString(),
            customer: {
              email: user.email,
              name: String(user.user_metadata?.full_name || user.user_metadata?.name || user.email),
              phonenumber: phone,
            },
            meta: {
              dcds_order_id: order.id,
              dcds_service: service,
              dcds_user_id: user.id,
            },
            customizations: {
              title: "De Champions Digital Service",
              description: service === "data" ? "DCDS data bundle top-up" : "DCDS airtime top-up",
              logo: SITE_URL + "/assets/dcds-splash-icon-v4-192.png",
            },
          }),
          signal: AbortSignal.timeout(15000),
        });
        flwResponse = response;
        flwData = await readJson(response);
      } catch {
        // Network failure is ambiguous: leave the row pending so the same user
        // cannot accidentally create another live charge until it is reconciled.
        return reply(req, { success: false, tx_ref: txRef, error: "Flutterwave checkout could not be confirmed. Do not retry payment yet; contact DCDS support with this reference." }, 502);
      }

      if (!flwResponse.ok || flwData?.status !== "success" || !flwData.data?.link) {
        if (flwResponse.status >= 400 && flwResponse.status < 500) {
          await db.from("dcds_vtu_orders").update({ payment_status: "failed", updated_at: new Date().toISOString() }).eq("id", order.id).eq("payment_status", "pending");
        }
        return reply(req, { success: false, tx_ref: txRef, error: flwData?.message || "Flutterwave could not create the checkout link." }, 502);
      }

      const { error: linkError } = await db.from("dcds_vtu_orders")
        .update({ payment_link: flwData.data.link, updated_at: new Date().toISOString() })
        .eq("id", order.id);
      if (linkError) return reply(req, { success: false, tx_ref: txRef, error: "Checkout link was created but could not be saved. Contact DCDS support before paying." }, 500);

      return reply(req, {
        success: true,
        payment_link: flwData.data.link,
        tx_ref: txRef,
        amount: pricing.customerAmount,
        currency: "NGN",
      });
    }

    if (action === "confirm_payment") {
      const txRef = String(body.tx_ref || "");
      const transactionId = String(body.transaction_id || "");
      if (!/^DCDSVTU[A-F0-9]{32}$/.test(txRef) || !transactionId) {
        return reply(req, { success: false, error: "Flutterwave did not return the required payment details." }, 400);
      }
      const order = await getOrder(db, txRef, user.id);
      const result = await confirmPaidOrder(db, order, transactionId, config.flutterwaveKey, config.oplugKey);
      return reply(req, result);
    }

    if (action === "check_status") {
      const txRef = String(body.tx_ref || "");
      if (!/^DCDSVTU[A-F0-9]{32}$/.test(txRef)) return reply(req, { success: false, error: "Invalid top-up reference." }, 400);
      const order = await getOrder(db, txRef, user.id);
      if (order.payment_status !== "successful") {
        return reply(req, { success: true, payment_status: order.payment_status, fulfillment_status: order.fulfillment_status, message: "Flutterwave payment has not been confirmed yet." });
      }
      const result = await reconcileOplug(db, order, config.oplugKey);
      return reply(req, {
        success: true,
        order_id: order.id,
        payment_status: "successful",
        fulfillment_status: result.status,
        provider_reference: result.providerReference || null,
        message: result.status === "successful" ? "Your top-up was delivered." :
          result.status === "failed" ? "Oplug reports that the top-up failed. Contact DCDS support for a refund review." :
          "Your top-up is still being reconciled. Do not submit another purchase.",
      });
    }

    return reply(req, { success: false, error: "Unsupported action." }, 400);
  } catch (error) {
    console.error("DCDS VTU payment error:", error instanceof Error ? error.message : "Unknown error");
    return reply(req, { success: false, error: error instanceof Error ? error.message : "Unable to process the top-up request." }, 400);
  }
});
