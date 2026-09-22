-- 0228 — a Category on every Job Description.
--
-- Free text, not a lookup table: the account holder asked for a column the
-- author can simply write in — Housekeeping, Internet, Vendors — and the set is
-- not known up front. The form suggests categories already in use, so the same
-- word is not spelled three ways, without refusing a new one.
--
-- The Event Checklist already has its own `ops_checklist_items.category` from
-- 0221; only the JD Bank needs the column.
--
-- Idempotent: this repository applies migrations by hand, and a migration that
-- cannot be run twice gets run twice.

alter table jd_entries add column if not exists category text;
