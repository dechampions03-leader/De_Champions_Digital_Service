-- Preserve provider ownership for historical VTU orders.
-- Every row present at cutover is historical and remains tagged as retired supplier.
-- All new orders default to VTpass. No payment, amount, or balance is changed.

-- Replace the old supplier-specific request-id column name without losing values.
DO $
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dcds_vtu_orders'
      AND column_name = 'oplug_request_id'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'dcds_vtu_orders'
      AND column_name = 'provider_request_id'
  ) THEN
    ALTER TABLE public.dcds_vtu_orders
      RENAME COLUMN oplug_request_id TO provider_request_id;
  END IF;
END $;

DO $
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'dcds_vtu_orders_oplug_request_id_key') THEN
    ALTER TABLE public.dcds_vtu_orders
      RENAME CONSTRAINT dcds_vtu_orders_oplug_request_id_key TO dcds_vtu_orders_provider_request_id_key;
  END IF;
END $;

ALTER TABLE public.dcds_vtu_orders
  ADD COLUMN IF NOT EXISTS provider text;

UPDATE public.dcds_vtu_orders
SET provider = 'legacy'
WHERE provider IS NULL;

ALTER TABLE public.dcds_vtu_orders
  ALTER COLUMN provider SET DEFAULT 'vtpass',
  ALTER COLUMN provider SET NOT NULL;

ALTER TABLE public.dcds_vtu_orders
  DROP CONSTRAINT IF EXISTS dcds_vtu_orders_provider_check,
  ADD CONSTRAINT dcds_vtu_orders_provider_check
    CHECK (provider = ANY (ARRAY['legacy','vtpass']));

CREATE INDEX IF NOT EXISTS dcds_vtu_orders_provider_status_idx
  ON public.dcds_vtu_orders(provider, status, created_at DESC);
