-- EMPLOYEE POLICY SIGN-OFF: printed name + date + signature image.
--
-- Employees already had a way to sign a policy: DigiLocker, which yields an
-- Aadhaar-verified identity, an archived signed PDF and a `document_signatures`
-- row. This table is the SECOND, always-available way - the same three things a
-- candidate provides (a printed name, the moment, and an image of their actual
-- signature) - for the many cases where DigiLocker is not to hand.
--
-- ── WHY ITS OWN TABLE AND NOT `document_signatures` ──────────────────────
-- Filing a typed-and-uploaded signature among the DigiLocker-verified ones
-- would make the two indistinguishable to anyone reading the ledger later, and
-- they are NOT equivalent evidence. Kept separate for the same reason
-- candidate_policy_signatures (0222) is separate, and mirrored into
-- `policy_compliance` with a null doc_instance_id, which is what every HR
-- screen already reads to answer "who has acknowledged what".
--
-- One row per employee per policy: signing again UPDATES it (re-stamping the
-- version), which is what happens when a policy is republished.
CREATE TABLE IF NOT EXISTS employee_policy_signatures (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  policy_key text NOT NULL,
  -- The published version that was on screen when they signed.
  version integer NOT NULL DEFAULT 1,
  -- What they printed, verbatim.
  signed_name text NOT NULL,
  -- Storage key of the signature image in the PRIVATE documents bucket.
  signature_path text NOT NULL,
  signed_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT employee_policy_signature_uq UNIQUE (employee_id, policy_key)
);

CREATE INDEX IF NOT EXISTS employee_policy_signatures_employee_idx
  ON employee_policy_signatures (employee_id);
