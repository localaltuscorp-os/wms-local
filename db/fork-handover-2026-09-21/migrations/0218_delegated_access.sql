-- 0218 — TEMPORARY DELEGATED ACCESS ("Rudra needs to test Rutvisha's account").
--
-- ── WHAT THIS IS NOT ───────────────────────────────────────────────────────
-- It is not a password change, not a password copy, and not a shared login.
-- No column here holds a credential of any kind. The employee's Firebase
-- account, their password and their own sessions are untouched by a grant and
-- by its expiry — they keep signing in normally throughout.
--
-- ── HOW IT WORKS ───────────────────────────────────────────────────────────
-- The delegate signs in AS THEMSELVES, normally. A grant issues one opaque
-- 256-bit token, stored here only as a SHA-256 hash, which the delegate's
-- browser carries in its own cookie beside their real session. While that token
-- resolves to a live row in this table, the server answers "who is the current
-- employee" with the TARGET's row instead of the delegate's — so the delegate
-- sees exactly the permissions of the account being tested and nothing more,
-- through the application's existing authorization model rather than around it.
--
-- Everything about the decision lives server-side: the row, the expiry, the
-- revocation. Deleting the cookie ends the delegation; keeping the cookie past
-- `expires_at` achieves nothing, because the expiry is re-evaluated from this
-- table on every single request.
--
-- FULLY IDEMPOTENT — safe to re-apply by hand at any time.

------------------------------------------------------------------------
-- 1. The grants
------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS delegated_access_grants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- WHOSE ACCOUNT is being accessed (Rutvisha).
  target_employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,

  -- WHO RECEIVES the access (Rudra). This is the person who must be signed in
  -- for the token to resolve: the token alone is not enough, so a leaked token
  -- is useless to anyone but the one delegate it was issued to.
  delegate_employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,

  -- THE GRANTING MANAGER. Nullable only so an offboarded manager's row can be
  -- anonymised without destroying the grant history that names them.
  granted_by_id uuid REFERENCES employees(id) ON DELETE SET NULL,

  -- Free text, and genuinely optional: the brief asks for a reason "if the
  -- existing system supports reasons". The device-revocation flow (0215) set
  -- the precedent of storing one, so this does too.
  reason text,

  -- What the manager PICKED, kept alongside the computed expiry. Without it the
  -- audit screen cannot distinguish "they chose 1 hour and the 20:30 floor
  -- extended it" from "they chose 4 hours" — the two produce different expiries
  -- from the same duration only because of when they started.
  duration_minutes integer NOT NULL,

  starts_at timestamptz NOT NULL DEFAULT now(),

  -- THE ONE AUTHORITY ON EXPIRY.
  --
  -- Computed server-side at grant time as
  --     max(starts_at + duration_minutes, 20:30 Asia/Kolkata on the start date)
  -- — the LATER of the two, per the brief ("Do not interpret this as whichever
  -- happens first"). Stored rather than recomputed on read so that a change to
  -- the rule, or to the server's clock handling, can never silently extend a
  -- grant that is already running.
  expires_at timestamptz NOT NULL,

  -- Set the moment a manager revokes. Checked on every request alongside
  -- `expires_at`, so revocation is immediate and does not wait for the timer.
  revoked_at timestamptz,
  revoked_by_id uuid REFERENCES employees(id) ON DELETE SET NULL,

  -- SHA-256 of the opaque token, hex. The token itself is shown to the granting
  -- manager once, handed to the delegate, and never stored anywhere: a dump of
  -- this table cannot be used to impersonate anyone, exactly as with a password
  -- hash. UNIQUE both to make the lookup an index hit and to make a hash
  -- collision a constraint error rather than an ambiguity.
  token_hash text NOT NULL UNIQUE,

  -- Bookkeeping the audit screen shows: when the delegate first activated the
  -- grant, when they last used it, and how many requests it has served.
  first_used_at timestamptz,
  last_used_at timestamptz,
  use_count integer NOT NULL DEFAULT 0,

  -- The device the delegate ACTIVATED the grant on ("Rudra's laptop"), recorded
  -- for the audit trail. Deliberately NOT an authorization input: the device
  -- restriction is applied to the delegate's OWN identity before the swap
  -- happens (see lib/auth/current.ts), which is both what the brief describes
  -- and stricter than binding here — it means a grant can never lend the
  -- target's registered devices to anybody.
  device_id text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Nobody delegates to themselves. Harmless, but it would put a meaningless
  -- row in an audit log that people will read during an incident.
  CONSTRAINT delegated_access_no_self CHECK (target_employee_id <> delegate_employee_id),

  CONSTRAINT delegated_access_duration_sane CHECK (duration_minutes > 0 AND duration_minutes <= 1440)
);

