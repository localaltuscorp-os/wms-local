-- 0232 — Recruitment JDs: the job descriptions recruiters send to candidates.
--
-- The account holder asked (2026-09-15) for a Job Description section for
-- recruiters, for every position we hire into, that can be sent to anyone by
-- WhatsApp or email, inside the HR module. It is NOT the internal Job
-- Description module (/operations/job-description, the JD Bank of recurring
-- duties per seat) — that answers "who does this job"; this answers "what do
-- we tell a candidate about this job".
--
-- One row per candidate position (`interview_positions`, the list the Candidate
-- Interview Form already uses), holding two versions:
--   master_content     the original — Rutvisha's JD. Changed only deliberately.
--   recruiter_content  what recruiters edit and send. NULL = identical to the
--                      master, so a master update flows through until someone
--                      edits the recruiter copy. "Reset to master" sets it NULL.
-- Content is jsonb in the shape lib/operations/recruitment-jd.ts defines, so the fields
-- can grow once the real JDs arrive without another migration.
--
-- recruitment_jd_sends records every send — what was sent (a snapshot, since
-- the JD can change afterwards), to whom, how, and by whom. A WhatsApp send is
-- 'opened': the WMS opens WhatsApp with the JD typed in; the recruiter presses
-- Send there, which the WMS cannot see.
--
-- Idempotent: this repository applies migrations by hand.

create table if not exists recruitment_jds (
  id uuid primary key default gen_random_uuid(),
  position_id uuid not null unique references interview_positions(id) on delete restrict,
  master_content jsonb,
  master_updated_by_id uuid references employees(id) on delete set null,
  master_updated_at timestamptz,
  recruiter_content jsonb,
  recruiter_updated_by_id uuid references employees(id) on delete set null,
  recruiter_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists recruitment_jd_sends (
  id uuid primary key default gen_random_uuid(),
  jd_id uuid references recruitment_jds(id) on delete set null,
  position_label text not null,
  channel text not null check (channel in ('whatsapp', 'email')),
  recipient_name text,
  recipient_phone text,
  recipient_email text,
  content jsonb not null,
  status text not null check (status in ('opened', 'sent', 'failed')),
  error text,
  sent_by_id uuid references employees(id) on delete set null,
  sent_at timestamptz not null default now()
);

create index if not exists recruitment_jd_sends_jd_idx on recruitment_jd_sends (jd_id, sent_at desc);
