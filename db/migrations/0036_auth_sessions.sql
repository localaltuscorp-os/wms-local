-- 0036 — auth_sessions
-- Tracks issued __session cookies so /profile Identity tab can list and
-- revoke individually. Written by /api/auth/session on mint; updated by
-- middleware on each request (debounced — see lib/profile/sessions-track.ts).

CREATE TABLE IF NOT EXISTS auth_sessions (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  firebase_uid  text NOT NULL,
  session_hash  text NOT NULL UNIQUE,                  -- hash of the cookie value; never raw
  created_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at  timestamptz NOT NULL DEFAULT now(),
  user_agent    text,
  ip_hash       text,                                  -- sha256(ip + COOKIE_SECRET); not raw IP
  country       text,                                  -- one-shot geo at create-time
  city          text,
  revoked_at    timestamptz
);

CREATE INDEX IF NOT EXISTS auth_sessions_employee_idx
  ON auth_sessions (employee_id, revoked_at, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS auth_sessions_firebase_uid_idx
  ON auth_sessions (firebase_uid);
