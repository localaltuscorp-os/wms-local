-- 0099 — Salary Breakup: the authoritative monthly salary sheet, imported AS-IS.
-- The salary module now READS this table (HR's sheet is the source of truth) —
-- it no longer derives pay from the app's attendance compute engine. So a month
-- where the attendance system failed and someone couldn't punch in NEVER changes
-- their pay: the sheet decides. ADDITIVE + idempotent.
create table if not exists salary_breakup (
  id                    uuid primary key default gen_random_uuid(),
  sr_no                 integer,
  fy                    text,
  month                 date not null,               -- first of the salary month
  employee_name         text not null,
  employee_id           uuid references employees(id) on delete set null,  -- best-effort name match
  designation           text,
  company_name          text,
  -- attendance columns straight from the sheet (informational; do NOT recompute)
  present               numeric(6,2) default 0,
  holiday               numeric(6,2) default 0,
  weekly_off            numeric(6,2) default 0,
  poh_full              numeric(6,2) default 0,       -- present on holiday (full)
  poh_half              numeric(6,2) default 0,       -- present on holiday (half)
  half_day              numeric(6,2) default 0,
  absent                numeric(6,2) default 0,
  days_in_month         numeric(6,2) default 0,
  total_days_worked     numeric(6,2) default 0,
  set_off               numeric(6,2),
  cf                    numeric(6,2),                 -- carry forward
  final_working_days    numeric(6,2) default 0,
  -- money (rupees)
  annual_ctc            numeric(14,2) default 0,
  monthly_ctc           numeric(14,2) default 0,
  payable_after_leave   numeric(14,2) default 0,
  pt                    numeric(14,2) default 0,      -- professional tax
  payable_after_pt      numeric(14,2) default 0,
  advance               numeric(14,2) default 0,
  previous_pending      numeric(14,2) default 0,
  final_payment         numeric(14,2) default 0,      -- Final Payment Post Adv
  salary_given          numeric(14,2),                -- "Salary Given By Sir"
  remarks               text,
  manan_remarks         text,
  imported_at           timestamptz not null default now(),
  unique (employee_name, month)
);
create index if not exists salary_breakup_month_idx on salary_breakup (month);
create index if not exists salary_breakup_emp_idx on salary_breakup (employee_id);
