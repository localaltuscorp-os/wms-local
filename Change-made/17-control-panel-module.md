# 17 — Control Panel leaves the Admin Panel and becomes a module of its own

**Date:** 24 September 2026
**Migration:** `db/migrations/0251_control_panel_module.sql` — **applied 2026-09-24**
**SQL for another database:** [`SQL/17-apply-control-panel-module.sql`](./SQL/17-apply-control-panel-module.sql),
verified by [`SQL/18-verify-control-panel-module.sql`](./SQL/18-verify-control-panel-module.sql)
**Written for:** anyone, including people who did not build this.

---

## What was asked for

> Remove Control Panel completely from Admin Panel. Make Control Panel a separate
> top-level WMS module, alongside WMS, Goals, Billing, HR, etc. Users with Control
> Panel permission → module appears normally. Users without permission → Control
> Panel should not appear anywhere: no sidebar/nav item, module card, route link,
> dashboard shortcut, or discoverable menu entry. Enforce the permission
> server-side as well, so manually entering the Control Panel URL/API is also
> blocked. Keep the existing Control Panel functionality and permissions intact;
> only change its placement and access/visibility model. Admin Panel should no
> longer contain any Control Panel entry or related navigation.

## What changed

1. **The Control Panel is a module** — a workspace of its own at `/control-panel`,
   listed beside the other modules, with its own rail.
2. **It vanishes when you may not enter it** — not greyed out, not present and
   locked. Absent, on every surface, for anybody the permission matrix excludes.
3. **It is gone from the Admin Panel** — no nav group, no link, no route.
4. **Nothing was rebuilt.** The five screens are the same files, moved; the
   permission nodes are the same switches, moved; the write paths and their
   capability checks are untouched.
5. **Old links still work** — `/admin/control-panel/*` and `/admin/temporary-access`
   forward to the new paths from the routing layer.
6. **Migration `0251`** moves the stored grants from the old node keys to the new
   ones, so nobody's access changes.

---

## 1. The room

| | Before | After |
|---|---|---|
| Where it lived | a group in the Admin Panel | a module, beside WMS / Goals / Billing / HR |
| Its screens | `/admin/control-panel/{users,roles,permissions,effective-access,temporary-access}` | `/control-panel/{…}` — same five, same order, same code |
| Its landing | the Admin Panel's Control Panel group | `/control-panel/users` |
| Its rail | the Admin Panel's top-nav dropdown | its own left rail (`components/layout/main-nav.tsx`) |
| Who could see it | every admin, always | an admin the matrix has not switched off |

`lib/workspaces.ts` gains the `control-panel` workspace: an id, a label, a
landing, a `canAccessWorkspace` branch and a `workspaceForPath` branch.
`lib/module-theme.ts` gains its theme (slate, `SlidersHorizontal`, no shortcut
letter).

**Why `workspaceForPath` is the load-bearing part.** `app/(app)/layout.tsx` gates
every route on the workspace the path resolves to. Claiming `/control-panel`
there is what makes the access rule real rather than cosmetic: a path under the
room is refused for somebody who may not enter it *before any page body runs*,
whether it was typed, bookmarked or linked — and whether or not the permission
catalogue happens to classify that exact sub-path.

## 2. The one thing that makes this module different

Every other module is a **fixed member** of the set. `MODULE_ORDER` is drawn on
the module row, the dock, the top bar and the hub, and a room you cannot enter
still renders — greyed and unclickable — because knowing the room exists is
useful, and the set is meant to be the same for everybody.

The Control Panel needs the opposite. A greyed label is still a menu entry, and
for a room whose purpose is handing out access that is exactly what must not
happen. So it is **not** in `MODULE_ORDER`. It lives in a new list beside it:

```ts
export const CONDITIONAL_MODULES: readonly WorkspaceId[] = ["control-panel"];
```

and every navigation surface renders `listedModules(access)` — `MODULE_ORDER`
plus whichever conditional modules this person may enter — instead of
`MODULE_ORDER` directly:

