# 09 — Upload Master as the single template source, and hierarchy-based task visibility

Two independent pieces of work, both on the `Om` branch working tree:

1. **Upload Master** becomes the one source of truth for every bulk-import
   template in the application, and every module's *Download Template* button is
   wired to it.
2. **WMS task visibility** becomes hierarchy-scoped on the server, with an
   explicit, audited grant in Admin Panel → Access Control for anyone who needs
   to see beyond their own reporting line.

Neither piece touches the Incentive module: the only Incentive-adjacent file
changed is `lib/permissions/catalog.ts`, where a new node was added and one
`note` was reworded.

---

## 1. Admin Panel — "WFH" is now "Remote Work"

The employee-entitlement settings pane in
`components/admin/employee-master/workspace.tsx` now reads:

| Before | After |
|---|---|
| Pane "Work from home" | Pane **Remote Work** |
| Toggle "Full Time WFH Allowed" | Toggle **Remote Work — Full Time Allowed** |
| Toggle "Part Time WFH Allowed" | Toggle **Remote Work — Part Time Allowed** |
| Note "…the WFH request flow reads it…" | Note "…the remote work request flow reads it…" |

Deliberately unchanged: the DB columns (`wfh_full_time_allowed`,
`wfh_part_time_allowed`), the zod fields, the API field names and the
`work_mode = 'wfh'` enum value. Those are identifiers, not wording, and renaming
one would orphan stored data and every query that reads it.

Also deliberately unchanged (confirmed with the requester): the **Attendance**
module's own wording — the "Work from Home" check-in mode, the calendar legend,
"WFH Days", the HR policy text and the auto-approval notes. Those describe a
different thing (a request type that also covers client site and field), not the
employee entitlement this task was about.

---

## 2. Upload Master — every template, not three

`lib/templates/registry.ts` went from 3 entries to 8, and each entry now carries
**module** and **feature** so the screen can say where a template belongs.

| Key | Name | Module | Serves |
|---|---|---|---|
| `tasks` | Tasks — Bulk Import | WMS | `/tasks/template.xlsx` |
| `goals` | Goals — Bulk Import | Goals | the cascade importer, and the Week/Day board levels |
| `weekly_goals_bulk_import` | Weekly Goals — Bulk Import | Goals | the Weekly Goals board's importer |
| `monthly_goals_bulk_import` | Monthly Goals — Bulk Import | Goals | `/goals/monthly` |
| `quarterly_goals_bulk_import` | Quarterly Goals — Bulk Import | Goals | `/goals/quarterly` |
| `yearly_goals_bulk_import` | Yearly Goals — Bulk Import | Goals | `/goals/yearly` |
| `projects_bulk_import` | Projects — Bulk Import | Projects | the Project Plan bulk upload (all six plan kinds) |
| `accounts-task-list` | Accounts — Task List | Accounts | `/accounts/task-list/template` |

Two of these were **generated in the browser** until now — the Weekly Goals CSV
and the Project Plan workbook — so no administrator could correct a column
without a deploy. Both are built server-side now
(`lib/templates/weekly-goals.ts`, `lib/templates/projects.ts`), from the same
manifests their importers parse.

**One key per feature, not per screen.** The Project Plan dialog uploads six
kinds (project, milestone, result, action, sub-action, sub-sub-action) through
one screen with a kind selector, so it is ONE row whose built-in varies by
`kind`. The Goals *levels* are separate pages with separate buttons, so they get
separate rows — replacing the Monthly template leaves the Yearly one alone.

The keys themselves live in `lib/templates/keys.ts` (pure, client-safe) and the
download URL is built there: `templateHref(key, { level, periodKey, kind })`.
Every button in the application goes through that one function, so no page can
ask for a template nobody registered.

### One download door

```
GET /api/templates/[key]?level=…&periodKey=…&kind=…
```

is now what every *Download Template* button points at. It resolves through the
same seam everything else uses — `resolveTemplate()` (override if present, else
built-in) — and takes the module's access guard per key
(`lib/templates/access.ts`), so it is not a way around the Goals or Accounts
room checks.

The three older per-module URLs (`/tasks/template.xlsx`,
`/goals/template.xlsx`, `/accounts/task-list/template`) are kept as thin
aliases — they are bookmarked, and the mobile build and the importer docs name
them — but they now delegate to the same `templateResponse()` call, so they
cannot serve a different file from Upload Master. `/goals/template.xlsx`
additionally maps its `?level=` onto the level's own key.

### The download bug

The reported bug was real and it was in the browser half. *Download Template*
was a programmatic `document.createElement("a").click()` on a detached anchor:
some browsers ignore that outright, and when the request was refused (expired
session, permission change) the browser still navigated, so a page of HTML was
saved as `.xlsx` — a failure that looks like a success.

