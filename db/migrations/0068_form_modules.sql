-- Dynamic form modules (Manan 2026-06): Reimbursements, Leave Approval,
-- Record Reference, Participant Breakthrough — plus admin-editable form
-- definitions and a shared, admin-extensible Product Name list.

create table if not exists module_submissions (
  id            uuid primary key default gen_random_uuid(),
  module        text not null,
  employee_id   uuid not null references employees(id) on delete cascade,
  fields        jsonb not null default '{}'::jsonb,
  admin_fields  jsonb not null default '{}'::jsonb,
  status        text not null default 'pending',
  decided_by_id uuid references employees(id) on delete set null,
  decided_at    timestamptz,
  archived      boolean not null default false,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists module_submissions_module_created_idx on module_submissions (module, created_at);
create index if not exists module_submissions_employee_idx on module_submissions (employee_id);

create table if not exists form_configs (
  form_key      text primary key,
  fields        jsonb not null default '[]'::jsonb,
  updated_by_id uuid references employees(id) on delete set null,
  updated_at    timestamptz not null default now()
);

create table if not exists product_options (
  id          uuid primary key default gen_random_uuid(),
  label       text not null,
  sort_order  integer not null default 100,
  created_at  timestamptz not null default now()
);
create unique index if not exists product_options_label_idx on product_options (label);

-- Seed the default Product Name MCQ options (idempotent).
insert into product_options (label, sort_order) values
  ('Don''t Know', 10),
  ('PSO', 20),
  ('BSS', 30),
  ('Consulting', 40),
  ('Collaboration', 50),
  ('Key Note', 60),
  ('Inhouse PSO', 70),
  ('Being Arjun', 80),
  ('2 Days', 90)
on conflict (label) do nothing;
