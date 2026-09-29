# Rudra and Vinal branch integration handoff

- **Date:** 2026-09-29
- **Branch:** `integration/rudra-vinal-testing`
- **Status:** Validated and ready for Development Repository testing promotion.

## Objective

Integrate the current `origin/Rudra` and `origin/Vinal` changes into a clean branch based on `origin/main` for Development testing.

## Scope

- Start from `origin/main` at `dc1834fc`.
- Merge Rudra first, then Vinal.
- Resolve only merge conflicts that can be determined from the existing code; otherwise stop for review.
- Do not touch `fork/main`.

## Merge result

- `origin/Rudra` merged cleanly in `dc5cccdd`.
- `origin/Vinal` merged cleanly in `1497457f`.
- One TypeScript integration mismatch in `components/salary/salary-entity-select.tsx` was corrected locally: the shared `MultiFilter` component expects the standard `aria-label` prop, not `ariaLabel`.
- No merge conflict required manual resolution.

## Validation plan

- `pnpm typecheck` passed after the isolated selector-prop correction.
- Initial `pnpm test` completed with 28 failed tests, 5,192 passed, and 34 skipped.
- The established Development baseline accounts for 26 failures. Two additional integration failures were isolated:
  - `tests/unit/exec-calendar-markers.test.ts` expects a four-week Grid range, while Rudra intentionally changed `GRID_WEEKS` to six; this test needs a contract update if the six-week product behavior is approved.
  - `tests/unit/reimbursement-claim-access.test.ts` identified that Vinal's first implementation allowed administrators to edit even decided claims. The approved policy is administrators may change documents only while pending; `lib/reimbursements/claim-access.ts` now enforces that boundary and the test covers both allowed and refused admin cases.
- The two focused tests now pass: 25 tests across `reimbursement-claim-access` and `exec-calendar-markers`.
- The final full suite returned to the established 26-failure baseline (5,195 passed and 34 skipped); no additional test failures remain from this integration.
- A pre-commit scan found added identity-based dummy access and non-synthetic fixtures/comments in `lib/client-engagement/access-server.ts` and `tests/unit/ce-v2.test.ts`. The cleanup replaces the dummy identity check with the existing admin-role condition in development-only dummy mode and uses only neutral synthetic test fixtures. The focused Client Engagement suite passes (24 tests), and the final effective-diff scan finds only `example.com` test addresses.

## Remaining action

Commit the integration work and handoff, then promote only to the Development Repository `origin/main` for testing. `fork/main` remains out of scope. The full unit suite returns to the established baseline: 26 failures, 5,195 passed, and 34 skipped; no additional integration failures remain.
