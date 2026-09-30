# Module Backup Folder Reuse and Readable Filenames

## Date

2026-09-29

## Work item and objective

- Branch: `bugfix/module-backup-folder-reuse`
- Objective: keep one Drive folder per module, retain one dated subfolder per
  backup day, and give copied PDFs/images readable content-based filenames.

Expected layout:

```text
Altus Module Backups/
  WMS/
    2026-09-28/
    2026-09-29/
```

## Status

Implemented and verified. The approved development commits are `7273722e` for
folder reuse and `54dff959` for readable filenames. They are ancestors of
`origin/main`. The isolated production release branch is
`release/module-backup-only-2026-09-30`, based on `fork/main` at `8750402e`,
with production candidate commits `08b65f75`, `ebc43555`, and documentation
commits `d6fa5b5c` and `a29a03ce`. The release contains only this backup work.
It was pushed directly to `fork/main` under the user's explicit release
authorization and the remote update was verified.

## Root cause

The backup runner remembers only the root Drive folder ID. Module and dated
folders call `ensureFolder` without a remembered ID. The Drive client therefore
created a new same-name module folder on every nightly run instead of finding
the app-created child already under the correct parent.

For attachments, the table exporter used the object-storage basename whenever
the row did not include an original filename. Storage basenames are commonly
UUIDs, so PDFs and images reached Drive with names that did not describe their
contents.

## Changes

- `lib/hr/records-export/drive-google.ts`
  - Look up an existing non-trashed folder by name and exact parent.
  - Reuse that folder before attempting creation.
  - Escape Drive query literals.
- `tests/unit/drive-folder-reuse.test.ts`
  - Covers module-folder reuse, dated-folder reuse, parent isolation, and query
    escaping with synthetic data.
- `lib/modules/backup/names.ts`
  - Builds readable names from the configured document details, content label,
    relevant date, and the original extension.
  - Preserves a real uploaded filename, adding the storage extension only when
    the recorded filename omitted it.
- `lib/modules/backup/table-dataset.ts`
  - Uses the shared readable-name builder instead of falling back to a storage
    UUID and supports declarative label/detail/date metadata.
- `lib/modules/backup/registry.ts`
  - Describes unnamed PDFs, signatures, photos, invoices, recordings,
    presentations, evidence, and other backup attachments.
- `tests/unit/module-backup.test.ts`
  - Covers UUID replacement, descriptive naming, extension preservation, and
    compatibility with duplicate-name numbering.

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
- `pnpm.cmd exec vitest run tests/unit/module-backup.test.ts -t "file names in a folder"`
  - PASS: 4 tests (18 unrelated tests skipped by the filter).
- `pnpm.cmd exec eslint lib/modules/backup/names.ts lib/modules/backup/table-dataset.ts lib/modules/backup/registry.ts tests/unit/module-backup.test.ts`
  - PASS: no errors or warnings.
- `pnpm.cmd exec vitest run tests/unit/module-backup.test.ts tests/unit/drive-folder-reuse.test.ts`
  - PARTIAL: filename and folder tests passed; two unrelated legacy assertions
    failed because they still expect `isSuperAdmin` and an admin-nav entry while
    the current branch uses `isMasterAdmin` and no longer has that nav entry.
- After integrating current `origin/main`:
  - `pnpm.cmd exec vitest run tests/unit/drive-folder-reuse.test.ts tests/unit/module-backup.test.ts -t "file names in a folder|Drive folder reuse"`
    - PASS: 2 files, 8 tests; 18 unrelated tests skipped by the filter.
  - `pnpm.cmd exec eslint lib/hr/records-export/drive-google.ts lib/modules/backup/names.ts lib/modules/backup/table-dataset.ts lib/modules/backup/registry.ts tests/unit/drive-folder-reuse.test.ts tests/unit/module-backup.test.ts`
    - PASS: no errors or warnings.
  - `node --max-old-space-size=8192 node_modules/typescript/bin/tsc --noEmit --pretty false`
    - PASS: zero TypeScript errors.
- Production candidate based on `fork/main`:
  - `pnpm.cmd typecheck`: PASS.
  - Focused folder-reuse test: PASS, 4/4.
  - Focused readable-filename test: PASS, 4/4 (18 unrelated tests skipped).
  - Changed-file ESLint: PASS, zero errors.
  - `pnpm.cmd build`: PASS; optimized build, TypeScript, page collection, and
    all 36 static pages completed.
  - `pnpm.cmd check:leaks`: PASS; zero PGlite source or NFT traces.

## Risks and remaining work

- Existing duplicate folders are not deleted or moved automatically. That is a
  separate destructive cleanup requiring explicit review.
- The lookup chooses the oldest visible matching folder. Existing duplicates
  remain visible, but future runs converge on one folder instead of adding more.
- Readable names apply on new backup copies; this does not rename files already
  present in Drive.
- Two stale, unrelated assertions in the full module-backup unit file remain as
  described under Testing; they were not changed as part of this focused fix.

## Rollback

Rollback production to pre-release `fork/main` SHA `8750402e`, or revert the
three production release commits without rewriting history. No database or
Drive data rollback is required because this change does not move, delete, or
rename existing content.
