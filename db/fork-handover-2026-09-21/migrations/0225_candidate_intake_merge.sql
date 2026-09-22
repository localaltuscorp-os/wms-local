-- 0225 — ONE CANDIDATE, ONE RECORD.
--
-- WHY THIS EXISTS. A candidate can now be created on the spot from the
-- evaluation form, before they have filled anything (`createQuickCandidate`).
-- That row holds the INTERVIEWER's assessment. When the candidate later fills
-- the interview form they get a DIFFERENT row, because `saveCandidateDraft`
-- matches on id only and `inviteCandidateByLink` matches on email — nothing
-- joins the two. So "what the candidate wrote" and "what the interviewer
-- thought" end up on two records, and nobody can read both in one place.
--
-- The merge keeps ONE of them. The survivor is always the candidate's own form
-- row: it owns their guest login, their access links, their policy signatures
-- and their `hr_form_submissions` index rows, and its name is the one they
-- typed correctly themselves. The placeholder is RETIRED, not deleted.
--
-- ── READ THIS BEFORE FILTERING ON `merged_into_id` ──────────────────────────
-- It is a TOMBSTONE, NOT A PERMANENT ONE, and that is deliberate. The FK is
-- ON DELETE SET NULL, so if the surviving row is ever deleted the retired row
-- becomes visible again — which is the behaviour we want, because the retired
-- row still holds its OWN COPY of the evaluation (the merge copies; it never
-- nulls the source). An interviewer's assessment can therefore never be
-- orphaned by a delete on either side of a merge.
--
-- The merge never destroys anything. Undoing one is a single statement:
--   update candidate_intake set merged_into_id = null where id = <retired id>;
--
-- Additive and idempotent. Nothing existing is read, altered or deleted.

ALTER TABLE candidate_intake
  ADD COLUMN IF NOT EXISTS merged_into_id uuid
    REFERENCES candidate_intake(id) ON DELETE SET NULL;

-- Every candidate picker filters on this, so it is the hot predicate.
CREATE INDEX IF NOT EXISTS candidate_intake_merged_into_idx
  ON candidate_intake (merged_into_id);

-- NOTE: no functional index on the normalised phone. The matching query runs
-- against <=200 rows and the planner seq-scans regardless; a functional index
-- here would be a write cost on every autosave for no read benefit.

CREATE TABLE IF NOT EXISTS candidate_intake_merge_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Denormalised names and numbers: an offboarded employee, or a later edit to
  -- either record, must not rewrite what the merge actually did.
  retired_intake_id  uuid REFERENCES candidate_intake(id) ON DELETE SET NULL,
  survivor_intake_id uuid REFERENCES candidate_intake(id) ON DELETE SET NULL,
  retired_name text,  retired_mobile text,
  survivor_name text, survivor_mobile text,
  -- Which blobs were written onto the survivor, and which were skipped because
  -- the survivor already had them. jsonb arrays of strings, e.g.
  -- ["evaluationV2:interviewer"].
  transferred jsonb NOT NULL DEFAULT '[]'::jsonb,
  skipped     jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- The bytes as they were on the retired row at merge time. The merge COPIES
  -- rather than moves, so this is redundancy by design: it makes the operation
  -- recoverable even if the retired row is later deleted outright.
  restore_payload jsonb,
  actor_employee_id uuid REFERENCES employees(id) ON DELETE SET NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  undone_at timestamptz,
  undone_by_id uuid REFERENCES employees(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS candidate_intake_merge_events_retired_idx
  ON candidate_intake_merge_events (retired_intake_id);
CREATE INDEX IF NOT EXISTS candidate_intake_merge_events_recent_idx
  ON candidate_intake_merge_events (occurred_at DESC);

-- Verify (ONE statement — the Supabase editor shows only the last result set):
--
--   select
--     (select count(*) from information_schema.columns
--       where table_name = 'candidate_intake' and column_name = 'merged_into_id')
--       = 1 as column_added,
--     (select count(*) from information_schema.tables
--       where table_name = 'candidate_intake_merge_events') = 1 as audit_table_added,
--     (select count(*) from candidate_intake where merged_into_id is not null)
--       = 0 as nothing_retired_yet;
