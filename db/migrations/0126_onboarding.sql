-- 0126 — Onboarding form submissions (Employee Dossier).
-- One structured onboarding record per employee: text/select answers in `fields`
-- jsonb, file attachments (selfie, salary cert, aadhar/pan copies, cancelled
-- cheque, …) as storage keys in `files` jsonb (bucket = documents). Additive +
-- idempotent. Access gated in app code (self fills own; admin fills/views all).

create table if not exists onboarding_submissions (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  fields jsonb not null default '{}'::jsonb,   -- { fieldKey: answer }
  files jsonb not null default '{}'::jsonb,     -- { fieldKey: { path, fileName, mime, size } }
  status text not null default 'submitted',     -- 'draft' | 'submitted'
  submitted_at timestamptz,
  created_by_id uuid references employees(id) on delete set null,
  updated_by_id uuid references employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists onb_employee_uidx on onboarding_submissions (employee_id);
