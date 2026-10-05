# Restore global Aura top-bar titles

## Date

2026-10-01

## Work item and objective

- Branch: `bugfix/restore-global-topbar-titles`
- Objective: restore the shared route-title fallback in the Aura top bar so the
  page name appears consistently across modules, while preserving explicit
  page-specific titles.

## Current finding

`components/layout/app-top-bar.tsx` already implements the established title
resolution order: HR route title, navigation title, workspace label, then a
neutral fallback. The active `components/layout/aura-top-bar.tsx` publishes the
same portal slots but omitted that fallback. Consequently, only pages that
explicitly portal a title display one in the Aura header.

## Implemented change

- Reuse the existing route title helpers in `aura-top-bar.tsx`.
- Render the derived title only when no page has provided an explicit title.
- Keep Hub branding unchanged and do not change navigation, permissions, data,
  database, migrations, or deployment configuration.

## Validation

- `pnpm exec vitest run tests/unit/aura-top-bar-tabs.test.ts` passed.
- `pnpm exec eslint components/layout/aura-top-bar.tsx` passed.
- `pnpm exec tsc --noEmit --incremental false` passed with
  `NODE_OPTIONS=--max-old-space-size=6144`.
- The normal `pnpm typecheck` command first exhausted the local default Node
  heap; the higher-memory run then reached TypeScript but could not write its
  incremental cache in this protected temporary worktree. Neither result
  reported a source type error.
- Final diff review and `git diff --check` passed; only this handoff and the
  shared Aura top-bar component are changed.

## Status

Implemented and validated locally. No commit, push, merge, database action, or
new deployment has occurred. A release owner must review and authorize any
promotion or deployment separately.
