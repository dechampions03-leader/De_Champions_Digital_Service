import {
  FlutterwaveRecurringPaymentError,
  FlutterwaveRecurringPayments,
  verifyFlutterwaveWebhookSignature,
  validateVerifiedPlusTransaction,
} from "./flutterwave-recurring-provider.ts";
import {
  VERIFIED_PLUS_PLAN_TERMS,
} from "./membership-billing.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function equal<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) throw new Error(message + ". Expected " + String(expected) + ", received " + String(actual) + ".");
}
function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
function mockFetch(
  handler: (url: string, init?: RequestInit) => Response | Promise<Response>,
): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
  return async (input, init) => handler(String(input), init);
}

const secretKey = "FLWSECK_TEST-UNIT-TEST-NOT-A-REAL-SECRET";
const checkoutConsent = {
  memberId: "member-123",
  planId: "monthly" as const,
  amount: 7500,
  currency: "NGN" as const,
  providerIntervalText: "every 30 days",
  termsVersion: "verified-plus-recurring-v1",
  consentedAt: new Date(Date.now() - 60_000).toISOString(),
  accepted: true,
  controlWasUncheckedBeforeAction: true,
  channel: "checkout" as const,
};

const checkoutInput = {
  txRef: "DCDS-VP-00000000-0000-4000-8000-000000000001",
  planId: "monthly" as const,
  email: "member@example.com",
  customerName: "DCDS Test Member",
  redirectUrl: "https://dechampions03-leader.github.io/De_Champions_Digital_Service/payment-return.html",
  membershipOrderReference: "DCDS-VP-00000000-0000-4000-8000-000000000002",
  memberId: "member-123",
  consent: checkoutConsent,
};

Deno.test("adapter defaults to Test mode and refuses a Live secret key", () => {
  let blocked = false;
  try {
    new FlutterwaveRecurringPayments({ secretKey: "FLWSECK-LIVE-PLACEHOLDER" });
  } catch (error) {
    blocked = error instanceof FlutterwaveRecurringPaymentError && error.code === "CONFIGURATION";
  }
  assert(blocked, "Live key must not be accepted by default");
});

Deno.test("adapter rejects unknown key formats in Test mode", () => {
  let blocked = false;
  try {
    new FlutterwaveRecurringPayments({ secretKey: "not-a-flutterwave-key" });
  } catch (error) {
    blocked = error instanceof FlutterwaveRecurringPaymentError && error.code === "CONFIGURATION";
  }
  assert(blocked, "Unknown key format rejected");
});

Deno.test("adapter rejects a Test key when Live mode is explicitly selected", () => {
  let blocked = false;
  try {
    new FlutterwaveRecurringPayments({
      secretKey,
      environment: "live",
    });
  } catch (error) {
    blocked = error instanceof FlutterwaveRecurringPaymentError && error.code === "CONFIGURATION";
  }
  assert(blocked, "Test key must not be accepted in Live mode");
});

Deno.test("createPaymentPlan provisions each exact approved NGN plan with no fixed duration", async () => {
  for (const planId of ["monthly", "annual", "five_year"] as const) {
    const terms = VERIFIED_PLUS_PLAN_TERMS[planId];
    const capturedBody: { value?: Record<string, unknown> } = {};
    const client = new FlutterwaveRecurringPayments({
      secretKey,
      fetcher: mockFetch(async (url, init) => {
        equal(url, "https://api.flutterwave.com/v3/payment-plans", "Plan endpoint");
        equal(init?.method, "POST", "Plan method");
        equal((init?.headers as Record<string,string>).Authorization, "Bearer " + secretKey, "Bearer secret header");
        capturedBody.value = JSON.parse(String(init?.body));
        return jsonResponse({
          status: "success",
          data: {
            id: 12345,
            amount: terms.amount,
            currency: "NGN",
            interval: terms.renewalInterval.providerIntervalText,
            status: "active",
          },
        });
      }),
    });
    const plan = await client.createPaymentPlan(planId);
    const planBody = capturedBody.value;
    assert(planBody !== undefined, "Plan request body captured");
    equal(planBody.amount, terms.amount, planId + " exact amount");
    equal(planBody.currency, "NGN", planId + " explicit currency");
    equal(planBody.interval, terms.renewalInterval.providerIntervalText, planId + " exact interval");
    equal("duration" in planBody, false, "Plan has no automatic end duration");
    equal(plan.id, 12345, "Returned plan id");
  }
});

