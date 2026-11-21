/**
 * TEST-ONLY synthetic identity provider adapter.
 *
 * SAFETY:
 * - Never import this module into a deployed Edge Function or customer flow.
 * - It makes no network requests and has no Supabase/database integration.
 * - It cannot perform real NIN, document, selfie, face-match, or liveness checks.
 * - It accepts only signed synthetic notifications created by the test helper.
 * - All in-memory records are disposable and disappear with the isolate.
 *
 * This is a contract-test fixture, not a production provider or security model
 * for any real vendor's webhook signature scheme.
 */

import {
  IdentityProviderAdapterError,
  type IdentityProviderAdapter,
  type NormalizedProviderOutcome,
  type StartVerificationInput,
  type StartVerificationResult,
  type VerifyNotificationInput,
} from "./identity-provider.ts";

export const MOCK_ADAPTER_SAFETY =
  "TEST_ONLY_SYNTHETIC_NO_REAL_IDENTITY_VERIFICATION";

interface MockOptions {
  /** Synthetic test secret only. Never load a real provider credential here. */
  webhookSecret: string;
  allowedReturnOrigins: string[];
  now?: () => Date;
  sessionTtlMs?: number;
  signatureToleranceMs?: number;
}

interface MockSession {
  caseId: string;
  providerReference: string;
  expiresAt: string;
}

interface SyntheticNotification {
  caseId: string;
  providerReference: string;
  providerEventId: string;
  decision: string;
  occurredAt: string;
  reasonCode?: string;
  countryCode?: string;
  documentCategory?: string;
}