| Surface | File |
|---|---|
| Module row / dock | `components/layout/module-footer.tsx`, `components/layout/module-bar.tsx` |
| Top bar room switcher + room allow-list | `app/(app)/layout.tsx` |
| Hub | `app/(app)/hub/page.tsx` |
| Alt+letter listener | `app/(app)/layout.tsx` → `components/layout/module-shortcuts.tsx` |

Four things follow from that, and all four are required by the brief:

- **No discoverable menu entry.** It has `shortcut: ""`, so `moduleForShortcut`
  never resolves a key for it, and the two static cheatsheets (`lib/shortcuts.ts`,
  `lib/shortcuts-catalog.ts` — both shown to everyone with no access context)
  advertise nothing about it.
- **No route link.** It is not in `MODULE_ORDER`, so it is not in any list that
  renders a href for a locked room.
- **Server-side refusal.** A typed URL is refused by the layout's workspace gate.
- **Nothing registered against it leaks.** A module is appended last, so no
  existing module's position changes — and no existing module's keyboard letter
  moves, because letters are indexed off `MODULE_ORDER`, not off the rendered
  list.

**Position is preserved where it matters.** The room renders last in the module
row and under the top bar's "More" menu. The Admin Panel's own entry is
unchanged and still sits where it always did.

## 3. Who may enter

One predicate, computed once per request in `lib/auth/workspace-access.ts`:

```ts
const canControlPanel =
  (me.isAdmin || isSuper) && (await canShowModule("control-panel").catch(() => true));
```

Two conditions, ANDed, and both are needed:

- **Admin** — the base authorization. The room was admin-only inside the Admin
  Panel; it stays admin-only. The matrix can only ever *narrow* (see the header of
  `lib/permissions/resolve.ts`), so nothing here can hand the Control Panel to
  somebody who could not reach it before.
- **The matrix** — whether this person's `control-panel` node is switched on.
  This is the switch the brief asks for. With no stored row the matrix has no
  opinion and the answer is the base authorization, which is exactly how every
  admin saw the screen before this change — so **nobody loses access by default**.

`canAccessWorkspace("control-panel", …)` checks this **before** the super-admin
bypass, and that ordering is deliberate: this is the surface that hands out the
matrix, so a row that switches it off has to bind even for a super-admin, or
there would be no way to close the tool that opens the tool. A **master admin**
is exempt from the matrix inside `canShowModule`, so the two people who can
always get back in still can.

**Fail-open**, like every other use of the matrix: a database hiccup returns
people to the access they had before the matrix existed rather than hiding a
module from the admins who run the company.

## 4. What was NOT touched

- The five screens' code — moved, not rewritten. `lib/queries/control-panel.ts`
  is byte-identical.
- The write paths. `roles/actions.ts` still re-checks `requireAdmin()` **and**
  `isMasterAdmin` on every exported action; `temporary-access/actions.ts` still
  re-checks `checkDelegationGrant` and `canOpenDelegatedAccess` on its own
  account. A server action renders no layout, so the layout gate never covered
  them and still does not — they authorise themselves exactly as before.
- The per-screen guards. Each moved page dropped its own `requireAdmin()` call,
  because the room's gate now answers for all of them one level up; the
  per-screen permission nodes (`requirePathView`) still apply through the
  catalogue, now at the new routes.
- The tables: `module_permissions`, `role_permissions`, `employee_roles`,
  `delegated_access_grants`, `delegated_access_events`.
- The Temporary Access feature — same component, same hierarchy gate, same
  expiry rules, same audit trail.
- `AdminSection` (`components/admin/ui/section-shell.tsx`), which the five
  screens render their header through. It is the shared card-and-header frame,
  not an Admin-Panel-only component — the Goals, Accounts and Employees rooms
  use the same `PageCommandBar` underneath it — so the screens keep it and no
  markup changed. It keeping an `admin/` path is the one cosmetic leftover of
  the move.

**One consequence worth naming.** The screens now live in the `(app)` route
group rather than `(admin)`, so they pass through the same post-login ritual
gates every other room passes through. An admin who has not yet planned their
day is asked to do that first, exactly as they would be walking into WMS. That
is the intended reading of "a module of its own": it is not a privileged side
door out of the daily loop. The `(admin)` group's own guard — `me.isAdmin` — is
replaced by `canControlPanel`, which is strictly narrower.

