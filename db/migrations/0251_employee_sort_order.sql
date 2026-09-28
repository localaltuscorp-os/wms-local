-- 0251 — a manual display order for people sharing the same manager.
-- Additive + idempotent. Nothing is dropped and no existing row is touched.
--
-- Backs Team Reporting's "move a full card up/down, shuffle their order"
-- (2026-09-24): the tree layout's column order and each column's card order
-- were both purely derived (join order / team size) with no persisted manual
-- override. NULL means "no manual order yet" — existing rows keep falling
-- back to their current derived order until someone reorders them once.
ALTER TABLE employees ADD COLUMN IF NOT EXISTS sort_order integer;
