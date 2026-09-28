-- 0239 — The signed Declaration Letter: one record per person, per wording.
-- Asked 2026-09-21. Idempotent: safe to run twice.
--
-- Every person working at the firm signs one declaration by hand, confirming
-- they have read the joining documents and the six policies and agree to abide
-- by them. The paper original is filed in a hard copy in HR's custody; this
-- table is the firm's record that it happened, and the thing the tracker at
-- /hr/declaration reads to show who is outstanding.
--
-- TWO KINDS OF EVIDENCE, TWO COLUMNS. `acknowledged_at` is the employee ticking
-- a box in the WMS. `scan_path` is the wet-signed sheet, scanned and uploaded by
-- whoever holds the file. They arrive at different times, from different people,
-- and only the second is worth anything in a dispute — so they are deliberately
-- NOT collapsed into one `status` column, which would let a tick stand in for
-- the paper. "Done" means both are present.
--
-- KEYED ON (employee, version), NOT employee alone. Re-wording the declaration
-- bumps DECLARATION_VERSION in lib/hr/letters/templates/declaration.ts. Old rows
-- stay, at the old version — so the firm can still show what somebody signed in
-- 2026 after the wording changes — and the tracker, which joins on the current
-- version, correctly shows everyone as outstanding again.
--
-- The scan itself lives in the private `documents` bucket under
-- `hr-declaration/<employee_id>/…`, a prefix no existing reader globs. It is
-- deliberately NOT an `employee_documents` row: that table is read by the
-- Dossier, the Letters workspace, the mobile route and the Records ZIP, all of
-- which are open to any admin, and this scan is for the employee plus two named
-- people only (lib/hr/declaration/access.ts).
--
-- NOT a replacement for `policy_compliance`, which remains the per-policy,
-- per-version ledger. This records one signature over the set as a whole.

CREATE TABLE IF NOT EXISTS declaration_compliance (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id      uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  version          text NOT NULL,
  acknowledged_at  timestamptz,
  scan_path        text,
  scan_file_name   text,
  scan_mime        text,
  scan_size_bytes  bigint,
  -- set null, not cascade: an uploader leaving the firm must not delete the
  -- evidence that somebody else's declaration was signed.
  uploaded_by_id   uuid REFERENCES employees(id) ON DELETE SET NULL,
  uploaded_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- One row per person per wording. The upserts in
-- app/(app)/hr/declaration/actions.ts target this constraint by name.
CREATE UNIQUE INDEX IF NOT EXISTS declaration_compliance_emp_version_uk
  ON declaration_compliance (employee_id, version);

-- The tracker reads every row at the current version in one go.
CREATE INDEX IF NOT EXISTS declaration_compliance_version_idx
  ON declaration_compliance (version);
