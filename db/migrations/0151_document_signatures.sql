-- Migration 0151 — Document Signatures (DigiLocker-verified e-signing).
-- ADDITIVE + idempotent: one NEW table, safe to re-run. Load-neutral (no
-- existing table touched).
--   pnpm tsx --env-file=.env.local scripts/apply-0151-document-signatures.ts
--
-- Backs the DigiLocker-verified signing flow for HR documents (Letters,
-- Agreements, Exit docs). The signer proves identity via DigiLocker OAuth; we
-- receive verified name/DOB/gender/address/photo + a MASKED Aadhaar (last-4
-- only), then they draw/type a signature and we archive a signed PDF.
--
-- ⚠ AADHAAR ACT COMPLIANCE: `masked_aadhaar` stores ONLY DigiLocker's masked
-- value (last-4, e.g. 'XXXXXXXX1234'). NEVER store a full 12-digit Aadhaar.

create table if not exists document_signatures (
  id                    uuid primary key default gen_random_uuid(),
  -- 'letter' | 'agreement' | 'exit_doc'
  doc_kind              text not null,
  -- the source document row id (employee_documents.id / agreements.id / exit doc id)
  doc_id                uuid not null,
  signer_employee_id    uuid references employees(id) on delete set null,
  -- 'pending' | 'verified' | 'signed'
  status                text not null default 'pending',
  method                text not null default 'digilocker',
  -- verified identity (from DigiLocker; PII, MASKED aadhaar only)
  verified_name         text,
  verified_dob          text,
  verified_gender       text,
  verified_address      text,
  -- last-4 only, e.g. 'XXXXXXXX1234' — NEVER a full 12-digit Aadhaar
  masked_aadhaar        text,
  -- storage path of the DigiLocker photo (documents bucket), or null
  photo_path            text,
  -- provider txn/ref id
  digilocker_ref        text,
  verified_at           timestamptz,
  -- signature
  -- 'drawn' | 'typed' | null
  signature_kind        text,
  signature_text        text,
  signature_image_path  text,
  consent_text          text,
  -- archived signed PDF storage path (documents bucket)
  signed_pdf_path       text,
  signed_at             timestamptz,
  ip                    text,
  user_agent            text,
  created_by_id         uuid references employees(id) on delete set null,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists document_signatures_doc_idx
  on document_signatures (doc_kind, doc_id);
create index if not exists document_signatures_signer_idx
  on document_signatures (signer_employee_id);
