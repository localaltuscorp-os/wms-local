# Archive reassignment and Project access integration handoff

- **Date:** 2026-09-28
- **Work item:** `archive-reassignment`
- **Source:** `origin/Shreya`, commit `078db129`.
- **Status:** Merged, validated, and integrated into `origin/main`; authorized promotion to `fork/main` is pending.
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

The change is available on Development `origin/main` at `a14e34bcea52c3e10467d3d5f7da7a1bd51e6065`. Production promotion must follow the documented release handoff and use the approved fast-forward range.
