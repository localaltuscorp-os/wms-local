-- 0154 — Candidate Intake (Pre-Interview → Basic Details)
-- Stores the "Altus Candidate Walk-in Interview Form" (108 fields). The full
-- structured answers live in `data` (jsonb, keyed by section+field); a few hot
-- columns are lifted out for listing/search. ADDITIVE + idempotent.

create table if not exists candidate_intake (
  id uuid primary key default gen_random_uuid(),
  position_applied text,
  full_name text not null default '',
  mobile text,
  email text,
  status text not null default 'new',            -- new | shortlisted | rejected | hired
  data jsonb not null default '{}'::jsonb,        -- { "<section>::<variant>": { "<field>": value } }
  photo_path text,
  signature_path text,
  created_by_id uuid references employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists candidate_intake_created_at_idx on candidate_intake (created_at desc);
create index if not exists candidate_intake_status_idx on candidate_intake (status);
