-- Allow route-specific bank branch selection where Flutterwave reports has_branches=true.
begin;

update public.dcds_international_payout_routes
set optional_fields = (
  select array_agg(distinct x order by x)
  from unnest(coalesce(optional_fields,array[]::text[]) || array['destination_branch_code']::text[]) as x
),
route_config = coalesce(route_config,'{}'::jsonb) || jsonb_build_object(
  'branch_lookup_supported',true,
  'branch_code_property','destination_branch_code'
),
updated_at=now()
where route_code in (
  'FLW_GH_GHS_BANK','FLW_KE_KES_BANK','FLW_MW_MWK_BANK',
  'FLW_TZ_TZS_BANK','FLW_UG_UGX_BANK','FLW_CM_XAF_BANK',
  'FLW_CI_XOF_BANK','FLW_SN_XOF_BANK','FLW_ZA_ZAR_BANK'
);

commit;
