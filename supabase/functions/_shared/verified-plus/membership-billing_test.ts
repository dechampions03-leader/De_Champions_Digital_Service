import {
  VERIFIED_PLUS_PLAN_TERMS,
  confirmProviderCancellation,
  hasPaidMembershipAccess,
  requestMemberCancellation,
  validateRecurringBillingConsent,
  type RecurringBillingConsentProof,
  type VerifiedPlusPlanId,
  type VerifiedPlusSubscription,
} from "./membership-billing.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function equal<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(message + ". Expected " + String(expected) + ", received " + String(actual) + ".");
  }
}

const NOW = new Date("2026-11-23T08:00:00.000Z");
const MEMBER = "member-123";
const paidThroughAt = "2026-12-23T00:00:00.000Z";

function consentFor(planId: VerifiedPlusPlanId): RecurringBillingConsentProof {
  const plan = VERIFIED_PLUS_PLAN_TERMS[planId];
  return {
    memberId: MEMBER,
    planId,
    amountMinor: plan.amountMinor,
    currency: "NGN",
    providerIntervalText: plan.renewalInterval.providerIntervalText,
    termsVersion: "verified-plus-recurring-v1",
    consentedAt: "2026-11-23T07:45:00.000Z",
    accepted: true,
    controlWasUncheckedBeforeAction: true,
    channel: "checkout",
  };
}

function subscription(
  overrides: Partial<VerifiedPlusSubscription> = {},
): VerifiedPlusSubscription {
  return {
    subscriptionId: "sub-001",
    memberId: MEMBER,
    planId: "monthly",
    billingState: "active_auto_renew",
    paidThroughAt,
    providerSubscriptionReference: "provider-sub-001",
    cancelledAt: null,
    ...overrides,
  };
}

Deno.test("approved catalogue exposes only the three current membership terms", () => {
  equal(VERIFIED_PLUS_PLAN_TERMS.monthly.amountMinor, 7500, "Monthly price");
  equal(VERIFIED_PLUS_PLAN_TERMS.monthly.entitlementTerm.value, 30, "Monthly duration");
  equal(VERIFIED_PLUS_PLAN_TERMS.annual.amountMinor, 75000, "Annual price");
  equal(VERIFIED_PLUS_PLAN_TERMS.annual.entitlementTerm.value, 12, "Annual duration");
  equal(VERIFIED_PLUS_PLAN_TERMS.five_year.amountMinor, 320000, "Five-Year price");
  equal(VERIFIED_PLUS_PLAN_TERMS.five_year.entitlementTerm.value, 60, "Five-Year duration");
});

Deno.test("automatic renewal is rejected when the member has not opted in", () => {
  const result = validateRecurringBillingConsent({
    memberId: MEMBER,
    planId: "monthly",
    consent: null,
    providerIntervalValidated: true,
    now: NOW,
  });
  equal(result.allowed, false, "Consent must be required");
  equal(result.code, "CONSENT_REQUIRED", "Missing consent reason");
});

Deno.test("automatic renewal requires a deliberate unticked-control action", () => {
  const proof = { ...consentFor("monthly"), controlWasUncheckedBeforeAction: false };
  const result = validateRecurringBillingConsent({
    memberId: MEMBER,
    planId: "monthly",
    consent: proof,
    providerIntervalValidated: true,
    now: NOW,
  });
  equal(result.code, "PRESELECTED_CONSENT", "Preselected consent");
});

Deno.test("all three approved plans accept matching explicit consent after provider interval validation", () => {
  for (const planId of ["monthly", "annual", "five_year"] as const) {
    const result = validateRecurringBillingConsent({
      memberId: MEMBER,
      planId,
      consent: consentFor(planId),
      providerIntervalValidated: true,
      now: NOW,
    });
    assert(result.allowed, planId + " consent should be accepted");
  }
});

Deno.test("Five-Year automatic renewal stays blocked until its exact interval passes sandbox validation", () => {
  const result = validateRecurringBillingConsent({
    memberId: MEMBER,
    planId: "five_year",
    consent: consentFor("five_year"),
    providerIntervalValidated: false,
    now: NOW,
  });
  equal(result.code, "PROVIDER_INTERVAL_NOT_VALIDATED", "Unvalidated Five-Year interval");
});

Deno.test("consent cannot be reused by another member or a different plan", () => {
  const wrongMember = validateRecurringBillingConsent({
    memberId: "somebody-else",
    planId: "monthly",
    consent: consentFor("monthly"),
    providerIntervalValidated: true,
    now: NOW,
  });
  equal(wrongMember.code, "MEMBER_MISMATCH", "Consent owner mismatch");

  const wrongPlan = validateRecurringBillingConsent({
    memberId: MEMBER,
    planId: "annual",
    consent: consentFor("monthly"),
    providerIntervalValidated: true,
    now: NOW,
  });
  equal(wrongPlan.code, "PLAN_MISMATCH", "Consent plan mismatch");
});

Deno.test("consent rejects a changed amount, currency or billing interval", () => {
  const badAmount = { ...consentFor("monthly"), amountMinor: 100 };
  equal(validateRecurringBillingConsent({ memberId: MEMBER, planId: "monthly", consent: badAmount, providerIntervalValidated: true, now: NOW }).code, "AMOUNT_MISMATCH", "Bad amount");

  const badCurrency = { ...consentFor("monthly"), currency: "USD" as const };
  equal(validateRecurringBillingConsent({ memberId: MEMBER, planId: "monthly", consent: badCurrency, providerIntervalValidated: true, now: NOW }).code, "CURRENCY_MISMATCH", "Bad currency");

  const badInterval = { ...consentFor("annual"), providerIntervalText: "monthly" };
  equal(validateRecurringBillingConsent({ memberId: MEMBER, planId: "annual", consent: badInterval, providerIntervalValidated: true, now: NOW }).code, "INTERVAL_MISMATCH", "Bad interval");
});

