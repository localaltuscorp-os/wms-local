-- Migration 0132 — Agreements module (ADDITIVE, load-neutral).
-- One NEW table. Idempotent: safe to re-run.
--   pnpm tsx --env-file=.env.local scripts/apply-0132-agreements.ts
--
-- Full-lifecycle employee agreements: HR generates from a template (auto-filled),
-- sends, the employee e-signs (types name + "I agree" + timestamp), stored + tracked.

create table if not exists agreements (
  id                uuid primary key default gen_random_uuid(),
  employee_id       uuid not null references employees(id) on delete cascade,
  -- 'appointment' | 'employment' | 'nda' | 'ctc'
  type              text not null,
  -- 'draft' | 'sent' | 'signed'
  status            text not null default 'draft',
  title             text not null,
  -- paying entity whose signatory closes the letter
  entity            text,
  -- the filled template fields (recipient, dates, ctc, clauses, particulars…)
  field_values      jsonb not null default '{}'::jsonb,
  -- generated (unsigned) + signed PDF paths in the Supabase `documents` bucket
  pdf_path          text,
  signed_pdf_path   text,
  -- e-signature: typed name + acknowledgement stamp
  signed_name       text,
  signed_at         timestamptz,
  signed_ip         text,
  -- unguessable token for the employee's sign link
  sign_token        text not null default replace(gen_random_uuid()::text, '-', ''),
  created_by_id     uuid references employees(id) on delete set null,
  sent_at           timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index if not exists agreements_employee_idx on agreements (employee_id);
create index if not exists agreements_status_idx on agreements (status);
create unique index if not exists agreements_sign_token_uq on agreements (sign_token);
