# Module Backup Folder Reuse

## Date

2026-09-29

## Work item and objective

- Branch: `bugfix/module-backup-folder-reuse`
- Objective: keep one Drive folder per module and retain one dated subfolder per
  backup day.

Expected layout:

```text
Altus Module Backups/
  WMS/
    2026-09-28/
    2026-09-29/
```

## Status

Implemented and verified locally. Not yet committed, pushed, reviewed, merged,
or deployed.

## Root cause

The backup runner remembers only the root Drive folder ID. Module and dated
folders call `ensureFolder` without a remembered ID. The Drive client therefore
created a new same-name module folder on every nightly run instead of finding
the app-created child already under the correct parent.

## Changes

- `lib/hr/records-export/drive-google.ts`
  - Look up an existing non-trashed folder by name and exact parent.
  - Reuse that folder before attempting creation.
  - Escape Drive query literals.
- `tests/unit/drive-folder-reuse.test.ts`
  - Covers module-folder reuse, dated-folder reuse, parent isolation, and query
    escaping with synthetic data.

## Database and migrations

None.

## Security and access

No permission changes. The existing OAuth scope remains `drive.file`, so the
lookup can only discover folders visible to the application connection.

## Testing

- `pnpm.cmd exec vitest run tests/unit/drive-folder-reuse.test.ts`
  - PASS: 1 file, 4 tests.
- `pnpm.cmd exec eslint lib/hr/records-export/drive-google.ts tests/unit/drive-folder-reuse.test.ts`
  - PASS: no errors or warnings.
- `pnpm.cmd typecheck`
  - Did not complete because Node exhausted its default 2 GB heap; no TypeScript
    diagnostic was reported before termination.
- `node --max-old-space-size=8192 node_modules/typescript/bin/tsc --noEmit --pretty false`
  - PASS: zero TypeScript errors.

## Risks and remaining work

- Existing duplicate folders are not deleted or moved automatically. That is a
  separate destructive cleanup requiring explicit review.
- The lookup chooses the oldest visible matching folder. Existing duplicates
  remain visible, but future runs converge on one folder instead of adding more.
- Verify the focused unit test, lint, and TypeScript before commit.

## Rollback

Revert the folder lookup in `googleDriveClient.ensureFolder`; no database or
Drive data rollback is required because this change does not move or delete
existing content.
