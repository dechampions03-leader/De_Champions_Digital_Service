# DCDS Airtime & Data Wallet — implementation plan

## Scope and isolation
This wallet is a separate NGN-only stored-value ledger for Airtime & Data. It must not share or modify course orders/payments, referral rewards/commissions, ambassador payouts, student fee balances, or existing direct-pay VTU orders.

Implementation is being developed on `feature/dcds-vtu-wallet`, based on `feature/vtpass-provider-migration`. No Supabase migration has been applied and no Production resource has been changed.

## Customer experience
- Wallet card on the Airtime & Data page showing available NGN balance.
- Fund wallet through Flutterwave hosted checkout.
- Funding amounts validated server-side; initial policy: ₦100 minimum and ₦1,000,000 maximum per funding attempt.
- Purchase airtime/data using wallet balance, with a clear confirmation screen.
- Show wallet activity: funding, purchase debit, refund credit, date, reference and status.
- Wallet is NGN-only in the first release. No cash withdrawal or peer-to-peer transfer in the first release.

## Money movement invariants
1. A funding intent is created before Flutterwave checkout and has a unique DCDS tx_ref.
2. The browser redirect never credits a wallet. Only the shared Flutterwave webhook, after server-to-server transaction verification and exact tx_ref, amount and currency matching, can credit.
3. Funding credit is idempotent: one Flutterwave transaction and one funding intent can produce only one ledger credit.
4. Wallet balance is never writable from the browser. Reads and mutations go through authenticated Edge Functions.
5. Every wallet mutation is an append-only ledger entry with a unique reference and balance_after snapshot.
6. A purchase debit and wallet order are created atomically. A client idempotency key prevents duplicate debits.
7. VTpass purchase uses one persisted provider request ID. Ambiguous provider outcomes are re-queried; never blindly submit a second /pay.
8. Refund credits happen only after a definitive provider failure or reviewed refund_required state, and are idempotent.
9. Wallet must be frozen by support/admin controls before manual investigation; no direct balance edits.
10. All operations remain in Development until sandbox funding, webhook, debit, delivery, requery, refund, RLS and CI tests pass.

## Current implementation checkpoint
- Additive schema migration creates wallet accounts, funding intents, append-only ledger and wallet-specific VTU orders.
- A second migration adds atomic server-only credit, debit and refund RPCs.
- The feature branch is separate from the VTpass migration PR.
- Remaining implementation: wallet funding Edge Function; shared Flutterwave webhook routing for funding intents; authenticated wallet summary/history Edge Function; wallet VTpass purchase/fulfilment Edge Function with provider requery; wallet UI; automated validation and preview checks.

## Release gates
- Do not apply migrations to Production.
- Do not deploy Production Edge Functions or change Live secrets as part of this work.
- Keep current direct Flutterwave-per-order checkout working until wallet has passed isolated Development testing.
- Do not enable wallet funding/purchases for real customers until explicit Production release approval.