Deno.test("consent requires a terms version and a valid non-future timestamp", () => {
  const noVersion = { ...consentFor("monthly"), termsVersion: " " };
  equal(validateRecurringBillingConsent({ memberId: MEMBER, planId: "monthly", consent: noVersion, providerIntervalValidated: true, now: NOW }).code, "TERMS_VERSION_REQUIRED", "Missing terms version");

  const future = { ...consentFor("monthly"), consentedAt: "2026-11-24T00:00:00.000Z" };
  equal(validateRecurringBillingConsent({ memberId: MEMBER, planId: "monthly", consent: future, providerIntervalValidated: true, now: NOW }).code, "CONSENT_TIMESTAMP_INVALID", "Future consent");
});

Deno.test("only the subscription owner may request self-service cancellation", () => {
  const result = requestMemberCancellation({
    subscription: subscription(),
    actorMemberId: "different-member",
    requestedAt: NOW.toISOString(),
  });
  equal(result.allowed, false, "Non-owner cancellation");
  if (!result.allowed) equal(result.code, "NOT_SUBSCRIPTION_OWNER", "Non-owner code");
});

Deno.test("owner can cancel without supplying a reason or waiting for admin approval", () => {
  const result = requestMemberCancellation({
    subscription: subscription(),
    actorMemberId: MEMBER,
    requestedAt: NOW.toISOString(),
  });
  assert(result.allowed, "Owner cancellation should be accepted");
  equal(result.code, "CANCELLATION_PENDING", "Cancellation state");
  equal(result.providerCancellationRequired, true, "Provider cancellation call required");
  equal(result.subscription.billingState, "cancellation_pending", "Pending status");
  equal(result.subscription.paidThroughAt, paidThroughAt, "Paid-through timestamp preserved");
  equal(result.subscription.cancellationReason, undefined, "Reason is optional");
});

Deno.test("cancellation can store a supplied optional reason", () => {
  const result = requestMemberCancellation({
    subscription: subscription(),
    actorMemberId: MEMBER,
    requestedAt: NOW.toISOString(),
    reason: "too_expensive",
  });
  assert(result.allowed, "Owner cancellation");
  equal(result.reason, "too_expensive", "Optional reason");
  equal(result.subscription.cancellationReason, "too_expensive", "Reason stored");
});

Deno.test("cancellation is idempotent while provider confirmation is pending", () => {
  const pending = subscription({ billingState: "cancellation_pending" });
  const result = requestMemberCancellation({
    subscription: pending,
    actorMemberId: MEMBER,
    requestedAt: NOW.toISOString(),
  });
  assert(result.allowed, "Repeated cancellation request");
  equal(result.code, "CANCELLATION_PENDING", "Pending cancellation");
  equal(result.subscription, pending, "No duplicate local transition");
});

Deno.test("confirmed provider cancellation stops auto-renew but preserves paid-through access", () => {
  const pending = subscription({ billingState: "cancellation_pending" });
  const cancelled = confirmProviderCancellation(pending, NOW.toISOString());
  assert(cancelled !== null, "Provider cancellation confirmation");
  equal(cancelled.billingState, "cancelled_auto_renew", "Cancelled billing state");
  equal(cancelled.paidThroughAt, paidThroughAt, "Paid period is unchanged");
  equal(hasPaidMembershipAccess(cancelled, NOW), true, "Paid access remains active after cancellation");
  equal(hasPaidMembershipAccess(cancelled, new Date(paidThroughAt)), false, "Access expires at paid-through date");
});

Deno.test("invalid provider cancellation timestamps cannot change billing state", () => {
  const result = confirmProviderCancellation(subscription({ billingState: "cancellation_pending" }), "not-a-date");
  equal(result, null, "Invalid confirmation timestamp");
});

Deno.test("cancelled, expired or payment-failed plans cannot be cancelled as active auto-renew subscriptions", () => {
  for (const state of ["cancelled_auto_renew", "expired", "payment_failed", "not_enrolled"] as const) {
    const result = requestMemberCancellation({
      subscription: subscription({ billingState: state }),
      actorMemberId: MEMBER,
      requestedAt: NOW.toISOString(),
    });
    if (state === "cancelled_auto_renew") {
      assert(result.allowed, "Already-cancelled request should be idempotent");
      equal(result.code, "ALREADY_CANCELLED", "Already cancelled");
    } else {
      equal(result.allowed, false, state + " cannot cancel active auto-renew");
    }
  }
});

Deno.test("current paid-through entitlement is independent from billing cancellation status", () => {
  const cancelled = subscription({ billingState: "cancelled_auto_renew" });
  const active = hasPaidMembershipAccess(cancelled, NOW);
  equal(active, true, "Cancelled renewal retains current paid entitlement");

  const expired = hasPaidMembershipAccess(
    subscription({ billingState: "cancelled_auto_renew", paidThroughAt: "2026-11-22T00:00:00.000Z" }),
    NOW,
  );
  equal(expired, false, "Expired paid-through date disables entitlement");
});
