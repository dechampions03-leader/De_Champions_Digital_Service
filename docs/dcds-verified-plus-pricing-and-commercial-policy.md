# DCDS Verified+ Pricing and Commercial Policy

**Status:** Approved product pricing decision; implementation and public launch still pending  
**Target branch:** `feature/dcds-verified-plus-ecosystem`  
**Applies to:** DCDS Verified+ membership and identity-verification fee separation  
**Production impact:** None. This document records product policy only; it does not create payment products, alter gateway settings, change accounts, or deploy services.

## 1. Approved membership catalogue

DCDS Verified+ has three paid membership durations:

| Plan | Price | Paid duration | Renewal |
|---|---:|---|---|
| Monthly | NGN 7,500 | 30 days | Opt-in automatic renewal every 30 days; member can cancel any time |
| Annual | NGN 75,000 | 12 months | Opt-in automatic renewal every one year; member can cancel any time |
| Five-Year | NGN 320,000 | 60 months | Opt-in automatic renewal every five years; member can cancel any time |

The Annual plan is NGN 15,000 less than twelve Monthly payments (NGN 90,000), a 16.7% saving for members who pay annually.

The Five-Year plan is NGN 55,000 less than five consecutive Annual terms (NGN 375,000), a 14.7% saving. It is a fixed 60-month entitlement paid upfront, not a lifetime or perpetual entitlement.

**Lifetime membership is discontinued.** Do not offer, advertise, sell, or grant a lifetime/perpetual Verified+ entitlement. The Five-Year plan expires after 60 months; the previous lifetime draft prices are retired and must not be used in checkout, marketing, invoices, support scripts or entitlement logic.

## 2. Identity verification fee is separate

Identity verification is a separate applicant-paid charge. It is not included in the NGN 7,500 Monthly or NGN 75,000 Annual membership price, or the NGN 320,000 Five-Year membership price, and must be shown as a separate fee before an applicant starts the check.

The identity-verification fee amount is **not yet approved**. Set it only after DCDS confirms:
- the selected provider's actual charge for each required check and any minimum monthly commitment;
- payment-processing fees and applicable taxes;
- expected retry, failure, manual-review and support costs.

Do not charge an applicant again for a retry caused by a DCDS or provider technical error. A successful fee payment is not an identity approval, and an identity approval is not a paid membership entitlement.

## 3. Independent decisions and Blue Badge eligibility

Keep these decisions independent:
1. Identity decision: pending, verified, rejected, requires review, suspended or revoked.
2. Membership entitlement: inactive, active monthly, active annual, active five-year, expired, cancelled or suspended.
3. Seller/business/professional recognition: separate application and approval tracks.
4. Creator recognition: earned through its own DCDS review and approval; it is not bought through membership.

The Verified+ Blue Badge is shown only when the identity decision is approved and a Monthly, Annual or Five-Year entitlement is currently active. The Creator Medal is shown only when Creator recognition has separately been approved and remains active. A member may have either recognition, both, or neither.

## 4. Payment, renewal and expiry controls

- Create separate, server-verified membership orders for Monthly, Annual and Five-Year plans.
- Confirm amount, currency, payment status and gateway reference server-side; process webhooks idempotently.
- Grant entitlements only after verified successful payment. Pending, failed, reversed or mismatched payments grant no access.
- Monthly access ends after 30 days; Annual access ends after 12 months; Five-Year access ends after 60 months. No plan is perpetual.
- The Five-Year amount is charged once upfront for the full 60-month term. It does not silently renew or create recurring charges.
- Automatic renewal is available for all three plans only after the member gives a separate, explicit opt-in consent. Do not preselect consent or silently enrol a member; without consent, checkout is one-time only and future renewal is manual.
- After a member confirms cancellation, stop future automatic charges without administrator approval. Keep the already-paid membership active through its paid-through timestamp; cancellation does not erase the remaining paid term.
- The amount, currency, interval and next billing date must be shown before recurring consent. A price change requires advance notice and fresh consent before charging the new amount.
- The exact Flutterwave Five-Year interval must pass a sandbox test before Five-Year automatic renewal is activated. If it fails, retain manual renewal for that plan rather than substituting a different billing cadence.
- See [the automatic-renewal and self-service cancellation specification](dcds-verified-plus-auto-renewal-and-cancellation-spec.md) for consent, cancellation, webhook, entitlement and release requirements. The [Flutterwave sandbox runbook](dcds-verified-plus-flutterwave-sandbox-runbook.md) records the provider API mapping, test-mode controls and outstanding live sandbox checks.
- Provide advance expiry notices and clear renewal, cancellation, refund and chargeback terms before checkout.
- Keep identity-verification fees, membership revenue, course payments, VTU orders, wallet/balance records, referrals and payouts in their proper separate accounting domains.

## 5. Financial sustainability and release gate

These prices are approved catalogue decisions, not a guarantee of profit or a completed operating budget. Before public checkout launches, DCDS must forecast:
- provider and verification costs (funded through the separate applicant-paid verification fee);
- payment-processing fees and applicable taxes;
- hosting, storage, bandwidth and security;
- moderation, customer support, operational labour and administration;
- marketing, refunds, chargebacks and a contingency reserve;
- the cash-flow implications of collecting the Five-Year price upfront while supporting a 60-month service period.

Review actual cost per active member, renewal/retention, support burden and cash runway at least quarterly. Do not promise international prices until the currency, payment fees, taxes and provider costs have been confirmed for each launch market.

The price decision does not authorise production deployment, a payment-gateway change, a new database migration, or public launch. Those remain subject to their existing security, migration, finance and explicit production-release gates.
