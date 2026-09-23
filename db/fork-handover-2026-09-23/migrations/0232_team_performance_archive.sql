-- 0232 — ARCHIVE a row on Productivity › Team Performance.
--
-- Manan, 2026-09-15, pointing at the Team Performance table: "give archive
-- option to archive the team performance table".
--
-- ── WHAT IS BEING ARCHIVED, AND WHAT IS NOT ───────────────────────────────
--
-- The rows on that board are not records. Every number in them — goal score,
-- goals done, overdue, status — is computed live from tasks, goals, DCC and
-- attendance at render time, and nothing about the row is stored anywhere. So
-- there is nothing to file away. What CAN be put away is the row's PLACE ON
-- THE BOARD: "stop listing this person here".
--
-- Hence a flag on `employees` rather than a new table. It says one thing —
-- this person is off the Team Performance list — and it says it in the only
-- place the board reads its population from.
--
-- ── WHY NOT is_active, AND WHY NOT employment_status ──────────────────────
--
-- Both already exist and both mean something this must not: `is_active` is the
-- LOGIN GATE (0212's note is explicit), and `employment_status` answers "do
-- they still work here". Archiving a board row must not sign anybody out or
-- mark them a leaver, so it gets its own column and touches neither.
--
-- Nothing else reads it. The person keeps their Productivity Dashboard, keeps
-- their Goals row (/goals/weekly/team renders the same board component and is
-- deliberately left alone), keeps every task and goal they own. One list, one
-- flag.
--
-- `performance_archived_at` is the WHEN — what the Archive sorts by and what
-- makes "put away in March" answerable — matching the pair every other
-- archivable table in this app carries (tasks, dcc_kpi_items, tc_materials,
-- and billing_documents / pms_monthly_review in 0231).
--
-- FULLY IDEMPOTENT — safe to re-apply by hand at any time.

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS performance_archived boolean NOT NULL DEFAULT false;

ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS performance_archived_at timestamptz;

-- PARTIAL, like 0230's and 0231's: almost every employee is on the board, so
-- an index over the whole column would be one enormous all-false entry. This
-- indexes only the filed rows, which is the set the Archive reads.
CREATE INDEX IF NOT EXISTS employees_performance_archived_idx
  ON employees (performance_archived)
  WHERE performance_archived = true;
