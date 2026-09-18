-- 0236 — account lockout after consecutive failed sign-ins
--
-- Locks an account after MAX_FAILED_ATTEMPTS (5) consecutive wrong passwords.
-- While locked, the person can neither sign in NOR use Forgot Password; only
-- the four named in lib/auth/unlock-permission.ts can clear it.
--
-- ADDITIVE ONLY. One new table, no change to any existing one. Nothing reads it
-- until the server-side sign-in route ships, so applying this early is safe and
-- is the intended order: migration first, code second. Shipping code that reads
-- a column the database lacks is exactly what caused the 2026-09-09 login
-- outage (see docs/SCHEMA_DRIFT_FIX_2026-09-10.sql).
--
--
-- ── WHY KEYED BY EMAIL, NOT employee_id ────────────────────────────────────
--
-- Failures arrive BEFORE we know who is typing. A wrong password proves only
-- that someone entered an address; it does not authenticate them, and the
-- address may belong to nobody. Keying on employees.id would mean either
-- resolving the address to a row first — which turns every failed attempt into
-- a lookup that leaks existence through timing — or dropping attempts against
-- unknown addresses, which is precisely the traffic worth counting.
--
-- So the key is the raw lower-cased address, and `employee_id` below is a
-- nullable CONVENIENCE for the admin screen, filled in when the address happens
-- to match a row. It is not the identity of this record.
--
--
-- ── WHY NO AUTO-EXPIRY COLUMN ──────────────────────────────────────────────
--
-- A lock ends when a human ends it. There is no `locked_until`, and that is the
-- product decision, not an omission: a timed unlock would let a brute-force
-- attempt simply wait, and the requirement is that the four approve each
-- release. `failed_count` DOES age out — see FAILED_ATTEMPT_WINDOW_MS — but the
-- lock itself does not.

CREATE TABLE IF NOT EXISTS account_lockouts (
  -- Lower-cased at every call site. The application normalises; this is not
  -- enforced by a constraint because a CHECK on lower(email) = email would
  -- reject rows a future importer might legitimately want to repair.
  email           text PRIMARY KEY,

  -- Consecutive failures inside FAILED_ATTEMPT_WINDOW_MS. Reset to 0 by a
  -- successful sign-in and by an unlock.
  failed_count    integer NOT NULL DEFAULT 0,

  -- When the most recent failure landed. Read together with failed_count to
  -- decide whether the window has lapsed and the count should restart.
  last_failed_at  timestamptz,

  -- NULL means NOT LOCKED. This single nullable timestamp is the lock, rather
  -- than a boolean plus a date that can disagree with each other.
  locked_at       timestamptz,

  -- Audit of the last release. Kept after unlocking rather than deleting the
  -- row, so "this account has been locked before" stays answerable — a repeat
  -- lockout is a different conversation from a first one.
  unlocked_at     timestamptz,
  unlocked_by_id  uuid REFERENCES employees(id) ON DELETE SET NULL,

  -- Convenience only; see the note above. SET NULL rather than CASCADE: an
  -- employee leaving must not erase the record that their account was locked.
  employee_id     uuid REFERENCES employees(id) ON DELETE SET NULL,

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- A count cannot be negative, and nothing should be able to write a value that
-- would make remainingAttempts() return a nonsense number.
ALTER TABLE account_lockouts DROP CONSTRAINT IF EXISTS account_lockouts_count_nonneg;
ALTER TABLE account_lockouts ADD CONSTRAINT account_lockouts_count_nonneg
  CHECK (failed_count >= 0);

-- The admin screen's only query: "show me everyone currently locked, newest
-- first". Partial, because locked rows are a handful and unlocked ones are the
-- rest of the table.
CREATE INDEX IF NOT EXISTS account_lockouts_locked_idx
  ON account_lockouts (locked_at DESC)
  WHERE locked_at IS NOT NULL;

-- Supports the admin screen joining back to the employee, and stays small.
CREATE INDEX IF NOT EXISTS account_lockouts_employee_idx
  ON account_lockouts (employee_id)
  WHERE employee_id IS NOT NULL;


-- ── PER-IP THROTTLE ────────────────────────────────────────────────────────
--
-- The per-email counter alone makes a denial-of-service trivial: typing a
-- colleague's address with junk five times locks them out, and with only four
-- unlockers that is disruptive by design. This table makes SWEEPING addresses
-- expensive, which is the attack the email counter cannot see — one failure
-- each against fifty addresses trips no per-email threshold at all.
--
-- Deliberately NOT a lockout: an IP is shared (an office NAT is one address for
-- everybody), so this feeds a delay and a refusal-to-count, never a lock on a
-- person. Rows are disposable; prune anything older than the window.
CREATE TABLE IF NOT EXISTS login_attempt_ips (
  ip              text NOT NULL,
  window_start    timestamptz NOT NULL DEFAULT now(),
  failed_count    integer NOT NULL DEFAULT 0,
  last_failed_at  timestamptz,
  PRIMARY KEY (ip, window_start)
);

CREATE INDEX IF NOT EXISTS login_attempt_ips_window_idx
  ON login_attempt_ips (window_start);


-- Record in the ledger the runner reads.
CREATE TABLE IF NOT EXISTS __schema_applied (
  filename    text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now()
);

INSERT INTO __schema_applied (filename) VALUES ('0236_account_lockouts.sql')
ON CONFLICT DO NOTHING;
