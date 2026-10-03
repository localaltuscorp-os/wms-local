-- 0265 — Module and page ownership.
--
-- Assignments use permission-catalogue node keys, so the configured UI and the
-- route guard share one hierarchy. No employee identity is seeded here.

create table if not exists module_ownership_assignments (
  id uuid primary key default gen_random_uuid(),
  node_key text not null,
  role text not null check (role in ('head', 'associate', 'developer')),
  employee_id uuid not null references employees(id) on delete cascade,
  assigned_by_id uuid references employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint module_ownership_node_role_employee_uq unique (node_key, role, employee_id)
);

create unique index if not exists module_ownership_one_head_uq
  on module_ownership_assignments (node_key) where role = 'head';
create unique index if not exists module_ownership_one_associate_uq
  on module_ownership_assignments (node_key) where role = 'associate';
create index if not exists module_ownership_employee_idx
  on module_ownership_assignments (employee_id);
create index if not exists module_ownership_node_idx
  on module_ownership_assignments (node_key);

create table if not exists module_ownership_events (
  id uuid primary key default gen_random_uuid(),
  node_key text not null,
  previous_assignments jsonb not null default '[]'::jsonb,
  next_assignments jsonb not null default '[]'::jsonb,
  actor_employee_id uuid references employees(id) on delete set null,
  occurred_at timestamptz not null default now()
);

create index if not exists module_ownership_events_node_idx
  on module_ownership_events (node_key, occurred_at desc);
