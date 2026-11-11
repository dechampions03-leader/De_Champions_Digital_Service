import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const json = (body: Record<string, unknown>, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });


function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return result === 0;
}

async function processInternationalTransferWebhook(
  payload: Record<string, unknown>,
  supabaseUrl: string,
  serviceRoleKey: string,
  flutterwaveSecret: string,
): Promise<Response | null> {
  const event = String(payload.event || "").toLowerCase();
  const eventType = String(payload["event.type"] || "").toLowerCase();
  const isTransferEvent = event.startsWith("transfer.") || eventType === "transfer" || eventType.includes("transfer");
  if (!isTransferEvent) return null;

  const data = payload.data && typeof payload.data === "object" && !Array.isArray(payload.data)
    ? payload.data as Record<string, unknown>
    : {};
  const transferId = String(data.id ?? "").trim();
  const transferReference = String(data.reference ?? "").trim();
  if (!transferId) return json({ received: true });

  try {
    const db = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: requestById, error: idLookupError } = await db
      .from("dcds_international_payout_requests")
      .select("*")
      .eq("provider_transfer_id", transferId)
      .maybeSingle();
    if (idLookupError) throw idLookupError;

    let payoutRequest = requestById;
    if (!payoutRequest && transferReference) {
      const { data: requestByReference, error: referenceLookupError } = await db
        .from("dcds_international_payout_requests")
        .select("*")
        .eq("transfer_reference", transferReference)
        .maybeSingle();
      if (referenceLookupError) throw referenceLookupError;
      payoutRequest = requestByReference;

      if (
        payoutRequest &&
        ["processing", "manual_review"].includes(payoutRequest.status) &&
        !payoutRequest.provider_transfer_id
      ) {
        const { error: attachError } = await db.rpc("dcds_internal_transition_international_payout", {
          p_request_id: payoutRequest.id,
          p_new_status: payoutRequest.status,
          p_provider_transfer_id: transferId,
          p_details: { stage: "webhook_transfer_id_attached" },
        });
        if (attachError) throw attachError;
        payoutRequest.provider_transfer_id = transferId;
      }
    }

    // The shared endpoint also receives domestic transfers and unrelated merchant transfers.
    // Only a transfer with a matching DCDS international payout request is processed.
    if (
      !payoutRequest ||
      !["processing", "manual_review", "paid", "failed", "cancelled"].includes(payoutRequest.status)
    ) {
      return json({ received: true });
    }

    const verifyResponse = await fetch(
      "https://api.flutterwave.com/v3/transfers/" + encodeURIComponent(transferId),
      {
        method: "GET",
        headers: {
          Authorization: "Bearer " + flutterwaveSecret,
          Accept: "application/json",
        },
      },
    );
    const verification = await verifyResponse.json().catch(() => null);
    const providerData = verification?.data as Record<string, unknown> | undefined;
    if (!verifyResponse.ok || verification?.status !== "success" || !providerData) {
      throw new Error("Flutterwave transfer status could not be verified.");
    }

    const verifiedReference = String(providerData.reference || "");
    const currency = String(providerData.currency || "").toUpperCase();
    const amount = Number(providerData.amount);
    const status = String(providerData.status || "").toLowerCase();

    if (
      verifiedReference !== payoutRequest.transfer_reference ||
      currency !== String(payoutRequest.destination_currency).toUpperCase() ||
      !Number.isFinite(amount) ||
      Math.abs(amount - Number(payoutRequest.destination_amount)) > 0.02
    ) {
      const { error: mismatchError } = await db.rpc("dcds_internal_transition_international_payout", {
        p_request_id: payoutRequest.id,
        p_new_status: "manual_review",
        p_provider_transfer_id: transferId,
        p_failure_reason: "Webhook transfer details did not match the DCDS request.",
        p_details: {
          stage: "webhook_verification_mismatch",
          provider_reference: verifiedReference,
          provider_currency: currency,
        },
      });
      if (mismatchError) throw mismatchError;
      return json({ received: true });
    }

    if (["successful", "success", "completed"].includes(status)) {
      const { error: transitionError } = await db.rpc("dcds_internal_transition_international_payout", {
        p_request_id: payoutRequest.id,
        p_new_status: "paid",
        p_provider_transfer_id: transferId,
        p_details: { stage: "verified_webhook", provider_status: status },
      });
      if (transitionError) throw transitionError;
    } else if (["failed", "reversed"].includes(status)) {
      const { error: transitionError } = await db.rpc("dcds_internal_transition_international_payout", {
        p_request_id: payoutRequest.id,
        p_new_status: "failed",
        p_provider_transfer_id: transferId,
        p_failure_reason: "Flutterwave webhook and transfer lookup report " + status + ".",
        p_details: { stage: "verified_webhook", provider_status: status },
      });
      if (transitionError) throw transitionError;
    }

    const { error: auditError } = await db.from("dcds_international_payout_events").insert({
      request_id: payoutRequest.id,
      user_id: payoutRequest.user_id,
      event_type: "provider_webhook_received",
      provider_event_key: "flutterwave-transfer:" + transferId + ":" + status,
      details: { provider_status: status, verified: true },
    });
    if (auditError && auditError.code !== "23505") throw auditError;

    return json({ received: true });
  } catch (error) {
    console.error(
      "DCDS international payout webhook processing error:",
      error instanceof Error ? error.message : "Unknown error",
    );
    // A non-200 response lets Flutterwave retry an event that DCDS could not safely reconcile.
    return json({ received: false }, 500);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const secretHash = Deno.env.get("FLW_WEBHOOK_HASH") || Deno.env.get("FLW_SECRET_HASH");
  const flwSecret = Deno.env.get("FLW_SECRET_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!secretHash || !flwSecret || !supabaseUrl || !serviceRoleKey) {
    console.error("Webhook configuration is incomplete.");
    return json({ error: "Webhook is not configured" }, 500);
  }

  const signature = req.headers.get("verif-hash");
  if (!signature || !secretHash || !constantTimeEqual(secretHash, signature)) {
    return json({ error: "Unauthorized" }, 401);
  }

  try {
    const payload = await req.json();
    const transferResponse = await processInternationalTransferWebhook(
      payload as Record<string, unknown>,
      supabaseUrl,
      serviceRoleKey,
      flwSecret,
    );
    if (transferResponse) return transferResponse;

    const transactionId = payload?.data?.id;

    // Acknowledge unrelated Flutterwave events without changing records.
    if (transactionId === undefined || transactionId === null || String(transactionId).trim() === "") {
      return json({ received: true });
    }

    const verifyResponse = await fetch(
      `https://api.flutterwave.com/v3/transactions/${encodeURIComponent(String(transactionId))}/verify`,
      {
        method: "GET",
        headers: { Authorization: `Bearer ${flwSecret}`, Accept: "application/json" },
      },
    );

    const verification = await verifyResponse.json().catch(() => null);
    const tx = verification?.data;

    if (!verifyResponse.ok || verification?.status !== "success" || !tx || tx.status !== "successful") {
      console.warn("Flutterwave transaction verification was unsuccessful.");
      return json({ error: "Transaction verification unsuccessful" }, 400);
    }

    const txRef = String(tx.tx_ref ?? "").trim();
    const verifiedId = String(tx.id ?? "").trim();
    const amount = Number(tx.amount);
    const currency = String(tx.currency ?? "").toUpperCase();

    if (!txRef || !verifiedId || !Number.isFinite(amount) || amount <= 0 || !currency) {
      return json({ error: "Verified transaction is missing required details" }, 400);
    }

    const db = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: order, error: orderError } = await db
      .from("orders")
      .select("id,user_id,course_id,amount,currency,status,tx_ref")
      .eq("tx_ref", txRef)
      .maybeSingle();

    if (orderError) {
      console.error("Order lookup failed:", orderError.message);
      return json({ error: "Could not verify order" }, 500);
    }
    if (!order) return json({ error: "Order not found" }, 404);

    if (order.status !== "pending" && order.status !== "successful") {
      return json({ error: "Order is not eligible for payment completion" }, 409);
    }

    const amountMatches = amount === Number(order.amount);
    const currencyMatches = currency === String(order.currency).toUpperCase();
    if (!amountMatches || !currencyMatches || String(order.tx_ref) !== txRef) {
      console.warn("Verified payment did not match its order.", { orderId: order.id, txRef });
      return json({ error: "Payment details do not match the order" }, 400);
    }

    // Prevent a Flutterwave transaction or reference from being attached to another order.
    const { data: transactionUse, error: transactionLookupError } = await db
      .from("payments")
      .select("id,order_id,tx_ref")
      .eq("transaction_id", verifiedId)
      .maybeSingle();

    if (transactionLookupError) {
      console.error("Transaction lookup failed:", transactionLookupError.message);
      return json({ error: "Could not check transaction reuse" }, 500);
    }
    if (transactionUse && (transactionUse.order_id !== order.id || transactionUse.tx_ref !== txRef)) {
      return json({ error: "Transaction has already been used" }, 409);
    }

    const { data: referenceUse, error: referenceLookupError } = await db
      .from("payments")
      .select("id,order_id,transaction_id")
      .eq("tx_ref", txRef)
      .maybeSingle();

    if (referenceLookupError) {
      console.error("Payment reference lookup failed:", referenceLookupError.message);
      return json({ error: "Could not check payment reference" }, 500);
    }
    if (referenceUse && (referenceUse.order_id !== order.id || String(referenceUse.transaction_id) !== verifiedId)) {
      return json({ error: "Payment reference has already been used" }, 409);
    }

    const paymentRecord = {
      order_id: order.id,
      user_id: order.user_id,
      provider: "flutterwave",
      transaction_id: verifiedId,
      tx_ref: txRef,
      amount,
      currency,
      status: "successful",
      raw_response: verification,
    };

    const paymentWrite = referenceUse
      ? await db.from("payments").update(paymentRecord).eq("id", referenceUse.id)
      : await db.from("payments").insert(paymentRecord);

    if (paymentWrite.error) {
      console.error("Payment record write failed:", paymentWrite.error.message);
      return json({ error: "Could not save verified payment" }, 500);
    }

    if (order.status !== "successful") {
      const { error: orderUpdateError } = await db
        .from("orders")
        .update({ status: "successful", updated_at: new Date().toISOString() })
        .eq("id", order.id)
        .eq("status", "pending");

      if (orderUpdateError) {
        console.error("Order update failed:", orderUpdateError.message);
        return json({ error: "Payment verified but order update failed" }, 500);
      }
    }

    // Preserve an existing enrolment (including an admin grant); create one only if absent.
    const { data: enrollment, error: enrollmentLookupError } = await db
      .from("enrollments")
      .select("id")
      .eq("user_id", order.user_id)
      .eq("course_id", order.course_id)
      .maybeSingle();

    if (enrollmentLookupError) {
      console.error("Enrollment lookup failed:", enrollmentLookupError.message);
      return json({ error: "Payment recorded but enrollment lookup failed" }, 500);
    }

    if (!enrollment) {
      const { error: enrollmentInsertError } = await db.from("enrollments").insert({
        user_id: order.user_id,
        course_id: order.course_id,
        order_id: order.id,
        enrollment_source: "purchase",
      });

      if (enrollmentInsertError) {
        // A concurrent webhook or verification request may have created it.
        const { data: retryEnrollment, error: retryError } = await db
          .from("enrollments")
          .select("id")
          .eq("user_id", order.user_id)
          .eq("course_id", order.course_id)
          .maybeSingle();

        if (retryError || !retryEnrollment) {
          console.error("Enrollment creation failed:", enrollmentInsertError.message);
          return json({ error: "Payment recorded but enrollment could not be confirmed" }, 500);
        }
      }
    }

    return json({ received: true, processed: true });
  } catch (error) {
    console.error("Flutterwave webhook processing failed:", error);
    return json({ error: "Webhook processing failed" }, 500);
  }
});