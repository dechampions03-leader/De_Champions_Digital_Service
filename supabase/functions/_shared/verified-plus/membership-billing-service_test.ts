import {
  VerifiedPlusBillingService,
  VerifiedPlusBillingServiceError,
  type VerifiedPlusBillingProvider,
  type VerifiedPlusBillingRepository,
  type VerifiedPlusPendingCheckout,
} from "./membership-billing-service.ts";
import {
  VERIFIED_PLUS_PLAN_TERMS,
  type RecurringBillingConsentProof,
  type VerifiedPlusSubscription,
} from "./membership-billing.ts";
import type {
  FlutterwaveCancellationResult,
  FlutterwaveCheckoutResult,
  FlutterwaveSubscriptionRecord,
  FlutterwaveVerifiedTransaction,
} from "./flutterwave-recurring-provider.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function equal<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) throw new Error(message + ". Expected " + String(expected) + ", received " + String(actual) + ".");
}

const memberId = "member-123";
const email = "member@example.com";
const redirectUrl = "https://dechampions03-leader.github.io/De_Champions_Digital_Service/payment-return.html";
const txRef = "DCDS-VP-00000000-0000-4000-8000-000000000001";
const orderRef = "DCDS-VP-00000000-0000-4000-8000-000000000002";
const paidThroughAt = "2026-12-23T00:00:00.000Z";

const consent: RecurringBillingConsentProof = {
  memberId,
  planId: "monthly",
  amount: 7500,
  currency: "NGN",
  providerIntervalText: "every 30 days",
  termsVersion: "verified-plus-recurring-v1",
  consentedAt: "2026-11-23T07:00:00.000Z",
  accepted: true,
  controlWasUncheckedBeforeAction: true,
  channel: "checkout",
};

function pendingCheckout(overrides: Partial<VerifiedPlusPendingCheckout> = {}): VerifiedPlusPendingCheckout {
  return {
    id: "order-1",
    membershipOrderReference: orderRef,
    memberId,
    email,
    planId: "monthly",
    mode: "one_time",
    txRef,
    amount: 7500,
    currency: "NGN",
    status: "pending",
    ...overrides,
  };
}

function subscription(overrides: Partial<VerifiedPlusSubscription> = {}): VerifiedPlusSubscription {
  return {
    subscriptionId: "subscription-1",
    memberId,
    planId: "monthly",
    billingState: "active_auto_renew",
    paidThroughAt,
    providerSubscriptionReference: "4147",
    cancelledAt: null,
    ...overrides,
  };
}

class FakeRepository implements VerifiedPlusBillingRepository {
  context: { email: string; consent: RecurringBillingConsentProof | null; providerIntervalValidated: boolean } | null = {
    email,
    consent: null,
    providerIntervalValidated: false,
  };
  order: VerifiedPlusPendingCheckout = pendingCheckout();
  ownedSubscription: VerifiedPlusSubscription | null = null;
  createdAttempt: Parameters<VerifiedPlusBillingRepository["createCheckoutAttempt"]>[0] | null = null;
  savedLink: string | null = null;
  startFailureCode: string | null = null;
  finalization: Parameters<VerifiedPlusBillingRepository["finalizeInitialPayment"]>[0] | null = null;
  finalizedCheckout: { readonly alreadyFinalized: true; readonly paidThroughAt: string } | null = null;
  cancelStart: { memberId: string; subscriptionId: string; reason: string | null; requestedAt: string } | null = null;
  cancelConfirmation: VerifiedPlusSubscription | null = null;
  cancelFailureCode: string | null = null;

