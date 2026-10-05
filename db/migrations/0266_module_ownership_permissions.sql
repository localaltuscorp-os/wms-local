-- 0266 — Per-person ownership actions and configurable default visibility.

alter table module_ownership_assignments
  add column if not exists can_view boolean not null default true,
  add column if not exists can_edit boolean not null default true;

drop index if exists module_ownership_one_associate_uq;

alter table module_ownership_assignments
  add constraint module_ownership_edit_requires_view_chk
    check (not can_edit or can_view),
  add constraint module_ownership_fixed_role_access_chk
    check (role = 'associate' or (can_view and can_edit));

create table if not exists module_ownership_policies (
  node_key text primary key,
  default_visibility text not null default 'everyone'
    check (default_visibility in ('everyone', 'restricted')),
  updated_by_id uuid references employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Preserve the pre-0266 visibility of already-configured nodes. Before this
-- migration ownership widened assigned people but did not hide the node from
-- everyone else, which is exactly the new `everyone` default.
insert into module_ownership_policies (node_key, default_visibility)
select distinct node_key, 'everyone'
from module_ownership_assignments
on conflict (node_key) do nothing;

alter table module_ownership_events
  add column if not exists previous_default_visibility text,
  add column if not exists next_default_visibility text;
