-- 0210 — Re-link imported HR-sheet rows to employees who joined the app later.
--
-- THE BUG
-- The four HR-sheet mirror tables (attendance_sheet_month / _day, salary_breakup,
-- paid_leave_cycle) are keyed on employee_name, because that is all the source
-- spreadsheet has. employee_id is a CONVENIENCE column resolved once, at import
-- time, by lib/attendance-log/match.ts. Every read path — loadHrSheetMonth,
-- listHrSheetMonths, mySalaryBreakup — filters on employee_id and nothing else.
--
-- So an employee whose sheet history was imported BEFORE their app account
-- existed keeps employee_id = NULL for ever, and their own History and My Salary
-- pages show nothing at all. The data was never lost; it was simply unreachable
-- by the only key the app queries on.
--
-- Rutvisha Mehta is the reported case: 6 months of attendance summaries, 157 day
-- cells and 6 salary-breakup rows imported 2026-08-02, against an employee row
-- created 2026-08-27.
--
-- WHY NOT JUST RE-RUN THE SYNC
-- That is the designed self-heal — both syncs re-resolve the name and overwrite
-- employee_id via `excluded.employee_id` on conflict — but the last sync_runs
-- entry is 2026-08-02. The syncs have not run in 25 days, so nothing is coming.
-- This migration computes exactly what a sync would, and stays correct if one
-- later runs: it is the same value, so a sync is a no-op over these rows.
--
-- SAFETY
--  · Only rows where employee_id IS NULL are touched. An existing link is never
--    re-pointed, so no row can be moved from one person to another.
--  · Only EXACT normalized-name matches (collapse whitespace, trim, lowercase —
--    the same normName as lib/attendance-log/match.ts). Reviewed aliases such as
--    "Sayyad Daniyal" -> "Danyal Sayyed" are deliberately NOT applied here: an
--    alias is a human judgement that belongs in the reviewed table in code, not
--    buried in a data migration.
--  · `HAVING count(*) = 1` refuses ambiguous names. The roster currently holds
--    two rows spelled "hetesh vichare"; guessing between them would attribute
--    one person's pay to another, so both are left unlinked for a human.
--  · Idempotent — re-running matches nothing, because the rows are no longer NULL.

WITH roster AS (
  SELECT lower(btrim(regexp_replace(name, '\s+', ' ', 'g'))) AS name_key,
         -- array_agg, not min(): Postgres has no min(uuid). HAVING below already
         -- guarantees the group holds exactly one row, so [1] is that row.
         (array_agg(id))[1] AS employee_id
    FROM employees
   GROUP BY 1
  HAVING count(*) = 1          -- ambiguous spellings are a human's call, not ours
)
, m AS (
  UPDATE attendance_sheet_month t SET employee_id = r.employee_id
    FROM roster r
   WHERE t.employee_id IS NULL
     AND lower(btrim(regexp_replace(t.employee_name, '\s+', ' ', 'g'))) = r.name_key
  RETURNING 1
)
, d AS (
  UPDATE attendance_sheet_day t SET employee_id = r.employee_id
    FROM roster r
   WHERE t.employee_id IS NULL
     AND lower(btrim(regexp_replace(t.employee_name, '\s+', ' ', 'g'))) = r.name_key
  RETURNING 1
)
, s AS (
  UPDATE salary_breakup t SET employee_id = r.employee_id
    FROM roster r
   WHERE t.employee_id IS NULL
     AND lower(btrim(regexp_replace(t.employee_name, '\s+', ' ', 'g'))) = r.name_key
  RETURNING 1
)
, p AS (
  UPDATE paid_leave_cycle t SET employee_id = r.employee_id
    FROM roster r
   WHERE t.employee_id IS NULL
     AND lower(btrim(regexp_replace(t.employee_name, '\s+', ' ', 'g'))) = r.name_key
  RETURNING 1
)
SELECT (SELECT count(*) FROM m) AS attendance_months_linked,
       (SELECT count(*) FROM d) AS attendance_days_linked,
       (SELECT count(*) FROM s) AS salary_rows_linked,
       (SELECT count(*) FROM p) AS paid_leave_rows_linked;
