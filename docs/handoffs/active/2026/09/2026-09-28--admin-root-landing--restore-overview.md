# Admin root landing restoration handoff

- **Date:** 2026-09-28
- **Branch:** `bugfix/admin-root-landing`
- **Status:** Implemented and validated locally; not pushed or deployed.

## Objective

Replace the unconditional 404 at `/admin` with a redirect to the first current Admin destination.

## Current behavior and cause

- `app/(admin)/admin/page.tsx` currently calls `notFound()` unconditionally.
- The 404 was introduced in commit `70049be3`.
- Individual Admin pages and the Admin layout continue to exist.

## Intended fix

- Redirect full admins to `/admin/employees`, the first current Admin navigation destination.
- Preserve the current Admin layout and its authorization behavior, including the roster-only redirect.

## Design note

The historical Admin Overview cannot be restored safely because the 24 September Admin separation also removed its overview query and activity-preview component. The redirect fixes the broken URL without reviving removed dependencies or inventing a new dashboard.

## Scope and safety

- Development Repository only.
- No SQL, schema, migration, production, deployment, Vercel, GitHub-setting, or authorization-model changes.
- The dirty local `main` worktree is not used or modified.

## Validation completed

- `pnpm exec eslint "app/(admin)/admin/page.tsx"` passed.
- `pnpm typecheck` passed.
- `git diff --check` passed.
- The final diff contains only the Admin root route and this active handoff; no PII or secrets were introduced.

## Remaining action

Review and commit the isolated fix. Do not push or deploy unless explicitly authorized.
