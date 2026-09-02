-- 0160 — Employee Exit forms (Exit Interview Questionnaire + Handover & Clearance
-- Checklist). One row per (employee, kind) submission; the app upserts the latest
-- draft/record so re-opening a form resumes it. Idempotent.
create table if not exists exit_records (
  id uuid primary key default gen_random_uuid(),
  -- The exiting employee this record is about.
  employee_id uuid references employees(id) on delete set null,
  -- 'interview' = Exit Interview Questionnaire, 'handover' = Handover & Clearance.
  kind text not null,
  -- Full form payload (answers / ratings / checklist / sign-offs).
  data jsonb not null default '{}'::jsonb,
  -- Who filled/saved it (HR user).
  created_by_id uuid references employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'exit_records_kind_chk'
  ) then
    alter table exit_records
      add constraint exit_records_kind_chk check (kind in ('interview', 'handover'));
  end if;
end $$;

create index if not exists exit_records_employee_idx on exit_records (employee_id);
create index if not exists exit_records_kind_idx on exit_records (kind);
create index if not exists exit_records_updated_idx on exit_records (updated_at);
