-- 0125 — Employee Dossier: the per-person HR document vault.
-- Appointment / probation-end / CTC breakup / increment / confidentiality (×2)
-- / onboarding letters + forms, one row per uploaded file. Files live in the
-- Supabase `documents` bucket; this row holds the storage key + metadata.
-- Additive + idempotent. Access is gated in app code (self sees own, admins all).

create table if not exists employee_documents (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  -- appointment | probation_end | ctc_breakup | increment | confidentiality_1
  -- | confidentiality_2 | onboarding | other
  doc_type text not null,
  title text not null,
  effective_date date,               -- letter/increment date (for sorting a series)
  storage_path text not null,        -- key in the 'documents' bucket
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  notes text,
  archived boolean not null default false,
  uploaded_by_id uuid references employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists empdoc_employee_idx on employee_documents (employee_id, doc_type);
create index if not exists empdoc_type_idx on employee_documents (doc_type);
create index if not exists empdoc_archived_idx on employee_documents (archived);
