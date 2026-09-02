-- Manan #23/#24 — Project Management. A self-referential tree of nodes:
-- Project → Milestone → Result. Tasks ("actions") link to any node via
-- tasks.project_node_id. Idempotent.

create table if not exists project_nodes (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  kind          text not null,                 -- 'project' | 'milestone' | 'result'
  parent_id     uuid references project_nodes(id) on delete cascade,
  sort_order    integer not null default 100,
  is_archived   boolean not null default false,
  created_by_id uuid references employees(id) on delete set null,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index if not exists project_nodes_parent_idx on project_nodes(parent_id);
create index if not exists project_nodes_kind_idx on project_nodes(kind, is_archived);

alter table tasks add column if not exists project_node_id uuid references project_nodes(id) on delete set null;
create index if not exists tasks_project_node_idx on tasks(project_node_id);

------------------------------------------------------------------------
-- RLS — any authenticated user can read/create/update the project tree
-- (small team; org structure is collaborative). No hard delete — archive.
------------------------------------------------------------------------
alter table project_nodes enable row level security;

drop policy if exists "project_nodes_read_authenticated"   on project_nodes;
drop policy if exists "project_nodes_insert_authenticated" on project_nodes;
drop policy if exists "project_nodes_update_authenticated" on project_nodes;

create policy "project_nodes_read_authenticated"
  on project_nodes for select to authenticated using (true);
create policy "project_nodes_insert_authenticated"
  on project_nodes for insert to authenticated with check (true);
create policy "project_nodes_update_authenticated"
  on project_nodes for update to authenticated using (true) with check (true);

revoke delete on project_nodes from authenticated;
revoke delete on project_nodes from anon;
