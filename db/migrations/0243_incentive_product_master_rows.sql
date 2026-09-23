-- PRODUCT MASTER — the three products the Sales Pitch form names that the
-- master did not have yet.
--
-- The brief lists seven products: PS, BSS, OS, Retainer, Key Note,
-- 2-Day Workshop, Inhouse PS. Five were already rows in `outstanding_products`
-- (PS/BSS/OS carry their own code; Retainer arrived in 0217 with a NULL code and
-- is left exactly as it is). The other three existed only in `product_options`
-- — the non-revenue MCQ list the module forms use — so a Sales Pitch could not
-- name them as a SOLD product at all.
--
-- Additive and idempotent. Codes are the short forms the brief shows
-- ("KN", "2-Day"), which is what the incentive tables print in the Product Code
-- column; "Inhouse PS" takes "IPS" because "IP" reads as internet protocol on a
-- money screen and the longer form does not fit the column.
--
-- This migration creates rows ONLY. Nothing is activated or retired: an admin
-- still manages the master at /admin/products, and the Sales Pitch form reads
-- whatever is active there.
INSERT INTO outstanding_products (name, code, is_active, sort_order)
VALUES
  ('Key Note',       'KN',    true, 100),
  ('2-Day Workshop', '2-Day', true, 100),
  ('Inhouse PS',     'IPS',   true, 100)
ON CONFLICT (name) DO NOTHING;

-- The same three, reached by their old MCQ spellings: if an admin had already
-- added "Inhouse PSO" or "2 Days" to the master by hand, those rows keep their
-- own names and codes and simply coexist — no rename, no data movement.
