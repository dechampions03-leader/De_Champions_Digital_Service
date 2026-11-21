# DCDS Verified+ Identity Provider Adapter Contract

**Status:** Draft implementation contract  
**Date:** 2026-11-21  
**Scope:** Provider-neutral identity verification only  
**Provider selected:** No  
**Database changes:** None  
**Release state:** Must remain disabled until the release gates in this document and the Verified+ architecture are satisfied

## 1. Purpose

This contract defines the boundary between DCDS and any future identity-verification provider. It is intended to make the provider replaceable without rebuilding DCDS or coupling identity checks to a single vendor.

It does not select a provider, authorise a contract, approve a data transfer, create database objects, activate a Blue Badge, or enable paid Verified+ membership.

The provider must support the Nigerian and international applicant routes that DCDS chooses to launch. Actual country/document coverage must be confirmed with the provider before integration; do not infer coverage from a marketing page.

## 2. Non-negotiable boundaries

1. **Provider independence:** application and domain code call a DCDS adapter interface, not provider-specific SDKs or endpoints.
2. **Server-side authority:** only trusted server-side code may create verification sessions, validate provider notifications, retrieve provider outcomes, and change the DCDS identity decision.
3. **Hosted capture preferred:** use the provider's hosted document and face/liveness capture wherever available. DCDS pages should receive only a short-lived handoff URL or equivalent session token.
4. **Data minimisation:** do not store raw NIN, full document numbers, document images, selfie images, facial templates, or biometric scans in ordinary DCDS profile or verification tables.
5. **Separate decisions:** an identity result is not a payment confirmation, membership entitlement, seller approval, professional qualification, or business registration.
6. **Auditable changes:** each state transition must record its source, timestamp, case reference, actor/system identity, and a safe reason code.
7. **Fail closed:** invalid signatures, unknown cases, mismatched references, expired sessions, duplicate events, provider outages, and unrecognised provider statuses must never activate a badge.
8. **No production shortcut:** the current migration-history reconciliation blocker remains in force. This contract must not be used as a reason to apply SQL or deploy Edge Functions to either shared Supabase project.

## 3. Domain ownership and state model

Keep identity verification independent from membership and marketplace admission.

### Identity decision

DCDS identity cases may use these normalized states:

| DCDS state | Meaning |
|---|---|
| `pending` | A case exists and provider verification has not produced a final accepted decision |
| `verified` | A trusted provider outcome has been validated and accepted under DCDS rules |
| `rejected` | A final provider outcome was validated and the application was rejected under the configured rules |
| `requires_review` | The provider or DCDS risk rules require an authorised human review |
| `suspended` | An authorised control has temporarily suspended the verification status |
| `revoked` | An authorised control has withdrawn a prior verification decision |

Provider-native statuses must be translated explicitly into this set. Unknown or newly introduced provider values map to a non-approved review/error path; never default an unknown status to `verified`.

A provider's temporary error, timeout, unavailable service, incomplete capture, or missing callback is not a rejection. Keep the case pending or mark it for operational review without inventing a final decision.

### Independent membership state

Membership remains separately modelled as inactive, active monthly, active lifetime, expired, cancelled, or suspended, as defined in the Verified+ architecture.

The public Blue Badge is eligible to display only when the required identity decision and membership entitlement conditions both pass. Do not change identity history just because a paid monthly membership expires. Do not grant membership because identity verification succeeds.

### Seller admission

TRUSTMARKET seller approval remains a third independent decision. Identity verification and active membership may be prerequisites to apply, but neither automatically approves a seller.

## 4. Adapter interface

The following TypeScript is an illustrative domain contract, not production code or a commitment to a particular provider SDK. Keep provider-specific request and response shapes inside the concrete adapter.

```ts
type DcdsIdentityDecision =
  | "pending"
  | "verified"
  | "rejected"
  | "requires_review"
  | "suspended"
  | "revoked";

type IdentityCountryCode = string; // ISO 3166-1 alpha-2, validated at the boundary

interface StartVerificationInput {
  caseId: string;              // opaque DCDS case identifier
  applicantId: string;         // auth.users.id; never expose to the provider unnecessarily
  countryCode: IdentityCountryCode;
  returnUrl: string;           // allowlisted DCDS URL
  idempotencyKey: string;      // stable for this case/session creation attempt
}

interface StartVerificationResult {
  providerName: string;
  providerReference: string;   // opaque provider reference, not a document number
  hostedUrl: string;           // short-lived URL; never persist in long-term logs
  expiresAt: string;
}

interface NormalizedProviderOutcome {
  providerReference: string;
  providerEventId?: string;
  decision: "verified" | "rejected" | "requires_review" | "pending";
  reasonCode?: string;         // allowlisted, non-sensitive code only
  occurredAt: string;
  countryCode?: IdentityCountryCode;
  documentCategory?: string;   // category only, never document number
}

interface IdentityProviderAdapter {
  readonly providerName: string;
  startVerification(input: StartVerificationInput):
    Promise<StartVerificationResult>;
  verifyNotification(input: {
    rawBody: Uint8Array;
    headers: Record<string, string>;
    receivedAt: string;
  }): Promise<NormalizedProviderOutcome | null>;
  getOutcome(input: {
    providerReference: string;
  }): Promise<NormalizedProviderOutcome>;
}
```

