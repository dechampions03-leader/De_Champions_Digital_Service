# DCDS Verified+ Pricing and Commercial Policy

**Status:** Approved product pricing decision; implementation and public launch still pending  
**Target branch:** `feature/dcds-verified-plus-ecosystem`  
**Applies to:** DCDS Verified+ membership and identity-verification fee separation  
**Production impact:** None. This document records product policy only; it does not create payment products, alter gateway settings, change accounts, or deploy services.

## 1. Approved membership catalogue

DCDS Verified+ has two paid membership durations:

| Plan | Price | Paid duration | Renewal |
|---|---:|---|---|
| Monthly | NGN 7,500 | 30 days | Member may renew for another 30-day term |
| Annual | NGN 75,000 | 12 months | Member may renew for another 12-month term |

The Annual plan is NGN 15,000 less than twelve Monthly payments (NGN 90,000), a 16.7% saving for members who pay annually.

**Lifetime membership is discontinued.** Do not offer, advertise, sell, or grant a lifetime/perpetual Verified+ entitlement. The previous draft prices are retired and must not be used in checkout, marketing, invoices, support scripts or entitlement logic.

## 2. Identity verification fee is separate

Identity verification is a separate applicant-paid charge. It is not included in the NGN 7,500 Monthly or NGN 75,000 Annual membership price and must be shown as a separate fee before an applicant starts the check.

The identity-verification fee amount is **not yet approved**. Set it only after DCDS confirms:
- the selected provider's actual charge for each required check and any minimum monthly commitment;
- payment-processing fees and applicable taxes;
- expected retry, failure, manual-review and support costs.

Do not charge an applicant again for a retry caused by a DCDS or provider technical error. A successful fee payment is not an identity approval, and an identity approval is not a paid membership entitlement.

## 3. Independent decisions and Blue Badge eligibility

Keep these decisions independent:
1. Identity decision: pending, verified, rejected, requires review, suspended or revoked.
2. Membership entitlement: inactive, active monthly, active annual, expired, cancelled or suspended.
3. Seller/business/professional recognition: separate application and approval tracks.
4. Creator recognition: earned through its own DCDS review and approval; it is not bought through membership.

The Verified+ Blue Badge is shown only when the identity decision is approved and a Monthly or Annual entitlement is currently active. The Creator Medal is shown only when Creator recognition has separately been approved and remains active. A member may have either recognition, both, or neither.

## 4. Payment, renewal and expiry controls

- Create separate, server-verified membership orders for Monthly and Annual plans.
- Confirm amount, currency, payment status and gateway reference server-side; process webhooks idempotently.
- Grant entitlements only after verified successful payment. Pending, failed, reversed or mismatched payments grant no access.
- Monthly access ends after 30 days; Annual access ends after 12 months. Neither plan is perpetual.
- Do not silently enrol members in recurring charges. Any automatic renewal requires clear disclosure and the member's explicit consent; otherwise the member renews manually.
- Provide advance expiry notices and clear renewal, cancellation, refund and chargeback terms before checkout.
- Keep identity-verification fees, membership revenue, course payments, VTU orders, wallet/balance records, referrals and payouts in their proper separate accounting domains.

## 5. Financial sustainability and release gate

These prices are approved catalogue decisions, not a guarantee of profit or a completed operating budget. Before public checkout launches, DCDS must forecast:
- provider and verification costs (funded through the separate applicant-paid verification fee);
- payment processing and taxes;
- hosting, storage, bandwidth and security;
- moderation, customer support, operational labour and administration;
- marketing, refunds, chargebacks and a contingency reserve.

Review actual cost per active member, renewal/retention, support burden and cash runway at least quarterly. Do not promise international prices until the currency, payment fees, taxes and provider costs have been confirmed for each launch market.

The price decision does not authorise production deployment, a payment-gateway change, a new database migration, or public launch. Those remain subject to their existing security, migration, finance and explicit production-release gates.
