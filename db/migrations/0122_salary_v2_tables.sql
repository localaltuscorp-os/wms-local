-- WS-5 (Phase C) — Salary v2 persistence: CTC breakup, retention bonus, and
-- accountant day-adjustments. Additive + idempotent. The read layer
-- (lib/queries/salary-ctc-store.ts) is FAIL-OPEN, so the app runs unchanged
-- before this is applied; the feature is inert until SALARY_V2 is flipped on.

create table if not exists salary_ctc_breakup (
  employee_id      uuid primary key references employees(id) on delete cascade,
  paying_entity_id uuid,
  annual_ctc       numeric(14,2) not null default 0,
  components       jsonb not null default '[]'::jsonb,
  updated_by_id    uuid references employees(id) on delete set null,
  updated_at       timestamptz not null default now()
);

create table if not exists salary_retention_bonus (
  employee_id   uuid primary key references employees(id) on delete cascade,
  amount        numeric(14,2) not null default 0,
  payable_date  date,
  paid          boolean not null default false,
  paid_date     date,
  note          text,
  updated_by_id uuid references employees(id) on delete set null,
  updated_at    timestamptz not null default now()
);

create table if not exists salary_adjustments (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid references employees(id) on delete cascade,
  month         text not null,          -- 'YYYY-MM'
  kind          text not null,          -- 'deduct' | 'ex_gratia'
  days          numeric(6,2) not null default 0,
  reason        text not null,          -- MANDATORY per spec
  created_by_id uuid references employees(id) on delete set null,
  created_at    timestamptz not null default now()
);
create index if not exists salary_adjustments_emp_month_idx on salary_adjustments(employee_id, month);
create index if not exists salary_adjustments_month_idx on salary_adjustments(month);
