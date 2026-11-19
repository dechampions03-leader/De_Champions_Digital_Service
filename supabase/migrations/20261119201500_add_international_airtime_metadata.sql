-- Add safe metadata storage and destination validation for international airtime.
ALTER TABLE public.dcds_vtu_orders
  ADD COLUMN IF NOT EXISTS provider_metadata jsonb;

ALTER TABLE public.dcds_vtu_orders
  DROP CONSTRAINT IF EXISTS dcds_vtu_orders_network_check,
  DROP CONSTRAINT IF EXISTS dcds_vtu_orders_network_id_check,
  DROP CONSTRAINT IF EXISTS dcds_vtu_orders_smile_account_check,
  DROP CONSTRAINT IF EXISTS dcds_vtu_orders_recipient_phone_check;

ALTER TABLE public.dcds_vtu_orders
  ADD CONSTRAINT dcds_vtu_orders_network_check
    CHECK (network = ANY (ARRAY['mtn','glo','9mobile','airtel','spectranet','smile','international'])),
  ADD CONSTRAINT dcds_vtu_orders_network_id_check
    CHECK (network_id >= 1 AND network_id <= 7),
  ADD CONSTRAINT dcds_vtu_orders_recipient_phone_check
    CHECK (recipient_phone ~ '^\\+?[0-9]{7,15}$'),
  ADD CONSTRAINT dcds_vtu_orders_special_provider_fields_check
    CHECK (
      (network = 'smile' AND provider_billers_code IS NOT NULL AND provider_email IS NOT NULL)
      OR
      (network = 'international' AND provider_email IS NOT NULL AND provider_metadata IS NOT NULL)
      OR
      (network NOT IN ('smile','international'))
    );
