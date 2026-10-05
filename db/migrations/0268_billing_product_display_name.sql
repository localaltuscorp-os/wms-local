-- Billing document and customer creation load the optional product display
-- label. Keep this schema repair isolated from the destructive master-cleanup
-- statements in 0259_masters_billing_part2.sql.

ALTER TABLE outstanding_products
  ADD COLUMN IF NOT EXISTS display_name text;
