# Archive reassignment and Project access integration handoff

- **Date:** 2026-09-28
- **Work item:** `archive-reassignment`
- **Source:** `origin/Shreya`, commit `078db129`.
- **Status:** Merged locally and validated; documentation handoff commit and authorized push to `origin/main` are pending.
- **Local merge commit:** `45f864ec526fd2aae5afb6bc9ce02eb54e04c5e0`.

## Objective

Integrate the Archive reassignment improvements and related Project Plan access/query changes from the Shreya development branch.

## Changes integrated

- Archive employee filtering and compact archive controls.
- Archive reassignment and restore behavior.
- Archived-task Doer column positioning.
- Related Project Plan actions, board behavior, and query updates.

## Files integrated

- `app/(app)/archive/[section]/page.tsx`
- `app/(app)/archive/actions.ts`
- `app/(app)/project-plan/actions.ts`
- `components/archive/archive-chrome.tsx`
- `components/archive/archive-people-filter.tsx`
- `components/archive/archive-tables-client.tsx`
- `components/project-plan/plan-board.tsx`
- `lib/queries/archive.ts`
- `lib/queries/project-plan.ts`

## Scope and safety

- Development Repository only.
- No production remote, deployment, Vercel, SQL, schema, or migration changes.
- The dirty local `main` worktree was not used or modified.

## Validation

- `pnpm typecheck` passed.
- `pnpm test` completed with 26 failures across 12 pre-existing baseline suites. The failing suites are outside the nine Archive and Project Plan files integrated from this branch; no Archive or Project Plan test failure was reported.

## Remaining action

Review the combined diff for unrelated changes, then an authorized maintainer may push the merge and the accompanying policy/handoff updates to `origin/main`.
