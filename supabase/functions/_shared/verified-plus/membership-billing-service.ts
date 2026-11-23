/**
 * DCDS Verified+ billing application service.
 *
 * This service coordinates trusted repository operations with the Flutterwave
 * adapter. The repository implementation must use the dedicated Verified+
 * membership tables/RPCs after migration reconciliation. This module itself
 * performs no database access and cannot grant entitlement on a browser redirect.
 */

import {
  VERIFIED_PLUS_PLAN_TERMS,
  confirmProviderCancellation,
  requestMemberCancellation,
  validateRecurringBillingConsent,
  type RecurringBillingConsentProof,
  type VerifiedPlusPlanId,
  type VerifiedPlusSubscription,
} from "./membership-billing.ts";
import {
  validateVerifiedPlusTransaction,
  type FlutterwaveCancellationResult,
  type FlutterwaveCheckoutResult,
  type FlutterwaveSubscriptionRecord,
  type FlutterwaveVerifiedTransaction,
} from "./flutterwave-recurring-provider.ts";

export type VerifiedPlusCheckoutMode = "one_time" | "auto_renew";

export interface VerifiedPlusCheckoutContext {
  /** Email is loaded from the authenticated account on the server. */
  readonly email: string;
  /** Append-only consent read from the server-side consent ledger. */
  readonly consent: RecurringBillingConsentProof | null;
  /** Server-side capability setting after exact provider interval qualification. */
  readonly providerIntervalValidated: boolean;
}

export interface VerifiedPlusPendingCheckout {
  readonly id: string;
  readonly membershipOrderReference: string;
  readonly memberId: string;
  readonly email: string;
  readonly planId: VerifiedPlusPlanId;
  readonly mode: VerifiedPlusCheckoutMode;
  readonly txRef: string;
  readonly amount: number;
  readonly currency: string;
  readonly status: "pending" | "successful" | "failed";
}

export interface VerifiedPlusCheckoutFinalization {
  readonly orderId: string;
  readonly memberId: string;
  readonly planId: VerifiedPlusPlanId;
  readonly mode: VerifiedPlusCheckoutMode;
  readonly transactionId: string;
  readonly txRef: string;
  readonly amount: number;
  readonly currency: string;
  readonly providerSubscriptionId: string | null;
  readonly providerPlanId: number | null;
  readonly providerStatus: "successful";
}

export interface VerifiedPlusBillingRepository {
  loadCheckoutContext(
    memberId: string,
    planId: VerifiedPlusPlanId,
  ): Promise<VerifiedPlusCheckoutContext | null>;

  /**
   * Atomically inserts a pending order with a unique DCDS reference.
   * Must reject duplicate pending auto-renew subscriptions for this member.
   * The implementation must persist server-owned price/consent information,
   * never client-supplied amounts or provider IDs.
   */
  createCheckoutAttempt(input: {
    readonly memberId: string;
    readonly email: string;
    readonly planId: VerifiedPlusPlanId;
    readonly mode: VerifiedPlusCheckoutMode;
    readonly txRef: string;
    readonly membershipOrderReference: string;
    readonly amount: number;
    readonly currency: string;
    readonly consentedAt: string | null;
    readonly consentTermsVersion: string | null;
  }): Promise<VerifiedPlusPendingCheckout>;

  saveHostedCheckoutLink(orderId: string, checkoutUrl: string): Promise<void>;
  markCheckoutStartFailed(orderId: string, safeErrorCode: string): Promise<void>;

  findPendingCheckoutForMember(
    memberId: string,
    txRef: string,
  ): Promise<VerifiedPlusPendingCheckout | null>;

  /**
   * Returns only an already-finalized order owned by this member. This lookup
   * prevents a repeat browser redirect from reprocessing the same initial
   * charge or attempting to recreate a subscription that may since be cancelled.
   */
  findFinalizedCheckoutForMember(
    memberId: string,
    txRef: string,
  ): Promise<{ readonly alreadyFinalized: true; readonly paidThroughAt: string } | null>;

  /**
   * Atomic, idempotent database finalizer. It must bind the provider transaction
   * to this exact membership order and must never touch course enrolments.
   * One-time mode must store no provider subscription ID.
   */
  finalizeInitialPayment(
    input: VerifiedPlusCheckoutFinalization,
  ): Promise<{ readonly alreadyFinalized: boolean; readonly paidThroughAt: string }>;