Implementation requirements:

- The adapter must validate provider configuration at startup and fail clearly when required secrets are absent.
- The adapter must accept only a DCDS-generated case ID and an allowlisted return URL.
- Provider credentials and signing secrets are server-side secrets, never frontend variables, HTML constants, mobile-app assets, or client-readable database fields.
- Provider event parsing must be strict and schema-validated. Do not pass raw provider JSON into domain logic.
- Do not log raw request bodies, document details, face data, access tokens, hosted URLs, or provider secrets.
- Adapter methods must have bounded timeouts and typed errors for retryable outage, invalid request, invalid signature, expired session, and provider-side review.
- The domain service—not the provider adapter—owns DCDS state transitions, reviewer permissions, membership checks, and audit writes.

## 5. Required verification flow

1. An authenticated applicant requests identity verification and receives the applicable privacy notice and eligibility information.
2. The DCDS server validates the account, country, rate limits, feature gate, and case-creation rules.
3. The server creates or reuses a DCDS case using an idempotent request. It does not accept a client-supplied identity status.
4. The selected adapter creates a provider-hosted session and returns a short-lived handoff URL.
5. The applicant completes the provider's document and any required face/liveness steps on the provider's controlled capture flow.
6. The provider sends a signed notification or DCDS retrieves the outcome through an authenticated server-to-server request.
7. DCDS validates authenticity, freshness, references, case ownership, event uniqueness, country/document compatibility, and the explicit provider status mapping.
8. DCDS records only the minimum normalized decision metadata and appends an audit event.
9. A verified outcome may become `verified` only after all DCDS acceptance rules pass. Ambiguous or exceptional results go to `requires_review`.
10. Membership entitlement is checked separately before displaying the public Blue Badge or enabling paid Verified+ capabilities.

The browser return URL is a user-experience signal only. A query parameter, redirect page, client callback, screenshot, or user-submitted claim must never be treated as proof of verification.

## 6. Notification and replay protection

For providers that support webhooks:

- Verify the signature against the exact raw request bytes using the provider's documented algorithm.
- Validate timestamp tolerance and reject stale or malformed signed messages.
- Use constant-time comparison for locally calculated signatures where applicable.
- Record and enforce uniqueness of provider event IDs (or a carefully designed deterministic event fingerprint when the provider has no event ID).
- Bind the provider reference to exactly one DCDS case and applicant.
- Reject or quarantine notifications with a mismatched provider, case, country, event type, or reference.
- Do not trust a webhook body alone when the provider supports server-to-server outcome retrieval; retrieve and reconcile the authoritative outcome.
- Treat a duplicate event as an idempotent no-op, not as a second verification.
- Do not allow an old or delayed event to overwrite a later suspension or revocation. State transitions must check case version and current state.

If a provider has no signed notification mechanism, require authenticated server-to-server status retrieval and document the polling/rate-limit strategy before approval.

## 7. Data DCDS may retain

Subject to privacy/legal approval and an agreed retention schedule, the ordinary DCDS verification record should be limited to fields such as:

- DCDS case ID and applicant user ID;
- provider name and opaque provider reference;
- applicant country and document category;
- normalized identity decision and safe reason code;
- verification session creation, expiry, completion, and decision timestamps;
- reviewer ID and reason code for human actions;
- provider event ID or replay-protection fingerprint;
- audit correlation ID and created/updated timestamps.

Do not retain raw identity-document numbers, NIN, scans, photographs, facial templates, biometric samples, or complete provider payloads in normal application tables or logs.

If a proposed provider integration requires DCDS to collect or retain any of those sensitive artefacts, stop and require a separate privacy, security, legal, access-control, encryption, retention, deletion, and impact-assessment review before proceeding. Do not create a temporary upload workaround.

## 8. Human review and administrative permissions

- Only a specifically authorised Verification Reviewer role may approve an exception, reject a case after review, suspend a verification, or revoke a prior decision.
- Root Administrator authority must not be inherited by ordinary moderators or support staff.
- Reviewers must not review or approve their own identity case.
- Every manual decision requires a reason code and an append-only audit event.
- A reviewer must see only the minimum evidence and provider summary necessary for the task.
- Support staff may view safe status and provide process guidance but must not change identity decisions.
- Review actions must not alter membership payment records, course enrolments, VTU orders, payouts, or balances.

## 9. Provider selection checklist

Do not select a provider on price or a logo alone. Complete and record these checks before enabling a real applicant flow:

