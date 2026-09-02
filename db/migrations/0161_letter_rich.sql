-- 0161 — Rich ("Google Docs") HR letters.
--
-- A letter is composed in the structured fill editor by DEFAULT. An "Edit
-- freely" action ejects it into a full TipTap rich editor whose output is stored
-- as HTML (+ an optional structured JSON snapshot) alongside the existing
-- merge_values. `content_kind` records which editor produced the archived body:
--   'structured' — rendered from the template + merge_values (existing pdfkit path)
--   'rich'       — rendered from body_html (headless-Chromium path)
-- Existing rows are all structured. Idempotent.
alter table document_instances
  add column if not exists body_rich jsonb;

alter table document_instances
  add column if not exists body_html text;

alter table document_instances
  add column if not exists content_kind text not null default 'structured';
