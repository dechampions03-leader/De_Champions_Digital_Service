/**
 * DCDS Verified+ membership billing domain rules.
 *
 * Pure, provider-neutral and persistence-free. Trusted server code must load
 * the subscription owner, plan, consent evidence and provider capability.
 * This module does not authenticate, charge cards, call Flutterwave or persist
 * subscription events. It must never be treated as a payment processor.
 */

export type VerifiedPlusPlanId = "monthly" | "annual" | "five_year";
export type VerifiedPlusBillingCurrency = "NGN";

export interface VerifiedPlusPlanTerms {
  readonly planId: VerifiedPlusPlanId;
  readonly amountMinor: number;
  readonly currency: VerifiedPlusBillingCurrency;
  readonly entitlementTerm: {
    readonly unit: "days" | "months";
    readonly value: number;
  };
  readonly renewalInterval: {
    readonly value: number;
    readonly unit: "days" | "years";
    readonly providerIntervalText: string;
  };
}

export const VERIFIED_PLUS_PLAN_TERMS: Readonly<
  Record<VerifiedPlusPlanId, VerifiedPlusPlanTerms>
> = {
  monthly: {
    planId: "monthly",
    amountMinor: 7500,
    currency: "NGN",
    entitlementTerm: { unit: "days", value: 30 },
    renewalInterval: {
      value: 30,
      unit: "days",
      providerIntervalText: "every 30 days",
    },
  },
  annual: {
    planId: "annual",
    amountMinor: 75000,
    currency: "NGN",
    entitlementTerm: { unit: "months", value: 12 },
    renewalInterval: {
      value: 1,
      unit: "years",
      providerIntervalText: "every one year",
    },
  },
  five_year: {
    planId: "five_year",
    amountMinor: 320000,
    currency: "NGN",
    entitlementTerm: { unit: "months", value: 60 },
    renewalInterval: {
      value: 5,
      unit: "years",
      providerIntervalText: "every five years",
    },
  },
} as const;

export type BillingConsentChannel = "checkout" | "manage_subscription";

export interface RecurringBillingConsentProof {
  readonly memberId: string;
  readonly planId: VerifiedPlusPlanId;
  readonly amountMinor: number;
  readonly currency: VerifiedPlusBillingCurrency;
  readonly providerIntervalText: string;
  readonly termsVersion: string;
  readonly consentedAt: string;
  /** Must be true only after a deliberate member action. */
  readonly accepted: boolean;
  /** Evidence that the control was initially unticked, not preselected. */
  readonly controlWasUncheckedBeforeAction: boolean;
  readonly channel: BillingConsentChannel;
}

export type ConsentDecisionCode =
  | "CONSENT_REQUIRED"
  | "MEMBER_MISMATCH"
  | "PLAN_MISMATCH"
  | "AMOUNT_MISMATCH"
  | "CURRENCY_MISMATCH"
  | "INTERVAL_MISMATCH"
  | "TERMS_VERSION_REQUIRED"
  | "CONSENT_TIMESTAMP_INVALID"
  | "PRESELECTED_CONSENT"
  | "PROVIDER_INTERVAL_NOT_VALIDATED"
  | "CONSENT_VALID";

export interface ConsentDecision {
  readonly allowed: boolean;
  readonly code: ConsentDecisionCode;
  readonly reason: string;
}

/**
 * Checks consent evidence against server-owned plan terms and server-owned
 * provider capability configuration. Never accept a client-supplied price or
 * providerIntervalValidated value as an authorization source.
 */
export function validateRecurringBillingConsent(input: {
  memberId: string;
  planId: VerifiedPlusPlanId;
  consent: RecurringBillingConsentProof | null;
  providerIntervalValidated: boolean;
  now?: Date;
}): ConsentDecision {
  const deny = (code: ConsentDecisionCode, reason: string): ConsentDecision => ({
    allowed: false,
    code,
    reason,
  });

  const consent = input.consent;
  if (!consent || consent.accepted !== true) {
    return deny("CONSENT_REQUIRED", "The member has not explicitly opted in to automatic renewal.");
  }
  if (consent.controlWasUncheckedBeforeAction !== true) {
    return deny("PRESELECTED_CONSENT", "Recurring billing consent must not be preselected.");
  }
  if (!input.memberId || consent.memberId !== input.memberId) {
    return deny("MEMBER_MISMATCH", "The consent record does not belong to this member.");
  }
  if (consent.planId !== input.planId) {
    return deny("PLAN_MISMATCH", "The consent record does not match the selected membership plan.");
  }

  const terms = VERIFIED_PLUS_PLAN_TERMS[input.planId];
  if (consent.amountMinor !== terms.amountMinor) {
    return deny("AMOUNT_MISMATCH", "The consent amount does not match the approved membership price.");
  }
  if (consent.currency !== terms.currency) {
    return deny("CURRENCY_MISMATCH", "The consent currency does not match the approved membership currency.");
  }
  if (consent.providerIntervalText !== terms.renewalInterval.providerIntervalText) {
    return deny("INTERVAL_MISMATCH", "The consent interval does not match the approved renewal interval.");
  }
  if (!consent.termsVersion.trim()) {
    return deny("TERMS_VERSION_REQUIRED", "A versioned recurring-billing disclosure must be recorded.");
  }

  const timestamp = Date.parse(consent.consentedAt);
  const now = (input.now ?? new Date()).getTime();
  if (!Number.isFinite(timestamp) || timestamp > now) {
    return deny("CONSENT_TIMESTAMP_INVALID", "The consent timestamp is invalid or in the future.");
  }
  if (!input.providerIntervalValidated) {
    return deny(
      "PROVIDER_INTERVAL_NOT_VALIDATED",
      "The exact provider billing interval has not passed the required sandbox validation.",
    );
  }

  return {
    allowed: true,
    code: "CONSENT_VALID",
    reason: "The member explicitly consented to the approved recurring plan and the provider interval is validated.",
  };
}

