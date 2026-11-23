/**
 * DCDS Verified+ recurring payment provider adapter for Flutterwave V3.
 *
 * This module is transport-injectable and never reads secrets from the browser.
 * Supply the secret key only from a trusted server-side Edge Function.
 * It does not write to DCDS databases or grant memberships.
 */

import {
  VERIFIED_PLUS_PLAN_TERMS,
  validateRecurringBillingConsent,
  type RecurringBillingConsentProof,
  type VerifiedPlusPlanId,
} from "./membership-billing.ts";

export interface FlutterwavePlanReference {
  readonly id: number;
  readonly amount: number;
  readonly currency: string;
  readonly interval: string;
  readonly status?: string;
}

export interface FlutterwaveCheckoutInput {
  readonly txRef: string;
  readonly planId: VerifiedPlusPlanId;
  /** Provider plan ID obtained from trusted server configuration/storage. */
  readonly providerPlanId: number;
  readonly email: string;
  readonly customerName?: string;
  readonly redirectUrl: string;
  /** Opaque DCDS membership-order reference; never put identity evidence here. */
  readonly membershipOrderReference: string;
  /** Authenticated member ID resolved by server code, never from browser metadata. */
  readonly memberId: string;
  /** Previously persisted, explicit, unticked-control consent evidence. */
  readonly consent: RecurringBillingConsentProof | null;
}

export interface FlutterwaveCheckoutResult {
  readonly checkoutUrl: string;
  readonly transactionReference: string;
}

export interface FlutterwaveCancellationResult {
  readonly subscriptionId: string;
  readonly status: "cancelled";
}

export interface FlutterwaveVerifiedTransaction {
  readonly id: number | string;
  readonly tx_ref: string;
  readonly amount: number;
  readonly currency: string;
  readonly status: string;
  readonly payment_type?: string;
  readonly customer?: { email?: string };
}

export interface FlutterwaveSubscriptionRecord {
  readonly id: number | string;
  readonly amount?: number;
  readonly plan?: number | string;
  readonly status?: string;
  readonly customer?: { customer_email?: string; email?: string };
}

export interface FlutterwaveSubscriptionLookup {
  readonly transactionId?: string;
  readonly email?: string;
  readonly planId?: number;
}

export class FlutterwaveRecurringPaymentError extends Error {
  constructor(
    public readonly code:
      | "CONFIGURATION"
      | "INVALID_INPUT"
      | "PROVIDER_HTTP"
      | "PROVIDER_REJECTED"
      | "PROVIDER_RESPONSE"
      | "PLAN_MISMATCH"
      | "TRANSACTION_MISMATCH"
      | "SUBSCRIPTION_MISMATCH"
      | "CONSENT_REQUIRED"
      | "CONSENT_INVALID"
      | "PROVIDER_INTERVAL_NOT_VALIDATED",
    message: string,
    public readonly httpStatus?: number,
  ) {
    super(message);
    this.name = "FlutterwaveRecurringPaymentError";
  }
}

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

interface FlutterwaveEnvelope<T> {
  status?: string;
  message?: string;
  data?: T;
}

export interface FlutterwaveRecurringPaymentOptions {
  readonly secretKey: string;
  readonly baseUrl?: string;
  readonly fetcher?: Fetcher;
  readonly timeoutMs?: number;
  /** Defaults to Test mode. Live mode must be an explicit future release choice. */
  readonly environment?: "test" | "live";
  /** Only plans that passed their exact Flutterwave sandbox interval tests. */
  readonly validatedPlanIds?: readonly VerifiedPlusPlanId[];
}

function isPositiveInteger(value: number): boolean {
  return Number.isSafeInteger(value) && value > 0;
}

function validEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function validDcdsReference(value: string): boolean {
  return /^DCDS-VP-[0-9a-f-]{36}$/i.test(value);
}

const PLAN_LABELS: Readonly<Record<VerifiedPlusPlanId, string>> = {
  monthly: "Monthly",
  annual: "Annual",
  five_year: "Five-Year",
};

export class FlutterwaveRecurringPayments {
  private readonly secretKey: string;
  private readonly baseUrl: string;
  private readonly fetcher: Fetcher;
  private readonly timeoutMs: number;
  private readonly validatedPlanIds: ReadonlySet<VerifiedPlusPlanId>;

