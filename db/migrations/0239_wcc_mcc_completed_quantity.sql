-- 0239 — WCC / MCC: how many were actually done (account holder, 2026-09-19).
--
-- A compliance with a target above one ("Send 25 emails", or a DCC Target of
-- 50 calls) asks the doer, when they mark it Done, how many they completed —
-- 18 of 25, say. That count is recorded here, on the fill.
--
--   completed_quantity  whole number, 0 or more; NULL for a compliance with no
--                       quantity (no target, or a target of 1), and for any
--                       fill that is not Done
--
-- The target itself is NOT new: it is dcc_kpi_items.target_number (and unit),
-- which the DCC Masters already set. Every WCC/MCC save also writes the count to
-- dcc_entries.value_number — DCC's own "value" — so the 10 pm DCC report and
-- the Android app show the same number without changing.
--
-- ADDITIVE and idempotent — this repository applies migrations by hand. The app
-- reads around a database without it (lib/queries/compliance.ts), so the order
-- of deploy and migration does not matter; only recording a quantity waits for it.

alter table dcc_entries add column if not exists completed_quantity integer;

alter table dcc_entries drop constraint if exists dcc_entries_completed_quantity_chk;
alter table dcc_entries add constraint dcc_entries_completed_quantity_chk
  check (completed_quantity is null or completed_quantity >= 0);