Deno.test("plan creation rejects a provider plan that changes the amount, currency or interval", async () => {
  const client = new FlutterwaveRecurringPayments({
    secretKey,
    fetcher: mockFetch(() => jsonResponse({
      status: "success",
      data: { id: 23, amount: 7500, currency: "USD", interval: "monthly" },
    })),
  });
  let failed = false;
  try {
    await client.createPaymentPlan("monthly");
  } catch (error) {
    failed = error instanceof FlutterwaveRecurringPaymentError && error.code === "PLAN_MISMATCH";
  }
  assert(failed, "Mismatched provider plan must be rejected");
});

Deno.test("adapter blocks recurring checkout without stored member consent", async () => {
  const client = new FlutterwaveRecurringPayments({
    secretKey,
    providerPlanIds: { monthly: 12345, annual: 12346 },
    validatedPlanIds: ["monthly", "annual"],
    fetcher: mockFetch(() => jsonResponse({ status: "success", data: { link: "https://checkout.flutterwave.com/v3/hosted/pay/test" } })),
  });
  let blocked = false;
  try {
    await client.createSubscriptionCheckout({ ...checkoutInput, consent: null });
  } catch (error) {
    blocked = error instanceof FlutterwaveRecurringPaymentError && error.code === "CONSENT_REQUIRED";
  }
  assert(blocked, "Missing member consent must block recurring checkout");
});

Deno.test("adapter blocks Five-Year checkout until the exact interval is sandbox-validated", async () => {
  const fiveYearConsent = {
    ...checkoutConsent,
    planId: "five_year" as const,
    amount: 320000,
    providerIntervalText: "every five years",
  };
  const client = new FlutterwaveRecurringPayments({
    secretKey,
    providerPlanIds: { monthly: 12345, annual: 12346, five_year: 12347 },
    validatedPlanIds: ["monthly", "annual"],
    fetcher: mockFetch(() => jsonResponse({ status: "success", data: { link: "https://checkout.flutterwave.com/v3/hosted/pay/test" } })),
  });
  let blocked = false;
  try {
    await client.createSubscriptionCheckout({
      ...checkoutInput,
      planId: "five_year",
      consent: fiveYearConsent,
        });
  } catch (error) {
    blocked = error instanceof FlutterwaveRecurringPaymentError && error.code === "PROVIDER_INTERVAL_NOT_VALIDATED";
  }
  assert(blocked, "Five-Year checkout must remain blocked before sandbox acceptance");
});

Deno.test("Test mode can explicitly qualify a custom interval before it is enabled for live checkout", async () => {
  const fiveYearConsent = {
    ...checkoutConsent,
    planId: "five_year" as const,
    amount: 320000,
    providerIntervalText: "every five years",
  };
  let requests = 0;
  const client = new FlutterwaveRecurringPayments({
    secretKey,
    environment: "test",
    allowSandboxQualification: true,
    providerPlanIds: { five_year: 12347 },
    fetcher: mockFetch((url, init) => {
      requests++;
      const body = JSON.parse(String(init?.body));
      equal(body.payment_plan, 12347, "Sandbox five-year provider plan ID");
      equal(body.amount, 320000, "Sandbox five-year amount");
      return jsonResponse({ status: "success", data: { link: "https://checkout.flutterwave.com/v3/hosted/pay/test" } });
    }),
  });
  const result = await client.createSubscriptionCheckout({
    ...checkoutInput,
    planId: "five_year",
    consent: fiveYearConsent,
  });
  equal(result.transactionReference, checkoutInput.txRef, "Sandbox checkout reference");
  equal(requests, 1, "One test checkout request");
});

