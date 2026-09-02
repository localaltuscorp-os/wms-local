-- Weekly Goals (ported from the intern app — their 0055 + 0062) — a lightweight,
-- fast-entry planner that sits alongside Tasks. Each row is ONE priority a team
-- member commits to finishing inside a single Mon→Sun week. Columns mirror the
-- spreadsheet: Sr. No. · Client · Subject · Priority for the Week ·
-- Incentive (y/n) + amount · KPI (y/n) · Target Done · % Done (Actual) ·
-- Explanation (+ link).
--
-- Client + Subject are free-text mirroring tasks.client / tasks.subject so the
-- same WMS pickers (clients / subjects rosters) drive this surface too.
--
-- % done is employee-entered; admins may overwrite it. We snapshot who last
-- touched the percentage + when so the dashboard can show provenance.
--
-- Carry-over: copying a goal into a later week writes a NEW row whose
-- `carried_from_id` points back at the original — the previous record is never
-- mutated or deleted, so the history stays intact.
--
-- Idempotent: create-if-not-exists throughout.

create table if not exists weekly_goals (
  id                uuid primary key default gen_random_uuid(),
  -- The team member this priority belongs to (doer). Interns are ordinary
  -- employee rows, so no separate flag is needed.
  employee_id       uuid not null references employees(id) on delete cascade,
  -- Monday (IST) of the ISO week this goal lives in. Stored as a plain date so
  -- week-bucketing is a trivial equality / range filter.
  week_start        date not null,
  -- "Sr. No." — 1-based ordering within (employee, week). Assigned max+1 on
  -- insert; gaps are fine (display uses row index, this preserves intent order).
  position          integer not null default 1,
  client            text,
  subject           text,
  -- "Priority for the Week" — reuses the app-wide Eisenhower enum so the
  -- Critical/Important/Urgent/Normal labels + colours match Tasks 1:1.
  priority          task_priority not null default 'imp_not_urgent',
  incentive         boolean not null default false,
  kpi               boolean not null default false,
  -- "Target Done" — free-text definition of what finishing looks like.
  target_done       text,
  -- "% Done (Actual)" — 0..100, employee-entered, admin-overridable.
  pct_done          integer not null default 0,
  -- Provenance for the percentage (who moved it last + when).
  pct_updated_by_id uuid references employees(id) on delete set null,
  pct_updated_at    timestamptz,
  -- "Explanation" — notes; `link_url` holds an optional URL to show proof.
  explanation       text,
  link_url          text,
  -- Carry-over chain: NULL on originals, set on a copy made into a later week.
  carried_from_id   uuid references weekly_goals(id) on delete set null,
  created_by_id     uuid references employees(id) on delete set null,
  updated_by_id     uuid references employees(id) on delete set null,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint weekly_goals_pct_range check (pct_done >= 0 and pct_done <= 100)
);

create index if not exists weekly_goals_employee_week_idx
  on weekly_goals (employee_id, week_start);
create index if not exists weekly_goals_week_idx
  on weekly_goals (week_start);
create index if not exists weekly_goals_carried_from_idx
  on weekly_goals (carried_from_id);

-- Their migration 0062 — incentive ₹ amount stored directly on the goal.
alter table weekly_goals add column if not exists incentive_amount integer not null default 0;
