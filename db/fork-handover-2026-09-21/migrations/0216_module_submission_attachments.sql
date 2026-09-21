-- 0216 — Reimbursement receipts become FILES the firm holds, not Drive links.
--
-- WHY. The reimbursement request form carried `bill_url`: a free-text link,
-- in practice to something in the claimant's personal Google Drive. That is not
-- a receipt the firm possesses. The link can have its sharing revoked, it dies
-- with the account, and it fails silently — years later, when an audit or a
-- Tally reconciliation actually needs the bill, all that survives is a URL that
-- 404s. Nothing in the app could even tell you the file's name or type.
--
-- WHAT REPLACES IT. One row per uploaded document, pointing at an object in the
-- app's own PRIVATE Supabase `documents` bucket — the same bucket and the same
-- `storage_path` contract `task_attachments` (0048) and
-- `project_node_attachments` (0212) already use. Access is granted per request
-- by minting a short-lived signed URL after the caller's permission has been
-- checked in app code; the bucket itself stays private.
--
-- WHERE THE BYTES GO, AND WHERE THEY DO NOT. The browser uploads straight to a
-- signed Supabase upload URL, so the file never passes through the Next.js
-- server. That is deliberate and not merely an optimisation: on Vercel the
-- serverless request body is capped well below a phone photo of a bill, and the
-- filesystem is ephemeral, so routing receipts through the app server would
-- have meant uploads that fail above a few megabytes and files that vanish on
-- redeploy. Vercel handles this row; Supabase holds the document.
--
-- GENERIC BY DESIGN. `module_submissions` is the shared table behind
-- Reimbursements, Record Reference and Participant Breakthrough, so the foreign
-- key is `submission_id` and the table is named for what it references. Naming
-- it `reimbursement_attachments` would have described the FK inaccurately. Only
-- the reimbursement UI attaches files today.
--
-- BACKWARD COMPATIBLE. `bill_url` is NOT dropped, and no submission is
-- rewritten. Existing claims keep their link and keep rendering it; `bill_url`
-- is simply no longer offered on new requests. The two coexist in the claim
-- card, which shows whichever a claim has.
--
-- Additive and idempotent. Nothing here drops or rewrites data.

CREATE TABLE IF NOT EXISTS module_submission_attachments (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  submission_id uuid NOT NULL REFERENCES module_submissions (id) ON DELETE CASCADE,
  -- Addresses the object in the private Supabase bucket. Shaped
  -- `reimbursements/<employee_id>/<uuid>/<safe file name>` — the employee
  -- segment is what lets the server refuse a path belonging to someone else.
  storage_path  text NOT NULL,
  -- The uploader's OWN file name, kept verbatim for display and download so a
  -- claim can still say "Uber-receipt-14-Sep.pdf" rather than a bare uuid.
  file_name     text NOT NULL,
  mime          text,
  size_bytes    integer,
  uploaded_by_id uuid REFERENCES employees (id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- The only access pattern: every file on one claim, oldest first.
CREATE INDEX IF NOT EXISTS module_submission_attachments_submission_idx
  ON module_submission_attachments (submission_id, created_at);