  async loadCheckoutContext(): Promise<typeof this.context> {
    return this.context;
  }
  async createCheckoutAttempt(input: Parameters<VerifiedPlusBillingRepository["createCheckoutAttempt"]>[0]): Promise<VerifiedPlusPendingCheckout> {
    this.createdAttempt = input;
    this.order = pendingCheckout({
      memberId: input.memberId,
      email: input.email,
      planId: input.planId,
      mode: input.mode,
      txRef: input.txRef,
      membershipOrderReference: input.membershipOrderReference,
      amount: input.amount,
      currency: input.currency,
    });
    return this.order;
  }
  async saveHostedCheckoutLink(_orderId: string, checkoutUrl: string): Promise<void> {
    this.savedLink = checkoutUrl;
  }
  async markCheckoutStartFailed(_orderId: string, safeErrorCode: string): Promise<void> {
    this.startFailureCode = safeErrorCode;
  }
  async findPendingCheckoutForMember(_memberId: string, _txRef: string): Promise<VerifiedPlusPendingCheckout | null> {
    return this.order;
  }
  async findFinalizedCheckoutForMember(_memberId: string, _txRef: string) {
    return this.finalizedCheckout;
  }
  async finalizeInitialPayment(input: Parameters<VerifiedPlusBillingRepository["finalizeInitialPayment"]>[0]) {
    if (this.finalizedCheckout) return this.finalizedCheckout;
    this.finalization = input;
    this.finalizedCheckout = { alreadyFinalized: true, paidThroughAt };
    return { alreadyFinalized: false, paidThroughAt };
  }
  async getOwnedAutoRenewSubscription(): Promise<VerifiedPlusSubscription | null> {
    return this.ownedSubscription;
  }
  async beginMemberCancellation(memberId: string, subscriptionId: string, reason: string | null, requestedAt: string): Promise<void> {
    this.cancelStart = { memberId, subscriptionId, reason, requestedAt };
  }
  async markMemberCancellationAttemptFailed(_memberId: string, _subscriptionId: string, safeErrorCode: string): Promise<void> {
    this.cancelFailureCode = safeErrorCode;
  }
  async confirmMemberCancellation(_memberId: string, item: VerifiedPlusSubscription): Promise<void> {
    this.cancelConfirmation = item;
  }
}

class FakeProvider implements VerifiedPlusBillingProvider {
  oneTimeCalls = 0;
  recurringCalls = 0;
  verifyCalls = 0;
  subscriptionResolveCalls = 0;
  cancelCalls = 0;
  lastRecurringInput: Parameters<VerifiedPlusBillingProvider["createSubscriptionCheckout"]>[0] | null = null;
  checkoutError: Error | null = null;
  cancelError: Error | null = null;
  transaction: FlutterwaveVerifiedTransaction = {
    id: 777,
    tx_ref: txRef,
    amount: 7500,
    currency: "NGN",
    status: "successful",
    customer: { email },
  };
  subscription: FlutterwaveSubscriptionRecord = {
    id: 4147,
    amount: 7500,
    plan: 12345,
    status: "active",
    customer: { customer_email: email },
  };
  cancellation: FlutterwaveCancellationResult = { subscriptionId: "4147", status: "cancelled" };

  async createOneTimeMembershipCheckout(): Promise<FlutterwaveCheckoutResult> {
    this.oneTimeCalls++;
    if (this.checkoutError) throw this.checkoutError;
    return { checkoutUrl: "https://checkout.flutterwave.com/v3/hosted/pay/one-time", transactionReference: txRef };
  }
  async createSubscriptionCheckout(input: Parameters<VerifiedPlusBillingProvider["createSubscriptionCheckout"]>[0]): Promise<FlutterwaveCheckoutResult> {
    this.recurringCalls++;
    this.lastRecurringInput = input;
    if (this.checkoutError) throw this.checkoutError;
    return { checkoutUrl: "https://checkout.flutterwave.com/v3/hosted/pay/recurring", transactionReference: txRef };
  }
  async verifyTransaction(): Promise<FlutterwaveVerifiedTransaction> {
    this.verifyCalls++;
    return this.transaction;
  }
  async resolveSubscriptionFromInitialCharge(): Promise<FlutterwaveSubscriptionRecord> {
    this.subscriptionResolveCalls++;
    return this.subscription;
  }
  async cancelSubscription(): Promise<FlutterwaveCancellationResult> {
    this.cancelCalls++;
    if (this.cancelError) throw this.cancelError;
    return this.cancellation;
  }
}

Deno.test("manual one-time checkout never creates or requests recurring consent", async () => {
  const repository = new FakeRepository();
  const provider = new FakeProvider();
  const service = new VerifiedPlusBillingService(repository, provider);
  const result = await service.startCheckout({
    memberId,
    planId: "annual",
    autoRenew: false,
    redirectUrl,
  });
  equal(result.mode, "one_time", "Checkout mode");
  equal(provider.oneTimeCalls, 1, "One-time provider calls");
  equal(provider.recurringCalls, 0, "No recurring checkout call");
  equal(repository.createdAttempt?.mode, "one_time", "Persisted manual mode");
  equal(repository.createdAttempt?.amount, 75000, "Server-owned annual price");
  equal(repository.createdAttempt?.consentedAt, null, "No recurring consent on one-time purchase");
  assert(repository.savedLink?.includes("checkout.flutterwave.com"), "Hosted checkout link stored");
});

