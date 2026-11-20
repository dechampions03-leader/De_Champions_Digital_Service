# VTpass Live API Access and International Coverage Request

**Applicant:** De Champions Digital Service (DCDS)  
**Current integration:** VTpass Sandbox  
**Requested access:** VTpass Live API credentials and confirmation of international catalogue entitlements

## Request to VTpass

Hello VTpass Integration Team,

De Champions Digital Service is completing its VTpass integration and sandbox validation. We would like to request Live API access and confirm the international airtime/data coverage available to our merchant account.

Before activating international checkout, please confirm:

1. Whether the Live `get-international-airtime-countries` endpoint returns the full currently supported destination list.
2. Whether United Kingdom (GB), with GBP as its local currency, is currently available for international airtime top-ups.
3. Whether the Sandbox country catalogue is intentionally restricted compared with Live. Our current Sandbox response contains Cameroon, Ghana, Nigeria, Rwanda, Swaziland, and Yemen.
4. Which countries support mobile airtime, which support mobile data, and which operators/variations are enabled for each.
5. Whether any country/operator requires additional merchant-level enablement.
6. Whether international purchases are settled to the merchant in NGN, and how the provider charge is represented for each destination.
7. The required onboarding, compliance, IP allowlisting, callback/webhook, funding, and minimum-balance steps for Live activation.

Please provide the current Live API documentation, supported-country catalogue, and the process for issuing Live credentials.

We will keep all credentials in our server-side secret manager and will not share API keys or passwords in email or chat.

Thank you,  
De Champions Digital Service

## DCDS internal release gate

- [ ] VTpass confirms Live API access approval and issues credentials through its secure channel.
- [ ] DCDS stores credentials only in Production server-side secrets after explicit release approval.
- [ ] Read-only Live country catalogue check records the full returned country list.
- [ ] United Kingdom (GB) is confirmed by the actual Live endpoint before it is displayed as available.
- [ ] Each enabled destination passes product type, operator, variation, currency, provider-cost, and recipient validation.
- [ ] International purchases remain disabled when provider charge is zero, missing, ambiguous, or unsupported.
- [ ] A controlled purchase is run only after VTpass confirms account readiness and DCDS authorizes the test.
- [ ] Flutterwave NGN checkout and server-side payment verification pass separate Development sandbox tests.
- [ ] Production deployment is separately approved; no Production financial records are changed as part of this request.

## Evidence boundary

The current Sandbox endpoint response contains six destinations. VTpass's historic published marketing material has advertised broader coverage, including the United Kingdom, but that historical material is not proof of current Live API availability. DCDS must use the current provider API response and written VTpass confirmation as the source of truth.