`lib/templates/client-download.ts` replaces it: the file is **fetched**, a
refusal or a non-spreadsheet body becomes a visible error toast, and a file is
written only when the server actually sent one. There is no silent fallback to
an older or empty template. Every download button in the application now uses
it.

### Template ↔ importer consistency

The registry tests build every registered workbook and compare its header row
with the manifest its importer parses. That test found one real mismatch in the
shipped Goals workbook: it offers **Delegated** and **Weight** columns, and
neither word was in the manifest, so both were silently discarded on import.
Fixed by making them real: `Delegated` is an alias of the existing Team
Member(s) field, and `Weight` is a new manifest column the importer now reads
(default 100, the schema's own default).

---

## 3. Task visibility — hierarchy first, grants second

### The rule

Everybody — admin, team leader, ordinary employee — opens on **My Tasks**.
*All* widens to **the people below them in the reporting tree**, and to nobody
else. Being an admin does not widen it. Seeing further than that needs a row in
`visibility_grants` (domain `tasks`), written from **Admin Panel → Access
Control**. The table was later generalised to carry the Incentive domain as
well and renamed — see [`10-incentive-module-complete.md`](./10-incentive-module-complete.md)
and [`SQL/05-apply-access-control.sql`](./SQL/05-apply-access-control.sql), which
renames the old table in place rather than re-creating it.

The exemption is the two accounts that administer the permission system itself
(`master_admin.manage` — Manan, Rohan) and super-admins: whoever grants the
visibility must not be able to lock themselves out of checking that a grant
worked. That set is the capability registry's, not a name list in the scope
module.

### Where it is enforced

In the QUERY layer (`lib/queries/tasks.ts`), before the cache key is built, so:

* every reader inherits it — the list, the archive, the agenda, the Kanban
  board, the task drawer, the CSV/XLSX export, the duplicate finder, the mobile
  team agenda;
* two people asking for "all tasks" cannot share a cache entry;
* a URL parameter cannot widen it — `?emp=<someone>` is **intersected** with the
  permitted set, never replaces it, and a selection that lies entirely outside
  it matches nothing rather than falling back to your own team.

The single-record door (`getTaskById`) applies the same OR rule, so the drawer,
a deep link and the read-receipt are not ways to open work the list refuses to
show. The ceiling is an OR over doer and initiator, matching the Team filter's
existing rule: work you raised is yours to see even when someone else carries it
out.

`lib/tasks/scope.ts` is the whole of the decision, and it **fails closed**: if
the grants table is missing (pre-migration) or unreadable, the answer is "no
grants" — the restrictive direction.

### Admin Panel → Access Control

A new admin screen (`/admin/access-control`, nav entry under **Access** beside
Temporary Access) lists the grants and writes them. Two shapes: *everyone in the
organisation*, or *a person and their team* — one select each. Reading is for
any admin; **writing** is `master_admin.manage` only, resolved from the
capability registry, which is the authority the existing system already uses.
Every write is audited into `settings_events` (`task_visibility_granted` /
`_revoked`) and drops the Tasks cache tag so the change is visible immediately.

The matrix (`module_permissions`) is untouched, because it can only *narrow* —
that is its documented, tested invariant, and inverting it to express a widening
grant is how a second, conflicting permission system gets built. The widening
lives in its own table with its own audit rows instead, and the new catalogue
node `admin.access-control` only decides whether the screen is reachable.

### Migration

One additive, idempotent table. Apply with the targeted applier, or run the SQL
directly:

```
npx tsx --env-file=.env.local scripts/apply-one-migration.ts \
  db/migrations/0242_visibility_grants.sql --apply
```

`Change-made/SQL/05-apply-access-control.sql` is the same DDL for the person
running it against production; `06-verify-access-control.sql` is read-only and
confirms the table, the indexes and the current grants.

Without the migration the feature is inert rather than broken: no grants exist,
so everybody is scoped to themselves and their downline, and the Access Control
screen lists nothing.

---

## Files

**Added**

```
lib/templates/keys.ts                             the template keys + templateHref()
lib/templates/download.ts                         templateResponse() — the one download
lib/templates/access.ts                           per-key module guard for the generic door
lib/templates/client-download.ts                  the browser half (fetch, verify, save)
lib/templates/weekly-goals.ts                     the Weekly Goals built-in (was a client CSV)
lib/templates/projects.ts                         the Project Plan built-in (was client-side)
lib/weekly-goals/template-columns.ts              one manifest for that template + its importer
lib/tasks/scope.ts                                who may see whose tasks
lib/queries/visibility-grants.ts                  reads for the Access Control screen
lib/access/visibility.ts                          the one grant resolver both domains share
app/api/templates/[key]/route.ts                  THE download route
app/(admin)/admin/access-control/page.tsx         the screen
app/(admin)/admin/access-control/actions.ts       grant / revoke
components/admin/access-control/panel.tsx         its table + form
db/migrations/0242_visibility_grants.sql          the grants table (tasks + incentive)
Change-made/SQL/05-apply-access-control.sql       production DDL
Change-made/SQL/06-verify-access-control.sql      production verification
tests/unit/template-keys.test.ts
tests/unit/template-registry.test.ts
tests/unit/template-download.test.ts
tests/unit/client-download.test.ts
tests/unit/task-visibility.test.ts
```

**Modified**

```
lib/templates/registry.ts            3 entries → 8, each with module + feature
lib/templates/resolve.ts             builds every key, parameterised by level/kind
lib/queries/template-files.ts        rows carry module, feature, current filename
lib/queries/tasks.ts                 the visibility ceiling, applied before caching
lib/queries/duplicates.ts            the same ceiling on the duplicate finder
lib/types.ts                         visibleDoerIds + assigneeOutsideScope
lib/tasks/scope.ts (new)             see above
lib/goals/template-columns.ts        "delegated" alias; a real Weight column
lib/permissions/catalog.ts           admin.access-control node; Upload Master note
lib/weekly-goals/...                 (new manifest) 
app/(app)/tasks/page.tsx             everyone defaults to My Tasks; scope label
app/(app)/goals/template.xlsx/route.ts   level → its own key
components/layout/filter-bar.tsx     Scope shown to anyone with somewhere to widen
components/admin/admin-nav-config.ts Access → Task Visibility
components/admin/upload-master/*     Module + Current file columns
components/tasks/task-import.tsx     the fetch-and-verify download
components/goals/board/goals-bulk-upload.tsx
components/goals/cascade/goals-import.tsx
components/weekly-goals/weekly-goals-import.tsx
components/project-plan/plan-bulk-upload.tsx
components/accounts/task-list/task-import.tsx
components/admin/employee-master/workspace.tsx   the WFH → Remote Work labels
next.config.ts                       trace the Goals workbook into the new route
```

---

## Verification

```
npx tsc --noEmit                                          clean
npx eslint (every added/changed file)                     clean (one pre-existing warning)
new tests                59 passed  (5 files)
adjacent suites          94 passed  (task filters, permission catalogue, cursor paging, imports)
full unit suite          3551 passed, 16 failed, 7 skipped
```

The 16 failures are **pre-existing and unrelated**. Five of them
(`task-stat-counts`, `delegated-access-authorization`, `done-on-time`,
`global-search-provider`, `task-actions`) were re-run against a stashed working
tree and fail identically without any of this work; the rest are 5-second
render-test timeouts that pass when their file is run alone (they fail under
full-suite CPU contention, with or without these changes).

### What is verified, and what is not

Verified here, without a browser:

* every registered template builds, and every column it shows is one its
  importer maps (`template-registry.test.ts`);
* the download handlers serve real `.xlsx` bytes for Tasks, Weekly Goals,
  Projects (per kind), every Goals level and Accounts; an unknown key 404s;
* a **replacement** row changes what the generic door, the module route AND
  Upload Master's own button serve; a Monthly replacement leaves Yearly on its
  built-in (`template-download.test.ts`);
* the browser helper refuses to save an HTML page as a spreadsheet, reports
  refusals and empty bodies, and writes the server's filename
  (`client-download.test.ts`);
* the scope rules, including the fail-closed grants read
  (`task-visibility.test.ts`).

NOT verified here: a real signed-in click-through. The local database has no
`template_files` table (the 0241 migration was applied to production, not
locally), so the download routes return 500 locally — the same way they did
before this work. A person with a session against a migrated database should
confirm:

1. `/admin/upload-master` lists eight templates, grouped by module.
2. Upload Master → Download returns a workbook that opens.
3. Upload Master → Replace on Tasks, then Tasks → Bulk Upload → Download
   Template hands over the replacement.
4. Replace the Monthly Goals template only: the Monthly board changes, the
   Yearly board does not.
5. `/tasks` opens on My Tasks for an admin; *All Tasks* shows their downline
   and no further.
6. Admin Panel → Access Control → grant a person *Everyone in the
   organisation*, then sign in as them and confirm *All Tasks* widens.

---

## Known boundary

Three import surfaces have **no template download** and therefore nothing to
register: Incentive entries (*Import Excel* shows the recognised columns but
offers no file), Outstanding (*Import* accepts the user's own sheet shapes), and
Salary (*Import Altus-Log* consumes an external workbook). None of them can be
"made to match Upload Master" without inventing a template and an upload flow
that do not exist — and the Incentive one is the module this work must not
touch. The management analytics dashboards (`/dashboard/task-report`, the Time
Intelligence widgets) still aggregate over the whole organisation: they are
permission-gated management surfaces rather than per-person task reads, and
scoping them is a separate decision about what those reports are for.
