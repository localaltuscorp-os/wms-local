# 15 — Admin Panel → Control Panel + Salary Breakup

> **PARTLY SUPERSEDED on 2026-09-24 by [`17-control-panel-module.md`](./17-control-panel-module.md).**
>
> This document placed the Control Panel **inside** the Admin Panel. It is no
> longer there: it left the Admin Panel and became a module of its own at
> `/control-panel`, shown only to the people the permission matrix lets in.
>
> What that changes here, and what it does not:
>
> - **The Admin Panel → Control Panel group** this document created is gone.
>   `components/admin/admin-nav-config.ts` no longer has it, and no Control Panel
>   route exists under `app/(admin)/admin/`.
> - **The five screens are the same five**, unchanged in behaviour, at
>   `/control-panel/*`. Their files moved from `app/(admin)/admin/control-panel/`.
> - **The permission keys named below are stale.** `admin.control-panel`,
>   `admin.control-panel.*` and `admin.temporary-access` are now
>   `control-panel`, `control-panel.*` and `control-panel.temporary-access`.
>   Existing grants moved with them, by migration `0251`. Where this document
>   says "the KEY is unchanged so existing grants keep working", read it as "was
>   true on 22 September; the keys changed on 24 September, and 17 records why".
> - **The old paths still resolve** — `/admin/control-panel/*` and
>   `/admin/temporary-access` forward to the new ones from `next.config.ts`,
>   rather than from a redirect page as described below.
> - **Salary Breakup (§4 below) is untouched** and is still current.

**Date:** 22 September 2026
**Migration:** `db/migrations/0246_control_panel.sql` — **applied 2026-09-22**
**SQL for another database:** [`SQL/13-apply-control-panel.sql`](./SQL/13-apply-control-panel.sql),
verified by [`SQL/14-verify-control-panel.sql`](./SQL/14-verify-control-panel.sql)
**Written for:** anyone, including people who did not build this.

---

## What changed

1. **Admin Panel → Control Panel** — a new nav group with five surfaces: Users,
   Roles, Permissions, Effective Access, Temporary Access.
2. **Temporary Access relocated** under Control Panel — reused, not rebuilt.
3. **Roles / Permissions / Effective Access** built on the existing permission
   architecture (no second system).
4. **Salary Profile → Salary Breakup** — navigation/UI rename only.

---

## 1. Temporary Access — relocated, not rebuilt

The existing Temporary Access implementation (delegated access) is unchanged in
every functional way. What moved:

- `app/(admin)/admin/temporary-access/{page.tsx,actions.ts}` →
  `app/(admin)/admin/control-panel/temporary-access/`.
- `components/admin/temporary-access-panel.tsx` and
  `components/auth/delegation-banner.tsx` now import the actions from the new
  path.
- The old route `/admin/temporary-access` is a redirect shim to the canonical
  location, so old links and bookmarks still resolve.
- The permission catalogue key `admin.temporary-access` is **unchanged** (only
  its `routes` moved), so existing grants and the page's `requireModuleView`
  keep working.

**Preserved verbatim:** `delegated_access_grants` / `delegated_access_events`
tables, `lib/auth/delegated-access.ts`, `delegation-permission.ts` (hierarchy
gate), `delegated-expiry.ts` (expiry), the panel component, and every grant /
revoke / expiry / validation path. Only the navigation location moved. One
canonical nav item remains.

## 2. Roles / Permissions / Effective Access

- **Users** — the existing employee directory joined live (name, code, function,
  designation, entity, roles, active state). Selecting a row deep-links to
  Effective Access. No employee data duplicated.
- **Roles** — a configurable template layer (`roles`, `role_permissions`,
  `employee_roles`). A user holds many roles. A role holds many
  (module, action, scope) permissions. The richer 15-action + 7-scope vocabulary
  (`lib/permissions/vocabulary.ts`) is stored as data and shown in Effective
  Access; enforcement stays the existing `module_permissions` matrix (show/view/
  edit), with read-class actions mapping to view and mutating actions to edit.
- **Permissions** — edits the existing per-employee `module_permissions` matrix
  (show/view/edit), reusing `setModulePermission` / `fetchEmployeeMatrix` from
  `app/master-admin/actions.ts` unchanged.
