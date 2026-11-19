-- Preserve provider ownership during the Oplug -> VTpass cutover.
-- Existing orders default to Oplug for legacy fulfilment/reconciliation only.
-- New purchases must explicitly save provider='vtpass'. No amount or balance is changed.

ALTER TABLE public.dcds_vtu_orders
  ADD COLUMN IF NOT EXISTS provider text;

-- VTpass request IDs start with the 12-digit Africa/Lagos date-time prefix.
-- Historical Oplug references use the older DCDSVTU... format.
UPDATE public.dcds_vtu_orders
SET provider = CASE
  WHEN oplug_request_id ~ '^[0-9]{12}[A-Za-z0-9]+

ALTER TABLE public.dcds_vtu_orders
  ALTER COLUMN provider SET DEFAULT 'oplug',
  ALTER COLUMN provider SET NOT NULL;

ALTER TABLE public.dcds_vtu_orders
  DROP CONSTRAINT IF EXISTS dcds_vtu_orders_provider_check,
  ADD CONSTRAINT dcds_vtu_orders_provider_check
    CHECK (provider = ANY (ARRAY['oplug','vtpass']));

CREATE INDEX IF NOT EXISTS dcds_vtu_orders_provider_status_idx
  ON public.dcds_vtu_orders(provider, status, created_at DESC);
 THEN 'vtpass'
  ELSE 'oplug'
END
WHERE provider IS NULL;

ALTER TABLE public.dcds_vtu_orders
  ALTER COLUMN provider SET DEFAULT 'oplug',
  ALTER COLUMN provider SET NOT NULL;

ALTER TABLE public.dcds_vtu_orders
  DROP CONSTRAINT IF EXISTS dcds_vtu_orders_provider_check,
  ADD CONSTRAINT dcds_vtu_orders_provider_check
    CHECK (provider = ANY (ARRAY['oplug','vtpass']));

CREATE INDEX IF NOT EXISTS dcds_vtu_orders_provider_status_idx
  ON public.dcds_vtu_orders(provider, status, created_at DESC);
