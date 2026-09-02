-- 0140 — Attendance discipline notes (admin note/reason per employee + month on
-- the read-only analytics page). ADDITIVE + idempotent. Never affects pay.

create table if not exists attendance_discipline_notes (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  month text not null,              -- 'YYYY-MM'
  note text,
  updated_by_id uuid references employees(id) on delete set null,
  updated_at timestamptz not null default now()
);

create unique index if not exists attendance_discipline_notes_uq
  on attendance_discipline_notes (employee_id, month);
