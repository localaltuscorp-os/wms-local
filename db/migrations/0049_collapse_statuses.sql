-- 0049 — sir's changes (2026-06-08) #2/#4/#6: simplify the status model.
--   #2  Collapse the granular follow_up_1/2/3 back into a single follow_up.
--   #4  Retire the `transferred` status/feature.
--   #6  Retire the `cancelled` status/feature (Archive replaces it).
--
-- Data-only and IDEMPOTENT — safe to run more than once. No enum changes: the
-- physical task_status / approval_status enums KEEP their values so any row we
-- miss still renders (see the migration-journal-out-of-sync workflow — this is
-- applied via scripts/apply-collapse-statuses.ts, not `pnpm db:migrate`).

-- (1) Collapse the granular follow-ups into the single follow_up status.
update tasks
   set status = 'follow_up'
 where status in ('follow_up_1', 'follow_up_2', 'follow_up_3');

-- (2) Retire transferred + cancelled: archive those tasks (recoverable via the
--     Archived column / unarchive) rather than leaving them on a dead status.
update tasks
   set archived = true
 where archived = false
   and (status in ('transferred', 'cancelled')
        or approval_status in ('transferred', 'cancelled'));

-- (3) Clear any dead approval verdict so it drops out of the approved /
--     not_approved counts. The working `status` is left as a historical record
--     of why the task was archived.
update tasks
   set approval_status = null
 where approval_status in ('transferred', 'cancelled');