- **Effective Access** — composes roles + direct overrides + temporary access for
  one person, deduplicating inherited permissions and combining their sources.
  Temporary access is shown separately, labelled live / revoked / expired.

Write actions are master-admin gated (`master_admin.manage`, the existing
capability) — "admin" is not automatically full access.

## 3. Logs integration

Every Control Panel change writes the immutable Logs (`lib/logs/audit.ts`), using
the existing event vocabulary + rich `action`/`resourceType` metadata — no new
logging system, no log is editable or deletable:

- role create/update/delete → `CREATE` / `UPDATE` / `DELETE` (resourceType `role`)
- role assign/remove → `CONFIG_CHANGE` (`role_assign` / `role_remove`)
- permission grant/revoke → `CONFIG_CHANGE` (`permission_grant` / `permission_revoke`)
- scope change → `UPDATE` (`scope`, with before/after `changes`)
- temporary access grant/revoke → `CONFIG_CHANGE` (`temp_access_grant` /
  `temp_access_revoke`), added beside the existing `delegated_access_events`
  (additive, does not modify them)

## 4. Salary Profile → Salary Breakup

Route `/admin/salary-profiles` is unchanged (minimal safe change). The user-facing
label is now "Salary Breakup" in the admin nav, the page title, and the edit
dialog title/toast. No salary logic, no calculation, no table rename.

## Files

**New**
- `db/migrations/0246_control_panel.sql`
- `lib/permissions/vocabulary.ts`, `lib/permissions/effective-access.ts`
- `lib/queries/control-panel.ts`
- `app/(admin)/admin/control-panel/{users,roles,permissions,effective-access,temporary-access}/` pages
- `app/(admin)/admin/control-panel/roles/actions.ts`
- `components/admin/control-panel/{roles-client,permissions-client,effective-access-client}.tsx`
- `tests/unit/vocabulary.test.ts`, `tests/unit/effective-access.test.ts`
- `Change-made/15-control-panel.md`, `Change-made/SQL/13,14`

**Modified**
- `components/admin/admin-nav-config.ts` (Control Panel group; Temporary Access
  moved; Salary Profiles → Salary Breakup)
- `lib/permissions/catalog.ts` (`admin.control-panel` nodes; `admin.temporary-access`
  route moved)
- `db/schema.ts` (`roles`, `rolePermissions`, `employeeRoles`)
- `app/master-admin/actions.ts` (global Logs mirror on permission writes)
- `app/(admin)/admin/salary-profiles/page.tsx`,
  `components/admin/salary-profile-dialog.tsx` (labels)
- `components/admin/temporary-access-panel.tsx`,
  `components/auth/delegation-banner.tsx` (import path)
- `app/(admin)/admin/temporary-access/page.tsx` (redirect shim)

**Relocated (reused)**
- `app/(admin)/admin/temporary-access/{page.tsx,actions.ts}` →
  `app/(admin)/admin/control-panel/temporary-access/`

## Verification

- `pnpm db:migrate` applied `0246`. `npx tsc --noEmit` clean; `npx eslint` clean
  (0 errors); `npx vitest run` — vocabulary + effective-access + permission
  catalogue + delegated-access tests green (49 tests).
- Live, on a fresh dev server: all five Control Panel pages return 200; the Roles
  page renders the seeded "Super Admin" role; the admin nav shows "Control Panel"
  (Users/Roles/Permissions/Effective Access/Temporary Access), "Salary Breakup",
  and Temporary Access gone from the old "Access" group; `/admin/temporary-access`
  redirects to the canonical location.

## Constraints / decisions

- **No runtime data-scope enforcement this pass.** The 7 scopes are stored and
  shown; wiring them into every query would touch every module. Enforcement
  remains the existing 3-action matrix + capabilities + delegated access.
- **15 actions collapse to 3 enforcement buckets** (view/export/download → view;
  the rest → edit) — richer vocabulary is data, not a second engine.
- **Role/permission writes are master-admin gated** via the existing
  `master_admin.manage` capability.
- **Temporary Access key is unchanged** to preserve existing grants.