  getOwnedAutoRenewSubscription(
    memberId: string,
  ): Promise<VerifiedPlusSubscription | null>;

  /** Atomically changes an owned active subscription to cancellation_pending. */
  beginMemberCancellation(
    memberId: string,
    subscriptionId: string,
    reason: string | null,
    requestedAt: string,
  ): Promise<void>;

  /** Records a safe retryable provider error; it must not mark cancellation confirmed. */
  markMemberCancellationAttemptFailed(
    memberId: string,
    subscriptionId: string,
    safeErrorCode: string,
  ): Promise<void>;

  /** Writes the provider-confirmed cancelled state without changing paidThroughAt. */
  confirmMemberCancellation(
    memberId: string,
    subscription: VerifiedPlusSubscription,
  ): Promise<void>;
}

export interface VerifiedPlusBillingProvider {
  createOneTimeMembershipCheckout(input: {
    txRef: string;
    planId: VerifiedPlusPlanId;
    email: string;
    redirectUrl: string;
    membershipOrderReference: string;
  }): Promise<FlutterwaveCheckoutResult>;

  createSubscriptionCheckout(input: {
    txRef: string;
    planId: VerifiedPlusPlanId;
    email: string;
    redirectUrl: string;
    membershipOrderReference: string;
    memberId: string;
    consent: RecurringBillingConsentProof | null;
  }): Promise<FlutterwaveCheckoutResult>;

  verifyTransaction(transactionId: string): Promise<FlutterwaveVerifiedTransaction>;

  resolveSubscriptionFromInitialCharge(input: {
    transactionId: string;
    planId: VerifiedPlusPlanId;
    email: string;
  }): Promise<FlutterwaveSubscriptionRecord>;

  cancelSubscription(subscriptionId: string): Promise<FlutterwaveCancellationResult>;
}

export class VerifiedPlusBillingServiceError extends Error {
  constructor(
    public readonly code:
      | "INVALID_INPUT"
      | "CHECKOUT_CONTEXT_UNAVAILABLE"
      | "CONSENT_REQUIRED"
      | "CONSENT_INVALID"
      | "INTERVAL_NOT_VALIDATED"
      | "CHECKOUT_NOT_FOUND"
      | "PAYMENT_NOT_CONFIRMED"
      | "PAYMENT_MISMATCH"
      | "SUBSCRIPTION_NOT_FOUND"
      | "SUBSCRIPTION_OWNER_MISMATCH"
      | "CANCELLATION_NOT_AVAILABLE"
      | "PROVIDER_CANCELLATION_UNCONFIRMED",
    message: string,
  ) {
    super(message);
    this.name = "VerifiedPlusBillingServiceError";
  }
}

export interface StartVerifiedPlusCheckoutInput {
  readonly memberId: string;
  readonly planId: VerifiedPlusPlanId;
  readonly autoRenew: boolean;
  readonly redirectUrl: string;
}

export interface StartVerifiedPlusCheckoutResult {
  readonly orderId: string;
  readonly transactionReference: string;
  readonly checkoutUrl: string;
  readonly mode: VerifiedPlusCheckoutMode;
}

export interface VerifyVerifiedPlusCheckoutInput {
  readonly memberId: string;
  readonly txRef: string;
  readonly transactionId: string;
}

export interface CancelVerifiedPlusAutoRenewInput {
  readonly memberId: string;
  readonly reason?: string | null;
  readonly requestedAt?: string;
}

export interface CancelVerifiedPlusAutoRenewResult {
  readonly status: "cancelled_auto_renew";
  readonly paidThroughAt: string;
  readonly providerSubscriptionId: string;
}

function toSafeProviderCode(error: unknown): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code.slice(0, 60);
  }
  return "PROVIDER_ERROR";
}

export class VerifiedPlusBillingService {
  constructor(
    private readonly repository: VerifiedPlusBillingRepository,
    private readonly provider: VerifiedPlusBillingProvider,
  ) {}

