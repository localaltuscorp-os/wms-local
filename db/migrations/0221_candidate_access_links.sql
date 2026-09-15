-- 0221 — Candidate access links: the HR forms, without a login.
-- Additive + idempotent.
--
-- THE PROBLEM. A person applying to the company is not an employee yet, but the
-- two things we need from them — their own details, and their signatures on the
-- policies — both live behind `requireCandidate()`, i.e. behind a Firebase
-- sign-in. Asking an outsider to create an account on os.altuscorp.in before
-- they have been hired is the wrong order, and it is the reason these forms were
-- being filled by HR on their behalf.
--
-- WHAT THIS CHANGES, AND WHAT IT DELIBERATELY DOES NOT. It replaces the SIGN-IN
-- step only. A candidate still has a real `employees` row (account_type
-- 'candidate', linked by `candidate_intake_id`) and every downstream write still
-- targets it — `document_signatures.signer_employee_id`, the intake row, the
-- policy compliance rows. So identity, ownership and audit are unchanged; only
-- the way the caller PROVES who they are is different.
--
-- THE TOKEN. 256 random bits, handed out once in a URL. Only its SHA-256 is
-- stored here, so this table leaking does not let anybody in — the same shape as
-- `delegated_access_grants` (lib/auth/delegated-access.ts), and for the same
-- reason. Every fact about a link is re-read from this row on every request:
-- the URL carries an opaque string and nothing else, not the intake id, not the
-- expiry, not a flag.
--
-- LIFETIME. 30 days, so "let me check what I filled in" keeps working for as
-- long as a hiring round realistically runs. Expired or lost links are not
-- re-sent by guessing: the candidate re-enters their personal email on a public
-- page and a fresh link is mailed ONLY if it matches a real record — the page
-- says the same thing either way, so it cannot be used to discover who applied.
--
-- REVOCATION is a column, not a delete: `revoked_at` keeps the row for the audit
-- trail. HR revoking a link takes effect on the very next request because
-- nothing about it is cached client-side.

CREATE TABLE IF NOT EXISTS candidate_access_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The one intake row this link opens. CASCADE: if the intake record is
  -- deleted the link must die with it, never outlive its subject.
  intake_id uuid NOT NULL REFERENCES candidate_intake(id) ON DELETE CASCADE,

  -- SHA-256 of the token, hex. UNIQUE because lookup is an indexed equality on
  -- exactly this column; the plaintext token is never stored, logged or echoed.
  token_hash text NOT NULL UNIQUE,

  expires_at timestamptz NOT NULL,
  -- Set instead of deleting, so a revoked link stays auditable.
  revoked_at timestamptz,
  -- Throttled write (see lib/hr/candidate/access-link.ts) — "has this link ever
  -- actually been opened" is what tells HR whether the candidate got the email.
  last_used_at timestamptz,

  -- Who issued it. SET NULL rather than CASCADE: an HR person leaving must not
  -- silently delete the links they issued.
  created_by_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Every request on a public link does exactly one lookup, on this column.
CREATE INDEX IF NOT EXISTS candidate_access_links_intake_idx
  ON candidate_access_links(intake_id, created_at DESC);