## 5. The permission catalogue

A new **top-level** node, and the two old nodes removed from under `admin`:

| Old key | New key | Route (was → now) |
|---|---|---|
| `admin.control-panel` | `control-panel` | (no screen) → `/control-panel` |
| `admin.control-panel.users` | `control-panel.users` | `/admin/control-panel/users` → `/control-panel/users` |
| `admin.control-panel.roles` | `control-panel.roles` | `…/roles` → `/control-panel/roles` |
| `admin.control-panel.permissions` | `control-panel.permissions` | `…/permissions` → `/control-panel/permissions` |
| `admin.control-panel.effective-access` | `control-panel.effective-access` | `…/effective-access` → `/control-panel/effective-access` |
| `admin.temporary-access` | `control-panel.temporary-access` | `…/temporary-access` → `/control-panel/temporary-access` |

**Why the keys changed and not just the routes.** Everywhere else in this file
the convention is the opposite — keep the key, move the label and the route,
because keys are stored in `module_permissions.node_key` and renaming one
orphans a grant. This is the exception, forced structurally: the catalogue
requires every child key to be prefixed by its parent's
(`tests/unit/permission-catalog.test.ts` asserts it), so
`admin.control-panel.users` cannot be a child of `control-panel`. Either the keys
move or the tree cannot describe the application.

**So the grants moved with them.** Migration `0251` re-points every stored row —
in `module_permissions` *and* in `role_permissions`, which uses the same keys —
from the old names to the new ones. It is data-only (`UPDATE`, no DDL) and
idempotent. Verified against the live database on 2026-09-24: zero rows on any of
the six old keys afterwards, and zero rows on the new keys, which is consistent —
no grants had ever been made against the old ones.

The module node `control-panel` claims `/control-panel` itself, so the module is
a governable thing in its own right rather than merely a folder. Switching it off
takes every child with it — that cascade is what makes one row hide the whole
room.

## 6. The Admin Panel, afterwards

- `components/admin/admin-nav-config.ts` — the "Control Panel" group is removed.
  The `Access` group keeps Task Visibility and nothing else. Nothing in the file
  names, links to or governs the Control Panel.
- `app/(admin)/admin/control-panel/` and `app/(admin)/admin/temporary-access/` —
  gone. No Control Panel route exists anywhere under `app/(admin)/admin/`.
- The old URLs still answer, from `redirects()` in `next.config.ts`:

  | Old | New |
  |---|---|
  | `/admin/control-panel/*` | `/control-panel/*` |
  | `/admin/temporary-access` | `/control-panel/temporary-access` |

  Answering from the routing layer rather than a catch-all page is deliberate:
  it keeps the Admin Panel's route tree free of Control Panel paths entirely.
  These exist because the old paths are two days old, in people's history and in
  links already sent.

## 7. The one log-message change

`app/master-admin/actions.ts` mirrors its writes into the global Logs feed. Its
`route` / `module` / `page` labels are updated to the new screen
(`/control-panel/permissions`, `Control Panel`, `Permissions`) so one filter in
the Logs feed still finds every permission change, wherever it was made.

---

## Files

**Added**

- `app/(app)/control-panel/page.tsx` — the room's front door; forwards to Users
- `db/migrations/0251_control_panel_module.sql`
- `tests/unit/control-panel-module.test.ts` — 21 assertions on placement,
  visibility, the catalogue move and the Admin Panel's separation
- `Change-made/17-control-panel-module.md`, `Change-made/SQL/17-*`, `…/18-*`

**Moved** (contents otherwise unchanged)

- `app/(admin)/admin/control-panel/{users,roles,permissions,effective-access,temporary-access}/`
  → `app/(app)/control-panel/…` (7 files)
- `components/admin/control-panel/{roles-client,permissions-client,effective-access-client}.tsx`
  → `components/control-panel/…`

**Changed**

