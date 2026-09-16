-- 0229 — INCENTIVE REQUESTS: the Split Incentive shares.
--
-- The New Incentive Request form can now split one incentive between 2–5
-- people, each with a percentage that totals exactly 100%. This is where that
-- lands.
--
-- WHY A COLUMN, NOT `details`. `details` is a flat `Record<string, string>` of
-- form answers, rendered and validated field by field from
-- lib/incentive-fields.ts. A list of {employee, share} objects is not a form
-- answer, and serialising it into a string inside that map would make every
-- later reader parse JSON out of JSON.
--
-- WHY NOT `incentive_participants`. That table already exists (0107), but it
-- belongs to the PAYOUT side: its rows carry booked / accrued / paid amounts and
-- a CHECK pinning each row to an `incentive_entries` or `incentive_projects`
-- parent. A request that has not been approved has no amount to book, and
-- Approval and Accounts were explicitly out of scope for this change.
--
-- SHAPE (enforced in lib/incentive/split.ts + lib/incentive/prepare-request.ts):
--   [{ "employeeId": uuid, "name": text, "pct": number }, ...]
--   2–5 entries, distinct employees, the requester among them, shares > 0 with
--   at most 2 decimals, totalling exactly 100.
-- The CHECK below guards only the outer shape — array, 2–5 long. The per-share
-- rules need arithmetic over the elements, which a CHECK cannot express
-- without a function, and the application is the only writer.
--
-- NULL means "not split": the existing single-employee request, unchanged.
-- Every row that exists today is NULL, so no backfill.
--
-- FULLY IDEMPOTENT. The constraint is dropped and re-added rather than wrapped
-- in a DO block, which keeps the file a plain list of statements.

ALTER TABLE incentive_requests
  ADD COLUMN IF NOT EXISTS split jsonb;

ALTER TABLE incentive_requests
  DROP CONSTRAINT IF EXISTS incentive_requests_split_shape_chk;

-- CASE, not AND: Postgres does not promise to evaluate `jsonb_typeof(...) =
-- 'array'` before `jsonb_array_length(...)`, and the latter raises on a
-- non-array rather than returning false.
ALTER TABLE incentive_requests
  ADD CONSTRAINT incentive_requests_split_shape_chk CHECK (
    split IS NULL
    OR CASE
         WHEN jsonb_typeof(split) = 'array' THEN jsonb_array_length(split) BETWEEN 2 AND 5
         ELSE false
       END
  );
