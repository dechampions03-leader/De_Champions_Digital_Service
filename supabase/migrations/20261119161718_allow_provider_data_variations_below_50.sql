-- VTpass data variations are provider-priced and may be below the airtime minimum.
-- Keep airtime checkout's separate NGN 50 minimum in the Edge Function.
ALTER TABLE public.dcds_vtu_orders
  DROP CONSTRAINT IF EXISTS dcds_vtu_orders_amount_check;

ALTER TABLE public.dcds_vtu_orders
  ADD CONSTRAINT dcds_vtu_orders_amount_check CHECK (amount > 0);
