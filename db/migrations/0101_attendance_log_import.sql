-- 0101 — "Attendance log" Google Sheet import (ADDITIVE, provenance-preserving)
-- Mirrors the two authoritative tabs of the HR "Attendance log" sheet
-- (1BJNUz4sACUbUWvVeF0oLy6Fbror464_Z45drpHL7Cx0) into three read-side tables:
--
--   attendance_sheet_month — one row per (employee_name, month): the sheet's
--     summary columns exactly as HR keeps them.
--   attendance_sheet_day   — one row per (employee_name, month, day 1..31):
--     the raw day STATUS CODE ("P"/"A"/"W/O"/"H"/"H-P"/"H-H/D"/"H/D"/"-").
--     This is a clean per-day truth layer with provenance — it does NOT touch
--     attendance_logs and never synthesizes punch times.
--   paid_leave_cycle       — one row per (employee_name, period) from the
--     employee-blocked "PAID LEAVE CALCULATION" tab (DOJ + leave cycles).
--
-- employee_id is a best-effort match (nullable, ON DELETE SET NULL — no
-- cascade dependency); the upsert key is always the sheet's employee_name so
-- name drift surfaces in sync_runs.unmatched_names instead of forking rows.
--
-- NON-DESTRUCTIVE: additive only — no existing table/column is altered.
-- Idempotent. Apply via the one-off script (drizzle journal is stale):
--   pnpm tsx --env-file=.env.local scripts/apply-0101-attendance-log.ts

create table if not exists attendance_sheet_month (
  id uuid primary key default gen_random_uuid(),
  fy text,
  -- Month bucket, always the 1st: 'YYYY-MM-01' (parsed from the sheet's
  -- "Mon-YYYY" TEXT cell by month NAME — never via new Date(), which drifts
  -- a month under IST→UTC).
  month date not null,
  employee_name text not null,
  employee_id uuid references employees(id) on delete set null,
  designation text,
  company_name text,
  present numeric(6,2) not null default 0,
  holiday numeric(6,2) not null default 0,
  weekly_off numeric(6,2) not null default 0,
  poh_full numeric(6,2) not null default 0,
  poh_half numeric(6,2) not null default 0,
  half_day numeric(6,2) not null default 0,
  absent numeric(6,2) not null default 0,
  days_in_month numeric(6,2) not null default 0,
  total_days_worked numeric(6,2) not null default 0,
  remark text,
  imported_at timestamptz not null default now()
);

create unique index if not exists attsm_emp_month_uidx
  on attendance_sheet_month (employee_name, month);
create index if not exists attsm_month_idx on attendance_sheet_month (month);
create index if not exists attsm_employee_idx on attendance_sheet_month (employee_id);

create table if not exists attendance_sheet_day (
  id uuid primary key default gen_random_uuid(),
  employee_name text not null,
  employee_id uuid references employees(id) on delete set null,
  -- Month bucket ('YYYY-MM-01') + day-of-month 1..31 as laid out in the sheet.
  month date not null,
  day smallint not null,
  -- Raw sheet code, stored verbatim: P | A | W/O | H | H-P | H-H/D | H/D | -
  status_code text not null,
  -- Derived calendar date (month + day); NULL when the day column exceeds the
  -- real length of that month (the sheet always carries 31 day columns).
  date date,
  source text not null default 'attendance_log_sheet',
  imported_at timestamptz not null default now()
);

create unique index if not exists attsd_emp_month_day_uidx
  on attendance_sheet_day (employee_name, month, day);
create index if not exists attsd_employee_date_idx on attendance_sheet_day (employee_id, date);
create index if not exists attsd_month_idx on attendance_sheet_day (month);

create table if not exists paid_leave_cycle (
  id uuid primary key default gen_random_uuid(),
  employee_name text not null,
  employee_id uuid references employees(id) on delete set null,
  -- Date of joining from the block header ("<Name> DOJ - dd/mm/yyyy").
  doj date,
  -- The cycle label exactly as written, e.g. "Mar 2019 – Aug 2019".
  period text not null,
  -- e.g. "Probation" / "Leave cycle 1".
  status text,
  leaves numeric(6,2),
  remarks text,
  imported_at timestamptz not null default now()
);

create unique index if not exists plc_emp_period_uidx
  on paid_leave_cycle (employee_name, period);
create index if not exists plc_employee_idx on paid_leave_cycle (employee_id);