Deno.test("recurring checkout refuses missing consent before creating an order", async () => {
  const repository = new FakeRepository();
  const provider = new FakeProvider();
  const service = new VerifiedPlusBillingService(repository, provider);
  let blocked = false;
  try {
    await service.startCheckout({ memberId, planId: "monthly", autoRenew: true, redirectUrl });
  } catch (error) {
    blocked = error instanceof VerifiedPlusBillingServiceError && error.code === "CONSENT_REQUIRED";
  }
  assert(blocked, "Missing consent must block recurring checkout");
  equal(repository.createdAttempt, null, "No order before consent");
  equal(provider.recurringCalls, 0, "No provider call before consent");
});

Deno.test("recurring checkout refuses unvalidated provider intervals before creating an order", async () => {
  const repository = new FakeRepository();
  repository.context = { email, consent, providerIntervalValidated: false };
  const provider = new FakeProvider();
  const service = new VerifiedPlusBillingService(repository, provider);
  let blocked = false;
  try {
    await service.startCheckout({ memberId, planId: "monthly", autoRenew: true, redirectUrl });
  } catch (error) {
    blocked = error instanceof VerifiedPlusBillingServiceError && error.code === "INTERVAL_NOT_VALIDATED";
  }
  assert(blocked, "Unvalidated interval must block recurring checkout");
  equal(repository.createdAttempt, null, "No order before provider interval validation");
});

Deno.test("recurring checkout uses only server-loaded consent and approved plan price", async () => {
  const repository = new FakeRepository();
  repository.context = { email, consent, providerIntervalValidated: true };
  const provider = new FakeProvider();
  const service = new VerifiedPlusBillingService(repository, provider);
  const result = await service.startCheckout({ memberId, planId: "monthly", autoRenew: true, redirectUrl });
  equal(result.mode, "auto_renew", "Recurring checkout mode");
  equal(provider.recurringCalls, 1, "Recurring provider calls");
  equal(provider.oneTimeCalls, 0, "No one-time provider call");
  equal(repository.createdAttempt?.amount, VERIFIED_PLUS_PLAN_TERMS.monthly.amount, "Approved monthly price");
  equal(repository.createdAttempt?.consentedAt, consent.consentedAt, "Persisted consent timestamp");
  equal(provider.lastRecurringInput?.consent, consent, "Server-loaded consent passed to provider");
});

Deno.test("provider checkout failures are stored as safe error codes without exposing raw body", async () => {
  const repository = new FakeRepository();
  const provider = new FakeProvider();
  provider.checkoutError = Object.assign(new Error("safe internal message"), { code: "PROVIDER_HTTP" });
  const service = new VerifiedPlusBillingService(repository, provider);
  let failed = false;
  try {
    await service.startCheckout({ memberId, planId: "monthly", autoRenew: false, redirectUrl });
  } catch {
    failed = true;
  }
  assert(failed, "Provider error propagated");
  equal(repository.startFailureCode, "PROVIDER_HTTP", "Safe provider error code stored");
});

Deno.test("repeated verification returns the prior finalized entitlement without reprocessing the provider charge", async () => {
  const repository = new FakeRepository();
  repository.finalizedCheckout = { alreadyFinalized: true, paidThroughAt };
  const provider = new FakeProvider();
  const service = new VerifiedPlusBillingService(repository, provider);
  const result = await service.verifyInitialPayment({ memberId, txRef, transactionId: "777" });
  equal(result.alreadyFinalized, true, "Replay marks prior finalization");
  equal(result.paidThroughAt, paidThroughAt, "Original paid-through value");
  equal(provider.verifyCalls, 0, "Provider charge is not reprocessed");
  equal(provider.subscriptionResolveCalls, 0, "Subscription is not rebound on replay");
  equal(repository.finalization, null, "Finalization is not invoked twice");
});