export type VerifiedPlusBillingState =
  | "not_enrolled"
  | "consent_pending"
  | "active_auto_renew"
  | "cancellation_pending"
  | "cancelled_auto_renew"
  | "payment_retrying"
  | "payment_failed"
  | "provider_suspended"
  | "expired";

export type VerifiedPlusCancellationReason =
  | "too_expensive"
  | "not_used_enough"
  | "benefits_not_as_expected"
  | "technical_problems"
  | "switching_service"
  | "temporary_need"
  | "other"
  | "prefer_not_to_say";

export interface VerifiedPlusSubscription {
  readonly subscriptionId: string;
  readonly memberId: string;
  readonly planId: VerifiedPlusPlanId;
  readonly billingState: VerifiedPlusBillingState;
  readonly paidThroughAt: string;
  readonly providerSubscriptionReference: string | null;
  readonly cancelledAt: string | null;
  readonly cancellationReason?: VerifiedPlusCancellationReason | null;
}

export type CancellationDecision =
  | {
    readonly allowed: true;
    readonly code: "CANCELLATION_PENDING" | "ALREADY_CANCELLED";
    readonly subscription: VerifiedPlusSubscription;
    readonly providerCancellationRequired: boolean;
    readonly reason?: VerifiedPlusCancellationReason;
  }
  | {
    readonly allowed: false;
    readonly code: "NOT_SUBSCRIPTION_OWNER" | "CANCELLATION_NOT_AVAILABLE";
    readonly reason: string;
  };

/**
 * Records a member's self-service cancellation request.
 * A persistence/service layer must call the provider API and then confirm the
 * result. The member's paid-through date is intentionally never changed here.
 */
export function requestMemberCancellation(input: {
  subscription: VerifiedPlusSubscription;
  actorMemberId: string;
  requestedAt: string;
  reason?: VerifiedPlusCancellationReason | null;
}): CancellationDecision {
  const current = input.subscription;
  if (input.actorMemberId !== current.memberId) {
    return {
      allowed: false,
      code: "NOT_SUBSCRIPTION_OWNER",
      reason: "Only the member who owns this subscription may cancel its automatic renewal.",
    };
  }

  if (current.billingState === "cancelled_auto_renew") {
    return {
      allowed: true,
      code: "ALREADY_CANCELLED",
      subscription: current,
      providerCancellationRequired: false,
      ...(input.reason ? { reason: input.reason } : {}),
    };
  }

  if (current.billingState === "cancellation_pending") {
    return {
      allowed: true,
      code: "CANCELLATION_PENDING",
      subscription: current,
      providerCancellationRequired: true,
      ...(input.reason ? { reason: input.reason } : {}),
    };
  }

  if (
    current.billingState !== "active_auto_renew" &&
    current.billingState !== "payment_retrying"
  ) {
    return {
      allowed: false,
      code: "CANCELLATION_NOT_AVAILABLE",
      reason: "This subscription does not have an active automatic renewal to cancel.",
    };
  }

  if (!Number.isFinite(Date.parse(input.requestedAt))) {
    return {
      allowed: false,
      code: "CANCELLATION_NOT_AVAILABLE",
      reason: "A valid cancellation timestamp is required.",
    };
  }

  return {
    allowed: true,
    code: "CANCELLATION_PENDING",
    subscription: {
      ...current,
      billingState: "cancellation_pending",
      ...(input.reason ? { cancellationReason: input.reason } : {}),
    },
    providerCancellationRequired: true,
    ...(input.reason ? { reason: input.reason } : {}),
  };
}

/**
 * Applies a trusted provider cancellation confirmation/webhook.
 * Preserve paidThroughAt so a cancellation never removes already-paid access.
 */
export function confirmProviderCancellation(
  subscription: VerifiedPlusSubscription,
  confirmedAt: string,
): VerifiedPlusSubscription | null {
  if (!Number.isFinite(Date.parse(confirmedAt))) return null;
  if (
    subscription.billingState !== "cancellation_pending" &&
    subscription.billingState !== "active_auto_renew" &&
    subscription.billingState !== "payment_retrying"
  ) {
    return null;
  }

  return {
    ...subscription,
    billingState: "cancelled_auto_renew",
    cancelledAt: confirmedAt,
  };
}

/** Cancellation affects future billing, not the already-paid membership term. */
export function hasPaidMembershipAccess(
  subscription: Pick<VerifiedPlusSubscription, "paidThroughAt">,
  now = new Date(),
): boolean {
  const paidThrough = Date.parse(subscription.paidThroughAt);
  return Number.isFinite(paidThrough) && paidThrough > now.getTime();
}
