# Restore reimbursement claim fields

## Objective

Restore the mandatory reimbursement request fields when a saved form
configuration is incomplete.

## Finding

The live claim dialog rendered only Notes and the receipt uploader because the
saved reimbursement form configuration omitted the core request fields.

## Change

`resolveRequestFields("reimbursement")` now validates the configuration has
Expense For, Amount, Expense Date, and Product. If any are absent, it uses the
existing complete reimbursement definition. This also keeps server-side
submission validation aligned with the dialog.

## Scope

- No database migration or production data change.
- No authorization, storage, or upload-flow change.
- The broader Billing/navigation restoration remains unimplemented.

## Validation

- `git diff --check` passed.
- Dependency installation and full automated checks remain pending in this new
  isolated worktree.

## Status

Implemented locally; not committed, pushed, merged, or deployed.
