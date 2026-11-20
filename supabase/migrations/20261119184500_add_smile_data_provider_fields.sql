-- Add Smile account verification fields for VTpass Smile Data purchases.
ALTER TABLE public.dcds_vtu_orders
  ADD COLUMN IF NOT EXISTS provider_billers_code text,
  ADD COLUMN IF NOT EXISTS provider_email text;

ALTER TABLE public.dcds_vtu_orders
  DROP CONSTRAINT IF EXISTS dcds_vtu_orders_network_check,
  DROP CONSTRAINT IF EXISTS dcds_vtu_orders_network_id_check;

ALTER TABLE public.dcds_vtu_orders
  ADD CONSTRAINT dcds_vtu_orders_network_check
    CHECK (network = ANY (ARRAY['mtn','glo','9mobile','airtel','spectranet','smile'])),
  ADD CONSTRAINT dcds_vtu_orders_network_id_check
    CHECK (network_id >= 1 AND network_id <= 6);

ALTER TABLE public.dcds_vtu_orders
  ADD CONSTRAINT dcds_vtu_orders_smile_account_check
  CHECK (
    (network = 'smile' AND provider_billers_code IS NOT NULL AND provider_email IS NOT NULL)
    OR
    (network <> 'smile')
  );
