-- Normalize international recipient phone values to digits before order insertion.
ALTER TABLE public.dcds_vtu_orders
  DROP CONSTRAINT IF EXISTS dcds_vtu_orders_recipient_phone_check;

ALTER TABLE public.dcds_vtu_orders
  ADD CONSTRAINT dcds_vtu_orders_recipient_phone_check
  CHECK (recipient_phone ~ '^[0-9]{7,15}$');