  async startCheckout(
    input: StartVerifiedPlusCheckoutInput,
  ): Promise<StartVerifiedPlusCheckoutResult> {
    if (
      !input.memberId.trim() ||
      !["monthly", "annual", "five_year"].includes(input.planId) ||
      typeof input.autoRenew !== "boolean"
    ) {
      throw new VerifiedPlusBillingServiceError("INVALID_INPUT", "The membership checkout request is invalid.");
    }

    const context = await this.repository.loadCheckoutContext(input.memberId, input.planId);
    if (!context || !context.email.trim()) {
      throw new VerifiedPlusBillingServiceError(
        "CHECKOUT_CONTEXT_UNAVAILABLE",
        "The signed-in member's billing details could not be loaded.",
      );
    }

    const terms = VERIFIED_PLUS_PLAN_TERMS[input.planId];
    const mode: VerifiedPlusCheckoutMode = input.autoRenew ? "auto_renew" : "one_time";

    if (input.autoRenew) {
      const decision = validateRecurringBillingConsent({
        memberId: input.memberId,
        planId: input.planId,
        consent: context.consent,
        providerIntervalValidated: context.providerIntervalValidated,
      });
      if (!decision.allowed) {
        if (decision.code === "CONSENT_REQUIRED") {
          throw new VerifiedPlusBillingServiceError("CONSENT_REQUIRED", decision.reason);
        }
        if (decision.code === "PROVIDER_INTERVAL_NOT_VALIDATED") {
          throw new VerifiedPlusBillingServiceError("INTERVAL_NOT_VALIDATED", decision.reason);
        }
        throw new VerifiedPlusBillingServiceError("CONSENT_INVALID", decision.reason);
      }
    }

    const txRef = "DCDS-VP-" + crypto.randomUUID();
    const membershipOrderReference = "DCDS-VP-" + crypto.randomUUID();
    const order = await this.repository.createCheckoutAttempt({
      memberId: input.memberId,
      email: context.email,
      planId: input.planId,
      mode,
      txRef,
      membershipOrderReference,
      amount: terms.amount,
      currency: terms.currency,
      consentedAt: input.autoRenew ? context.consent?.consentedAt ?? null : null,
      consentTermsVersion: input.autoRenew ? context.consent?.termsVersion ?? null : null,
    });

    try {
      const checkout = input.autoRenew
        ? await this.provider.createSubscriptionCheckout({
          txRef: order.txRef,
          planId: order.planId,
          email: order.email,
          redirectUrl: input.redirectUrl,
          membershipOrderReference: order.membershipOrderReference,
          memberId: order.memberId,
          consent: context.consent,
        })
        : await this.provider.createOneTimeMembershipCheckout({
          txRef: order.txRef,
          planId: order.planId,
          email: order.email,
          redirectUrl: input.redirectUrl,
          membershipOrderReference: order.membershipOrderReference,
        });

      await this.repository.saveHostedCheckoutLink(order.id, checkout.checkoutUrl);
      return {
        orderId: order.id,
        transactionReference: order.txRef,
        checkoutUrl: checkout.checkoutUrl,
        mode,
      };
    } catch (error) {
      await this.repository.markCheckoutStartFailed(order.id, toSafeProviderCode(error));
      throw error;
    }
  }

