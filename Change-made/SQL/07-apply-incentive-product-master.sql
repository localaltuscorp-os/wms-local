-- ============================================================================
-- 07 — Product Master: the three products the Sales Pitch form could not name.
--
-- WHAT THIS IS. The brief lists seven sold products: PS, BSS, OS, Retainer,
-- Key Note, 2-Day Workshop, Inhouse PS. Five were already rows in
-- `outstanding_products` (PS / BSS / OS carry their own code; Retainer arrived
-- in 0217 with a NULL code and is left exactly as it is). The other three
-- existed only in `product_options` — the non-revenue MCQ list the module forms
-- use — so a Sales Pitch could not name them as a product it had SOLD.
--
-- This migration CREATES ROWS ONLY. Nothing is activated, renamed or retired;
-- an admin still manages the master at /admin/products, and the Sales Pitch
-- form reads whatever is active there. No code holds a product list.
--
-- Additive and idempotent: safe to run against production as-is, and safe to
-- run twice. Matches db/migrations/0243_incentive_product_master_rows.sql.
-- ============================================================================

INSERT INTO outstanding_products (name, code, is_active, sort_order)
VALUES
  ('Key Note',       'KN',    true, 100),
  ('2-Day Workshop', '2-Day', true, 100),
  ('Inhouse PS',     'IPS',   true, 100)
ON CONFLICT (name) DO NOTHING;

-- The codes are the short forms the incentive tables print in their Product Code
-- column. "Inhouse PS" takes "IPS" — "IP" reads as internet protocol on a money
-- screen, and the longer form does not fit the column.

-- If an admin had already added one of these by hand under an older spelling
-- ("Inhouse PSO", "2 Days"), that row keeps its own name and code and simply
-- coexists. No rename, no data movement, no duplicate.

-- ============================================================================
-- WHAT ELSE THIS CHANGE NEEDS FROM SQL: NOTHING.
--
-- Shift Types (the Sales Pitch form's Shift field) is an EXISTING master — the
-- form reads the active rows of the shift-types table through
-- lib/queries/shift-types.ts and offers the requester's own shift as the
-- default. No schema, no seed.
--
-- The incentive product rows are read through lib/queries/products.ts
-- (`listActiveProductNames`, `listActiveProductCodes`), which every product
-- write busts through the `products` cache tag — so an admin's edit reaches the
-- form without a deploy.
-- ============================================================================
