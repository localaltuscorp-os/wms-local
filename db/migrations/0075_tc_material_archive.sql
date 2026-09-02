-- 0075 — Training Centre: archive flag for materials.
-- Managers/admins can archive (hide) or hard-delete materials. Archived
-- materials stay in the DB (recoverable) but drop out of the learner library;
-- delete cascades to tests/questions/attempts/watch via existing FKs.
ALTER TABLE "tc_materials" ADD COLUMN IF NOT EXISTS "archived" boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS "tc_materials_archived_idx" ON "tc_materials" ("archived");
