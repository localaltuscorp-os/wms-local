-- ════════════════════════════════════════════════════════════════════════════
-- 0250 — writable master data for the Training & Learning module.
--
-- WHY
--   Spec §29 asks the admin to CONFIGURE training types, audience scopes, share
--   slots and self-learning sources. Those were enum-only (db/enums.ts), which
--   means changing them needs a deploy. This table makes them real master data
--   an admin can add to, rename, reorder and retire — following the SAME shape
--   the module already uses for tc_subjects / tc_services (is_active +
--   sort_order + soft delete), so nothing new is invented.
--
--   The enum arrays stay as the SEED and the fallback: if this table is empty or
--   a row is retired, the app still has a usable list. A new value added here is
--   stored as text in the owning columns, which are already text columns.
--
--   Additive and idempotent. Seeded with the current enum values.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS "tc_lookups" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "kind" text NOT NULL,          -- training_type | audience_scope | share_slot | self_learning_source
  "value" text NOT NULL,         -- what gets stored in the owning column
  "label" text NOT NULL,         -- what the picker shows
  "is_active" boolean NOT NULL DEFAULT true,
  "sort_order" integer NOT NULL DEFAULT 100,
  "created_at" timestamptz NOT NULL DEFAULT now(),
  "updated_at" timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS "tc_lookups_kind_value_uq" ON "tc_lookups" ("kind", "value");
CREATE INDEX IF NOT EXISTS "tc_lookups_kind_active_idx" ON "tc_lookups" ("kind", "is_active", "sort_order");

-- Seed from the current enum values. ON CONFLICT keeps any admin edit.
INSERT INTO "tc_lookups" ("kind", "value", "label", "sort_order") VALUES
  ('training_type', 'technical',   'Technical',   10),
  ('training_type', 'soft_skills', 'Soft Skills', 20),
  ('training_type', 'product',     'Product',     30),
  ('training_type', 'process',     'Process',     40),
  ('training_type', 'compliance',  'Compliance',  50),
  ('training_type', 'induction',   'Induction',   60),
  ('training_type', 'other',       'Other',       70),
  ('audience_scope', 'my_team',            'My Team',            10),
  ('audience_scope', 'another_team',       'Another Team',       20),
  ('audience_scope', 'multiple_teams',     'Multiple Teams',     30),
  ('audience_scope', 'function',           'Function',           40),
  ('audience_scope', 'selected_employees', 'Selected Employees', 50),
  ('audience_scope', 'everyone',           'Everyone',           60),
  ('share_slot', 'junior', 'Juniors (1:30 PM)',     10),
  ('share_slot', 'tl',     'Team Leads (1:40 PM)',  20),
  ('self_learning_source', 'youtube',           'YouTube',          10),
  ('self_learning_source', 'course',            'Course',           20),
  ('self_learning_source', 'book',              'Book',             30),
  ('self_learning_source', 'article',           'Article',          40),
  ('self_learning_source', 'documentation',     'Documentation',    50),
  ('self_learning_source', 'podcast',           'Podcast',          60),
  ('self_learning_source', 'ai',                'AI',               70),
  ('self_learning_source', 'certification',     'Certification',    80),
  ('self_learning_source', 'workshop',          'Workshop',         90),
  ('self_learning_source', 'internal_material', 'Internal Material', 100),
  ('self_learning_source', 'other',             'Other',           110)
ON CONFLICT ("kind", "value") DO NOTHING;
