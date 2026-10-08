# Mobile attendance photo picker

- **Date:** 2026-10-08
- **Work item:** `bugfix/mobile-attendance-photo`
- **Status:** CI passed; awaiting approved merge and production deployment

## Objective

Make the remote attendance evidence step reliable on mobile by giving people separate choices to take a new photo or upload an existing image.

## What changed

- `components/attendance/remote-checkin-dialog.tsx`
  - Replaced the single ambiguous photo control with separate **Take photo** and **Upload photo** controls.
  - The camera control retains `capture="environment"`; the upload control deliberately omits it so mobile browsers can open the gallery/files picker.
  - Both choices feed the same existing `photo` state and unchanged `punchRemote` action.

## Data and access impact

- No schema, migration, configuration, role, or authorization changes.
- Existing server-side constraints remain: authenticated caller, approved remote-work request, location, note, image-only evidence, and 15 MB maximum file size.

## Verification

- `git diff --check` passed.
- File-level ESLint completed with no errors. It reports one existing warning for `setMounted(true)` in the component's mount effect; this change does not alter that effect.
- Full typecheck was attempted with a 4 GB temporary Node heap. It reached an unrelated missing local `nodemailer` module resolution error because this worktree initially had no installed dependencies.
- GitHub Actions run `37732940884` passed its clean `pnpm install --frozen-lockfile`, `pnpm typecheck`, and `pnpm test` stages for commit `33aaffa7`.
- Visual tests were skipped because the required secret-backed environment is not configured in the workflow.

## Release / rollback

- No production deployment has occurred yet.
- Rollback is a one-file revert of the UI picker change.
