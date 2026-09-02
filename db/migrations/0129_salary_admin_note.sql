-- 0129 — Salary editable admin note. Super-admins (Manan/Hetesh) write a free
-- note per employee/month in the salary table's Remarks column. Kept SEPARATE
-- from the imported `remarks`/`manan_remarks` (both overwritten by the sheet
-- sync) so the note SURVIVES every re-sync — same contract as the paid mark.
-- Additive + idempotent.

alter table salary_breakup
  add column if not exists admin_note text,
  add column if not exists admin_note_at timestamptz,
  add column if not exists admin_note_by_id uuid references employees(id) on delete set null;