Deno.test("initial one-time payment is verified server-side and finalized without a provider subscription", async () => {
  const repository = new FakeRepository();
  repository.order = pendingCheckout({ mode: "one_time" });
  const provider = new FakeProvider();
  const service = new VerifiedPlusBillingService(repository, provider);
  const result = await service.verifyInitialPayment({ memberId, txRef, transactionId: "777" });
  equal(provider.verifyCalls, 1, "Provider verification call");
  equal(provider.subscriptionResolveCalls, 0, "No recurring subscription lookup");
  equal(repository.finalization?.providerSubscriptionId, null, "One-time payment has no subscription ID");
  equal(repository.finalization?.providerPlanId, null, "One-time payment has no payment plan ID");
  equal(result.paidThroughAt, paidThroughAt, "Paid-through value returned by atomic finalizer");
});

Deno.test("initial recurring payment requires a matching provider subscription before finalization", async () => {
  const repository = new FakeRepository();
  repository.order = pendingCheckout({ mode: "auto_renew" });
  const provider = new FakeProvider();
  const service = new VerifiedPlusBillingService(repository, provider);
  await service.verifyInitialPayment({ memberId, txRef, transactionId: "777" });
  equal(provider.subscriptionResolveCalls, 1, "Recurring subscription lookup");
  equal(repository.finalization?.providerSubscriptionId, "4147", "Provider subscription ID attached");
  equal(repository.finalization?.providerPlanId, 12345, "Provider plan ID attached");
});

Deno.test("an incorrect initial transaction cannot grant membership", async () => {
  const repository = new FakeRepository();
  const provider = new FakeProvider();
  provider.transaction = { ...provider.transaction, amount: 1 };
  const service = new VerifiedPlusBillingService(repository, provider);
  let blocked = false;
  try {
    await service.verifyInitialPayment({ memberId, txRef, transactionId: "777" });
  } catch (error) {
    blocked = error instanceof VerifiedPlusBillingServiceError && error.code === "PAYMENT_MISMATCH";
  }
  assert(blocked, "Mismatched payment rejected");
  equal(repository.finalization, null, "Membership not finalized");
});

Deno.test("self-service cancellation calls only the owned provider subscription and keeps paid access", async () => {
  const repository = new FakeRepository();
  repository.ownedSubscription = subscription();
  const provider = new FakeProvider();
  const service = new VerifiedPlusBillingService(repository, provider);
  const result = await service.cancelAutoRenew({ memberId, requestedAt: "2026-11-23T08:00:00.000Z" });
  equal(provider.cancelCalls, 1, "One provider cancellation");
  equal(repository.cancelStart?.memberId, memberId, "Cancellation actor");
  equal(result.status, "cancelled_auto_renew", "Confirmed billing state");
  equal(result.paidThroughAt, paidThroughAt, "Paid-through access preserved");
  equal(repository.cancelConfirmation?.paidThroughAt, paidThroughAt, "Persisted paid-through access");
  equal(repository.cancelConfirmation?.billingState, "cancelled_auto_renew", "Persisted cancellation state");
});

Deno.test("provider cancellation failures remain retryable and never claim success", async () => {
  const repository = new FakeRepository();
  repository.ownedSubscription = subscription();
  const provider = new FakeProvider();
  provider.cancelError = Object.assign(new Error("provider unavailable"), { code: "PROVIDER_HTTP" });
  const service = new VerifiedPlusBillingService(repository, provider);
  let failed = false;
  try {
    await service.cancelAutoRenew({ memberId });
  } catch {
    failed = true;
  }
  assert(failed, "Provider error propagated");
  equal(repository.cancelFailureCode, "PROVIDER_HTTP", "Retryable provider failure recorded");
  equal(repository.cancelConfirmation, null, "Cancellation not marked confirmed");
});

Deno.test("subscription owned by another member cannot be cancelled", async () => {
  const repository = new FakeRepository();
  repository.ownedSubscription = subscription({ memberId: "different-member" });
  const provider = new FakeProvider();
  const service = new VerifiedPlusBillingService(repository, provider);
  let blocked = false;
  try {
    await service.cancelAutoRenew({ memberId });
  } catch (error) {
    blocked = error instanceof VerifiedPlusBillingServiceError && error.code === "SUBSCRIPTION_OWNER_MISMATCH";
  }
  assert(blocked, "Wrong member is rejected");
  equal(provider.cancelCalls, 0, "Provider not called");
});

Deno.test("invalid plan price is never supplied by the member", async () => {
  const repository = new FakeRepository();
  const provider = new FakeProvider();
  const service = new VerifiedPlusBillingService(repository, provider);
  await service.startCheckout({ memberId, planId: "annual", autoRenew: false, redirectUrl });
  equal(repository.createdAttempt?.amount, 75000, "Server-owned annual price");
});
