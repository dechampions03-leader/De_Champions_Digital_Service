# VTpass international country coverage review

**Environment:** DCDS Development / VTpass Sandbox  
**Status:** Sandbox catalogue returns six destinations; broader Live coverage must be confirmed against the Live API before enabling.

## Confirmed from the current VTpass API documentation

VTpass documents separate endpoints for:
1. International countries
2. Country product types
3. Country/product operators
4. Operator variations
5. Purchase and transaction requery

The country endpoint is dynamic:
- Sandbox: `https://sandbox.vtpass.com/api/get-international-airtime-countries`
- Live: `https://vtpass.com/api/get-international-airtime-countries`

The currently published Sandbox example returns six countries: Cameroon (CM), Ghana (GH), Nigeria (NG), Rwanda (RW), Swaziland (SZ), and Yemen (YE). DCDS renders the country response returned by this endpoint; it does not hard-code a six-country allowlist.

VTpass's published international-airtime marketing material lists 131 destinations and includes the United Kingdom. That material is older than the current API documentation and is not proof that the current Sandbox or Live API returns all 131 destinations.

## Required Live activation check

After VTpass issues Live credentials, make a read-only GET request to the Live country endpoint and record:
- Exact country count
- Country code, name, currency, and dialing prefix
- Whether United Kingdom (GB) is returned
- Whether the UK has product types, operators, and valid variations
- Whether the Live response differs from the Sandbox response

Do not add countries manually or infer country availability from the old marketing list. A destination must be returned by the provider and have valid downstream catalogue entries before checkout is enabled.

## Questions for VTpass support

Please confirm:
1. Does the current VTpass Live API country endpoint return the full international destination catalogue, including United Kingdom (GB)?
2. Is the six-country response in the Sandbox environment intentional, and does Sandbox have a restricted country catalogue?
3. Does international airtime support mobile data bundles in all listed destinations, or only selected countries/operators?
4. Are all countries returned by the Live country endpoint enabled for API partners, or are additional account-level permissions required?
5. Can VTpass provide the current supported-country list and confirm any country-specific purchase requirements?

## Safety

- Do not hard-code the historic 131-country list into the purchase selector.
- Do not enable a destination based only on marketing material.
- Keep provider catalogue retrieval read-only until country, product type, operator, and variation responses have been checked.
- Do not submit a purchase for a destination whose provider price/charge is missing or zero.
- Keep NGN checkout and Production financial records unchanged during this Development review.

## Sources

- VTpass International Airtime API documentation: https://vtpass.com/documentation/foreign-airtime/
- VTpass published country coverage article: https://vtpass.com/blog/buy-international-airtime-for-these-countries-on-vtpass/
- VTpass international airtime product page: https://www.vtpass.com/foreign-airtime
