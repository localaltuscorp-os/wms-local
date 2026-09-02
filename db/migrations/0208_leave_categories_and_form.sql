-- 0208 — Leave gets a CATEGORY, half-day boundaries, and reachability answers.
--
-- ── WHAT THIS ADDS, AND WHY EACH PIECE IS SHAPED THE WAY IT IS ─────────────
--
-- 1. CATEGORY (`leave_categories` + `leave_requests.category_id`)
--    `leave_requests.kind` is 'paid' | 'unpaid' — that is the PAYROLL fact and
--    it must stay a closed union, because the salary engine branches on it. The
--    category is a different question: Sick, Exam, Death, Vacation. Overloading
--    `kind` with those would put an editable list in the path of money.
--
--    A TABLE, not another text union, because the ask is explicitly that admins
--    can add to the dropdown. A union in code cannot grow without a deploy.
--    Rows are RETIRED (`is_active = false`), never deleted: a leave taken last
--    March under "Family Duties" must keep saying so after someone tidies the
--    dropdown, which a foreign key to a deleted row cannot do.
--
-- 2. HALF-DAY BOUNDARIES (`start_half_day`, `end_half_day`)
--    The two flags are NOT symmetric, and the asymmetry is the whole point:
--      · start_half_day → the leave begins at MIDDAY on start_date (you work
--        the morning and leave at lunch).
--      · end_half_day   → the leave ends at MIDDAY on end_date (you are back
--        after lunch).
--    So "second half of 24 Sep through first half of 30 Sep" is
--    start=24 Sep, start_half=true, end=30 Sep, end_half=true → 6 days, not 7.
--    `days` is already numeric(5,1), so halves fit without a type change.
--
--    A single-day leave with either flag set is 0.5 days; both flags on one day
--    is the same half twice and is rejected by CHECK rather than silently
--    counted as zero.
--
-- 3. REACHABILITY (`avail_personal_phone`, `avail_office_phone`,
--    `avail_computer`)
--    Nullable on purpose. Every leave row that already exists predates the
--    questions, and a NOT NULL DEFAULT would answer them retroactively on 100+
--    historical rows — inventing a claim the employee never made. NULL reads as
--    "not asked", which is the truth.
--
--    `avail_office_phone` is text with three values, not a boolean: "I have no
--    office line" and "I have one and won't be answering it" are different
--    answers, and a boolean makes them share a value.
--
-- FULLY IDEMPOTENT — this repo re-runs every migration on every apply.

-- ── The admin-editable dropdown ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS leave_categories (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  -- Explicit ordering so the dropdown reads in the order the org thinks in,
  -- rather than alphabetically or by whenever someone happened to add a row.
  sort_order  integer NOT NULL DEFAULT 100,
  is_active   boolean NOT NULL DEFAULT true,
  created_by_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Case-insensitive, and only among ACTIVE rows — so a retired category's name
-- can be brought back without first deleting the history that points at it.
CREATE UNIQUE INDEX IF NOT EXISTS leave_categories_name_uq
  ON leave_categories (lower(name)) WHERE is_active;

CREATE INDEX IF NOT EXISTS leave_categories_order_idx
  ON leave_categories (sort_order, name) WHERE is_active;

-- The seven the business named. `ON CONFLICT DO NOTHING` against the partial
-- unique index means a re-run never duplicates them and never resurrects one an
-- admin has since retired.
INSERT INTO leave_categories (name, sort_order) VALUES
  ('Casual Leave',            10),
  ('Birthday & Anniversary',  20),
  ('Family Duties',           30),
  ('Death',                   40),
  ('Vacation',                50),
  ('Exam Leave',              60),
  ('Sick Leave',              70)
ON CONFLICT DO NOTHING;

-- ── Leave request: category, half-day boundaries, reachability ────────────
ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS category_id uuid
    REFERENCES leave_categories(id) ON DELETE SET NULL;

ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS start_half_day boolean NOT NULL DEFAULT false;
ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS end_half_day   boolean NOT NULL DEFAULT false;

ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS avail_personal_phone boolean;
ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS avail_office_phone   text;
ALTER TABLE leave_requests
  ADD COLUMN IF NOT EXISTS avail_computer       boolean;

-- Three answers, or none yet. NULL is "not asked" and stays legal forever,
-- because the historical rows genuinely were not asked.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leave_requests_office_phone_chk'
  ) THEN
    ALTER TABLE leave_requests ADD CONSTRAINT leave_requests_office_phone_chk
      CHECK (avail_office_phone IS NULL OR avail_office_phone IN ('yes', 'no', 'na'));
  END IF;
END $$;

-- A one-day leave cannot be half at both ends: that names the same half twice
-- and would arithmetically cancel to zero days.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'leave_requests_half_day_chk'
  ) THEN
    ALTER TABLE leave_requests ADD CONSTRAINT leave_requests_half_day_chk
      CHECK (start_date <> end_date OR NOT (start_half_day AND end_half_day));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS leave_requests_category_idx
  ON leave_requests (category_id) WHERE category_id IS NOT NULL;