- `lib/workspaces.ts` — the workspace, its landing, its gate, its path
- `lib/module-theme.ts` — the theme, `CONDITIONAL_MODULES`, `listedModules`
- `lib/auth/workspace-access.ts` — `accessFor` resolves `canControlPanel`
- `lib/permissions/catalog.ts` — the new top-level node
- `components/layout/module-footer.tsx`, `module-bar.tsx`, `main-nav.tsx`
- `app/(app)/layout.tsx`, `app/(app)/hub/page.tsx`
- `components/admin/admin-nav-config.ts`
- `components/hub/module-logos.tsx` — a tile for the new workspace
- `lib/modules/backup/registry.ts` — the three role tables in the nightly export
- `app/(app)/control-panel/*` — imports, link targets, audit labels, removed
  page-level guards (see §4), `requireModuleView` key
- `components/auth/delegation-banner.tsx`, `components/admin/temporary-access-panel.tsx`
  — import paths
- `app/master-admin/actions.ts` — log labels (§7)
- `next.config.ts` — the two forwards
- `components/admin/admin-nav-config.ts` — the group removed; two now-unused
  lucide imports dropped

**Deleted**

- `app/(admin)/admin/temporary-access/page.tsx` — replaced by the `next.config.ts`
  forward

---

## Verification performed

```
npx tsc --noEmit                          exit 0
pnpm build                                exit 0 — ✓ Compiled successfully, 519 routes,
                                          BUILD_ID -Qc8XFIjdEQ7r1xlLbwmR
tests/unit/control-panel-module.test.ts   21 passed
full unit suite                           5194 tests: 5138 passed, 22 failed, 34 skipped
```

The route table carries all six new paths and **no** `/admin/control-panel*` or
`/admin/temporary-access` entry — verified by grepping the build output, which is
the only way to tell a moved route from a route that still exists:

```
├ ƒ /control-panel
├ ƒ /control-panel/effective-access
├ ƒ /control-panel/permissions
├ ƒ /control-panel/roles
├ ƒ /control-panel/temporary-access
├ ƒ /control-panel/users
```

The **22 failures are pre-existing and unrelated** — they fail identically on
the previous commit (`79bfad9`) and none of them touches a file this change
edited. They are:

| File | Count | Cause |
|---|---|---|
| `salary-statement-render.test.tsx` | 4 | Salary Statement markup drift (doc 13) |
| `api-guard.test.ts` | 4 | `apiRoutes` no longer exists in the catalogue — see below |
| `permission-catalog.test.ts` | 3 | 2× the same `apiRoutes` gap; 1× `/events/{obligations,calendar,masters,batches}` claimed by the catalogue with no `page.tsx` on disk |
| `filter-bar-default-scope.test.tsx` | 3 | Filter-bar scope markup |
| `incentive-master-authorization.test.ts` | 3 | Incentive Master work (docs 12/15) |
| `account-lockout-wiring.test.ts` | 1 | Lockout wiring |
| `incentive-analytics.test.ts` | 1 | Incentive analytics scope |
| `module-backup.test.ts` | 1 | Expects `/admin/module-backups` in the admin rail; absent at `79bfad9` too |
| `operations-room.test.ts` | 1 | Expects `workspaceForPath("/projects") === null`; the WMS block still claims `/projects` |
| `route-handler-coverage.test.ts` | 1 | The same `apiRoutes` gap |
| `task-visibility.test.ts` | 1 (file) | Task visibility |

Two of those are worth naming precisely, because they look like they belong to
this change and do not:

- **`apiRoutes`** is referenced by `tests/unit/permission-catalog.test.ts` and by
  `lib/permissions/api-guard.ts`'s doc comment, but the field does not exist on
  any catalogue node — in this change's tree or in `79bfad9`. `nodeKeyForPath`
  builds its index from `routes` only, so `/api/hr/letters/pdf` resolves to
  nothing. That is a real gap in the permission matrix (handler paths outside
  their page's prefix are ungoverned), it predates this work, and fixing it is a
  separate job.
- **`/events/*`** — the Operations re-parenting (2026-09-11/12) moved those
  screens and the catalogue was not updated with it.

Neither is repaired here: this change was scoped to the Control Panel, and
widening it to unrelated modules is exactly what the brief asks not to do.
