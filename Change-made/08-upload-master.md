# 08 — Upload Master (admin management of the bulk-import template files)

Adds a new Admin Panel section, **Upload Master**, that lists the three
bulk-import templates and lets an admin download, replace and revert them. A
replacement applies **sitewide** — every download route serves it immediately.

Built on top of `65b07ed` (`docs: add production database handoff for the Om
branch merge`). Everything in the earlier `Change-made/` entries is committed;
this entry covers only the Upload Master work.

---

## What it is

| Template | Key | Download route | Built-in source |
|---|---|---|---|
| Tasks — Bulk Import | `tasks` | `/tasks/template.xlsx` | generated from `TASK_TEMPLATE_COLUMNS` (exceljs) |
| Goals — Bulk Import | `goals` | `/goals/template.xlsx` | `public/templates/Altus-Goals-Template.xlsx` + live lookup decoration |
| Accounts — Task List | `accounts-task-list` | `/accounts/task-list/template` | generated (XLSX utils) |

The screen is a `<DataTable>` with columns **Template · Last edited · Download ·
Delete · Edit**, inline buttons and no kebab menu. Multi-select powers **Download
selected** and **Delete selected**.

- **Replace (Edit)** — uploads a `.xlsx` to Supabase Storage (`DOCUMENTS_BUCKET`
  under `templates/<key>/<uuid>/<file>`), writes a `template_files` row, and the
  next download anywhere serves it.
- **Delete** — removes the override row + storage object and reverts to built-in.
  Disabled for a template that has no override (there is always a built-in; a
  template cannot be truly deleted).
- **Last edited** — the override row's `updated_at`; "Built-in — never edited"
  when there is no override.

## Files added

```
db/migrations/0241_template_files.sql                     the template_files table (DDL)
lib/templates/registry.ts                                 the fixed 3-template registry + XLSX content type
lib/templates/tasks.ts                                    buildTasksTemplate() (moved from the route)
lib/templates/goals.ts                                    buildGoalsTemplate() (moved from the route)
lib/templates/accounts-task-list.ts                       buildAccountsTaskListTemplate() (moved from the route)
lib/templates/resolve.ts                                  resolveTemplate() + buildTemplate() dispatcher
lib/queries/template-files.ts                             listTemplateFiles() + getTemplateOverride()
app/(admin)/admin/upload-master/page.tsx                  the admin page
app/(admin)/admin/upload-master/actions.ts                uploadTemplate() + deleteTemplates()
app/(admin)/admin/upload-master/download/[key]/route.ts   admin download door (no module access needed)
components/admin/upload-master/master-table.tsx           the DataTable + replace dialog + bulk actions
```

## Files modified

```
db/schema.ts                          + templateFiles table + TemplateFile / NewTemplateFile
lib/permissions/catalog.ts            + admin.masters.upload-master node
components/admin/admin-nav-config.ts  + "Upload Master" under the Masters group
lib/storage/objects.ts                + getObject() (prod download, dummy-mode disk)
next.config.ts                        + trace the Goals workbook into the admin download route
app/(app)/tasks/template.xlsx/route.ts             now resolves override-first
app/(app)/goals/template.xlsx/route.ts             now resolves override-first
app/(app)/accounts/task-list/template/route.ts     now resolves override-first
```

## Data model

One row per **overridden** template. No row = built-in.

```sql
create table template_files (
  id            uuid primary key default gen_random_uuid(),
  key           text not null,
  storage_path  text not null,
  content_type  text not null,
  file_name     text not null,
  file_size     integer not null,
  updated_by_id uuid not null references employees(id) on delete restrict,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create unique index template_files_key_uq on template_files (key);
```

The full, idempotent DDL lives in
[`SQL/03-apply-upload-master.sql`](./SQL/03-apply-upload-master.sql), with
read-only checks in [`SQL/04-verify-upload-master.sql`](./SQL/04-verify-upload-master.sql).

## Resolution rule (the "sitewide" bit)

`lib/templates/resolve.ts` → `resolveTemplate(key, buildBuiltIn)`:

1. `getTemplateOverride(key)` — if a `template_files` row exists, download its
   object and return it.
2. Otherwise return the built-in.

All four download surfaces call this, so an uploaded file is live the moment the
row commits (the routes are `force-dynamic`; no cache). If an override row exists
but its object is gone, the resolver falls through to the built-in rather than
500.

## Authorization

Matches every other admin master:

- Page: `requireAdmin()` + `requireModuleView("admin.masters.upload-master")`.
- Actions: `requireAdmin()` + `requireModuleEdit("admin.masters.upload-master")`.
- The catalogue node is registered at `lib/permissions/catalog.ts` under
  `admin.masters`, so the Master Admin matrix shows it and a missing grant
  defaults to allow (the app-wide convention).

## Verification

```
pnpm typecheck                                    exit 0
pnpm test tests/unit/permission-catalog.test.ts   17 passed
npx eslint (new + changed files)                  clean
```

Manual, once the migration is applied:

1. `/admin/upload-master` shows three rows; Download returns each built-in file.
2. Replace Goals → re-download shows the replacement; `/goals/template.xlsx` (as
   a normal user) serves it too.
3. Delete → reverts to built-in; the row reads "Built-in — never edited" again.
4. Select two rows → bulk download fetches both; bulk delete reverts both.

## Migration

One new table, additive and idempotent. Apply with the targeted applier (never
the bulk runner — see `SQL/README.md`):

```
npx tsx --env-file=.env.local scripts/apply-one-migration.ts \
  db/migrations/0241_template_files.sql --apply
```

Or run `Change-made/SQL/03-apply-upload-master.sql` directly.

## Notes and residual risk

- **Reused `DOCUMENTS_BUCKET`** rather than a new bucket — matches the
  billing-master / salary-policy precedent, so no bucket-creation script.
- **`.xlsx` only** on replace — a CSV would break the xlsx importers. `uploadTemplate`
  rejects anything whose name does not end in `.xlsx`.
- **The admin download route needs the Goals workbook traced** into its own
  serverless function; `next.config.ts` now includes it. The `[key]` segment is a
  dynamic route key under `outputFileTracingIncludes`.
- **Delete is non-destructive** — it removes an override and reverts to built-in.
  Re-upload restores it. No confirmation beyond a browser `window.confirm`.
- **Orphan safety** — a failed DB write drops the just-uploaded object; the
  previous object is removed only after the new row commits (best-effort).
- **One stray-object window** — if the process dies between a successful
  `putObject` and the DB commit, the object orphans. The DB row is the record;
  the resolver still serves built-in, and the orphan is unreachable garbage, not
  a correctness bug.
