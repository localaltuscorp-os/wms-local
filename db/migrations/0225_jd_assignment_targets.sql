-- 0225 — Job Description assignments become PER DESTINATION.
--
-- The JD form now has three boxes: Daily Compliance Checklist, Work Management
-- System and Event Checklist, each with its own list of people. An assignment
-- therefore has to say WHICH destination it is for — "Dattaram does this job"
-- is no longer a complete answer when the job goes to three places and he only
-- covers one of them.
--
-- THREE FLAGS ON ONE ROW, not one row per destination. A person who does the
-- job for two destinations is one assignment with two flags, so the existing
-- partial unique index on (jd_id, employee_id) WHERE is_active still holds —
-- and that index is what stops somebody being assigned twice and receiving the
-- same task twice. One row per destination would have required dropping it.
--
-- Idempotent: this repository applies migrations by hand, and a migration that
-- cannot be run twice gets run twice.

alter table jd_assignments
  add column if not exists for_dcc   boolean not null default false,
  add column if not exists for_wms   boolean not null default false,
  add column if not exists for_event boolean not null default false;

-- Existing rows were written before destinations were separable: they meant
-- "this person does this job", full stop. They inherit whichever destinations
-- the JD itself pushes to, which is what that used to mean in practice.
--
-- Guarded on all-three-false so a re-run cannot undo a real edit made after the
-- first run.
update jd_assignments a
   set for_dcc   = e.push_dcc,
       for_wms   = e.push_wms,
       for_event = e.push_event
  from jd_entries e
 where e.id = a.jd_id
   and a.for_dcc = false
   and a.for_wms = false
   and a.for_event = false;

-- Reading "who is assigned for the DCC" is the query the push job will run once
-- per JD per day, so it is worth an index rather than a scan per row.
create index if not exists jd_assignments_target_idx
  on jd_assignments (jd_id, is_active, for_dcc, for_wms, for_event);
