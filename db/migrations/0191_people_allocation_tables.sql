-- 0191 — Hand-holding: the tables the module stands on.
--
-- This REPLACES the earlier 0191_people_allocation_reset, which created these
-- same four tables but opened with two unguarded statements:
--
--   DELETE FROM billing_allocation_scope;
--   DELETE FROM billing_people_allocation;
--
-- That was written for a local reset, where emptying a superseded table costs
-- nothing. Against production it is destructive and unrecoverable: the rows are
-- live, and nothing in the migration puts them back. Retiring that data is a
-- decision to take deliberately, against a backup — not a side effect of
-- creating an unrelated table. The DELETEs are gone and the billing tables are
-- left untouched; Hand-holding never reads them.
--
-- Everything below is create-if-not-exists, so this is safe on a database where
-- the tables already exist and safe on one where they do not.
--
--   pa_clients      — the client roster, each in exactly one category. Retainer
--                     clients additionally carry a start/end date, which is why
--                     those columns live here rather than on the allocation.
--   pa_people       — who can hold clients. Either a link to an employee (picked
--                     from the roster) or a free-typed name: `name` is always the
--                     display value, `employee_id` the optional link back.
--   pa_allocations  — the many-to-many join. UNIQUE(person, client) so one client
--                     cannot be counted twice for one person, which would
--                     silently inflate every total on the page.
--   pa_ambassadors  — deliberately its OWN table with no link to clients or
--                     categories: the brief is explicit that ambassadors must
--                     not mix with the four sections.

CREATE TABLE IF NOT EXISTS pa_clients (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  -- ps | bss | retainer | ecosystem
  category    text NOT NULL,
  start_date  date,
  end_date    date,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pa_clients_category_idx ON pa_clients (category, name);

CREATE TABLE IF NOT EXISTS pa_people (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  is_active   boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);
-- One row per roster employee; free-typed people are unconstrained.
CREATE UNIQUE INDEX IF NOT EXISTS pa_people_employee_idx ON pa_people (employee_id) WHERE employee_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS pa_allocations (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id  uuid NOT NULL REFERENCES pa_people(id) ON DELETE CASCADE,
  client_id  uuid NOT NULL REFERENCES pa_clients(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (person_id, client_id)
);
CREATE INDEX IF NOT EXISTS pa_allocations_person_idx ON pa_allocations (person_id);

CREATE TABLE IF NOT EXISTS pa_ambassadors (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name       text NOT NULL,
  email      text,
  phone      text,
  notes      text,
  is_active  boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
