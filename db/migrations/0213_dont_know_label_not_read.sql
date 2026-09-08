-- 0213 — the `dont_know` status is labelled "Not Read", not "Don't Know"
--
-- WHAT WAS WRONG. `status_settings` is the authoritative, admin-editable label
-- map: every surface in the app reads it through `getStatusDisplayMap()`, and
-- it beats the code's own `STATUS_LABELS_FALLBACK`. Migration 0024 seeded this
-- row as 'Don''t Know' back when the status was introduced, and the product
-- name settled on "Not Read" afterwards — the fallback map in lib/format.ts was
-- updated to match, the database row never was.
--
-- So the two disagreed, and the database won everywhere it mattered: the tasks
-- table's Doer Status chip, the status filter, the kanban column, the dashboard
-- legends and the exports all said "Don't Know" while the code, the docs and
-- db/enums.ts all said "Not Read". The fallback only shows up when a DB read
-- fails, which is precisely when nobody is looking at labels.
--
-- WHY AN UPDATE AND NOT AN EDIT TO 0024. That migration has already run on
-- every environment; changing it would fix nothing that exists and would make
-- the file lie about what was applied. Forward-only.
--
-- SCOPED TO THE STALE VALUE. `where label = 'Don''t Know'` means an admin who
-- has deliberately renamed this status to something of their own keeps their
-- name — this repairs the seed, it does not overwrite a decision. Re-running is
-- a no-op once the row is corrected.
UPDATE status_settings
   SET label = 'Not Read'
 WHERE status = 'dont_know'
   AND label = 'Don''t Know';

-- The row may not exist at all on a database seeded before 0024. Same label,
-- same colour and same ordering as 0024 gave it, so the two paths converge.
INSERT INTO status_settings (status, label, color_token, display_order)
VALUES ('dont_know', 'Not Read', 'stone', 5)
ON CONFLICT (status) DO NOTHING;
