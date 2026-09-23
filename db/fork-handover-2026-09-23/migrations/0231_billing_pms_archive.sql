-- 0231 — ARCHIVE for billing documents and monthly performance reviews.
--
-- Manan, 2026-09-15, pointing at Billing › Documents and at Performance:
-- "give archive for this as well".
--
-- Both screens list records that accumulate forever and had no way to be put
-- away — only a Cancel (billing) or nothing at all (reviews). Archive is the
-- app's standing answer to that: the row leaves the working list, keeps every
-- field, and comes back from Archive.
--
-- ── WHY TWO COLUMNS AND NOT ONE ───────────────────────────────────────────
--
-- `archived` is the flag every read filters on and every index is built for;
-- `archived_at` says WHEN, which is what an archive screen sorts by and what
-- makes "put away last March" answerable. The rest of the app carries both
-- (tc_materials, dcc_kpi_items, tasks) and the Archive browser reads the flag,
-- so a new table joining that set needs to look like the others.
--
-- ── BILLING: ARCHIVE IS NOT CANCEL, AND NEVER DELETES ─────────────────────
--
-- `billing_documents.status` already has 'cancelled', and it means something
-- else entirely: the document was withdrawn and is void. Archiving says only
-- "stop showing me this" — a paid invoice from two years ago is still a valid
-- legal record and must stay exactly as issued. So this is a separate flag
-- rather than a seventh status, and nothing here removes a row.
--
-- FULLY IDEMPOTENT — safe to re-apply by hand at any time.

------------------------------------------------------------------------
-- 1. Billing documents
------------------------------------------------------------------------

ALTER TABLE billing_documents
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;

ALTER TABLE billing_documents
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- PARTIAL, like daily_checklist's in 0230: almost every document is live, so an
-- index over the whole column would be one enormous all-false entry. This
-- indexes only the filed ones, which is the set the archived view reads.
CREATE INDEX IF NOT EXISTS billing_documents_archived_idx
  ON billing_documents (archived)
  WHERE archived = true;

------------------------------------------------------------------------
-- 2. Monthly performance reviews
------------------------------------------------------------------------
-- `pms_monthly_review` is the LIVE review table — the 360 one /pms/review and
-- /pms/v3 write, keyed by 'YYYY-MM'. (`pms_review` is a different, older table
-- that nothing writes any more; only the Archive browser still reads it, so it
-- is deliberately left alone here.)
--
-- Archiving is per ROW rather than per period: a period is not a record, it is
-- a string on a set of rows, and "archive September" is therefore "archive the
-- rows whose period is September" — which the action does in one statement.

ALTER TABLE pms_monthly_review
  ADD COLUMN IF NOT EXISTS archived boolean NOT NULL DEFAULT false;

ALTER TABLE pms_monthly_review
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

CREATE INDEX IF NOT EXISTS pms_monthly_review_archived_idx
  ON pms_monthly_review (archived)
  WHERE archived = true;
