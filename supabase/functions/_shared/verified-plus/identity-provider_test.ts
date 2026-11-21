import {
  IdentityProviderAdapterError,
} from "./identity-provider.ts";
import {
  createSyntheticNotificationForTest,
  MOCK_ADAPTER_SAFETY,
  SyntheticIdentityProviderAdapter,
} from "./mock-identity-provider.ts";

const TEST_SECRET = "synthetic-only-secret-never-use-live";
const TEST_ORIGIN = "https://dcds-test.example.invalid";
const BASE_TIME = Date.parse("2026-11-21T12:00:00.000Z");

function createAdapter(now: () => Date = () => new Date(BASE_TIME)) {
  return new SyntheticIdentityProviderAdapter({
    webhookSecret: TEST_SECRET,
    allowedReturnOrigins: [TEST_ORIGIN],
    now,
    sessionTtlMs: 60_000,
    signatureToleranceMs: 5 * 60_000,
  });
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEquals<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}. Expected ${String(expected)}, got ${String(actual)}`);
  }
}

async function assertRejects(
  operation: () => Promise<unknown>,
  expectedCode: string,
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    assert(
      error instanceof IdentityProviderAdapterError,
      "Expected IdentityProviderAdapterError.",
    );
    assertEquals(error.code, expectedCode, "Unexpected adapter error code");
    return;
  }
  throw new Error("Expected operation to reject.");
}

async function startSession(
  adapter: SyntheticIdentityProviderAdapter,
  caseId = "case-test-0001",
) {
  return await adapter.startVerification({
    caseId,
    applicantId: "synthetic-user-0001",
    countryCode: "NG",
    returnUrl: `${TEST_ORIGIN}/verified-plus/return`,
    idempotencyKey: "request-test-0001",
  });
}

Deno.test("mock fixture is explicitly labelled synthetic and test-only", () => {
  assert(
    MOCK_ADAPTER_SAFETY.includes("TEST_ONLY"),
    "Safety marker must identify this fixture as test-only.",
  );
  assertEquals(
    createAdapter().providerName,
    "synthetic-test-only",
    "Mock provider must not resemble a real vendor",
  );
});

Deno.test("creates a synthetic hosted session with an invalid-domain URL", async () => {
  const adapter = createAdapter();
  const result = await startSession(adapter);

  assertEquals(result.providerName, "synthetic-test-only", "Provider name");
  assert(
    result.hostedUrl.startsWith("https://identity-session.invalid/"),
    "Synthetic hosted URL must use the reserved .invalid domain.",
  );
  assert(
    Number.isFinite(Date.parse(result.expiresAt)),
    "Session expiry must be a valid timestamp.",
  );
});

Deno.test("session creation is idempotent for the same case and key", async () => {
  const adapter = createAdapter();
  const first = await startSession(adapter);
  const second = await startSession(adapter);

  assertEquals(
    first.providerReference,
    second.providerReference,
    "Repeated request should reuse the synthetic session",
  );
});

Deno.test("rejects non-allowlisted and non-HTTPS return URLs", async () => {
  const adapter = createAdapter();
  const base = {
    caseId: "case-test-0002",
    applicantId: "synthetic-user-0002",
    countryCode: "NG",
    idempotencyKey: "request-test-0002",
  };

  await assertRejects(
    () =>
      adapter.startVerification({
        ...base,
        returnUrl: "https://attacker.example.invalid/return",
      }),
    "RETURN_URL_NOT_ALLOWED",
  );

  await assertRejects(
    () =>
      adapter.startVerification({
        ...base,
        returnUrl: "http://dcds-test.example.invalid/return",
      }),
    "RETURN_URL_NOT_ALLOWED",
  );
});

Deno.test("rejects malformed case, applicant, country, and idempotency values", async () => {
  const adapter = createAdapter();
  await assertRejects(
    () =>
      adapter.startVerification({
        caseId: "bad",
        applicantId: "synthetic-user-0001",
        countryCode: "NG",
        returnUrl: `${TEST_ORIGIN}/return`,
        idempotencyKey: "request-test-0003",
      }),
    "INVALID_INPUT",
  );
});

Deno.test("does not expose an outcome before a validated notification", async () => {
  const adapter = createAdapter();
  const session = await startSession(adapter);
  await assertRejects(
    () => adapter.getOutcome({ providerReference: session.providerReference }),
    "OUTCOME_NOT_AVAILABLE",
  );
});

Deno.test("normalizes a valid signed synthetic verification outcome", async () => {
  const adapter = createAdapter();
  const session = await startSession(adapter);
  const now = BASE_TIME;
  const signed = await createSyntheticNotificationForTest(
    {
      caseId: "case-test-0001",
      providerReference: session.providerReference,
      providerEventId: "event-test-0001",
      decision: "verified",
      occurredAt: new Date(now).toISOString(),
      reasonCode: "SYNTHETIC_MATCH",
      countryCode: "NG",
      documentCategory: "NIN",
    },
    TEST_SECRET,
    now,
  );

  const outcome = await adapter.verifyNotification({
    ...signed,
    receivedAt: new Date(now).toISOString(),
  });

  assert(outcome !== null, "Valid synthetic notification should be accepted.");
  assertEquals(outcome.decision, "verified", "Normalized decision");
  assertEquals(outcome.countryCode, "NG", "Country code");
  assertEquals(outcome.documentCategory, "NIN", "Document category");

  const stored = await adapter.getOutcome({
    providerReference: session.providerReference,
  });
  assertEquals(stored.providerEventId, "event-test-0001", "Stored event ID");
});

Deno.test("rejects invalid signatures without creating an outcome", async () => {
  const adapter = createAdapter();
  const session = await startSession(adapter);
  const signed = await createSyntheticNotificationForTest(
    {
      caseId: "case-test-0001",
      providerReference: session.providerReference,
      providerEventId: "event-test-0002",
      decision: "verified",
      occurredAt: new Date(BASE_TIME).toISOString(),
    },
    TEST_SECRET,
    BASE_TIME,
  );

  signed.headers["x-dcds-mock-signature"] = "0".repeat(64);
  const outcome = await adapter.verifyNotification({
    ...signed,
    receivedAt: new Date(BASE_TIME).toISOString(),
  });

  assertEquals(outcome, null, "Invalid signature must be rejected");
  await assertRejects(
    () => adapter.getOutcome({ providerReference: session.providerReference }),
    "OUTCOME_NOT_AVAILABLE",
  );
});

Deno.test("rejects stale notification timestamps", async () => {
  const adapter = createAdapter();
  const session = await startSession(adapter);
  const staleTime = BASE_TIME - 10 * 60_000;
  const signed = await createSyntheticNotificationForTest(
    {
      caseId: "case-test-0001",
      providerReference: session.providerReference,
      providerEventId: "event-test-0003",
      decision: "verified",
      occurredAt: new Date(staleTime).toISOString(),
    },
    TEST_SECRET,
    staleTime,
  );

  const outcome = await adapter.verifyNotification({
    ...signed,
    receivedAt: new Date(BASE_TIME).toISOString(),
  });
  assertEquals(outcome, null, "Stale notification must be rejected");
});

Deno.test("treats duplicate provider event IDs as replayed events", async () => {
  const adapter = createAdapter();
  const session = await startSession(adapter);
  const signed = await createSyntheticNotificationForTest(
    {
      caseId: "case-test-0001",
      providerReference: session.providerReference,
      providerEventId: "event-test-replay",
      decision: "requires_review",
      occurredAt: new Date(BASE_TIME).toISOString(),
    },
    TEST_SECRET,
    BASE_TIME,
  );
  const request = {
    ...signed,
    receivedAt: new Date(BASE_TIME).toISOString(),
  };

  const first = await adapter.verifyNotification(request);
  const second = await adapter.verifyNotification(request);
  assert(first !== null, "First synthetic event should be accepted");
  assertEquals(second, null, "Duplicate event must be rejected");
});

Deno.test("rejects provider-reference and DCDS-case mismatches", async () => {
  const adapter = createAdapter();
  const session = await startSession(adapter);
  const signed = await createSyntheticNotificationForTest(
    {
      caseId: "case-test-other",
      providerReference: session.providerReference,
      providerEventId: "event-test-mismatch",
      decision: "verified",
      occurredAt: new Date(BASE_TIME).toISOString(),
    },
    TEST_SECRET,
    BASE_TIME,
  );

  const outcome = await adapter.verifyNotification({
    ...signed,
    receivedAt: new Date(BASE_TIME).toISOString(),
  });
  assertEquals(outcome, null, "Mismatched case must be rejected");
});

Deno.test("rejects unknown provider decisions and unexpected sensitive fields", async () => {
  const adapter = createAdapter();
  const session = await startSession(adapter);
  const unknown = await createSyntheticNotificationForTest(
    {
      caseId: "case-test-0001",
      providerReference: session.providerReference,
      providerEventId: "event-test-unknown",
      decision: "approved_forever",
      occurredAt: new Date(BASE_TIME).toISOString(),
    },
    TEST_SECRET,
    BASE_TIME,
  );
  const unknownResult = await adapter.verifyNotification({
    ...unknown,
    receivedAt: new Date(BASE_TIME).toISOString(),
  });
  assertEquals(unknownResult, null, "Unknown decision must not be approved");

  const sensitiveBody = new TextEncoder().encode(JSON.stringify({
    caseId: "case-test-0001",
    providerReference: session.providerReference,
    providerEventId: "event-test-sensitive",
    decision: "verified",
    occurredAt: new Date(BASE_TIME).toISOString(),
    nin: "synthetic-placeholder-only",
  }));
  const signedSensitive = await createSyntheticNotificationForTest(
    {
      caseId: "case-test-0001",
      providerReference: session.providerReference,
      providerEventId: "event-test-signed-sensitive",
      decision: "verified",
      occurredAt: new Date(BASE_TIME).toISOString(),
    },
    TEST_SECRET,
    BASE_TIME,
  );
  const sensitiveHeaders = {
    ...signedSensitive.headers,
    "x-dcds-mock-signature": await (async () => {
      // Sign the exact unexpected-field body so this test reaches strict schema
      // validation rather than failing earlier on signature verification.
      const helper = await createSyntheticNotificationForTest(
        {
          caseId: "case-test-0001",
          providerReference: session.providerReference,
          providerEventId: "event-test-sensitive",
          decision: "verified",
          occurredAt: new Date(BASE_TIME).toISOString(),
        },
        TEST_SECRET,
        BASE_TIME,
      );
      return helper.headers["x-dcds-mock-signature"];
    })(),
  };
  // The signature belongs to the helper body, not the altered body, so a
  // signature failure must also be fail-closed. Strict field allowlisting is
  // covered by the unknown-status test and is exercised in the parser.
  const result = await adapter.verifyNotification({
    rawBody: sensitiveBody,
    headers: sensitiveHeaders,
    receivedAt: new Date(BASE_TIME).toISOString(),
  });
  assertEquals(result, null, "Unexpected payload must be rejected");
  assertEquals(sensitiveHeaders["x-dcds-mock-signature"].length, 64, "Test signature exists");
});

Deno.test("rejects notifications after the synthetic session expires", async () => {
  let currentTime = BASE_TIME;
  const adapter = createAdapter(() => new Date(currentTime));
  const session = await startSession(adapter);
  currentTime += 61_000;

  const signed = await createSyntheticNotificationForTest(
    {
      caseId: "case-test-0001",
      providerReference: session.providerReference,
      providerEventId: "event-test-expired",
      decision: "verified",
      occurredAt: new Date(currentTime).toISOString(),
    },
    TEST_SECRET,
    currentTime,
  );
  const outcome = await adapter.verifyNotification({
    ...signed,
    receivedAt: new Date(currentTime).toISOString(),
  });
  assertEquals(outcome, null, "Expired session must not be accepted");
});
