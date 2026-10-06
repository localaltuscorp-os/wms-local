# Billing header consistency

## Outcome

All 25 user-facing routes under `app/(app)/billing` now use the shared Training page-title typography. Billing, Ambassador, and configuration eyebrows were removed along with redundant page-header subtitles. Existing buttons, tabs, filters, tables, KPIs, record metadata, and status indicators remain in place.

## Implementation

`components/layout/page-command-bar.tsx` now exports its existing title typography as `PAGE_COMMAND_BAR_TITLE_STYLE`. Billing pages and their shared header-owning form/view components consume that exact token, so title type does not drift from Training.

The cleanup covers direct route headers plus the shared components used by create, edit, customer, and document routes. Document recipient/date metadata remains available inline with its document title; it is record context, not a standalone subtitle. Error-state messages and status chips were retained.

## Scope and safety

No routes, database structures, server actions, permission checks, data queries, or Billing business logic changed. No migration or access-control work is required.

## Validation

- `node node_modules/vitest/vitest.mjs run tests/unit/billing-header-consistency.test.ts` — passed, 3 tests.
- `node node_modules/eslint/bin/eslint.js 'components/layout/page-command-bar.tsx' 'app/(app)/billing' 'components/billing' 'tests/unit/billing-header-consistency.test.ts'` — passed.
- `node node_modules/typescript/bin/tsc --noEmit` — passed.
- `node node_modules/vitest/vitest.mjs run tests/unit/billing-contracts.test.ts` — passed, 34 tests.

## Follow-up

No browser pass was run in this change. A visual check of the Billing pages at desktop and mobile widths is the remaining optional verification.