  constructor(options: FlutterwaveRecurringPaymentOptions) {
    const secretKey = options.secretKey.trim();
    if (!secretKey) {
      throw new FlutterwaveRecurringPaymentError(
        "CONFIGURATION",
        "Flutterwave server secret is not configured.",
      );
    }
    const environment = options.environment ?? "test";
    const isTestKey = secretKey.startsWith("FLWSECK_TEST-");
    const isRecognizedLiveKey = secretKey.startsWith("FLWSECK-") && !isTestKey;
    if ((environment === "test" && !isTestKey) || (environment === "live" && !isRecognizedLiveKey)) {
      throw new FlutterwaveRecurringPaymentError(
        "CONFIGURATION",
        "Flutterwave key prefix does not match the explicitly selected payment environment.",
      );
    }

    this.secretKey = secretKey;
    this.baseUrl = (options.baseUrl ?? "https://api.flutterwave.com/v3").replace(/\/$/, "");
    this.fetcher = options.fetcher ?? fetch;
    this.timeoutMs = options.timeoutMs ?? 15000;
    this.validatedPlanIds = new Set(options.validatedPlanIds ?? []);
    if (!Number.isSafeInteger(this.timeoutMs) || this.timeoutMs < 1000 || this.timeoutMs > 60000) {
      throw new FlutterwaveRecurringPaymentError("CONFIGURATION", "The provider request timeout is invalid.");
    }
  }

  private async request<T>(
    path: string,
    method: "GET" | "POST" | "PUT",
    body?: Record<string, unknown>,
  ): Promise<T> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetcher(this.baseUrl + path, {
        method,
        headers: {
          Authorization: "Bearer " + this.secretKey,
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {}),
        },
        ...(body ? { body: JSON.stringify(body) } : {}),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null) as FlutterwaveEnvelope<T> | null;

