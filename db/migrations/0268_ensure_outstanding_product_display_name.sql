-- Repair schema drift: the billing product query reads this optional display
-- label, while databases that missed the original billing master migration do
-- not yet have the column. This is additive and preserves all existing rows.
ALTER TABLE outstanding_products
  ADD COLUMN IF NOT EXISTS display_name text;
