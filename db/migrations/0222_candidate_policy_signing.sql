-- 0222 — Post-Interview: the policies, signed without a login.
-- Additive + idempotent. Nothing existing is read, altered or deleted.
--
-- THE PROBLEM. 0221 let an outsider fill their own INTERVIEW FORM from an
-- emailed link, with no account on os.altuscorp.in. The other half of what a
-- candidate owes us is their acknowledgement of the firm's policies, and that
-- still sat behind `requireUser()` — so HR was either creating a login for
-- somebody who has not been hired, or chasing signatures on paper.
--
-- TWO CHANGES, BOTH ADDITIVE.
--
-- 1. `candidate_access_links.purpose` — one link now knows what it was issued
--    FOR, so `/c/<token>` can land the candidate on their form or on their
--    policies. It is only ever a LANDING decision: both surfaces belong to the
--    same person and the same intake row, and the token proves identity for
--    both. Defaulting to 'form' leaves every link issued by 0221 behaving
--    exactly as it did.
--
-- 2. `candidate_policy_signatures` — one row per (intake, policy) recording
--    that this candidate accepted this version, when, and under what typed
--    name.
--
-- WHY A SEPARATE TABLE AND NOT `document_signatures`. That table is the
-- DigiLocker flow: an Aadhaar-verified signature that produces an archived
-- signed PDF. A candidate has no DigiLocker session and no account, so
-- recording their acceptance there would file an unverified consent in the same
-- place as verified ones and let the two be mistaken for each other later. This
-- table says exactly what it is: typed acceptance of a named policy version by
-- a named candidate at a known time. `policy_compliance` is still mirrored
-- alongside it, so HR's existing ledger shows these candidates without needing
-- to learn about a new table.
--
-- EDITABLE AFTER SIGNING, like the interview form: the unique constraint is on
-- (intake_id, policy_key), so returning to re-accept a policy UPDATES the row
-- rather than stacking a second one. `signed_at` moves to the latest acceptance
-- and `version` records which published version they accepted.

ALTER TABLE candidate_access_links
  ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'form';

CREATE TABLE IF NOT EXISTS candidate_policy_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The intake row this acceptance belongs to. CASCADE: deleting a candidate's
  -- record must not leave their acknowledgements behind it.
  intake_id uuid NOT NULL REFERENCES candidate_intake(id) ON DELETE CASCADE,

  -- The candidate's own employees row — the SAME subject every other write in
  -- this flow targets, so HR's ledger and this table agree about who signed.
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,

  policy_key text NOT NULL,
  -- Which published version was on screen when they accepted. A later version
  -- must not be able to claim a signature made against the older text.
  version integer NOT NULL DEFAULT 1,

  -- What they typed as their signature, kept verbatim.
  signed_name text NOT NULL,
  signed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- One acceptance per policy per candidate; re-accepting updates it.
  CONSTRAINT candidate_policy_signature_uq UNIQUE (intake_id, policy_key)
);

-- The page lists every policy for one candidate on each render.
CREATE INDEX IF NOT EXISTS candidate_policy_signatures_intake_idx
  ON candidate_policy_signatures(intake_id);
