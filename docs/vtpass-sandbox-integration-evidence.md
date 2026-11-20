# DCDS VTpass Sandbox Integration Evidence Register

**Environment:** VTpass Sandbox only
**DCDS environment:** Development Supabase project
**Purpose:** Evidence for VTpass Live API integration review. These are Sandbox references, not Live transactions or Live API request IDs.

## Confirmed successful data deliveries

| Service | Test plan | Sandbox amount | Request ID | VTpass code | Status |
|---|---|---:|---|---|---|
| MTN Data | 100MB / 24 hours | NGN 100 | 202611200752c83ae7efb03f | 000 | delivered |
| Airtel Data | 25MB / 1 day | NGN 49.99 | 202611200758a8321ddc0a07 | 000 | delivered |
| 9mobile Data | 100MB / 1 day | NGN 100 | 202611200800b3b1caf405d5 | 000 | delivered |
| GLO Data | WTF N25 100MB Oneoff | NGN 25 | 20261120080241affbca4da2 | 000 | delivered |
| GLO Data (Best Value / SME) | N70 200MB / 14 days | NGN 70 | 2026112008024614fa303579 | 000 | delivered |

## Confirmed successful airtime deliveries

| Service | Test top-up | Sandbox amount | Request ID | VTpass code | Status |
|---|---|---:|---|---|---|
| MTN Airtime | N50 top-up | NGN 50 | 2026112008133cb46836ff0f | 000 | delivered |
| Airtel Airtime | N50 top-up | NGN 50 | 202611200814089647f9b5ce | 000 | delivered |
| 9mobile Airtime | N50 top-up | NGN 50 | 202611200814c73b57defd95 | 000 | delivered |
| GLO Airtime | N50 top-up | NGN 50 | 202611200814e6b68536b340 | 000 | delivered |

## Unresolved historical Sandbox attempt

| Service | Request ID | VTpass code(s) observed | Status | Handling |
|---|---|---|---|---|
| MTN Data | 202611200735e1909d65096b | 087 then 015 | unknown / not confirmed | Do not reuse as success evidence; do not submit another purchase for this reference |

## Remaining Sandbox evidence to collect

| Service | Service ID | Status |
|---|---|---|
| MTN Airtime | mtn | <not applicable: confirmed above> |
| Airtel Airtime | airtel | <not applicable: confirmed above> |
| 9mobile Airtime | etisalat | <not applicable: confirmed above> |
| GLO Airtime | glo | <not applicable: confirmed above> |
| International Airtime | foreign-airtime | Ghana mobile top-up Sandbox flow added; awaiting user-run test |
| Smile Network Payment | smile-direct | Sandbox email/account verification and plan flow added; requires VTpass Smile Basic Auth secrets in Development and user-run test |


## Latest failed / blocked Sandbox attempts (2026-11-20)

| Service | Request ID | Result | Handling |
|---|---|---|---|
| International Airtime (Ghana selection; provider returned a GMD-labelled variation) | 202611200847c18a21baff2c | VTpass code 011; status unknown; reported amount NGN 0 | Not successful evidence. Do not repeat /pay for this reference. Investigate country/operator/variation mapping and require a positive NGN provider charge before another test. |
| Smile Network Payment | No request ID generated | Failed at smile-email-verification; no /pay request was made | No purchase was submitted. Check Sandbox Basic Auth account credentials and exact documented Sandbox Smile email/account verification flow before retry. |

The 2026-11-20 screenshots confirmed that the four domestic airtime tests and five data tests above returned code 000 and status delivered. The Ghana international attempt and Smile email verification are not successful deliveries.

## Safety and release notes

- No Production Supabase migration or Edge Function deployment is authorized by this register.
- Sandbox test recipient is the documented VTpass test number 08011111111.
- Each test must use one unique request ID. If /pay is ambiguous, query/requery the same ID; never send a second /pay for that test.
- Record a reference as successful only when the provider returns code 000 and transaction status delivered.
- Never record API keys, passwords, tokens, or other secrets in this file.
- Existing DCDS/Oplug historical orders and customer financial records must remain preserved as legacy audit history.
- VTpass Live API access must be separately requested and provisioned by VTpass after its review. Sandbox success does not itself activate Live credentials.

## Official VTpass documentation consulted

- Service IDs: https://vtpass.com/documentation/service-ids/
- MTN Airtime: https://vtpass.com/documentation/mtn-airtime-vtu-api/
- 9mobile Airtime: https://vtpass.com/documentation/9mobile-airtime-vtu-api/
- GLO Airtime: https://vtpass.com/documentation/glo-airtime-vtu-api/
- International Airtime: https://vtpass.com/documentation/foreign-airtime/
- Smile Network Payment: https://vtpass.com/documentation/smile-network-payment-api-2/