Deno.test("Sandbox interval qualification cannot be enabled with Live mode", () => {
  let blocked = false;
  try {
    new FlutterwaveRecurringPayments({
      secretKey: "FLWSECK-LIVE-PLACEHOLDER",
      environment: "live",
      allowSandboxQualification: true,
    });
  } catch (error) {
    blocked = error instanceof FlutterwaveRecurringPaymentError && error.code === "CONFIGURATION";
  }
  assert(blocked, "Live sandbox qualification must be rejected");
});

Deno.test("checkout reads the provider plan ID from trusted plan configuration, not request input", async () => {
  const captured: { value?: Record<string, unknown> } = {};
  const client = new FlutterwaveRecurringPayments({
    secretKey,
    providerPlanIds: { monthly: 98765 },
    validatedPlanIds: ["monthly"],
    fetcher: mockFetch((url, init) => {
      captured.value = JSON.parse(String(init?.body));
      return jsonResponse({ status: "success", data: { link: "https://checkout.flutterwave.com/v3/hosted/pay/test" } });
    }),
  });
  await client.createSubscriptionCheckout(checkoutInput);
  const checkoutBody = captured.value;
  assert(checkoutBody !== undefined, "Checkout payload captured");
  equal(checkoutBody.payment_plan, 98765, "Provider plan comes from trusted configuration");
});

Deno.test("checkout is blocked when no trusted provider plan ID is configured", async () => {
  let calls = 0;
  const client = new FlutterwaveRecurringPayments({
    secretKey,
    validatedPlanIds: ["monthly"],
    fetcher: mockFetch(() => {
      calls++;
      return jsonResponse({ status: "success", data: { link: "https://checkout.flutterwave.com/v3/hosted/pay/test" } });
    }),
  });
  let blocked = false;
  try {
    await client.createSubscriptionCheckout(checkoutInput);
  } catch (error) {
    blocked = error instanceof FlutterwaveRecurringPaymentError && error.code === "INVALID_INPUT";
  }
  assert(blocked, "Missing provider plan mapping rejected");
  equal(calls, 0, "No provider request for unmapped plan");
});

Deno.test("checkout sends the server-approved amount, NGN and provider plan ID", async () => {
  const captured: { value?: Record<string, unknown> } = {};
  const client = new FlutterwaveRecurringPayments({
    secretKey,
    providerPlanIds: { monthly: 12345 },
    validatedPlanIds: ["monthly"],
    fetcher: mockFetch((url, init) => {
      equal(url, "https://api.flutterwave.com/v3/payments", "Hosted checkout endpoint");
      equal(init?.method, "POST", "Hosted checkout method");
      captured.value = JSON.parse(String(init?.body));
      return jsonResponse({ status: "success", data: { link: "https://checkout.flutterwave.com/v3/hosted/pay/test" } });
    }),
  });
  const result = await client.createSubscriptionCheckout(checkoutInput);
  const checkoutBody = captured.value;
  assert(checkoutBody !== undefined, "Checkout payload captured");
  equal(checkoutBody.amount, 7500, "Monthly amount in NGN units");
  equal(checkoutBody.currency, "NGN", "NGN currency");
  equal(checkoutBody.payment_plan, 12345, "Provider recurring plan");
  equal((checkoutBody.customer as Record<string,unknown>).email, checkoutInput.email, "Customer email");
  equal(result.transactionReference, checkoutInput.txRef, "Transaction reference");
});

