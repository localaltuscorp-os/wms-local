-- 0127 — WFH / on-site attendance evidence. Lets remote & field staff log
-- attendance from anywhere with location + reason + a photo + a work-mode tag
-- (office punches leave these null / 'office'). Additive + idempotent.

alter table attendance_logs
  add column if not exists work_mode text,      -- office | wfh | client_site | field | other
  add column if not exists evidence_path text;  -- photo storage key in the documents bucket

create index if not exists attendance_logs_work_mode_idx on attendance_logs (work_mode);