      if (!response.ok) {
        throw new FlutterwaveRecurringPaymentError(
          "PROVIDER_HTTP",
          "Flutterwave returned HTTP " + response.status + ".",
          response.status,
        );
      }
      if (!payload || payload.status !== "success" || payload.data == null) {
        throw new FlutterwaveRecurringPaymentError(
          "PROVIDER_REJECTED",
          "Flutterwave did not confirm the requested operation.",
          response.status,
        );
      }
      return payload.data;
    } catch (error) {
      if (error instanceof FlutterwaveRecurringPaymentError) throw error;
      if (error instanceof Error && error.name === "AbortError") {
        throw new FlutterwaveRecurringPaymentError("PROVIDER_HTTP", "Flutterwave request timed out.");
      }
      throw new FlutterwaveRecurringPaymentError("PROVIDER_HTTP", "Flutterwave could not be reached.");
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * Creates one provider payment plan. Run only from a trusted operator task,
   * then store the returned ID in restricted server configuration/database.
   * Do not call this for every customer checkout.
   */
  async createPaymentPlan(planId: VerifiedPlusPlanId): Promise<FlutterwavePlanReference> {
    const terms = VERIFIED_PLUS_PLAN_TERMS[planId];
    if (!terms) {
      throw new FlutterwaveRecurringPaymentError("INVALID_INPUT", "Unknown Verified+ membership plan.");
    }

    const data = await this.request<FlutterwavePlanReference>(
      "/payment-plans",
      "POST",
      {
        amount: terms.amount,
        currency: terms.currency,
        name: "DCDS Verified+ " + PLAN_LABELS[planId] + " NGN",
        interval: terms.renewalInterval.providerIntervalText,
        // No duration: continue until the member cancels. Five-Year remains
        // one charge every five years, never five annual or 60 monthly charges.
      },
    );

    if (
      !isPositiveInteger(Number(data.id)) ||
      Number(data.amount) !== terms.amount ||
      String(data.currency ?? "").toUpperCase() !== terms.currency ||
      String(data.interval ?? "").toLowerCase() !== terms.renewalInterval.providerIntervalText.toLowerCase()
    ) {
      throw new FlutterwaveRecurringPaymentError(
        "PLAN_MISMATCH",
        "Flutterwave created a plan whose amount, currency or billing interval did not match DCDS.",
      );
    }
    return { ...data, id: Number(data.id), amount: Number(data.amount), currency: String(data.currency).toUpperCase() };
  }

  /**
   * Starts only the first hosted charge. Flutterwave subscribes the customer
   * to the plan after this initial charge is successful.
   */
  async createSubscriptionCheckout(input: FlutterwaveCheckoutInput): Promise<FlutterwaveCheckoutResult> {
    const terms = VERIFIED_PLUS_PLAN_TERMS[input.planId];
    if (
      !terms ||
      !validDcdsReference(input.txRef) ||
      !validEmail(input.email) ||
      !isPositiveInteger(input.providerPlanId) ||
      !validDcdsReference(input.membershipOrderReference) ||
      typeof input.memberId !== "string" ||
      !input.memberId.trim()
    ) {
      throw new FlutterwaveRecurringPaymentError("INVALID_INPUT", "The Verified+ checkout details are invalid.");
    }

    const consentDecision = validateRecurringBillingConsent({
      memberId: input.memberId,
      planId: input.planId,
      consent: input.consent,
      providerIntervalValidated: this.validatedPlanIds.has(input.planId),
    });
    if (!consentDecision.allowed) {
      if (consentDecision.code === "CONSENT_REQUIRED") {
        throw new FlutterwaveRecurringPaymentError("CONSENT_REQUIRED", consentDecision.reason);
      }
      if (consentDecision.code === "PROVIDER_INTERVAL_NOT_VALIDATED") {
        throw new FlutterwaveRecurringPaymentError("PROVIDER_INTERVAL_NOT_VALIDATED", consentDecision.reason);
      }
      throw new FlutterwaveRecurringPaymentError("CONSENT_INVALID", consentDecision.reason);
    }
    let redirect: URL;
    try {
      redirect = new URL(input.redirectUrl);
    } catch {
      throw new FlutterwaveRecurringPaymentError("INVALID_INPUT", "The checkout return URL is invalid.");
    }
    if (redirect.protocol !== "https:" || redirect.hostname !== "dechampions03-leader.github.io") {
      throw new FlutterwaveRecurringPaymentError("INVALID_INPUT", "The checkout return URL is not an approved DCDS HTTPS destination.");
    }

    const data = await this.request<{ link?: string }>(
      "/payments",
      "POST",
      {
        tx_ref: input.txRef,
        amount: terms.amount,
        currency: terms.currency,
        redirect_url: redirect.toString(),
        payment_plan: input.providerPlanId,
        customer: {
          email: input.email,
          ...(input.customerName ? { name: input.customerName.slice(0, 120) } : {}),
        },
        meta: {
          dcds_product: "verified_plus",
          dcds_plan: input.planId,
          dcds_membership_order: input.membershipOrderReference,
        },
        customizations: {
          title: "De Champions Digital Service",
          description: "Verified+ " + PLAN_LABELS[input.planId] + " membership",
        },
      },
    );

    let checkout: URL;
    try {
      checkout = new URL(String(data.link ?? ""));
    } catch {
      throw new FlutterwaveRecurringPaymentError("PROVIDER_RESPONSE", "Flutterwave did not return a valid hosted checkout link.");
    }
    if (checkout.protocol !== "https:" || checkout.hostname !== "checkout.flutterwave.com") {
      throw new FlutterwaveRecurringPaymentError("PROVIDER_RESPONSE", "Flutterwave returned an unapproved checkout destination.");
    }
    return { checkoutUrl: checkout.toString(), transactionReference: input.txRef };
  }

  async cancelSubscription(subscriptionId: string): Promise<FlutterwaveCancellationResult> {
    const id = subscriptionId.trim();
    if (!/^\d{1,18}$/.test(id)) {
      throw new FlutterwaveRecurringPaymentError("INVALID_INPUT", "The Flutterwave subscription ID is invalid.");
    }

    const data = await this.request<{ id?: number | string; status?: string }>(
      "/subscriptions/" + encodeURIComponent(id) + "/cancel",
      "PUT",
    );
    if (String(data.id ?? "") !== id || String(data.status ?? "").toLowerCase() !== "cancelled") {
      throw new FlutterwaveRecurringPaymentError(
        "SUBSCRIPTION_MISMATCH",
        "Flutterwave did not confirm cancellation of the requested subscription.",
      );
    }
    return { subscriptionId: id, status: "cancelled" };
  }

  /**
   * Looks up the individual subscription created by a first charge. Prefer
   * transactionId because email plus plan can match several subscriptions.
   */
  async listSubscriptions(query: FlutterwaveSubscriptionLookup): Promise<FlutterwaveSubscriptionRecord[]> {
    const params = new URLSearchParams();
    if (query.transactionId) {
      if (!/^\d{1,30}$/.test(query.transactionId)) {
        throw new FlutterwaveRecurringPaymentError("INVALID_INPUT", "The initial Flutterwave transaction ID is invalid.");
      }
      params.set("transaction_id", query.transactionId);
    }
    if (query.email) {
      if (!validEmail(query.email)) {
        throw new FlutterwaveRecurringPaymentError("INVALID_INPUT", "The subscription email filter is invalid.");
      }
      params.set("email", query.email);
    }
    if (query.planId !== undefined) {
      if (!isPositiveInteger(query.planId)) {
        throw new FlutterwaveRecurringPaymentError("INVALID_INPUT", "The Flutterwave plan ID filter is invalid.");
      }
      params.set("plan", String(query.planId));
    }
    if (params.toString() === "") {
      throw new FlutterwaveRecurringPaymentError("INVALID_INPUT", "A transaction, email or plan filter is required.");
    }

    const data = await this.request<FlutterwaveSubscriptionRecord[]>(
      "/subscriptions?" + params.toString(),
      "GET",
    );
    if (!Array.isArray(data)) {
      throw new FlutterwaveRecurringPaymentError("PROVIDER_RESPONSE", "Flutterwave returned an invalid subscription list.");
    }
    return data;
  }

  async verifyTransaction(transactionId: string): Promise<FlutterwaveVerifiedTransaction> {
    const id = transactionId.trim();
    if (!/^\d{1,30}$/.test(id)) {
      throw new FlutterwaveRecurringPaymentError("INVALID_INPUT", "The Flutterwave transaction ID is invalid.");
    }
    const data = await this.request<FlutterwaveVerifiedTransaction>(
      "/transactions/" + encodeURIComponent(id) + "/verify",
      "GET",
    );
    if (String(data.id ?? "") !== id) {
      throw new FlutterwaveRecurringPaymentError("TRANSACTION_MISMATCH", "Flutterwave returned a different transaction ID.");
    }
    return data;
  }
}

