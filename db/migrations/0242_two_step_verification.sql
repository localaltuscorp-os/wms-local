-- 0242 — two-step sign-in by emailed code
--
-- After the password is accepted, a 6-digit code is emailed to the person and
-- must be entered before a session is issued. Once entered, that browser is not
-- asked again until the next midnight IST (a signed cookie carries that; see
-- lib/auth/two-step-pass.ts). These tables are the server's record:
--
--   two_step_challenges    every code sent. The code and the browser's handle
--                          are stored HASHED; the plain code only exists in
--                          the email.
--   two_step_verifications who verified, when, from which IP / browser, and
--                          until when. Audit only — nothing in the app shows it
--                          yet.
--
-- ADDITIVE ONLY: two new tables, no change to any existing one. Apply BEFORE
-- deploying the code — the sign-in route writes to these tables, and a missing
-- table would stop everyone signing in.
--
-- Numbered 0242 because 0237/0238 are taken twice already and Om's branch holds
-- 0240/0241.

CREATE TABLE IF NOT EXISTS two_step_challenges (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id  uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  token_hash   text NOT NULL,
  code_hash    text NOT NULL,
  expires_at   timestamptz NOT NULL,
  attempts     integer NOT NULL DEFAULT 0,
  consumed_at  timestamptz,
  ip           text,
  user_agent   text,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS two_step_challenges_token_uniq
  ON two_step_challenges (token_hash);

-- The send throttle's query: codes sent to this person in the last N minutes.
CREATE INDEX IF NOT EXISTS two_step_challenges_employee_created_idx
  ON two_step_challenges (employee_id, created_at);

CREATE TABLE IF NOT EXISTS two_step_verifications (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id   uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  email         text NOT NULL,
  method        text NOT NULL DEFAULT 'email',
  challenge_id  uuid REFERENCES two_step_challenges(id) ON DELETE SET NULL,
  verified_at   timestamptz NOT NULL DEFAULT now(),
  valid_until   timestamptz NOT NULL,
  ip            text,
  user_agent    text
);

CREATE INDEX IF NOT EXISTS two_step_verifications_employee_idx
  ON two_step_verifications (employee_id, verified_at);

-- Record in the ledger the runner reads.
CREATE TABLE IF NOT EXISTS __schema_applied (
  filename    text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO __schema_applied (filename) VALUES ('0242_two_step_verification.sql')
ON CONFLICT DO NOTHING;
