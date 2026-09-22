-- 0234 · FUNCTIONS REPLACE DEPARTMENTS
--
-- The organisational attribute on an employee is called a FUNCTION, not a
-- department. Employee Master has shown it that way since 0225 ("FUNCTION —
-- this is the DEPARTMENT record, relabelled"); this migration makes the data
-- match the word, everywhere.
--
-- ── WHAT MOVES, AND WHAT STAYS ─────────────────────────────────────────────
-- The `functions` table (created empty by 0225 and never used) becomes the live
-- master, holding the SAME ROWS WITH THE SAME IDS as `departments`. Because the
-- ids are preserved, every `department_id` already stored on an employee keeps
-- pointing at the same organisational unit — nothing is re-assigned, and no
-- screen changes what it says.
--
-- `departments` is KEPT, with all of its rows, as a BACKUP. Nothing reads or
-- writes it after this migration. It is deliberately not dropped: it is the
-- record of what the Function list looked like before the move.
--
-- ── IT ALSO REPAIRS 19 EMPLOYEES WHOSE FUNCTION WAS INVISIBLE ──────────────
-- 19 of 26 employees carry a `department_id` that exists in NO table — six
-- distinct ids left behind by a restore that loaded rows with foreign-key
-- triggers disabled (which is also why the constraint still reports itself as
-- valid). Their Function rendered as "—" on every screen, including Employee
-- Master.
--
-- Every one is recoverable, because the legacy free-text `employees.department`
-- column still holds the name and each broken id maps to exactly ONE name. So
-- they are remapped by name rather than nulled, and 19 people get their Function
-- back.
--
-- ── employee_departments IS CLEANED, NOT REPAIRED ──────────────────────────
-- The multi-Function join table has the same damage — 48 of its 75 rows point
-- at ids that exist nowhere — but there it is NOT recoverable: the same broken
-- id appears against employees of three different legacy departments, so a name
-- cannot be inferred. Those rows are deleted rather than guessed at.
--
-- Deleting them changes nothing a user can see. `getEmployeeDepartmentMap()`
-- (lib/queries/departments.ts) reads this table with an INNER JOIN onto the
-- master, so a row whose id resolves to nothing already contributes nothing to
-- any screen. What is removed is invisible today and would only have blocked
-- the foreign key below.

-- ── 1 · Copy the master, ids and all ─────────────────────────────────────────

insert into functions (id, name, is_active, sort_order, created_at, updated_at)
select d.id, d.name, d.is_active, d.sort_order, d.created_at, d.updated_at
from departments d
on conflict (id) do nothing;

-- ── 2 · Give 19 employees their Function back ────────────────────────────────

update employees e
set department_id = f.id
from functions f
where e.department_id is not null
  and not exists (select 1 from functions x where x.id = e.department_id)
  and e.department is not null
  and lower(btrim(e.department)) = lower(f.name);

-- Anything still dangling had no legacy name to recover from. Null it rather
-- than leave a value that points at nothing — the column is nullable, and "no
-- Function recorded" is honest where "a Function that does not exist" is not.
update employees
set department_id = null
where department_id is not null
  and not exists (select 1 from functions f where f.id = employees.department_id);

-- ── 3 · Clear the unrecoverable join rows (see the header) ───────────────────

delete from employee_departments ed
where not exists (select 1 from functions f where f.id = ed.department_id);

-- ── 4 · Point the foreign keys at the live master ────────────────────────────
--
-- The column NAMES stay `department_id`. Renaming them would touch ~1,289
-- identifiers across ~180 files for no behavioural gain, and the constraint is
-- what decides which table the value must exist in.

alter table employees
  drop constraint if exists employees_department_id_fkey;
alter table employees
  add constraint employees_department_id_fkey
  foreign key (department_id) references functions(id) on delete set null;

alter table employee_departments
  drop constraint if exists employee_departments_department_id_fkey;
alter table employee_departments
  add constraint employee_departments_department_id_fkey
  foreign key (department_id) references functions(id) on delete cascade;

alter table jd_positions
  drop constraint if exists jd_positions_department_id_fkey;
alter table jd_positions
  add constraint jd_positions_department_id_fkey
  foreign key (department_id) references functions(id) on delete set null;

-- ── 5 · The name stays unique, case-insensitively ────────────────────────────
--
-- `departments.name` carried a plain UNIQUE constraint; `functions` already has
-- a case-insensitive unique index (0225), which is stricter: it stops "Sales"
-- and "sales" both existing and splitting a filter in two.

create unique index if not exists functions_name_uq on functions (lower(name));

create index if not exists functions_active_idx on functions (is_active, sort_order);
