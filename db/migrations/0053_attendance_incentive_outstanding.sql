-- 0053 — attendance_logs + incentive_requests + outstanding_entries/followups
-- Ports the three remaining Altus Ecosystem modules into the WMS as native
-- tables (the Ecosystem versions lived in Google Sheets / a GAS web app).
-- Additive + idempotent: safe to re-run.

-- ── Attendance ──────────────────────────────────────────────────────────────
-- One row per punch. log_date is the calendar day in the employee's own
-- timezone (computed server-side); UNIQUE (employee, day, kind) = one
-- check-in + one check-out per day.
CREATE TABLE IF NOT EXISTS attendance_logs (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  log_date    date NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('in','out')),
  logged_at   timestamptz NOT NULL DEFAULT now(),
  note        text
);

CREATE UNIQUE INDEX IF NOT EXISTS attendance_logs_employee_day_kind_uq
  ON attendance_logs (employee_id, log_date, kind);
CREATE INDEX IF NOT EXISTS attendance_logs_date_idx
  ON attendance_logs (log_date);
CREATE INDEX IF NOT EXISTS attendance_logs_employee_date_idx
  ON attendance_logs (employee_id, log_date);

-- ── Incentive requests ──────────────────────────────────────────────────────
-- Four request shapes (BSS Conversion / Sales Pitch / Client Happiness /
-- Group Introduction); per-type fields in `details` jsonb, validated at the
-- action layer against lib/incentive-fields.ts.
CREATE TABLE IF NOT EXISTS incentive_requests (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  type          text NOT NULL CHECK (type IN
                  ('bss_conversion','sales_pitch','client_happiness','group_intro')),
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN
                  ('pending','approved','rejected')),
  details       jsonb NOT NULL DEFAULT '{}'::jsonb,
  decided_by_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  decided_at    timestamptz,
  decision_note text,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS incentive_requests_employee_created_idx
  ON incentive_requests (employee_id, created_at);
CREATE INDEX IF NOT EXISTS incentive_requests_status_created_idx
  ON incentive_requests (status, created_at);

-- ── Outstanding tracker ─────────────────────────────────────────────────────
-- Receivables ledger. Entries are admin-managed; any user logs follow-ups
-- (note + optional payment), which roll up into amount_received and
-- auto-advance status open → partial → paid. written_off is an explicit
-- admin verdict.
CREATE TABLE IF NOT EXISTS outstanding_entries (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client          text NOT NULL,
  particulars     text,
  amount          numeric(14,2) NOT NULL CHECK (amount >= 0),
  amount_received numeric(14,2) NOT NULL DEFAULT 0 CHECK (amount_received >= 0),
  due_date        date,
  status          text NOT NULL DEFAULT 'open' CHECK (status IN
                    ('open','partial','paid','written_off')),
  owner_id        uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_by_id   uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS outstanding_entries_status_due_idx
  ON outstanding_entries (status, due_date);
CREATE INDEX IF NOT EXISTS outstanding_entries_client_idx
  ON outstanding_entries (client);

CREATE TABLE IF NOT EXISTS outstanding_followups (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id        uuid NOT NULL REFERENCES outstanding_entries(id) ON DELETE CASCADE,
  actor_id        uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  note            text NOT NULL,
  promised_date   date,
  amount_received numeric(14,2) CHECK (amount_received IS NULL OR amount_received >= 0),
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS outstanding_followups_entry_created_idx
  ON outstanding_followups (entry_id, created_at);
