-- 0156 — Candidate Evaluation Checklist state stored on the intake record.
-- Idempotent. evaluation = { checked: string[] } (criterion ids).
alter table candidate_intake add column if not exists evaluation jsonb;
