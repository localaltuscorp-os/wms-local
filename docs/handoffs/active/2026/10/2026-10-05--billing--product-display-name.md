# Billing product display-name schema repair

Date: 2026-10-05
Branch: `bugfix/billing-product-display-name`

## Outcome

- New Document and New Customer KYC can load their Billing Product options.
- The missing `outstanding_products.display_name` column is added through an isolated additive migration.
- The destructive master-cleanup statements in `0259_masters_billing_part2.sql` are intentionally not executed.

## Production evidence

- Vercel logged Postgres `42703` on both `/billing/documents/new` and `/billing/customers/new` because `display_name` did not exist.
- A read-only schema audit confirmed the other selected columns already existed.

## Rollback

Application rollback requires no action. The nullable column is backward-compatible and should remain in place to preserve schema history.
