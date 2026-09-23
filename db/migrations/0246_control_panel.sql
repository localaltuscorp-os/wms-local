-- ════════════════════════════════════════════════════════════════════════════
-- CONTROL PANEL (0246) — a configurable Roles template layer over the existing
-- permission architecture.
--
-- WHAT THIS IS
--   Roles are reusable permission templates that administrators assign to users.
--   Enforcement is UNCHANGED: it remains `module_permissions` (per-employee
--   show/view/edit) + capabilities + delegated access + visibility grants. These
--   three tables are the authoring surface behind Admin Panel → Control Panel's
--   Users / Roles / Permissions / Effective Access.
--
--   · roles            a named template (e.g. "HR Admin", "Reporting Viewer").
--   · role_permissions one (module node, action, scope) a role grants.
--   · employee_roles   the many-to-many user ↔ role assignment.
--
-- SAFETY
--   Additive + idempotent. Every statement is `if not exists`. No DROP, no
--   DELETE, no TRUNCATE.
-- ════════════════════════════════════════════════════════════════════════════

create table if not exists roles (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  description  text,
  -- A system role cannot be deleted or renamed from the Control Panel (it is
  -- the seeded "Super Admin"). Writable only by a system-level process.
  is_system    boolean not null default false,
  created_by_id uuid references employees (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create unique index if not exists roles_name_uq on roles (lower(name));

create table if not exists role_permissions (
  id         uuid primary key default gen_random_uuid(),
  role_id    uuid not null references roles (id) on delete cascade,
  node_key   text not null,
  action     text not null,
  scope      text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists role_permissions_uq
  on role_permissions (role_id, node_key, action, scope);
create index if not exists role_permissions_role_idx
  on role_permissions (role_id);
create index if not exists role_permissions_node_idx
  on role_permissions (node_key);

create table if not exists employee_roles (
  id            uuid primary key default gen_random_uuid(),
  employee_id   uuid not null references employees (id) on delete cascade,
  role_id       uuid not null references roles (id) on delete cascade,
  assigned_by_id uuid references employees (id) on delete set null,
  created_at    timestamptz not null default now()
);

create unique index if not exists employee_roles_uq
  on employee_roles (employee_id, role_id);
create index if not exists employee_roles_employee_idx
  on employee_roles (employee_id);
create index if not exists employee_roles_role_idx
  on employee_roles (role_id);

-- The seeded, non-deletable "Super Admin" template. Idempotent: skips itself
-- when a role named "Super Admin" already exists.
insert into roles (name, description, is_system)
select 'Super Admin', 'Unrestricted access to the Control Panel and every module.', true
where not exists (select 1 from roles where lower(name) = 'super admin');