Deno.test("one-time membership checkout sends exact amount and does not attach a recurring plan", async () => {
  let captured: { value?: Record<string, unknown> } = {};
  const client = new FlutterwaveRecurringPayments({
    secretKey,
    fetcher: mockFetch((url, init) => {
      equal(url, "https://api.flutterwave.com/v3/payments", "One-time checkout endpoint");
      equal(init?.method, "POST", "One-time checkout method");
      captured.value = JSON.parse(String(init?.body));
      return jsonResponse({ status: "success", data: { link: "https://checkout.flutterwave.com/v3/hosted/pay/one-time-test" } });
    }),
  });
  const result = await client.createOneTimeMembershipCheckout({
    txRef: checkoutInput.txRef,
    planId: "annual",
    email: checkoutInput.email,
    customerName: checkoutInput.customerName,
    redirectUrl: checkoutInput.redirectUrl,
    membershipOrderReference: checkoutInput.membershipOrderReference,
  });
  const body = captured.value;
  assert(body !== undefined, "One-time request captured");
  equal(body.amount, 75000, "Annual one-time amount");
  equal(body.currency, "NGN", "One-time currency");
  equal("payment_plan" in body, false, "No recurring plan attached");
  equal((body.meta as Record<string, unknown>).dcds_auto_renew, false, "Automatic renewal explicitly off");
  equal(result.transactionReference, checkoutInput.txRef, "One-time transaction reference");
});

Deno.test("one-time membership checkout validates its DCDS redirect and provider checkout host", async () => {
  const client = new FlutterwaveRecurringPayments({
    secretKey,
    fetcher: mockFetch(() => jsonResponse({ status: "success", data: { link: "https://evil.example/pay" } })),
  });
  let badReturn = false;
  try {
    await client.createOneTimeMembershipCheckout({
      txRef: checkoutInput.txRef,
      planId: "monthly",
      email: checkoutInput.email,
      redirectUrl: "https://evil.example/return",
      membershipOrderReference: checkoutInput.membershipOrderReference,
    });
  } catch (error) {
    badReturn = error instanceof FlutterwaveRecurringPaymentError && error.code === "INVALID_INPUT";
  }
  assert(badReturn, "Off-site return URL rejected");

  let badCheckout = false;
  try {
    await client.createOneTimeMembershipCheckout({
      txRef: checkoutInput.txRef,
      planId: "monthly",
      email: checkoutInput.email,
      redirectUrl: checkoutInput.redirectUrl,
      membershipOrderReference: checkoutInput.membershipOrderReference,
    });
  } catch (error) {
    badCheckout = error instanceof FlutterwaveRecurringPaymentError && error.code === "PROVIDER_RESPONSE";
  }
  assert(badCheckout, "Unapproved checkout host rejected");
});

Deno.test("checkout rejects off-site return URLs and non-Flutterwave hosted destinations", async () => {
  const client = new FlutterwaveRecurringPayments({
    secretKey,
    providerPlanIds: { monthly: 12345 },
    validatedPlanIds: ["monthly"],
    fetcher: mockFetch(() => jsonResponse({ status: "success", data: { link: "https://evil.example/pay" } })),
  });
  let badReturn = false;
  try {
    await client.createSubscriptionCheckout({ ...checkoutInput, redirectUrl: "http://evil.example/return" });
  } catch (error) {
    badReturn = error instanceof FlutterwaveRecurringPaymentError && error.code === "INVALID_INPUT";
  }
  assert(badReturn, "Off-site return URL rejected");

  let badCheckout = false;
  try {
    await client.createSubscriptionCheckout(checkoutInput);
  } catch (error) {
    badCheckout = error instanceof FlutterwaveRecurringPaymentError && error.code === "PROVIDER_RESPONSE";
  }
  assert(badCheckout, "Unapproved checkout host rejected");
});

Deno.test("invalid plan, tx reference and email never call Flutterwave", async () => {
  let calls = 0;
  const client = new FlutterwaveRecurringPayments({
    secretKey,
    providerPlanIds: { monthly: 12345 },
    validatedPlanIds: ["monthly"],
    fetcher: mockFetch(() => {
      calls++;
      return jsonResponse({ status: "success", data: { link: "https://checkout.flutterwave.com/a" } });
    }),
  });
  for (const bad of [
    { ...checkoutInput, txRef: "bad-ref" },
    { ...checkoutInput, email: "not-an-email" },
  ]) {
    let failed = false;
    try {
      await client.createSubscriptionCheckout(bad);
    } catch (error) {
      failed = error instanceof FlutterwaveRecurringPaymentError && error.code === "INVALID_INPUT";
    }
    assert(failed, "Invalid checkout input rejected");
  }
  equal(calls, 0, "No provider request made for invalid input");
});