const DEFAULT_SESSION_TTL_MS = 5 * 60 * 1000;
const DEFAULT_SIGNATURE_TOLERANCE_MS = 5 * 60 * 1000;
const SAFE_REASON_CODE = /^[A-Z0-9_]{1,64}$/;
const SAFE_DOCUMENT_CATEGORY = /^[A-Za-z0-9_-]{1,40}$/;
const SAFE_ID = /^[A-Za-z0-9_-]{8,120}$/;
const ALLOWED_NOTIFICATION_FIELDS = new Set([
  "caseId",
  "providerReference",
  "providerEventId",
  "decision",
  "occurredAt",
  "reasonCode",
  "countryCode",
  "documentCategory",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function headerValue(
  headers: Record<string, string>,
  name: string,
): string | undefined {
  const match = Object.entries(headers).find(
    ([key]) => key.toLowerCase() === name.toLowerCase(),
  );
  return match?.[1];
}

function toHex(bytes: Uint8Array): string {
  return Array.from(bytes, (value) => value.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

function concatBytes(left: Uint8Array, right: Uint8Array): Uint8Array {
  const result = new Uint8Array(left.length + right.length);
  result.set(left, 0);
  result.set(right, left.length);
  return result;
}

async function hmacHex(
  secret: string,
  timestamp: string,
  rawBody: Uint8Array,
): Promise<string> {
  const encoder = new TextEncoder();
  const prefix = encoder.encode(`${timestamp}.`);
  const payload = concatBytes(prefix, rawBody);
  const key = await crypto.subtle.importKey(
    "raw",
    encoder.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, payload);
  return toHex(new Uint8Array(signature));
}

/**
 * Test helper. Produces the synthetic HMAC header format consumed only by
 * SyntheticIdentityProviderAdapter. It does not imitate any vendor's scheme.
 */
export async function signSyntheticRawBodyForTest(
  rawBody: Uint8Array,
  webhookSecret: string,
  timestampMs: number,
): Promise<{ rawBody: Uint8Array; headers: Record<string, string> }> {
  const timestamp = String(timestampMs);
  const signature = await hmacHex(webhookSecret, timestamp, rawBody);
  return {
    rawBody,
    headers: {
      "x-dcds-mock-timestamp": timestamp,
      "x-dcds-mock-signature": signature,
    },
  };
}

/** Builds and signs a synthetic normalized provider event for tests. */
export async function createSyntheticNotificationForTest(
  body: SyntheticNotification,
  webhookSecret: string,
  timestampMs: number,
): Promise<{ rawBody: Uint8Array; headers: Record<string, string> }> {
  const rawBody = new TextEncoder().encode(JSON.stringify(body));
  return await signSyntheticRawBodyForTest(rawBody, webhookSecret, timestampMs);
}

export class SyntheticIdentityProviderAdapter
  implements IdentityProviderAdapter {
  readonly providerName = "synthetic-test-only";

  private readonly webhookSecret: string;
  private readonly allowedReturnOrigins: Set<string>;
  private readonly now: () => Date;
  private readonly sessionTtlMs: number;
  private readonly signatureToleranceMs: number;
  private sequence = 0;
  private readonly idempotentSessions = new Map<string, MockSession>();
  private readonly sessionsByReference = new Map<string, MockSession>();
  private readonly outcomesByReference = new Map<
    string,
    NormalizedProviderOutcome
  >();
  private readonly processedEventIds = new Set<string>();

  constructor(options: MockOptions) {
    if (
      typeof options.webhookSecret !== "string" ||
      options.webhookSecret.length < 16
    ) {
      throw new IdentityProviderAdapterError(
        "INVALID_INPUT",
        "A synthetic test secret of at least 16 characters is required.",
      );
    }

    if (
      !Array.isArray(options.allowedReturnOrigins) ||
      options.allowedReturnOrigins.length === 0
    ) {
      throw new IdentityProviderAdapterError(
        "INVALID_INPUT",
        "At least one DCDS test return origin must be configured.",
      );
    }

    this.webhookSecret = options.webhookSecret;
    this.allowedReturnOrigins = new Set(
      options.allowedReturnOrigins.map((value) => {
        const origin = new URL(value);
        if (origin.protocol !== "https:") {
          throw new IdentityProviderAdapterError(
            "INVALID_INPUT",
            "Synthetic adapter allowlist entries must use HTTPS.",
          );
        }
        return origin.origin;
      }),
    );

    this.now = options.now ?? (() => new Date());
    this.sessionTtlMs = options.sessionTtlMs ??
      DEFAULT_SESSION_TTL_MS;
    this.signatureToleranceMs = options.signatureToleranceMs ??
      DEFAULT_SIGNATURE_TOLERANCE_MS;

    if (
      !Number.isSafeInteger(this.sessionTtlMs) ||
      this.sessionTtlMs <= 0 ||
      !Number.isSafeInteger(this.signatureToleranceMs) ||
      this.signatureToleranceMs < 0
    ) {
      throw new IdentityProviderAdapterError(
        "INVALID_INPUT",
        "Synthetic session and signature timing values are invalid.",
      );
    }
  }

  async startVerification(
    input: StartVerificationInput,
  ): Promise<StartVerificationResult> {
    if (
      !SAFE_ID.test(input.caseId) ||
      !SAFE_ID.test(input.applicantId) ||
      !/^[A-Z]{2}$/.test(input.countryCode) ||
      !SAFE_ID.test(input.idempotencyKey)
    ) {
      throw new IdentityProviderAdapterError(
        "INVALID_INPUT",
        "Synthetic verification input is malformed.",
      );
    }

    let returnOrigin: string;
    try {
      const returnUrl = new URL(input.returnUrl);
      if (
        returnUrl.protocol !== "https:" ||
        returnUrl.username ||
        returnUrl.password
      ) {
        throw new Error("Unsafe return URL.");
      }
      returnOrigin = returnUrl.origin;
    } catch {
      throw new IdentityProviderAdapterError(
        "RETURN_URL_NOT_ALLOWED",
        "The DCDS return URL is not valid.",
      );
    }

    if (!this.allowedReturnOrigins.has(returnOrigin)) {
      throw new IdentityProviderAdapterError(
        "RETURN_URL_NOT_ALLOWED",
        "The DCDS return URL origin is not allowlisted.",
      );
    }

    const idempotencyKey = `${input.caseId}:${input.idempotencyKey}`;
    let session = this.idempotentSessions.get(idempotencyKey);

    if (!session || Date.parse(session.expiresAt) <= this.now().getTime()) {
      this.sequence += 1;
      const providerReference = `mock-ref-${String(this.sequence).padStart(6, "0")}`;
      session = {
        caseId: input.caseId,
        providerReference,
        expiresAt: new Date(
          this.now().getTime() + this.sessionTtlMs,
        ).toISOString(),
      };
      this.idempotentSessions.set(idempotencyKey, session);
      this.sessionsByReference.set(providerReference, session);
    }

    return {
      providerName: this.providerName,
      providerReference: session.providerReference,
      hostedUrl:
        `https://identity-session.invalid/mock/${session.providerReference}`,
      expiresAt: session.expiresAt,
    };
  }

  async verifyNotification(
    input: VerifyNotificationInput,
  ): Promise<NormalizedProviderOutcome | null> {
    const timestamp = headerValue(
      input.headers,
      "x-dcds-mock-timestamp",
    );
    const suppliedSignature = headerValue(
      input.headers,
      "x-dcds-mock-signature",
    );

    if (
      !timestamp ||
      !/^[0-9]{10,16}$/.test(timestamp) ||
      !suppliedSignature ||
      !/^[a-f0-9]{64}$/i.test(suppliedSignature)
    ) {
      return null;
    }

    const receivedAtMs = Date.parse(input.receivedAt);
    const signedAtMs = Number(timestamp);
    const currentAtMs = this.now().getTime();

    if (
      !Number.isFinite(receivedAtMs) ||
      !Number.isSafeInteger(signedAtMs) ||
      Math.abs(receivedAtMs - signedAtMs) > this.signatureToleranceMs ||
      Math.abs(currentAtMs - signedAtMs) > this.signatureToleranceMs
    ) {
      return null;
    }

    const expectedSignature = await hmacHex(
      this.webhookSecret,
      timestamp,
      input.rawBody,
    );

    if (!constantTimeEqual(expectedSignature, suppliedSignature.toLowerCase())) {
      return null;
    }

    let payload: unknown;
    try {
      payload = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(input.rawBody),
      );
    } catch {
      return null;
    }

    if (!isRecord(payload)) return null;

    const fields = Object.keys(payload);
    if (fields.some((field) => !ALLOWED_NOTIFICATION_FIELDS.has(field))) {
      return null;
    }

    const notification = payload as unknown as SyntheticNotification;
    if (
      typeof notification.caseId !== "string" ||
      typeof notification.providerReference !== "string" ||
      typeof notification.providerEventId !== "string" ||
      !SAFE_ID.test(notification.caseId) ||
      !/^mock-ref-[0-9]{6}$/.test(notification.providerReference) ||
      !SAFE_ID.test(notification.providerEventId) ||
      !["pending", "verified", "rejected", "requires_review"].includes(
        notification.decision,
      ) ||
      typeof notification.occurredAt !== "string" ||
      !Number.isFinite(Date.parse(notification.occurredAt))
    ) {
      return null;
    }

    if (
      notification.reasonCode !== undefined &&
      (typeof notification.reasonCode !== "string" ||
        !SAFE_REASON_CODE.test(notification.reasonCode))
    ) {
      return null;
    }

    if (
      notification.countryCode !== undefined &&
      (typeof notification.countryCode !== "string" ||
        !/^[A-Z]{2}$/.test(notification.countryCode))
    ) {
      return null;
    }

    if (
      notification.documentCategory !== undefined &&
      (typeof notification.documentCategory !== "string" ||
        !SAFE_DOCUMENT_CATEGORY.test(notification.documentCategory))
    ) {
      return null;
    }

    const session = this.sessionsByReference.get(
      notification.providerReference,
    );
    if (
      !session ||
      session.caseId !== notification.caseId ||
      Date.parse(session.expiresAt) <= currentAtMs ||
      this.processedEventIds.has(notification.providerEventId)
    ) {
      return null;
    }

    const outcome: NormalizedProviderOutcome = {
      providerReference: notification.providerReference,
      providerEventId: notification.providerEventId,
      decision: notification.decision as NormalizedProviderOutcome["decision"],
      occurredAt: new Date(notification.occurredAt).toISOString(),
      ...(notification.reasonCode
        ? { reasonCode: notification.reasonCode }
        : {}),
      ...(notification.countryCode
        ? { countryCode: notification.countryCode }
        : {}),
      ...(notification.documentCategory
        ? { documentCategory: notification.documentCategory }
        : {}),
    };

    this.processedEventIds.add(notification.providerEventId);
    this.outcomesByReference.set(notification.providerReference, outcome);
    return { ...outcome };
  }

  async getOutcome(input: {
    providerReference: string;
  }): Promise<NormalizedProviderOutcome> {
    const outcome = this.outcomesByReference.get(input.providerReference);
    if (!outcome) {
      throw new IdentityProviderAdapterError(
        "OUTCOME_NOT_AVAILABLE",
        "No validated synthetic outcome is available for this reference.",
        true,
      );
    }
    return { ...outcome };
  }
}
