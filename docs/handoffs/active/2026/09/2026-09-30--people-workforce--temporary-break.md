# People Workforce — Temporary Break

## Scope

- Employee Master: six active-workforce KPI filters, frozen identity columns, sortable scrollable table, canonical single-line DOJ.
- Temporary Break: persisted lifecycle, start/end actions, People dropdown page, manager restoration.
- Team Reporting: distinct Temporary Break bucket and root hierarchy safeguards.

## Data

- Migration: 0262_employee_temporary_breaks.sql (apply through the migration ledger).
- Active break is one open employee_temporary_breaks row per employee.
- Start stores the prior manager and clears the active manager link.
- End restores that manager only when it remains active and is not on break; otherwise no manager is assigned.

## Safeguards

- Active-break employees are excluded from active Employee Master KPIs and the live hierarchy.
- Manager assignment rejects an employee on break and a break employee as target manager.
- Existing super-admin/root detection prevents a root user from movement or Temporary Break placement; no personal identifiers were added.

## Validation

- Migration applier: applied 0258; skipped 337 ledgered migrations.
- Typecheck passed.
- Targeted Vitest: 3 files, 76 tests passed.
- Build compile started, but the local terminal time ceiling stopped observation before completion; no result recorded.

## Next

- Manually exercise start/end in a browser with an authorized People admin after deployment.
