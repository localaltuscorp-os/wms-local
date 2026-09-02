-- WS-5 (Phase D) — flag staff who work OUTSIDE the office; drives the Monday
-- attendance-confirmation queues (manager confirms reports, accountant confirms
-- managers). Additive + idempotent. The reader (lib/attendance/confirmations.ts
-- outsideOfficeIds) is FAIL-OPEN, so the app runs unchanged before this is
-- applied; the feature is inert until MONDAY_CONFIRM_UI is flipped on.

alter table employees
  add column if not exists works_outside_office boolean not null default false;
