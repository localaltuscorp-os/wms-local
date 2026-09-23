-- ============================================================================
-- 08 — Read-only verification for the Product Master work (change 10).
--
-- Nothing here writes. Run it after 07-apply-incentive-product-master.sql.
-- ============================================================================

-- 1. The seven products the brief lists, and where each one stands.
--    EXPECT: all seven present, is_active true, one row each.
SELECT name, code, is_active, sort_order
FROM outstanding_products
WHERE name IN (
  'PS', 'BSS', 'OS', 'Retainer', 'Key Note', '2-Day Workshop', 'Inhouse PS'
)
ORDER BY name;

-- 2. Nothing was added twice under a near-miss spelling. EXPECT: zero rows —
--    or a deliberate pair the admin created on purpose.
SELECT name, code FROM outstanding_products
WHERE name ILIKE '%inhouse%' OR name ILIKE '%2 day%' OR name ILIKE '%key note%'
ORDER BY name;

-- 3. The code column is what the incentive tables print. EXPECT: no active
--    product sold with a NULL code is a display gap, not an error — the column
--    falls back to the product's name.
SELECT count(*) AS active_products_without_a_code
FROM outstanding_products
WHERE is_active AND (code IS NULL OR code = '');

-- 4. The shift master the form's Shift field reads. EXPECT: the shifts the
--    company actually runs; the form offers exactly these and refuses others.
SELECT name, is_active
FROM shift_types
ORDER BY is_active DESC, name;

-- ============================================================================
-- A NOTE ON WHAT IS *NOT* HERE.
--
-- The form's Product Sold field is validated on the SERVER against these active
-- rows (lib/incentive-fields.ts → lib/incentive/prepare-request.ts), so a
-- product an admin retires cannot be filed, and a product added here becomes
-- valid with no deploy.
-- ============================================================================
