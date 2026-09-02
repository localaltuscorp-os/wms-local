-- 0159 — Management Assessment (Pre-Interview, management round). Idempotent.
-- Stores the whole management-round capture per candidate as one jsonb blob:
--   { notes: text,
--     recordings:  [{ path, durationSec, createdAt }],
--     attachments: [{ path, name, mime, size }] }
-- Files (audio/video/images/docs) live in the Supabase "documents" bucket under
-- management-assessment/<kind>/<uuid>.<ext>; only their paths + metadata are here.
alter table candidate_intake add column if not exists management_assessment jsonb;
