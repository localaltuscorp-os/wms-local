-- 0070_cash_to_igv.sql
-- Founder request: rename the "Cash" entity AND payment mode to "IGV" across the
-- Outstanding rosters. App-visible "Cash" reads as unaccounted cash and looks bad
-- when anyone opens the app. Pure label change — these rows are referenced by id,
-- not by name, so nothing downstream breaks; fully reversible.
--
-- Idempotent: name is UNIQUE per table, so there is at most one "Cash" row. The
-- NOT EXISTS guard prevents a unique-name collision if an "IGV" row already
-- exists or the script is re-run (second run becomes a no-op).

UPDATE outstanding_entities
   SET name = 'IGV', updated_at = now()
 WHERE lower(name) = 'cash'
   AND NOT EXISTS (SELECT 1 FROM outstanding_entities e WHERE e.name = 'IGV');

UPDATE outstanding_payment_modes
   SET name = 'IGV', updated_at = now()
 WHERE lower(name) = 'cash'
   AND NOT EXISTS (SELECT 1 FROM outstanding_payment_modes m WHERE m.name = 'IGV');
