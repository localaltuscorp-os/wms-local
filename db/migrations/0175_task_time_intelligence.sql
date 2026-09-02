-- 0175 · Task Time Intelligence
-- Event-sourced active-working-time engine for WMS tasks. Append-only event log
-- (task_time_events) + projections (task_work_sessions, task_time_rollup) +
-- camera monitoring (task_work_snapshots, task_time_consent). Idempotent.

-- ── Event log (source of truth, immutable) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS task_time_events (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id     uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  actor_id    uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  doer_id     uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  kind        text NOT NULL,
  revision    integer NOT NULL DEFAULT 1,
  at          timestamptz NOT NULL DEFAULT now(),
  session_id  uuid,
  meta        jsonb,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS task_time_events_task_at_idx  ON task_time_events (task_id, at);
CREATE INDEX IF NOT EXISTS task_time_events_doer_at_idx  ON task_time_events (doer_id, at);
CREATE INDEX IF NOT EXISTS task_time_events_kind_idx     ON task_time_events (kind);
CREATE INDEX IF NOT EXISTS task_time_events_session_idx  ON task_time_events (session_id);

-- ── Session ledger (projection; frozen once ended) ──────────────────────────
CREATE TABLE IF NOT EXISTS task_work_sessions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id          uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  doer_id          uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  revision         integer NOT NULL DEFAULT 1,
  started_at       timestamptz NOT NULL,
  ended_at         timestamptz,
  duration_seconds integer,
  end_reason       text,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS task_work_sessions_task_started_idx ON task_work_sessions (task_id, started_at);
CREATE INDEX IF NOT EXISTS task_work_sessions_doer_started_idx ON task_work_sessions (doer_id, started_at);
CREATE INDEX IF NOT EXISTS task_work_sessions_live_idx         ON task_work_sessions (doer_id) WHERE ended_at IS NULL;

-- ── Per-task rollup (projection) ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_time_rollup (
  task_id               uuid PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
  total_active_seconds  integer NOT NULL DEFAULT 0,
  original_seconds      integer NOT NULL DEFAULT 0,
  revision_seconds      integer NOT NULL DEFAULT 0,
  session_count         integer NOT NULL DEFAULT 0,
  pause_count           integer NOT NULL DEFAULT 0,
  rejection_count       integer NOT NULL DEFAULT 0,
  current_revision      integer NOT NULL DEFAULT 1,
  longest_session_sec   integer NOT NULL DEFAULT 0,
  shortest_session_sec  integer,
  first_started_at      timestamptz,
  last_done_at          timestamptz,
  approved_at           timestamptz,
  open_session_count    integer NOT NULL DEFAULT 0,
  updated_at            timestamptz NOT NULL DEFAULT now()
);

-- ── Camera monitoring (super-admin-only) ────────────────────────────────────
CREATE TABLE IF NOT EXISTS task_work_snapshots (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id   uuid NOT NULL REFERENCES task_work_sessions(id) ON DELETE CASCADE,
  task_id      uuid NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  doer_id      uuid NOT NULL REFERENCES employees(id) ON DELETE RESTRICT,
  storage_path text NOT NULL,
  captured_at  timestamptz NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS task_work_snapshots_session_idx ON task_work_snapshots (session_id, captured_at);
CREATE INDEX IF NOT EXISTS task_work_snapshots_doer_idx    ON task_work_snapshots (doer_id, captured_at);

CREATE TABLE IF NOT EXISTS task_time_consent (
  employee_id    uuid PRIMARY KEY REFERENCES employees(id) ON DELETE CASCADE,
  consented_at   timestamptz NOT NULL DEFAULT now(),
  policy_version text NOT NULL
);
