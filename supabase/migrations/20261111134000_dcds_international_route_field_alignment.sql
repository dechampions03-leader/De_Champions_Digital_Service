-- Align the USD, GBP and EUR beneficiary fields with Flutterwave's current v3 guide.
-- All international corridors remain disabled; this only corrects the field schema used by the UI and transfer meta.

begin;

update public.dcds_international_payout_routes
set required_fields = array[
  'beneficiary_name','account_number','routing_number','swift_code','bank_name',
  'account_type','beneficiary_address','postal_code','street_number','street_name',
  'beneficiary_country'
]::text[],
optional_fields = array['email','mobile_number','sender_address','sender_mobile_number','city']::text[],
route_config = jsonb_build_object(
  'country_for_bank_list','US',
  'beneficiary_country_value','US',
  'country_selection_required',true,
  'transfer_meta_fields',jsonb_build_array(
    'routing_number','swift_code','bank_name','account_type','beneficiary_address',
    'beneficiary_country','postal_code','street_number','street_name','city',
    'email','mobile_number','sender_address','sender_mobile_number'
  ),
  'top_level_account_bank',false,
  'destination_amount_precision',0,
  'provider_verification','authorised_admin_review'
),
updated_at=now()
where route_code='FLW_US_USD_BANK';

update public.dcds_international_payout_routes
set required_fields = array[
  'beneficiary_name','account_number','routing_number','bank_name',
  'account_type','beneficiary_country'
]::text[],
optional_fields = array[
  'swift_code','first_name','last_name','beneficiary_merchant_name','email',
  'mobile_number','beneficiary_address','sender_address','sender_mobile_number',
  'postal_code','street_number','street_name','city'
]::text[],
route_config = jsonb_build_object(
  'country_for_bank_list','GB',
  'beneficiary_country_value','UK',
  'country_selection_required',true,
  'transfer_meta_fields',jsonb_build_array(
    'routing_number','swift_code','bank_name','account_type','first_name','last_name',
    'beneficiary_merchant_name','beneficiary_address','beneficiary_country','email',
    'mobile_number','sender_address','sender_mobile_number','postal_code',
    'street_number','street_name','city'
  ),
  'top_level_account_bank',false,
  'destination_amount_precision',0,
  'provider_verification','authorised_admin_review'
),
updated_at=now()
where route_code='FLW_GB_GBP_BANK';

update public.dcds_international_payout_routes
set required_fields = array[
  'beneficiary_name','account_number','routing_number','swift_code','bank_name',
  'beneficiary_country','postal_code','street_number','street_name','city'
]::text[],
optional_fields = array['email','mobile_number','beneficiary_address','sender_address','sender_mobile_number']::text[],
route_config = jsonb_build_object(
  'country_for_bank_list','DE',
  'country_selection_required',true,
  'transfer_meta_fields',jsonb_build_array(
    'routing_number','swift_code','bank_name','beneficiary_country','postal_code',
    'street_number','street_name','city','email','mobile_number',
    'beneficiary_address','sender_address','sender_mobile_number'
  ),
  'top_level_account_bank',false,
  'destination_amount_precision',0,
  'provider_verification','authorised_admin_review',
  'sepa_country_selection_required',true
),
updated_at=now()
where route_code='FLW_EU_EUR_BANK';

commit;
