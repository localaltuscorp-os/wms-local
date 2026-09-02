-- Migration 0152 — HR Letters / Documents engine (26-type letter program).
-- ADDITIVE + idempotent: THREE new tables only, safe to re-run. Load-neutral
-- (no existing table touched).
--   pnpm tsx --env-file=.env.local scripts/apply-0152-hr-letters.ts
--
-- Backs the HR LETTERS/DOCUMENTS program:
--   • letter_templates   — one admin-editable body per document type (HYBRID
--     model: fixed Altus frame + editable {{merge}} body). Seeded with the 26
--     canonical types by the applier.
--   • document_instances — a composed/issued document for one employee (or a
--     pre-hire candidate); freezes the body at issue + tracks send/sign status.
--     Signature status itself lives in the existing `document_signatures` table
--     (doc_kind 'letter'|'agreement', doc_id = this instance id).
--   • ctc_breakups       — the NEW HR compensation engine (structured CTC letter,
--     20-field jsonb + growth journey), versioned per employee. SUPERSEDES the
--     old Salary CTC pdf inside the letters flow.
-- NOTE: `trigger` is a reserved keyword — the column is deliberately quoted.

create table if not exists letter_templates (
  id            uuid primary key default gen_random_uuid(),
  -- 'A'..'G' family letter (see lib/hr-docs/types.ts HR_CATEGORIES)
  category      text not null,
  -- stable identity, e.g. 'appointment_letter' — one row per DOC_TYPES key
  type_key      text not null unique,
  title         text not null,
  -- admin-editable body with {{mergeFields}} (the fixed frame lives in code)
  body_md       text not null default '',
  -- 'issued' | 'email' | 'request'
  "trigger"     text not null default 'issued',
  -- 'none' | 'acknowledge' | 'esign'
  signature     text not null default 'none',
  -- 'text' | 'structured' | 'certificate'
  content       text not null default 'text',
  active        boolean not null default true,
  updated_by_id uuid references employees(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table if not exists document_instances (
  id                uuid primary key default gen_random_uuid(),
  -- which template/type this instance was composed from
  type_key          text not null,
  -- signer/recipient; NULL for pre-hire candidates (use candidate_* instead)
  employee_id       uuid references employees(id) on delete set null,
  candidate_name    text,
  candidate_email   text,
  -- 'draft' | 'sent' | 'acknowledged' | 'signed'
  status            text not null default 'draft',
  -- the filled {{merge}} field values at compose time
  merge_values      jsonb not null default '{}'::jsonb,
  -- frozen body_md at issue (the source of truth for the rendered PDF)
  body_snapshot_md  text,
  -- archived rendered PDF storage path (private `documents` bucket)
  rendered_pdf_path text,
  emailed_at        timestamptz,
  issued_by_id      uuid references employees(id) on delete set null,
  issued_at         timestamptz,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create index if not exists document_instances_employee_idx
  on document_instances (employee_id);
create index if not exists document_instances_type_idx
  on document_instances (type_key);
create index if not exists document_instances_status_idx
  on document_instances (status);

create table if not exists ctc_breakups (
  id             uuid primary key default gen_random_uuid(),
  employee_id    uuid not null references employees(id) on delete cascade,
  version        int not null default 1,
  -- 'initial' | 'promotion' | 'appraisal'
  reason         text not null default 'initial',
  effective_date date,
  -- the 20-field CTC structure (see lib/hr-docs/types.ts CtcFields)
  fields         jsonb not null default '{}'::jsonb,
  -- [{ id, date, title, detail }] growth-journey timeline
  growth_journey jsonb not null default '[]'::jsonb,
  created_by_id  uuid references employees(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (employee_id, version)
);

create index if not exists ctc_breakups_employee_idx
  on ctc_breakups (employee_id);
