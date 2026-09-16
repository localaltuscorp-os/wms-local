-- ════════════════════════════════════════════════════════════════════════════
-- ENTITY CODE PREFIXES (0227) — the letters employee codes are built from.
--
--     A = Altus Corp                       A-101, A-102, …
--     U = Unleashed                        U-101, …
--     K = Khushboo                         K-101, …
--     M = The Gainmakers (MJV HUF)         M-101, …
--     J = Legacy Creators (JSV HUF)        J-101, …
--
-- Interns carry an "I" after the letter — AI/UI/KI/MI/JI — as a SEPARATE number
-- series. That rule lives in lib/employees/employee-code.ts and needs nothing
-- here: the intern prefix is derived from the entity letter at allocation time.
--
-- ── WHY THIS IS A MIGRATION OF ITS OWN, AND WHY 0225 LEFT IT NULL ─────────
-- Migration 0225 added `code_prefix` and deliberately assigned none, recording
-- the reason: "two entities currently carry a Khushboo name and which of them
-- owns 'K' is not a migration's decision." That was right. The two candidates
-- were `Khushboo` and `The Perfect Blend (Khushboo Shah)`, and picking wrongly
-- would put five people on the wrong series — codes that cannot be un-issued.
--
-- It is now an operator decision rather than a guess: K is `Khushboo`, the
-- entity that actually has the five employees. `The Perfect Blend (Khushboo
-- Shah)` is deliberately left NULL — it has no employees, and a letter it does
-- not need is a letter nobody else can have.
--
-- ── MATCHED ON EXACT NAME, AND SILENT ON A MISS ──────────────────────────
-- `name` is UNIQUE on this table and is the value migration 0158 reconciled
-- these rows to, so it is the stable handle; ids differ between environments.
-- A name that does not match updates nothing rather than guessing at a
-- near-neighbour — assigning A to the wrong company is worse than assigning
-- nothing, because the codes it mints are permanent.
--
-- ── SAFE TO RE-RUN ────────────────────────────────────────────────────────
-- Each statement is conditional on the prefix not already being set, so this
-- cannot overwrite a letter an administrator has since changed by hand.
-- ════════════════════════════════════════════════════════════════════════════

UPDATE paying_entities SET code_prefix = 'A'
 WHERE name = 'Altus Corp' AND code_prefix IS NULL;

UPDATE paying_entities SET code_prefix = 'U'
 WHERE name = 'Unleashed' AND code_prefix IS NULL;

-- The operator's decision. See the header.
UPDATE paying_entities SET code_prefix = 'K'
 WHERE name = 'Khushboo' AND code_prefix IS NULL;

UPDATE paying_entities SET code_prefix = 'M'
 WHERE name = 'The Gainmakers (MJV HUF)' AND code_prefix IS NULL;

UPDATE paying_entities SET code_prefix = 'J'
 WHERE name = 'Legacy Creators (JSV HUF)' AND code_prefix IS NULL;

-- ── ONE LETTER, ONE ENTITY ────────────────────────────────────────────────
-- Two entities sharing a letter would mint colliding codes: both would draw
-- from the same series, and the first collision would surface as a unique-index
-- error at the moment somebody tried to issue a code. Enforced in the database
-- because the allocator derives the prefix from whatever is in this column and
-- has no way to notice that two rows agree.
--
-- Partial, so the entities with no letter (The Perfect Blend, and any entity
-- added later) are not all competing for a single NULL.
CREATE UNIQUE INDEX IF NOT EXISTS paying_entities_code_prefix_uq
  ON paying_entities (upper(code_prefix))
  WHERE code_prefix IS NOT NULL;

-- A prefix is ONE letter here. The intern series is derived, never stored, so a
-- two-character value in this column would mean somebody had mistaken the
-- entity letter for a full prefix — and `suggestPrefix` would then produce
-- "UII" for an intern were it not separately idempotent.
ALTER TABLE paying_entities DROP CONSTRAINT IF EXISTS paying_entities_code_prefix_chk;
ALTER TABLE paying_entities
  ADD CONSTRAINT paying_entities_code_prefix_chk
  CHECK (code_prefix IS NULL OR code_prefix ~ '^[A-Za-z]$');