| Area | Evidence required |
|---|---|
| Country and document coverage | Written confirmation for each launch country and accepted document category, including Nigerian NIN route if offered |
| Capture model | Hosted capture capability, redirect/session behaviour, accessibility and supported mobile browsers |
| Decision quality | Clear definitions for verified, rejected, pending, review, liveness and face-match outcomes; known limitations and false-positive/false-negative handling |
| Security | Current security assurance, encryption, access controls, incident response, audit logging and vulnerability disclosure |
| Privacy and lawfulness | Data-processing terms, purpose limitation, retention/deletion, data-subprocessor list, data location and cross-border transfer terms |
| Operational reliability | Availability commitments, rate limits, timeouts, retry semantics, webhook replay protection and support escalation |
| Commercial model | Price per attempt/success, failed/retry billing, minimum commitments, refund rules, taxes and currency |
| Portability | Documented API, exportable case references/outcomes, webhook documentation, sandbox access and practical exit procedure |
| Accessibility and fairness | Accessible capture flow, manual review route, language support and accommodations for applicants who cannot complete automated checks |

Record the selected provider, approved countries/documents, data flow, contract owner, effective date, price basis, and exit plan in a separate decision record. Do not hard-code a provider name into the domain model.

## 10. Failure and recovery behaviour

| Condition | Required DCDS behaviour |
|---|---|
| Provider timeout or outage | Keep case pending; show a retry-safe message; do not create duplicate billable sessions unnecessarily |
| Applicant abandons capture | Keep case pending until the session expires; permit a controlled restart |
| Invalid webhook signature | Reject notification, record a security event without sensitive payload, and do not change the case |
| Duplicate webhook | Return idempotent acknowledgement after confirming the event was already handled |
| Unknown provider status | Quarantine or require review; never approve by default |
| Reference/case mismatch | Reject and raise a security/operations alert |
| Provider says manual review | Set `requires_review`; do not auto-approve |
| Provider API unavailable during confirmation | Keep the last trusted decision; do not infer success or failure |
| Applicant requests deletion | Follow the approved privacy and retention procedure; retain only records required for lawful audit, with the rationale documented |
| Suspension or revocation | Disable dependent entitlements according to policy and append an audit event; preserve historical decision history |

## 11. Feature flags and rollout

Before a provider is approved, all identity-verification entry points must remain disabled.

When implementation begins:

- Default the identity-verification feature flag to off in every environment.
- Enforce the flag on the server; hiding a button in the UI is not a security boundary.
- Use separate provider credentials and callback URLs for local/test and production environments.
- Never use real government IDs or biometric material in development tests.
- Begin with synthetic provider fixtures and signature test vectors.
- Enable a provider sandbox only after credentials and contract terms are available.
- Start any live pilot with explicit legal/security approval, an approved country/document scope, support escalation, monitoring, and a rollback switch.
- Keep membership billing and public badge display separately gated.

## 12. Minimum test matrix

The adapter and domain service must have automated tests for:

1. valid hosted-session creation;
2. duplicate start request with the same idempotency key;
3. invalid country and non-allowlisted return URL;
4. missing or malformed provider configuration;
5. valid signed verified outcome;
6. valid signed rejected outcome;
7. provider manual-review outcome;
8. invalid, expired, and replayed signatures;
9. duplicate provider event ID;
10. provider reference bound to the wrong case or applicant;
11. unknown provider status;
12. provider timeout, 429, and 5xx handling;
13. out-of-order event after suspension or revocation;
14. browser return without a validated provider outcome;
15. verified identity with inactive/expired membership;
16. active membership with unverified identity;
17. reviewer permission denial and self-review prevention;
18. audit event content contains no raw ID, image, biometric, secret, token, or full provider payload.

Use synthetic fixtures only. Tests must not create real verification cases, perform live provider charges, or contact a real identity service.

## 13. Implementation order after the reconciliation blocker

1. Confirm the production and Development Supabase project mapping.
2. Complete the approved isolated/local migration reconciliation plan; do not run migration repair or push against either shared project as a shortcut.
3. Approve an identity provider using the checklist above and complete the privacy/security review.
4. Implement the adapter interface and a fake/test adapter without database activation.
5. Design the case/audit schema and RLS policies against the reconciled schema.
6. Implement the server-side case lifecycle, notification validation, reviewer workflow, and audit path in Development only.
7. Complete synthetic tests, provider sandbox tests, RLS tests, and manual-review exercises.
8. Obtain an explicit production release decision before any production migration, secret configuration, provider callback registration, deployment, or live applicant use.

## 14. Explicitly out of scope

- Selecting or purchasing an identity-verification provider;
- collecting NIN or identity documents directly in DCDS;
- building a selfie/biometric storage pipeline;
- deciding final age eligibility or legal policy;
- implementing Verified+ membership payment processing;
- approving TRUSTMARKET sellers;
- creating Supabase tables or policies;
- deploying or changing any Supabase Edge Function;
- enabling any production feature or public Blue Badge.

**Current result:** DCDS now has a vendor-neutral identity adapter contract to guide future implementation. Provider selection, privacy/legal approval, migration reconciliation, and explicit release approval remain prerequisites.
