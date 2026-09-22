-- 0235 — the SP1 call log (DCC-SPEC §7, §13).
--
-- The compliance board records whether a duty was DONE. SP1 records, of the
-- calls a person made on a day, HOW MANY landed on each of fifteen outcomes —
-- Registered, Verbal Yes, DND, Ringing and the rest. That is a count per
-- outcome per person per day, and it is not a compliance: there is no
-- Done/Not-done here, only numbers.
--
-- ── WHY A NARROW LOG AND NOT FIFTEEN COLUMNS ───────────────────────────────
-- Fifteen columns on dcc_entries would widen a table much of the module reads
-- with a bare select(), and every new outcome would then be a migration PLUS a
-- code change everywhere that table is read. Keyed by outcome, a sixteenth
-- outcome is a data row.
--
-- NO CHECK ON `disposition` — deliberately. The vocabulary lives in
-- lib/dcc/sp1.ts, the write path validates against it, and the grid drops
-- anything it does not recognise. A constraint here would mean a migration
-- every time Jeevan's sheet gains a row.
--
-- IDEMPOTENT: this repository applies migrations by hand, in the Supabase SQL
-- editor, and a file that cannot be run twice is a file that gets run once and
-- then half-run.

create table if not exists dcc_call_logs (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  log_date date not null,
  disposition text not null,
  -- A count, never negative. ZERO IS MEANINGFUL and different from no row:
  -- zero means "asked, none landed here", no row means nobody said.
  count integer not null default 0 check (count >= 0),
  note text,
  filled_by_id uuid references employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ONE row per person per day per outcome. This is what lets the fill screen
-- upsert a cell without reading it first, and what stops a double-submit
-- doubling a day's numbers.
create unique index if not exists dcc_call_logs_uq
  on dcc_call_logs (employee_id, log_date, disposition);

-- The grid reads a date window for a set of people; the 10 pm report reads one
-- day for everybody. Both are served by this.
create index if not exists dcc_call_logs_date_idx
  on dcc_call_logs (log_date, employee_id);
