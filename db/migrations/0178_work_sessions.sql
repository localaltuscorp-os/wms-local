-- 0178 — Project-remote work sessions (worker types Phase 2). Accountability
-- only; project workers are paid a fixed fee so sessions never feed payroll.
-- Idempotent + additive; feature stays dormant behind PROJECT_REMOTE_OFF.

CREATE TABLE IF NOT EXISTS work_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL,
  ended_at timestamptz,
  source text NOT NULL,
  meet_space_id text,
  meet_conference_record text,
  meet_participant text,
  total_minutes numeric(8,2),
  screenshot_count integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ws_emp_started_idx ON work_sessions(employee_id, started_at);
CREATE INDEX IF NOT EXISTS ws_status_idx ON work_sessions(status);

CREATE TABLE IF NOT EXISTS work_session_shots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES work_sessions(id) ON DELETE CASCADE,
  path text NOT NULL,
  taken_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wss_session_idx ON work_session_shots(session_id);
