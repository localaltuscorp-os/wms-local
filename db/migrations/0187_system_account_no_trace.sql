-- SYSTEM ACCOUNTS LEAVE NO AUDIT TRAIL (Sir, 2026-08).
--
-- The admin Activity page unions task_events + employee_events + settings_events.
-- Those three tables are written from 56 different call sites, so filtering at
-- each one would be fragile and a future insert would silently start leaking.
-- Instead the rule lives in the DATABASE: a BEFORE INSERT trigger that returns
-- NULL — which skips the insert — whenever the row's actor (or, for
-- employee_events, its subject) is an account_type = 'system' row.
--
-- Safe because no event insert in the codebase uses .returning(), so nothing
-- depends on getting a row back. Verified by grep before writing this.
--
-- Keyed on account_type, NOT on an email address, so no address is baked into
-- the schema and any future hidden account inherits the behaviour.

CREATE OR REPLACE FUNCTION skip_system_account_events() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  j jsonb := to_jsonb(NEW);
  actor text := j->>'actor_id';
  subject text := j->>'employee_id';
BEGIN
  IF actor IS NULL AND subject IS NULL THEN
    RETURN NEW;
  END IF;
  IF EXISTS (
    SELECT 1 FROM employees e
     WHERE e.account_type = 'system'
       AND e.id::text IN (COALESCE(actor, ''), COALESCE(subject, ''))
  ) THEN
    RETURN NULL;  -- silently drop: the action happens, the trace does not
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_skip_system_events ON task_events;
CREATE TRIGGER trg_skip_system_events BEFORE INSERT ON task_events
  FOR EACH ROW EXECUTE FUNCTION skip_system_account_events();

DROP TRIGGER IF EXISTS trg_skip_system_events ON employee_events;
CREATE TRIGGER trg_skip_system_events BEFORE INSERT ON employee_events
  FOR EACH ROW EXECUTE FUNCTION skip_system_account_events();

DROP TRIGGER IF EXISTS trg_skip_system_events ON settings_events;
CREATE TRIGGER trg_skip_system_events BEFORE INSERT ON settings_events
  FOR EACH ROW EXECUTE FUNCTION skip_system_account_events();
