# Employee Master code backfill and contact UI

- Date: 2026-09-29
- Work item: employee-master
- Status: implemented, not committed or deployed

## Summary

- Kept the canonical allocator and its entity/intern numbering rules.
- Made automatic allocation retry-safe per employee and preserved deliberate code moves.
- Extended the existing backfill script to restore a missing denormalized code from an active registry row before allocating a new code.
- Added the `employees:backfill-codes` command. It is dry-run by default and requires an explicit admin actor with `--apply`.
- Separated editable Office Mail and Personal Mail from the read-only Firebase login address; tightened wrapping and compacted the emergency-contact empty state.

## Files

- `lib/employees/code-registry.ts`
- `scripts/backfill-employee-codes.ts`
- `package.json`
- `lib/employees/master-query.ts`
- `components/admin/employee-master/workspace.tsx`
- `components/admin/employee-master/aura.css`
- `tests/unit/employee-master-fields.test.ts`

## Database and deployment

- No schema migration or database write was run.
- Before applying, run a dry run from the intended environment, then use an approved administrator as the audit actor:
  `pnpm employees:backfill-codes -- --apply --actor-email=<approved-admin>`
- Rows without an entity prefix remain intentionally skipped; assigning a prefix is required before the canonical allocator can issue a code.

## Verification

- `node node_modules\\vitest\\vitest.mjs run tests\\unit\\employee-code.test.ts tests\\unit\\employee-master-fields.test.ts` — 74 passed.
- `node node_modules\\eslint\\bin\\eslint.js components/admin/employee-master/workspace.tsx lib/employees/master-query.ts lib/employees/code-registry.ts scripts/backfill-employee-codes.ts tests/unit/employee-master-fields.test.ts` — passed.
- `node node_modules\\typescript\\bin\\tsc --noEmit` — passed.
- `git diff --check` — passed.

## Next steps

- Review the dry-run list in the target environment before applying the backfill.
- Keep the unrelated scoped-temporary-access worktree changes separate when staging or committing.
