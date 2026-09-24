-- ════════════════════════════════════════════════════════════════════════════
-- 0249 — link a learning share back to the self-learning entry it came from.
--
-- WHY
--   Spec §18: "It should be possible to select 'Share this Self Learning'." A
--   share is often the re-telling of a self-learning session already logged.
--   This adds the optional FK on both share surfaces (the weekly tc_shares and
--   the daily tc_share_schedule) so the origin is preserved rather than just a
--   re-typed title.
--
--   Additive and idempotent. NULL for shares that did not originate from a
--   logged self-learning entry.
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE "tc_shares" ADD COLUMN IF NOT EXISTS "self_learning_id" uuid REFERENCES "tc_self_learning"("id") ON DELETE SET NULL;
ALTER TABLE "tc_share_schedule" ADD COLUMN IF NOT EXISTS "self_learning_id" uuid REFERENCES "tc_self_learning"("id") ON DELETE SET NULL;
