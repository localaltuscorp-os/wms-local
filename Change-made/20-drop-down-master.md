# 20 — Drop Down Master

**Date:** 26 September 2026  
**Migration:** None  
**Scope:** Admin Panel navigation and launcher only

---

## What changed

Added a new Admin Panel section at `/admin/drop-down-master`.

The page provides a compact module launcher for these twelve modules:

1. Admin
2. Incentive
3. Operations
4. WMS
5. Goals
6. Employees
7. Productivity
8. Project
9. Billing
10. Accounts
11. HR
12. Sales

Each launcher tile uses the existing module icon and colour from
`lib/module-theme.ts`. Selecting a module shows only the dropdown masters used
by that module.

## Master mappings

| Module | Dropdown masters |
| --- | --- |
| Admin | Function, Designation |
| Incentive | Products |
| Operations | Client, Subjects |
| WMS | Client, Subjects, Function |
| Goals | Function |
| Employees | Function, Designation |
| Productivity | Function |
| Project | Client |
| Billing | Products, Payment Modes, Paying Entity, Products (Legacy View) |
| Accounts | Products |
| HR | Paying Entity, Function, Designation |
| Sales | Designation |

## Existing sources reused

The launcher contains route references only. It creates no dropdown values,
tables, queries, actions, or duplicate sources of truth.

| Dropdown | Existing master route |
| --- | --- |
| Function | `/admin/functions` |
| Designation | `/admin/designations` |
| Client | `/admin/clients` |
| Subjects | `/admin/subjects` |
| Products | `/admin/products` |
| Payment Modes | `/admin/outstanding-payment-modes` |
| Paying Entity | `/admin/paying-entities` |
| Products (Legacy View) | `/admin/outstanding-products` |

## Files

- `app/(admin)/admin/drop-down-master/page.tsx` — module launcher and selected-module configuration links.
- `lib/admin/drop-down-master.ts` — module-to-existing-master mapping.
- `components/admin/admin-nav-config.ts` — new `Drop Down Master` Admin navigation item.
- `docs/dropdown-usage-audit.md` — dropdown usage audit used for grouping.

## Verification

- `pnpm.cmd typecheck` passed.
- Targeted ESLint passed for new page, mapping, and Admin navigation.
- All eight linked Admin master routes were verified present.
- `pnpm.cmd build` was interrupted by the local process (`^C`, exit code `3221225786`) before completion.

## Intentionally unchanged

- Dropdown values and all existing master data.
- Existing master pages, actions, queries, permissions, and authentication.
- Hub module order and module theme definitions.
- Database schema and migrations.
