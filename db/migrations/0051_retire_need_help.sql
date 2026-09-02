-- 0051 — retire the `need_help` task status (2026-06-10).
--
-- Removed from every user-facing picker / filter / kanban column in code, but
-- the physical task_status enum KEEPS the value so any row we miss still
-- renders. Existing need_help tasks migrate to `need_info` (closest meaning),
-- which keeps them in the pending lane + all "pending"/"need" counts.
--
-- Data-only and IDEMPOTENT — safe to run more than once. Applied via
-- scripts/apply-retire-need-help.ts, NOT `pnpm db:migrate` (the drizzle journal
-- is out of sync — see the migration-journal-out-of-sync workflow).

update tasks
   set status = 'need_info'
 where status = 'need_help';