Deno.test("member cancellation uses the individual subscription endpoint and confirms its own ID", async () => {
  const client = new FlutterwaveRecurringPayments({
    secretKey,
    fetcher: mockFetch((url, init) => {
      equal(url, "https://api.flutterwave.com/v3/subscriptions/4147/cancel", "Subscription cancellation endpoint");
      equal(init?.method, "PUT", "Cancellation method");
      return jsonResponse({ status: "success", data: { id: 4147, status: "cancelled" } });
    }),
  });
  const result = await client.cancelSubscription("4147");
  equal(result.subscriptionId, "4147", "Cancelled subscription ID");
  equal(result.status, "cancelled", "Provider cancellation status");
});

Deno.test("cancellation rejects malformed ID and mismatched provider response", async () => {
  const client = new FlutterwaveRecurringPayments({
    secretKey,
    fetcher: mockFetch(() => jsonResponse({ status: "success", data: { id: 4148, status: "cancelled" } })),
  });
  let badId = false;
  try {
    await client.cancelSubscription("https://evil.example");
  } catch (error) {
    badId = error instanceof FlutterwaveRecurringPaymentError && error.code === "INVALID_INPUT";
  }
  assert(badId, "Invalid subscription ID rejected");

  let mismatched = false;
  try {
    await client.cancelSubscription("4147");
  } catch (error) {
    mismatched = error instanceof FlutterwaveRecurringPaymentError && error.code === "SUBSCRIPTION_MISMATCH";
  }
  assert(mismatched, "Wrong provider subscription ID rejected");
});

Deno.test("transaction verification uses the numeric ID endpoint and verifies returned identity", async () => {
  const client = new FlutterwaveRecurringPayments({
    secretKey,
    fetcher: mockFetch((url, init) => {
      equal(url, "https://api.flutterwave.com/v3/transactions/777/verify", "Transaction verification endpoint");
      equal(init?.method, "GET", "Verify method");
      return jsonResponse({
        status: "success",
        data: { id: 777, tx_ref: checkoutInput.txRef, amount: 7500, currency: "NGN", status: "successful" },
      });
    }),
  });
  const tx = await client.verifyTransaction("777");
  equal(String(tx.id), "777", "Verified transaction identity");
  equal(tx.status, "successful", "Verified status");
}); 

Deno.test("transaction validation checks ID, reference, amount, currency, status and customer email", () => {
  const base = {
    id: 777,
    tx_ref: checkoutInput.txRef,
    amount: 7500,
    currency: "NGN",
    status: "successful",
    customer: { email: checkoutInput.email },
  };
  equal(validateVerifiedPlusTransaction({
    transaction: base,
    expectedTransactionId: "777",
    expectedReference: checkoutInput.txRef,
    expectedPlanId: "monthly",
    expectedCustomerEmail: checkoutInput.email,
  }), null, "Matching monthly charge");
  equal(validateVerifiedPlusTransaction({
    transaction: { ...base, amount: 7501 },
    expectedTransactionId: "777",
    expectedReference: checkoutInput.txRef,
    expectedPlanId: "monthly",
    expectedCustomerEmail: checkoutInput.email,
  }) !== null, true, "Wrong amount rejected");
  equal(validateVerifiedPlusTransaction({
    transaction: { ...base, customer: { email: "attacker@example.com" } },
    expectedTransactionId: "777",
    expectedReference: checkoutInput.txRef,
    expectedPlanId: "monthly",
    expectedCustomerEmail: checkoutInput.email,
  }) !== null, true, "Wrong customer email rejected");
});

