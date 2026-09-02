-- 0145 — HR Support / Ticketing (ONE table, TWO doors: /support + /queries).
-- ADDITIVE + idempotent. WRITTEN, NOT APPLIED — apply via the usual idempotent
-- SQL one-off BEFORE flipping the module on (module ships behind
-- HR_SUPPORT_OFF, lib/hr/flag.ts). Audit trail = event_log (aggregate
-- "hr_ticket"), no bespoke audit table.
--
-- Confidentiality (grievances): the read set of a confidential ticket is
-- requester + CURRENT assignee + super-admins ONLY, enforced by the single
-- visibleTicketsFilter predicate in app code — no RLS here (house norm).

-- Friendly serial ticket numbers (#2000+ so they never collide with the
-- #1000+ task numbers in people's heads).
create sequence if not exists hr_ticket_no_seq start with 2000;

create table if not exists hr_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_no integer not null default nextval('hr_ticket_no_seq'),
  employee_id uuid not null references employees(id) on delete cascade,
  category text not null,
  subject text not null,
  status text not null default 'new',
  priority text not null default 'normal',
  assignee_id uuid references employees(id) on delete set null,
  confidential boolean not null default false,
  source text not null default 'support',
  -- SLA stamps (computed once at create / priority change; ONE breach cron
  -- compares them to now() — no SLA engine).
  first_response_due_at timestamptz,
  resolution_due_at timestamptz,
  first_responded_at timestamptz,
  sla_breached_at timestamptz,
  resolved_at timestamptz,
  closed_at timestamptz,
  reopened_count integer not null default 0,
  csat_score smallint,
  csat_comment text,
  archived boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hr_tickets_status_chk check (
    status in ('new','in_progress','waiting_on_employee','resolved','closed','reopened')
  ),
  constraint hr_tickets_priority_chk check (
    priority in ('low','normal','high','urgent')
  ),
  constraint hr_tickets_category_chk check (
    category in ('payroll','leave_attendance','reimbursement','it_access',
                 'facilities','documents_letters','policy_question','grievance','other')
  ),
  constraint hr_tickets_source_chk check (source in ('support','query')),
  constraint hr_tickets_csat_chk check (csat_score is null or csat_score between 1 and 5)
);

create unique index if not exists hr_tickets_ticket_no_uq on hr_tickets (ticket_no);
create index if not exists hr_tickets_employee_idx on hr_tickets (employee_id, status);
create index if not exists hr_tickets_assignee_idx on hr_tickets (assignee_id, status);
create index if not exists hr_tickets_status_idx on hr_tickets (status, priority);
create index if not exists hr_tickets_category_idx on hr_tickets (category);

-- Thread messages. internal = true is an HR-only note (never shown to the
-- requester, never notifies them) — the Reply/Note fork exists from day 1.
create table if not exists hr_ticket_messages (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references hr_tickets(id) on delete cascade,
  author_id uuid not null references employees(id) on delete cascade,
  body text not null,
  internal boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists hr_ticket_messages_ticket_idx
  on hr_ticket_messages (ticket_id, created_at);

-- Attachments (Supabase `documents` bucket — dossier upload pattern).
-- message_id NULL = attached to the raise form itself.
create table if not exists hr_ticket_attachments (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references hr_tickets(id) on delete cascade,
  message_id uuid references hr_ticket_messages(id) on delete set null,
  uploaded_by_id uuid references employees(id) on delete set null,
  storage_path text not null,
  file_name text not null,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz not null default now()
);
create index if not exists hr_ticket_attachments_ticket_idx
  on hr_ticket_attachments (ticket_id);

-- category → owner auto-routing. Seeded with all 9 categories (NULL owner =
-- fall back to super-admins) so no ticket is ever born unowned; the admin
-- assigns real owners in the UI.
create table if not exists hr_ticket_routes (
  id uuid primary key default gen_random_uuid(),
  category text not null unique,
  owner_id uuid references employees(id) on delete set null,
  is_active boolean not null default true,
  updated_by_id uuid references employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint hr_ticket_routes_category_chk check (
    category in ('payroll','leave_attendance','reimbursement','it_access',
                 'facilities','documents_letters','policy_question','grievance','other')
  )
);

insert into hr_ticket_routes (category)
values
  ('payroll'),
  ('leave_attendance'),
  ('reimbursement'),
  ('it_access'),
  ('facilities'),
  ('documents_letters'),
  ('policy_question'),
  ('grievance'),
  ('other')
on conflict (category) do nothing;