-- THE RESOLUTION INDEX. Every authenticated request asks "is there a live grant
-- for this token", so it must be a single index hit on the hottest path in the
-- application.
CREATE INDEX IF NOT EXISTS delegated_access_token_idx
  ON delegated_access_grants (token_hash);

-- AT MOST ONE LIVE GRANT PER DELEGATE.
--
-- Not a tidiness rule — a correctness one. If Rudra held live grants for two
-- accounts at once, "who is Rudra acting as" would have two answers and the
-- resolver would have to pick one, which is precisely the kind of ambiguity an
-- impersonation feature must not contain. The partial index makes a second
-- concurrent grant a constraint violation at the database, so no code path can
-- create one.
--
-- Expired grants are excluded from the predicate only via `revoked_at`, because
-- an index predicate cannot reference now(). The overlap check that uses
-- `expires_at` therefore lives in the grant action; this index is the backstop
-- for the un-revoked case, which is the one that matters.
CREATE UNIQUE INDEX IF NOT EXISTS delegated_access_one_live_per_delegate_idx
  ON delegated_access_grants (delegate_employee_id)
  WHERE revoked_at IS NULL;

-- The admin screen lists by target and by recency.
CREATE INDEX IF NOT EXISTS delegated_access_target_idx
  ON delegated_access_grants (target_employee_id, starts_at DESC);

CREATE INDEX IF NOT EXISTS delegated_access_delegate_idx
  ON delegated_access_grants (delegate_employee_id, starts_at DESC);

------------------------------------------------------------------------
-- 2. The audit trail
------------------------------------------------------------------------
-- A SEPARATE, APPEND-ONLY table rather than more columns on the grant.
--
-- The brief asks for six distinct events to be logged, including "attempted
-- access after expiry" — which can happen many times for one grant, and which
-- has no natural column to live in. It also asks for the record to survive, so
-- these rows carry their own copies of the two employee ids: a grant row that
-- is ever removed, or an employee who is later anonymised, must not take the
-- log of what happened with them.

CREATE TABLE IF NOT EXISTS delegated_access_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The grant this concerns. SET NULL, not CASCADE: the whole point of an audit
  -- row is that it outlives the thing it describes.
  grant_id uuid REFERENCES delegated_access_grants(id) ON DELETE SET NULL,

  /**
   * granted            — a manager created the grant
   * started            — the delegate activated it and first acted as the target
   * expired            — the first request refused because the clock ran out
   * revoked            — a manager ended it early
   * denied_after_expiry— a later request refused on an expired or revoked grant
   * denied             — a token that resolved to no usable grant at all
   */
  kind text NOT NULL,

  -- Denormalised on purpose (see the note above).
  target_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  delegate_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,

  -- Who caused THIS event: the manager for granted/revoked, the delegate for
  -- started/expired/denied.
  actor_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,

  -- Readable one-liner for the audit screen; never a token, never a credential.
  detail text,
  device_id text,

  occurred_at timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT delegated_access_event_kind CHECK (
    kind IN ('granted', 'started', 'expired', 'revoked', 'denied_after_expiry', 'denied')
  )
);

CREATE INDEX IF NOT EXISTS delegated_access_events_grant_idx
  ON delegated_access_events (grant_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS delegated_access_events_recent_idx
  ON delegated_access_events (occurred_at DESC);

CREATE INDEX IF NOT EXISTS delegated_access_events_target_idx
  ON delegated_access_events (target_employee_id, occurred_at DESC);
