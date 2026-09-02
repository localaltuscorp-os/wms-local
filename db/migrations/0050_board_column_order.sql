-- 0050 — sir's changes #8: admin-defined kanban column order.
-- Additive + idempotent. Stores an ordered array of column ids (TaskStatus
-- values + the synthetic "__archived__") on the singleton org_settings row.
-- null = use the built-in default order. Apply via:
--   pnpm tsx --env-file=.env.local scripts/apply-migration.ts db/migrations/0050_board_column_order.sql

alter table org_settings
  add column if not exists board_column_order jsonb;
