-- 0158_paying_entities_reconcile — reconcile the salary paying-entity roster to
-- the FIVE canonical Altus entities used by the HR letterhead system
-- (lib/hr/entities.ts). ADDITIVE + IDEMPOTENT. No columns dropped, no rows
-- deleted — legacy names are RENAMED in place (so employees.paying_entity_id
-- FKs are preserved) and any missing entity is inserted.
--
-- Canonical display names:
--   Altus Corp                          (default)
--   Unleashed
--   The Gainmakers (MJV HUF)            (was "MJV HUF")
--   Legacy Creators (JSV HUF)          (was "JSV HUF")
--   The Perfect Blend (Khushboo Shah)  (new)
--
-- ⚠ Do NOT run against the DB as part of a page load. Apply out-of-band via
--   pnpm tsx --env-file=.env.local scripts/apply-0158-paying-entities.ts

-- 1) Rename legacy "MJV HUF" → "The Gainmakers (MJV HUF)" (only if the canonical
--    name is not already taken, to avoid the UNIQUE(name) collision).
UPDATE paying_entities
   SET name = 'The Gainmakers (MJV HUF)', updated_at = now()
 WHERE lower(trim(name)) IN ('mjv huf', 'the gainmakers', 'gainmakers')
   AND NOT EXISTS (
     SELECT 1 FROM paying_entities p2 WHERE p2.name = 'The Gainmakers (MJV HUF)'
   );

-- 2) Rename legacy "JSV HUF" → "Legacy Creators (JSV HUF)".
UPDATE paying_entities
   SET name = 'Legacy Creators (JSV HUF)', updated_at = now()
 WHERE lower(trim(name)) IN ('jsv huf', 'legacy creators', 'legacy creators - jsv huf')
   AND NOT EXISTS (
     SELECT 1 FROM paying_entities p2 WHERE p2.name = 'Legacy Creators (JSV HUF)'
   );

-- 3) Ensure all five canonical entities exist (insert any that are missing).
INSERT INTO paying_entities (name, is_active, sort_order)
VALUES
  ('Altus Corp',                        true, 10),
  ('Unleashed',                         true, 20),
  ('The Gainmakers (MJV HUF)',          true, 30),
  ('Legacy Creators (JSV HUF)',         true, 40),
  ('The Perfect Blend (Khushboo Shah)', true, 50)
ON CONFLICT (name) DO NOTHING;

-- 4) Normalise sort order + reactivate the canonical five so they lead pickers
--    (altus-corp first). Leaves any other/legacy rows untouched.
UPDATE paying_entities SET sort_order = 10, is_active = true WHERE name = 'Altus Corp';
UPDATE paying_entities SET sort_order = 20, is_active = true WHERE name = 'Unleashed';
UPDATE paying_entities SET sort_order = 30, is_active = true WHERE name = 'The Gainmakers (MJV HUF)';
UPDATE paying_entities SET sort_order = 40, is_active = true WHERE name = 'Legacy Creators (JSV HUF)';
UPDATE paying_entities SET sort_order = 50, is_active = true WHERE name = 'The Perfect Blend (Khushboo Shah)';
