# DCDS International Payout Operations

## Programme policy

The Global Ambassador & Rewards Programme remains NGN-denominated:

- ₦1,000 NGN per qualifying distinct referred-course purchase.
- ₦5,000 NGN minimum withdrawal threshold.
- Referral registration and attribution are worldwide.
- The current working payout route remains verified Nigerian bank accounts in NGN.

Worldwide referral participation does not mean worldwide withdrawals are enabled.

## Provider corridor reference

Flutterwave's published bank-transfer guide lists these destination corridors: EUR to SEPA countries, GBP to the UK, GHS to Ghana, KES to Kenya, MWK to Malawi, NGN to Nigeria, TZS to Tanzania, UGX to Uganda, USD to the United States (and Nigerian domiciliary accounts), XAF to Cameroon, XOF to Côte d'Ivoire and Senegal, and ZAR to South Africa.

This is provider-wide documentation, not confirmation that the DCDS merchant account is approved for every corridor. The actual destination country, bank, payout type, required beneficiary fields, limits, fee treatment and account availability must be confirmed using DCDS's own live merchant account.

Provider references (checked 11 November 2026):
- [Flutterwave bank account transfer coverage](https://developer.flutterwave.com/docs/bank-account)
- [Flutterwave international USD, EUR and GBP transfers](https://developer.flutterwave.com/docs/international-usd-eur-gbp)
- [Flutterwave transfer rates](https://developer.flutterwave.com/docs/transfer-rates)
- [Flutterwave create transfer API](https://developer.flutterwave.com/reference/create-a-transfer)

## Financial and FX controls

Flutterwave's transfer-rate documentation says the rate endpoint returns the source amount required for a requested destination amount and that transfer rates are updated several times daily. DCDS must therefore show the destination amount, source NGN amount, provider fee, fee currency, quote timestamp and expiry before asking an ambassador to accept a payout quote. The rate must be refreshed before submission if the quote expires.

The provider's international transfer instructions also state that cross-currency transfers use the source wallet for the converted transfer amount while the transfer fee is charged to the transfer-currency wallet. DCDS must verify that the relevant destination-currency wallet is funded; the NGN reward ledger alone does not prove the transfer fee is funded.

Never promise a fixed FX rate, net destination amount, fee, delivery time or country until it is confirmed from the provider response for that quote and route.

## Rollout gates

These server-side flags are required before the international service will expose any enabled route:

- `FLW_SECRET_KEY`
- `DCDS_SERVICE_ROLE_KEY`
- `DCDS_PAYOUT_ENCRYPTION_KEY`
- `DCDS_FLW_INTL_KYC_APPROVED=true`
- `DCDS_FLW_TRANSFER_API_ENABLED=true`
- `DCDS_FLW_IP_WHITELISTED=true`
- `DCDS_FLW_DESTINATION_WALLETS_FUNDED=true`
- `DCDS_INTL_SANDBOX_VERIFIED=true`
- `DCDS_INTL_LIVE_TRANSFER_VERIFIED=true`
- `DCDS_INTL_PAYOUTS_ENABLED=true`

Do not set a flag to true merely because a provider documentation page lists a route. It must be confirmed on the DCDS account and supported by evidence from a successful test.

A corridor database record may be marked `enabled` only when provider approval, sandbox verification, live verification and the enabled timestamp are all recorded. Every newly added route starts disabled.

## Current implementation boundary

The international payout foundation adds:

- A route registry with country, currency, method, required fields and verification state.
- An encrypted beneficiary-data vault. Beneficiary payloads use AES-GCM and are never readable through direct browser/Data API access.
- A short-lived FX quote record structure for later quote acceptance and reconciliation.
- An admin readiness panel that reports configuration gates and per-route verification state.
- A global default-off switch and server-side checks.

It does **not** yet create payout requests, accept FX quotes, verify beneficiary ownership with the provider, debit wallets, create transfers or reconcile international transfers. The existing Nigerian bank payout functions and NGN reward ledger are deliberately unchanged.

Do not enable any route or advertise international withdrawals until the next implementation phase has added provider-backed beneficiary verification, quote generation/expiry, atomic reward reservation, route-specific transfer submission, webhook/reconciliation, refunds/reversals and end-to-end sandbox tests.
