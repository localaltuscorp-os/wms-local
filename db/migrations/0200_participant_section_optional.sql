-- 0200 — Hand-holding: a participant may exist before its Product is chosen.
--
-- The All Participants list is populated from the roster, and a product is not
-- known for every person at the moment they are added. Forcing NOT NULL meant
-- inventing one, which is worse than an honest blank: "—" says "not assigned",
-- a wrong PS says something false.
--
-- Every reader compares section to a known code, so a NULL simply matches no
-- section rather than needing a special case.

ALTER TABLE pa_entries ALTER COLUMN section DROP NOT NULL;
