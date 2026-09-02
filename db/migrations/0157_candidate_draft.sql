-- 0157 — Candidate Interview Form draft/resume support. Idempotent.
-- instances = repeater structure for faithful resume; submitted_at = draft vs complete.
alter table candidate_intake add column if not exists instances jsonb;
alter table candidate_intake add column if not exists submitted_at timestamptz;
