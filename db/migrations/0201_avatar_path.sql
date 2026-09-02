-- 0201 — store WHERE an avatar lives, not a URL that expires.
--
-- employees.avatar_url held a Supabase SIGNED url with a 7-day TTL. A signed
-- url is a temporary credential; persisting one means every uploaded avatar
-- breaks permanently a week after upload, returning a 400 JSON that the browser
-- then blocks (ERR_BLOCKED_BY_ORB) — a broken image with no way back.
--
-- The path is durable, so it is what we keep. avatar_url now points at our own
-- /api/avatar/<id>, which signs on demand at render time.

ALTER TABLE employees ADD COLUMN IF NOT EXISTS avatar_path text;
