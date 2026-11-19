-- Preserve provider ownership for historical VTU orders.
-- Every row present at cutover is historical and remains tagged as Oplug.
-- All new orders default to VTpass. No payment, amount, or balance is changed.

ALTER TABLE public.dcds_vtu_orders
  ADD COLUMN IF NOT EXISTS provider text;

UPDATE public.dcds_vtu_orders
SET provider = 'oplug'
WHERE provider IS NULL;

ALTER TABLE public.dcds_vtu_orders
  ALTER COLUMN provider SET DEFAULT 'vtpass',
  ALTER COLUMN provider SET NOT NULL;

ALTER TABLE public.dcds_vtu_orders
  DROP CONSTRAINT IF EXISTS dcds_vtu_orders_provider_check,
  ADD CONSTRAINT dcds_vtu_orders_provider_check
    CHECK (provider = ANY (ARRAY['oplug','vtpass']));

CREATE INDEX IF NOT EXISTS dcds_vtu_orders_provider_status_idx
  ON public.dcds_vtu_orders(provider, status, created_at DESC);
