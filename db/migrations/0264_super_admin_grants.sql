-- 0264 — Separate database-backed Super Admin registry.
--
-- Super Admin and Master Admin are deliberately different roles:
--   · super_admin_grants: whole-application, break-glass authority;
--   · capability_grants/master_admin.manage: the existing Master Admin role.
--
-- This migration creates no memberships and contains no employee identities.
-- Membership is added only by the controlled, operator-run backfill after the
-- migration has been reviewed and applied. Existing application access is not
-- changed by this migration.

create table if not exists super_admin_grants (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete restrict,
  employee_email text not null,
  granted_by_id uuid references employees(id) on delete set null,
  created_at timestamptz not null default now(),
  constraint super_admin_grants_employee_uniq unique (employee_id)
);

create index if not exists super_admin_grants_created_idx
  on super_admin_grants (created_at desc);

-- Append-only event history. An offboarded account must not erase evidence of
-- who held whole-application authority or who changed it.
create table if not exists super_admin_grant_events (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid references employees(id) on delete set null,
  employee_email text not null,
  action text not null check (action in ('granted', 'revoked', 'backfilled')),
  actor_employee_id uuid references employees(id) on delete set null,
  occurred_at timestamptz not null default now()
);

create index if not exists super_admin_grant_events_employee_idx
  on super_admin_grant_events (employee_id, occurred_at desc);
create index if not exists super_admin_grant_events_recent_idx
  on super_admin_grant_events (occurred_at desc);
