-- ════════════════════════════════════════════════════════════════════════════
-- 0247 — let the append-only activity_logs trigger pass FK "set null" actions
--
-- WHY
--   0245 made activity_logs immutable with a `before update or delete` trigger
--   that raises on every write. But the table also carries two foreign keys with
--   ON DELETE SET NULL: employee_id (→ employees) and daily_session_id
--   (→ daily_sessions). Deleting an employee therefore issues
--
--       UPDATE activity_logs SET employee_id = NULL WHERE employee_id = …
--
--   which the trigger refuses with "activity_logs is append-only" — so
--   `deleteEmployee` fails for anyone who has ever produced a log row (i.e.
--   everyone). The delete never reaches the employees row; the whole transaction
--   rolls back. Same trap when daily_sessions cascade on that delete.
--
--   That UPDATE is not a mutation of the record — it is anonymisation, the exact
--   thing the set-null action exists to do. This migration teaches the trigger
--   the difference, so deletes work again while every other write stays refused.
--
-- Idempotent: create-or-replace + the trigger still calls the function by name.
-- ════════════════════════════════════════════════════════════════════════════

create or replace function activity_logs_no_mutate() returns trigger as $$
begin
  -- Permit ONLY the referential set-null. Every column other than the two FKs is
  -- byte-identical, and each FK column is either left alone or cleared to NULL —
  -- never repointed at a value. The two set-null actions fire separately (one
  -- UPDATE for employee_id, one for daily_session_id), so each must pass while
  -- the other column still holds its value.
  if tg_op = 'UPDATE'
     and (to_jsonb(old) - 'employee_id' - 'daily_session_id')
         = (to_jsonb(new) - 'employee_id' - 'daily_session_id')
     and (new.employee_id is null or old.employee_id is not distinct from new.employee_id)
     and (new.daily_session_id is null or old.daily_session_id is not distinct from new.daily_session_id)
  then
    return new;
  end if;
  raise exception 'activity_logs is append-only (no UPDATE, no DELETE)';
end;
$$ language plpgsql;
