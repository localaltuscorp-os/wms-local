-- Tier-3 follow-up — seed status_settings rows for the 4 new status values
-- introduced in migration 0019 (need_info, follow_up_1/2/3).
--
-- Without these rows, the admin Statuses tab silently fails to save renames
-- and tone changes for the new statuses (UPDATE affects 0 rows, action
-- returns ok, UI reverts on reload). status_settings has INSERT revoked
-- from `authenticated` per migration 0016, so app code can't backfill —
-- the migration owner has to seed.
--
-- display_order slots the new entries between existing rows so the admin
-- table reads as a logical timeline: follow_up_1/2/3 sit between the legacy
-- "Follow Up" (30) and Need Help (40); need_info comes right after the
-- need bucket.

INSERT INTO status_settings (status, label, color_token, display_order) VALUES
  ('follow_up_1', 'Follow Up 1', 'amber', 32),
  ('follow_up_2', 'Follow Up 2', 'amber', 34),
  ('follow_up_3', 'Follow Up 3', 'red',   36),
  ('need_info',   'Need Info',   'blue',  45)
ON CONFLICT (status) DO NOTHING;
