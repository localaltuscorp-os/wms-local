-- 0181 — HR form submissions index.
--
-- The HR lifecycle forms (Exit Interview, Exit Handover, Induction, …) each own
-- their own table and keep it: exit_records, induction rows, candidate rows.
-- This table does NOT replace them. It is a thin, uniform INDEX over them so a
-- single "My Filled Forms" / "All Filled Forms" list can page, filter and sort
-- across heterogeneous sources without knowing any of their shapes.
--
-- WHY A RESPONSE SNAPSHOT (`responses`) rather than joining back to the source:
-- the sources have nothing in common — one stores {fields, ratings}, another
-- {fields, checked}, a third a candidate row. Rendering View / PDF / Email off a
-- normalised [{question, answer}] snapshot means one renderer instead of one per
-- form. The snapshot is rewritten on every save, so it cannot drift from the
-- source: the write path updates both in the same action.
--
-- `source_table` + `source_id` are a deliberate soft pointer (no FK): the target
-- table varies per row, which a real FK cannot express. Rows are cleaned up via
-- the owning employee's cascade below.

CREATE TABLE IF NOT EXISTS hr_form_submissions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity of the form itself. `form_key` joins to the code registry
  -- (lib/hr/forms/registry.ts); `form_name` and `section` are SNAPSHOTS so an
  -- old submission keeps the name and stage it was filed under even if the
  -- registry is later renamed or re-parented.
  form_key          text NOT NULL,
  form_name         text NOT NULL,
  section           text NOT NULL,

  -- WHOSE form this is (the subject). Drives the employee's own list and the
  -- permission check. Cascades so an employee delete takes their index rows.
  employee_id       uuid NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  -- WHO filled it in — often HR filling on the employee's behalf, so this is
  -- deliberately separate from employee_id and must never gate visibility.
  submitted_by_id   uuid REFERENCES employees(id) ON DELETE SET NULL,

  -- 'draft' = Save Draft, not yet submitted; 'submitted' = Submit succeeded.
  status            text NOT NULL DEFAULT 'draft',

  -- Normalised completed responses: [{ "question": "...", "answer": "..." }].
  responses         jsonb NOT NULL DEFAULT '[]'::jsonb,

  -- Soft pointer back to the owning row in its own table.
  source_table      text,
  source_id         uuid,

  -- Stamped only when status flips to 'submitted'. NULL for drafts, which is
  -- what lets the two lists split without a second column.
  submitted_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- The employee's own list: their rows, newest first.
CREATE INDEX IF NOT EXISTS hr_form_submissions_employee_idx
  ON hr_form_submissions (employee_id, submitted_at DESC NULLS LAST);

-- The HR list: everyone's rows, newest first, plus the filter columns.
CREATE INDEX IF NOT EXISTS hr_form_submissions_submitted_idx
  ON hr_form_submissions (submitted_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS hr_form_submissions_status_idx
  ON hr_form_submissions (status);
CREATE INDEX IF NOT EXISTS hr_form_submissions_section_idx
  ON hr_form_submissions (section);
CREATE INDEX IF NOT EXISTS hr_form_submissions_form_idx
  ON hr_form_submissions (form_key);

-- One index row per (form, employee, source row): re-saving a form updates its
-- row rather than growing a new one every keystroke-save. Partial, because
-- source_id is NULL for forms that have no owning row yet.
CREATE UNIQUE INDEX IF NOT EXISTS hr_form_submissions_source_uniq
  ON hr_form_submissions (form_key, employee_id, source_id)
  WHERE source_id IS NOT NULL;
