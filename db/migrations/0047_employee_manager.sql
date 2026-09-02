-- Direct-manager relationship for the approval hierarchy. Nullable self-FK —
-- each employee's single direct manager. ON DELETE SET NULL so removing a
-- manager doesn't cascade-delete their reports. Additive + idempotent.

alter table employees
  add column if not exists manager_id uuid references employees(id) on delete set null;
