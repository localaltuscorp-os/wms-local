-- 0190 — Subjects "WMS" and "WMS App" become one subject: "Altus Ecosystem".
--
-- WHY THIS IS A DATA MIGRATION AND NOT A SETTINGS EDIT: `tasks.subject` is
-- free TEXT, not a foreign key to `subjects` (see db/schema.ts) — the picker's
-- label is COPIED into every row at write time. Renaming the master row alone
-- would leave 232 tasks still saying "WMS" / "WMS App" and filtering under a
-- name no longer in the dropdown. Every table that stores the copy has to be
-- rewritten in the same breath.
--
-- WHICH TABLES HOLD THE COPY: tasks, daily_checklist, weekly_goals (all three
-- feed off the same Subject picker) and incentive_projects (legacy import,
-- currently no WMS rows — included so it can never drift). `hr_tickets.subject`
-- is DELIBERATELY NOT TOUCHED: that column is a ticket's own title line, an
-- unrelated meaning of the word.
--
-- ROW COUNTS AT AUTHORING TIME (2026-08-22, production):
--   tasks            42 WMS + 190 WMS App = 232
--   daily_checklist  62 WMS +   9 WMS App =  71
--   weekly_goals     11 WMS +  33 WMS App =  44
--
-- FULLY IDEMPOTENT — this repo re-runs every migration on every apply, so each
-- statement is written to match nothing on a second pass.

-- 1 ── Rewrite the copied value everywhere it landed. -----------------------
UPDATE tasks              SET subject = 'Altus Ecosystem' WHERE lower(subject) IN ('wms', 'wms app');
UPDATE daily_checklist    SET subject = 'Altus Ecosystem' WHERE lower(subject) IN ('wms', 'wms app');
UPDATE weekly_goals       SET subject = 'Altus Ecosystem' WHERE lower(subject) IN ('wms', 'wms app');
UPDATE incentive_projects SET subject = 'Altus Ecosystem' WHERE lower(subject) IN ('wms', 'wms app');

-- 2 ── The master list that feeds the dropdown. -----------------------------
-- "WMS App" leaves the picker the way this app always retires a subject: the
-- admin UI has no delete action for subjects at all, only an active toggle, so
-- deactivating keeps that convention AND keeps the row's settings_events audit
-- history intact. Done BEFORE the rename below so the two can never collide.
UPDATE subjects
   SET is_active = false, updated_at = now()
 WHERE lower(name) = 'wms app';

-- "WMS" is RENAMED rather than replaced, so the new subject inherits the old
-- row's id — every settings_events entry already written against it keeps
-- pointing at something real. Guarded by NOT EXISTS because `subjects.name`
-- carries a unique index: on a re-run, or on a database that already grew its
-- own "Altus Ecosystem", this must no-op instead of erroring.
UPDATE subjects
   SET name = 'Altus Ecosystem', is_active = true, updated_at = now()
 WHERE lower(name) = 'wms'
   AND NOT EXISTS (SELECT 1 FROM subjects s2 WHERE lower(s2.name) = 'altus ecosystem');

-- Only reachable when the rename above was blocked by a pre-existing
-- "Altus Ecosystem" row. The leftover "WMS" still has to leave the picker.
UPDATE subjects
   SET is_active = false, updated_at = now()
 WHERE lower(name) = 'wms';

-- And the fresh-database case: no "WMS" row ever existed to rename, so the
-- subject has to be created outright.
INSERT INTO subjects (name)
SELECT 'Altus Ecosystem'
 WHERE NOT EXISTS (SELECT 1 FROM subjects WHERE lower(name) = 'altus ecosystem');
