-- Manan's authoritative status colour scheme (2026-05-27). Migrations 0016
-- and 0021 seeded the original status_settings rows with placeholder
-- `amber/red/blue` tokens, predating the extended palette landed in
-- 0019/0020. lib/format.ts has the correct fallback, but mergeStatusDisplay
-- prefers DB rows, so the stale tokens were winning on every surface that
-- reads getStatusDisplayMap() — picker dots, kanban headers, the
-- distribution chart, etc.
--
-- This migration aligns every status_settings row with the canonical scheme:
--
--   dont_know     → stone   (light grey)
--   not_started   → blue    (light blue)
--   initiated     → yellow
--   follow_up     → orange  (legacy follow-up — kept in orange family)
--   need_help     → red
--   need_info     → red
--   follow_up_1   → orange
--   follow_up_2   → orange
--   follow_up_3   → orange
--   done          → green   (light green)
--   approved      → purple
--   not_approved  → rose    (light red)
--   cancelled     → slate   (dark grey)
--   transferred   → brown
--
-- Idempotent: re-running is a no-op once tokens are in place. Admins who
-- have intentionally recoloured a status will be reset — accepted, since
-- the canonical scheme is the new floor.

UPDATE status_settings SET color_token = 'stone'  WHERE status = 'dont_know'    AND color_token <> 'stone';
UPDATE status_settings SET color_token = 'blue'   WHERE status = 'not_started'  AND color_token <> 'blue';
UPDATE status_settings SET color_token = 'yellow' WHERE status = 'initiated'    AND color_token <> 'yellow';
UPDATE status_settings SET color_token = 'orange' WHERE status = 'follow_up'    AND color_token <> 'orange';
UPDATE status_settings SET color_token = 'red'    WHERE status = 'need_help'    AND color_token <> 'red';
UPDATE status_settings SET color_token = 'red'    WHERE status = 'need_info'    AND color_token <> 'red';
UPDATE status_settings SET color_token = 'orange' WHERE status = 'follow_up_1'  AND color_token <> 'orange';
UPDATE status_settings SET color_token = 'orange' WHERE status = 'follow_up_2'  AND color_token <> 'orange';
UPDATE status_settings SET color_token = 'orange' WHERE status = 'follow_up_3'  AND color_token <> 'orange';
UPDATE status_settings SET color_token = 'green'  WHERE status = 'done'         AND color_token <> 'green';
UPDATE status_settings SET color_token = 'purple' WHERE status = 'approved'     AND color_token <> 'purple';
UPDATE status_settings SET color_token = 'rose'   WHERE status = 'not_approved' AND color_token <> 'rose';
UPDATE status_settings SET color_token = 'slate'  WHERE status = 'cancelled'    AND color_token <> 'slate';
UPDATE status_settings SET color_token = 'brown'  WHERE status = 'transferred'  AND color_token <> 'brown';

-- Backfill any Tier-3 rows that might be missing (defensive — migration
-- 0021 seeds these, but if a journal-out-of-sync env skipped it, we don't
-- want the picker silently rendering fallback colours).
INSERT INTO status_settings (status, label, color_token, display_order) VALUES
  ('dont_know',   'Don''t Know',   'stone',  5),
  ('need_info',   'Need Info',     'red',    45),
  ('follow_up_1', 'Follow Up 1',   'orange', 32),
  ('follow_up_2', 'Follow Up 2',   'orange', 34),
  ('follow_up_3', 'Follow Up 3',   'orange', 36)
ON CONFLICT (status) DO NOTHING;

-- Bump updated_at so any consumer watching the row sees a fresh write
-- (revalidateTag on the status-display cache still has to be triggered
-- separately — the admin UI does this on save, but for a bulk migration
-- like this you'll want to revalidate from the app or just wait out the
-- 3600s unstable_cache TTL).
UPDATE status_settings SET updated_at = now() WHERE color_token IN
  ('stone','blue','yellow','orange','red','green','purple','rose','slate','brown');