  async verifyInitialPayment(
    input: VerifyVerifiedPlusCheckoutInput,
  ): Promise<{ readonly alreadyFinalized: boolean; readonly paidThroughAt: string }> {
    if (
      !input.memberId.trim() ||
      !/^DCDS-VP-[0-9a-f-]{36}$/i.test(input.txRef) ||
      !/^\d{1,30}$/.test(input.transactionId)
    ) {
      throw new VerifiedPlusBillingServiceError("INVALID_INPUT", "The membership payment verification request is invalid.");
    }

    const finalized = await this.repository.findFinalizedCheckoutForMember(input.memberId, input.txRef);
    if (finalized) return finalized;

    const order = await this.repository.findPendingCheckoutForMember(input.memberId, input.txRef);
    if (!order || order.status !== "pending") {
      throw new VerifiedPlusBillingServiceError(
        "CHECKOUT_NOT_FOUND",
        "No pending membership checkout for this account and reference was found.",
      );
    }

    const transaction = await this.provider.verifyTransaction(input.transactionId);
    const mismatch = validateVerifiedPlusTransaction({
      transaction,
      expectedTransactionId: input.transactionId,
      expectedReference: order.txRef,
      expectedPlanId: order.planId,
      expectedCustomerEmail: order.email,
    });
    if (mismatch) {
      throw new VerifiedPlusBillingServiceError("PAYMENT_MISMATCH", mismatch);
    }

    let providerSubscriptionId: string | null = null;
    let providerPlanId: number | null = null;

    if (order.mode === "auto_renew") {
      const subscription = await this.provider.resolveSubscriptionFromInitialCharge({
        transactionId: input.transactionId,
        planId: order.planId,
        email: order.email,
      });
      providerSubscriptionId = String(subscription.id);
      providerPlanId = Number(subscription.plan);
      if (
        !/^\d{1,18}$/.test(providerSubscriptionId) ||
        !Number.isSafeInteger(providerPlanId) ||
        providerPlanId <= 0
      ) {
        throw new VerifiedPlusBillingServiceError(
          "PAYMENT_NOT_CONFIRMED",
          "Flutterwave could not confirm the membership subscription created by the first charge.",
        );
      }
    }

    return this.repository.finalizeInitialPayment({
      orderId: order.id,
      memberId: order.memberId,
      planId: order.planId,
      mode: order.mode,
      transactionId: String(transaction.id),
      txRef: String(transaction.tx_ref),
      amount: Number(transaction.amount),
      currency: String(transaction.currency).toUpperCase(),
      providerSubscriptionId,
      providerPlanId,
      providerStatus: "successful",
    });
  }

  async cancelAutoRenew(
    input: CancelVerifiedPlusAutoRenewInput,
  ): Promise<CancelVerifiedPlusAutoRenewResult> {
    if (!input.memberId.trim()) {
      throw new VerifiedPlusBillingServiceError("INVALID_INPUT", "A signed-in member is required.");
    }

    const subscription = await this.repository.getOwnedAutoRenewSubscription(input.memberId);
    if (!subscription) {
      throw new VerifiedPlusBillingServiceError(
        "SUBSCRIPTION_NOT_FOUND",
        "No automatic-renewal subscription was found for this account.",
      );
    }

    const requestedAt = input.requestedAt ?? new Date().toISOString();
    const decision = requestMemberCancellation({
      subscription,
      actorMemberId: input.memberId,
      requestedAt,
      reason: input.reason ?? null,
    });
    if (!decision.allowed) {
      throw new VerifiedPlusBillingServiceError("SUBSCRIPTION_OWNER_MISMATCH", decision.reason);
    }
    if (decision.code === "ALREADY_CANCELLED") {
      return {
        status: "cancelled_auto_renew",
        paidThroughAt: subscription.paidThroughAt,
        providerSubscriptionId: subscription.providerSubscriptionReference ?? "",
      };
    }

    const providerSubscriptionId = subscription.providerSubscriptionReference;
    if (!providerSubscriptionId) {
      throw new VerifiedPlusBillingServiceError(
        "SUBSCRIPTION_NOT_FOUND",
        "The provider subscription reference is missing. Contact support for safe reconciliation.",
      );
    }

    await this.repository.beginMemberCancellation(
      input.memberId,
      subscription.subscriptionId,
      input.reason ?? null,
      requestedAt,
    );

    try {
      const providerResult = await this.provider.cancelSubscription(providerSubscriptionId);
      if (
        providerResult.status !== "cancelled" ||
        providerResult.subscriptionId !== providerSubscriptionId
      ) {
        throw new VerifiedPlusBillingServiceError(
          "PROVIDER_CANCELLATION_UNCONFIRMED",
          "Flutterwave did not confirm cancellation of this subscription.",
        );
      }

      const cancelled = confirmProviderCancellation(
        { ...subscription, billingState: "cancellation_pending" },
        new Date().toISOString(),
      );
      if (!cancelled) {
        throw new VerifiedPlusBillingServiceError(
          "PROVIDER_CANCELLATION_UNCONFIRMED",
          "DCDS could not confirm the provider cancellation state.",
        );
      }

      await this.repository.confirmMemberCancellation(input.memberId, cancelled);
      return {
        status: "cancelled_auto_renew",
        paidThroughAt: cancelled.paidThroughAt,
        providerSubscriptionId,
      };
    } catch (error) {
      await this.repository.markMemberCancellationAttemptFailed(
        input.memberId,
        subscription.subscriptionId,
        toSafeProviderCode(error),
      );
      throw error;
    }
  }
}
