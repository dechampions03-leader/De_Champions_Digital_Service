# International coverage implementation note

The DCDS international country selector is provider-driven. It calls VTpass `get-international-airtime-countries` through the DCDS catalog Edge Function and renders the returned country codes, names, and currencies. The selector now sorts the returned entries alphabetically for easier navigation.

## Important availability boundary

The current VTpass API documentation's example response contains Cameroon, Ghana, Nigeria, Rwanda, Swaziland, and Yemen. It does not list the United Kingdom in that example. VTpass's older 131-destination marketing article does list the United Kingdom, but that historical article is not proof that the current API account can transact there.

DCDS therefore does not add unsupported countries as selectable options. The UK and other destinations will appear automatically when VTpass returns them from the authorized Live country endpoint. Before checkout, DCDS must also retrieve the destination's product types, operators, and variations and validate the provider's actual NGN charge.

## Verification references

- Current API country endpoint and response example: https://vtpass.com/documentation/foreign-airtime/
- Historical 131-country marketing article: https://vtpass.com/blog/buy-international-airtime-for-these-countries-on-vtpass/
- Live international airtime page: https://www.vtpass.com/foreign-airtime

## No production operation

This change is on the Development feature branch only. No Live credentials were used, no purchase was submitted, and no Production database, payment, balance, or payout data was changed.