/**
 * Validate the initial or renewal charge against server-owned membership
 * terms. A successful HTTP response alone never grants a DCDS entitlement.
 */
export function validateVerifiedPlusTransaction(input: {
  readonly transaction: FlutterwaveVerifiedTransaction;
  readonly expectedTransactionId: string;
  readonly expectedReference: string;
  readonly expectedPlanId: VerifiedPlusPlanId;
  readonly expectedCustomerEmail: string;
}): string | null {
  const transaction=input.transaction;
  const expected=VERIFIED_PLUS_PLAN_TERMS[input.expectedPlanId];
  if (String(transaction.id ?? "") !== input.expectedTransactionId) {
    return "Flutterwave transaction ID does not match the pending membership payment.";
  }
  if (String(transaction.tx_ref ?? "") !== input.expectedReference) {
    return "Flutterwave transaction reference does not match the membership order.";
  }
  if (String(transaction.status ?? "").toLowerCase() !== "successful") {
    return "Flutterwave has not marked the membership charge as successful.";
  }
  if (Number(transaction.amount) !== expected.amount) {
    return "Flutterwave transaction amount does not match the approved membership price.";
  }
  if (String(transaction.currency ?? "").toUpperCase() !== expected.currency) {
    return "Flutterwave transaction currency does not match the approved membership currency.";
  }
  const email=String(transaction.customer?.email ?? "").trim().toLowerCase();
  if (!email || email !== input.expectedCustomerEmail.trim().toLowerCase()) {
    return "Flutterwave customer email does not match the member's billing email.";
  }
  return null;
}

/**
 * Verify the documented Flutterwave webhook secret-hash header.
 * The current Flutterwave guide specifies `verif-hash` and directs the
 * merchant to compare it with the secret hash configured in the dashboard.
 */
export function verifyFlutterwaveWebhookSignature(input: {
  readonly headers: Headers;
  readonly secretHash: string;
}): boolean {
  const configuredHash = input.secretHash;
  const receivedHash = input.headers.get("verif-hash");
  if (!configuredHash || !receivedHash) return false;
  return constantTimeStringEqual(receivedHash, configuredHash);
}

function constantTimeStringEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) {
    difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return difference === 0;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
