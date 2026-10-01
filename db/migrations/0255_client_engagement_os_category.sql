-- 0255 — Client Engagement gains an OS (Outstation) product type alongside
-- Retainer, Ambassador, PS, BSS and Corporate.
--
-- OS is a real row on the admin Product Master (`outstanding_products`,
-- seeded PS/BSS/OS/Retainer among others) that Client Engagement's own
-- category list had never picked up. It joins as a PARTICIPANT (group "P"),
-- same as PS and BSS, but — unlike them — carries no batch number: the CHECK
-- on `batch_code` below is deliberately left listing only 'ps' and 'bss', so
-- an OS account can never be given one.
ALTER TABLE "ce_accounts"
  DROP CONSTRAINT IF EXISTS "ce_accounts_category_chk";
ALTER TABLE "ce_accounts"
  ADD CONSTRAINT "ce_accounts_category_chk"
  CHECK ("category" IN ('ps', 'bss', 'os', 'retainer', 'corporate', 'ambassador'));
