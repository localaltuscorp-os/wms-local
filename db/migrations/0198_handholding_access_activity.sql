-- Hand-holding · Access Activity.
--
-- The log the Access / Permissions dialog lists: who was added, edited or
-- deleted, in which section, and when. One row per entry; the Manage column
-- deletes the row, nothing else.

CREATE TABLE IF NOT EXISTS hh_access_activity (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role        text NOT NULL,          -- admin | hr | ruchita
  module      text NOT NULL,          -- handholding | ambassadors | development
  section     text NOT NULL,          -- employees | interns | ...
  person_name text NOT NULL,
  action      text NOT NULL,          -- add | edit | delete | view
  occurred_on date NOT NULL,
  day         text NOT NULL,          -- mon..sun, as chosen in the Day field
  occurred_at timestamptz NOT NULL DEFAULT now(),
  description text,
  created_by  uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS hh_access_activity_role_idx ON hh_access_activity (role, occurred_at DESC);
