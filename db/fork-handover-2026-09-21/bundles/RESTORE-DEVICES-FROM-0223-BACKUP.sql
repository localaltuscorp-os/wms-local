-- ===========================================================================
--  RESTORE mobile_devices FROM THE 0223 BACKUP
--
--  Puts back every device row that Part 2 of RUN-IN-SUPABASE-0215-0224-ALL.sql
--  deleted, from the copy it took first (mobile_devices_pre_0223).
--
--  WHAT THIS UNDOES, so it is a decision and not a surprise. The wipe is the
--  point of first-login registration: `enroll()` has written a row on first
--  sight of ANY browser since the device gate shipped, and auto-adopt marked
--  those `approved` with nobody present. So a restored "approved" row means
--  "this browser turned up once", not "this person registered this machine" --
--  plus the duplicates DEVICE_LOCK_AUDIT.md documents. Restoring means nobody
--  is asked to register, and the roster reads as already-registered.
--
--  That is a fine trade if the goal is that people keep working today. It is
--  the wrong one if the goal was to rebuild the device list honestly. Run
--  Part 2 again later to redo the wipe -- but DROP the backup table first, or
--  its own guard will skip it (see the bottom of this file).
--
--  ── SAFE TO RUN TWICE ────────────────────────────────────────────────────
--  One statement, so it is atomic on its own -- no BEGIN/COMMIT needed, and
--  none wanted: a trailing COMMIT returns no rows, and the Supabase editor
--  shows only the LAST result set, which would hide the report.
--
--  Rows already present are skipped by id, so a second run restores nothing
--  and reports 0.
--
--  ── WHAT IT DELIBERATELY SKIPS ───────────────────────────────────────────
--  Five guards, each protecting a constraint the restore would otherwise trip.
--  A skipped row stays in the backup table; nothing is lost either way.
--
--   1. id already live          -- re-run safety.
--   2. device_id already live   -- somebody re-registered from that same
--      browser since the wipe. THEIR NEW ROW WINS. It is the one their cookie
--      actually points at, and mobile_devices_device_id_uq allows only one.
--   3. the employee is gone     -- employee_id is a FK; a row for a deleted
--      employee cannot be inserted at all.
--   4. they already hold an approved device of that kind. 0215 put back the
--      one-approved-laptop-AND-one-approved-phone rule as a partial unique
--      index, with a trigger raising the readable error. A device registered
--      since the wipe occupies that slot, and the old row cannot also have it.
--   5. that laptop serial is already live -- 0222's unique index on
--      lower(device_name) for laptops, which exists so one physical machine
--      cannot be registered under two accounts.
--
--  Guards 2, 4 and 5 only ever match if somebody signed in between the wipe
--  and this restore. Minutes after the wipe, expect zero of them.
--
--  ── NO SEQUENCE TO RE-SYNC ───────────────────────────────────────────────
--  The handoffs warn that restoring a table leaves its id counter behind the
--  rows, so the next insert dies on a duplicate key. That does not apply here:
--  mobile_devices.id is `uuid primary key default gen_random_uuid()`, not a
--  serial. There is no counter. (Check before assuming the same of any other
--  table you restore -- most of this schema does use sequences.)
-- ===========================================================================


-- ── LOOK FIRST (optional) ─────────────────────────────────────────────────
-- Run this on its own to see what the restore will do before doing it.
--
-- select (select count(*) from mobile_devices_pre_0223) as in_backup,
--        (select count(*) from mobile_devices)          as live_now,
--        (select count(*) from mobile_devices_pre_0223 b
--          where exists (select 1 from mobile_devices m
--                         where m.device_id = b.device_id))
--                                                       as would_skip_device_id,
--        (select count(*) from mobile_devices_pre_0223 b
--          where not exists (select 1 from employees e where e.id = b.employee_id))
--                                                       as would_skip_no_employee;


-- ── THE RESTORE ───────────────────────────────────────────────────────────
-- `b.*` rather than a named column list ON PURPOSE. The backup was created as
-- CREATE TABLE ... AS SELECT * FROM mobile_devices, so its columns are the live
-- table's columns in the live table's own physical order -- which a hand-typed
-- list would have to guess at, and would silently mis-map if it guessed wrong.
-- The backup was also taken AFTER Part 1, so it already carries device_name
-- rather than bios_serial_number: the two tables are the same shape.

with restored as (
  insert into mobile_devices
  select b.*
  from mobile_devices_pre_0223 b
  where
    -- 1. not already back
    not exists (select 1 from mobile_devices m where m.id = b.id)
    -- 2. that browser re-registered since the wipe; the live row wins
    and not exists (select 1 from mobile_devices m where m.device_id = b.device_id)
    -- 3. the employee still exists (FK)
    and exists (select 1 from employees e where e.id = b.employee_id)
    -- 4. the approved slot for this kind is free
    and (
      b.status <> 'approved'
      or not exists (
        select 1 from mobile_devices m
        where m.employee_id = b.employee_id
          and m.kind = b.kind
          and m.status = 'approved'
      )
    )
    -- 5. that laptop serial is not already live
    and (
      b.kind <> 'laptop'
      or b.device_name is null
      or not exists (
        select 1 from mobile_devices m
        where m.kind = 'laptop'
          and lower(m.device_name) = lower(b.device_name)
      )
    )
  returning id
)
select (select count(*) from restored)                as rows_restored,
       (select count(*) from mobile_devices_pre_0223) as rows_in_backup,
       -- The snapshot BEFORE this statement: a data-modifying CTE's siblings do
       -- not see its own inserts. Read it as "what was live when I started".
       (select count(*) from mobile_devices)          as live_rows_before,
       (select count(*) from mobile_devices_pre_0223) -
       (select count(*) from restored)                as left_behind_see_guards;


-- ── CONFIRM (run on its own afterwards) ───────────────────────────────────
-- live should now equal backup, unless a guard skipped something.
--
-- select (select count(*) from mobile_devices)                        as live,
--        (select count(*) from mobile_devices_pre_0223)               as backup,
--        (select count(*) from mobile_devices where status='approved') as approved;


-- ── IF YOU LATER WANT THE WIPE AFTER ALL ──────────────────────────────────
-- Part 2 does nothing while the backup table exists -- that guard is what stops
-- a second paste of the big file from wiping devices people just registered. To
-- redo the wipe deliberately, take a fresh copy under a new name first, then
-- drop the old backup and re-run Part 2:
--
--   create table mobile_devices_pre_0223_v2 as select * from mobile_devices;
--   drop table mobile_devices_pre_0223;
--   -- then re-run PART 2 of db/RUN-IN-SUPABASE-0215-0224-ALL.sql
