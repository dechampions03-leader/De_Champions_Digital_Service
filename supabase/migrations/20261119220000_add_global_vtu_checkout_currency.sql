-- Global VTU checkout: customer payment currency is separate from VTpass NGN settlement.
-- Existing orders remain NGN with a neutral 1:1 historical FX record.
ALTER TABLE public.dcds_vtu_orders
  ADD COLUMN IF NOT EXISTS fx_rate numeric(20,10) NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS fx_rate_date date,
  ADD COLUMN IF NOT EXISTS fx_rate_source text NOT NULL DEFAULT 'DCDS-NGN-BASELINE',
  ADD COLUMN IF NOT EXISTS provider_cost_currency text NOT NULL DEFAULT 'NGN';

UPDATE public.dcds_vtu_orders
SET fx_rate = 1,
    fx_rate_source = 'DCDS-NGN-BASELINE',
    provider_cost_currency = 'NGN'
WHERE fx_rate IS NULL OR provider_cost_currency IS NULL;

ALTER TABLE public.dcds_vtu_orders
  DROP CONSTRAINT IF EXISTS dcds_vtu_orders_currency_check,
  ADD CONSTRAINT dcds_vtu_orders_currency_check
    CHECK (currency = ANY (ARRAY['NGN','USD','GBP','EUR'])),
  ADD CONSTRAINT dcds_vtu_orders_provider_cost_currency_check
    CHECK (provider_cost_currency = 'NGN'),
  ADD CONSTRAINT dcds_vtu_orders_fx_rate_check
    CHECK (fx_rate > 0);

-- Airtime face value remains the NGN provider amount; amount is the customer's
-- converted checkout total. Preserve historical rows (where both were equal).
ALTER TABLE public.dcds_vtu_orders
  DROP CONSTRAINT IF EXISTS dcds_vtu_service_fields_check,
  ADD CONSTRAINT dcds_vtu_service_fields_check CHECK (
    (service_type = 'data' AND data_plan_id IS NOT NULL
      AND NULLIF(btrim(data_plan_name), '') IS NOT NULL AND airtime_amount IS NULL)
    OR
    (service_type = 'airtime' AND data_plan_id IS NULL
      AND data_plan_name IS NULL AND airtime_amount IS NOT NULL
      AND airtime_amount = provider_cost)
  );
