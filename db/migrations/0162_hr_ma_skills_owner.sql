-- 0162 — HR Management-Assessment upgrade: Skills Master + HR assignment owner.
-- ADDITIVE + idempotent.
--   (1) skill_lookups — admin-extensible dropdown options for the MA skills
--       capture. `kind` = 'technical' | 'non_technical'; base options live in
--       code (lib/hr/skills.ts). Soft-delete via `active`. Mirrors goal_lookups.
--   (2) org_settings.hr_assignment_owner_id — the employee who receives the
--       auto-created task when an HR assignment is dispatched (Rutvisha by
--       default; the apply script best-effort seeds it).

create table if not exists skill_lookups (
  id uuid primary key default gen_random_uuid(),
  kind text not null,
  value text not null,
  active boolean not null default true,
  sort_order integer default 100,
  created_by_id uuid references employees(id) on delete set null,
  created_at timestamptz not null default now()
);

-- One row per (kind, value) case-insensitively — so a skill can't be added twice.
create unique index if not exists skill_lookups_kind_value_uidx
  on skill_lookups (kind, lower(value));
create index if not exists skill_lookups_kind_idx on skill_lookups (kind);

-- HR assignment owner (nullable FK → employees.id; NULL = resolve by name at read).
alter table org_settings
  add column if not exists hr_assignment_owner_id uuid references employees(id) on delete set null;