Deno.test("subscription lookup is scoped by the first verified transaction ID", async () => {
  const client = new FlutterwaveRecurringPayments({
    secretKey,
    fetcher: mockFetch((url, init) => {
      equal(url, "https://api.flutterwave.com/v3/subscriptions?transaction_id=777&email=member%40example.com&plan=12345", "Subscription query");
      equal(init?.method, "GET", "Subscription lookup method");
      return jsonResponse({
        status: "success",
        data: [{ id: 4147, amount: 7500, plan: 12345, status: "active", customer: { customer_email: "member@example.com" } }],
      });
    }),
  });
  const rows = await client.listSubscriptions({ transactionId: "777", email: checkoutInput.email, planId: 12345 });
  equal(rows.length, 1, "One matching subscription");
  equal(String(rows[0].id), "4147", "Provider subscription ID");
});

Deno.test("subscription resolution matches the first transaction, trusted plan, amount and email", async () => {
  const client = new FlutterwaveRecurringPayments({
    secretKey,
    providerPlanIds: { monthly: 12345 },
    validatedPlanIds: ["monthly"],
    fetcher: mockFetch((url, init) => {
      equal(
        url,
        "https://api.flutterwave.com/v3/subscriptions?transaction_id=777&email=member%40example.com&plan=12345",
        "Find subscription by initial verified payment",
      );
      return jsonResponse({
        status: "success",
        data: [{
          id: 4147,
          amount: 7500,
          plan: 12345,
          status: "active",
          customer: { customer_email: "member@example.com" },
        }],
      });
    }),
  });
  const record = await client.resolveSubscriptionFromInitialCharge({
    transactionId: "777",
    planId: "monthly",
    email: checkoutInput.email,
  });
  equal(String(record.id), "4147", "Bound recurring subscription ID");
});

Deno.test("subscription resolution rejects wrong amount or customer email", async () => {
  const client = new FlutterwaveRecurringPayments({
    secretKey,
    providerPlanIds: { monthly: 12345 },
    validatedPlanIds: ["monthly"],
    fetcher: mockFetch(() => jsonResponse({
      status: "success",
      data: [{
        id: 4147,
        amount: 7501,
        plan: 12345,
        status: "active",
        customer: { customer_email: "someone-else@example.com" },
      }],
    })),
  });
  let blocked = false;
  try {
    await client.resolveSubscriptionFromInitialCharge({
      transactionId: "777",
      planId: "monthly",
      email: checkoutInput.email,
    });
  } catch (error) {
    blocked = error instanceof FlutterwaveRecurringPaymentError && error.code === "SUBSCRIPTION_MISMATCH";
  }
  assert(blocked, "Mismatched subscription details must be rejected");
});

Deno.test("provider HTTP failures do not expose provider body or secret credentials", async () => {
  const client = new FlutterwaveRecurringPayments({
    secretKey,
    fetcher: mockFetch(() => jsonResponse({ status: "error", message: "secret details" }, 401)),
  });
  let safe = false;
  try {
    await client.verifyTransaction("777");
  } catch (error) {
    safe = error instanceof FlutterwaveRecurringPaymentError &&
      error.code === "PROVIDER_HTTP" &&
      !error.message.includes("secret details") &&
      !error.message.includes(secretKey);
  }
  assert(safe, "Provider error is sanitised");
});

Deno.test("documented Flutterwave verif-hash header is checked against the configured secret", () => {
  const headers = new Headers({ "verif-hash": "sandbox-webhook-secret" });
  equal(
    verifyFlutterwaveWebhookSignature({ headers, secretHash: "sandbox-webhook-secret" }),
    true,
    "Matching configured secret hash",
  );
  equal(
    verifyFlutterwaveWebhookSignature({ headers: new Headers({ "verif-hash": "wrong" }), secretHash: "sandbox-webhook-secret" }),
    false,
    "Mismatched secret hash rejected",
  );
});

Deno.test("missing Flutterwave secret hash or verif-hash header is rejected", () => {
  equal(
    verifyFlutterwaveWebhookSignature({ headers: new Headers(), secretHash: "sandbox-webhook-secret" }),
    false,
    "Missing request header rejected",
  );
  equal(
    verifyFlutterwaveWebhookSignature({ headers: new Headers({ "verif-hash": "sandbox-webhook-secret" }), secretHash: "" }),
    false,
    "Missing server secret rejected",
  );
});

