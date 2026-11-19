-- Extend DCDS VTU data catalogue to include Spectranet and 9mobile SME.
-- Airtime remains limited to the four Nigerian mobile operators in the checkout function.
ALTER TABLE public.dcds_vtu_orders
  DROP CONSTRAINT IF EXISTS dcds_vtu_orders_network_check,
  DROP CONSTRAINT IF EXISTS dcds_vtu_orders_network_id_check;

ALTER TABLE public.dcds_vtu_orders
  ADD CONSTRAINT dcds_vtu_orders_network_check
    CHECK (network = ANY (ARRAY['mtn','glo','9mobile','airtel','spectranet'])),
  ADD CONSTRAINT dcds_vtu_orders_network_id_check
    CHECK (network_id >= 1 AND network_id <= 5);
