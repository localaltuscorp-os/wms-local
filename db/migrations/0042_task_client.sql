-- Client as a first-class task field.
--
-- Until now "client" had no column: imported tasks stashed it in the
-- free-text `notes` as "Client/Participant: X", while form-created tasks
-- overloaded `title` (the form's "Client Name" field writes to title). That
-- made client-wise sorting/grouping impossible. This migration promotes
-- client to its own column, backfills from both sources, and normalises the
-- casing against the canonical `clients` roster ("Altus corp" -> "Altus Corp").
--
-- Idempotent: add-column-if-not-exists + re-runnable backfill (only fills
-- NULLs / fixes casing), so applying twice is a no-op.

alter table tasks
  add column if not exists client text;

-- 1. Backfill imported tasks: pull the value after "Client/Participant:" up to
--    the first newline. Only touch rows still NULL so re-runs don't clobber
--    later manual edits.
update tasks
set client = nullif(btrim(split_part(
      substring(notes from 'Client/Participant:(.*)'), E'\n', 1)), '')
where client is null
  and notes ilike 'Client/Participant:%';

-- 2. Backfill form-created tasks (no legacy key): their title IS the client.
update tasks
set client = nullif(btrim(title), '')
where client is null
  and legacy_import_key is null;

-- 3. Drop junk placeholders ("-", whitespace) left by the import.
update tasks
set client = null
where client is not null
  and btrim(client) in ('-', '');

-- 4. Normalise casing to the canonical roster name so the same client doesn't
--    fragment into "Altus Corp" / "Altus corp" groups.
update tasks t
set client = c.name
from clients c
where t.client is not null
  and lower(t.client) = lower(c.name)
  and t.client <> c.name;

-- 5. Fold any client value not yet in the roster into it, so the picker and
--    any future client filter stay in sync with what's actually on tasks.
insert into clients (name)
  select distinct btrim(client) from tasks
  where client is not null and btrim(client) <> ''
on conflict (name) do nothing;

-- 6. Index for the sort/group/filter paths.
create index if not exists tasks_client_idx on tasks(client);
