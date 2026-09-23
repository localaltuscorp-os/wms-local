# 14 — Global WMS Logs System (Admin Panel → Logs)

**Date:** 22 September 2026
**Migration:** `db/migrations/0245_global_logs.sql` — **applied 2026-09-22**
**SQL for another database:** [`SQL/11-apply-global-logs.sql`](./SQL/11-apply-global-logs.sql),
verified by [`SQL/12-verify-global-logs.sql`](./SQL/12-verify-global-logs.sql)
**Written for:** anyone, including people who did not build this.

---

## Read this first

This adds **Admin Panel → Logs** — an immutable, server-authoritative record of
activity across the whole WMS, plus a lightweight client tracker for the
browsing it would otherwise miss (page visits, record views, searches, filters,
estimated time). No new auth, no new permission system, no WebSockets, no
multi-tab identity, and no second module registry.

Two scope decisions were confirmed before building:

1. **Mutation audit = mechanism + key paths.** The full `auditLog()` primitive is
   built, and it is wired into the session lifecycle (login / failed login /
   logout / inactivity timeout), access-denied, export, employee edit
   (before/after), incentive decisions (approve / reject / reverse / publish)
   and access-control grants. Every *other* server action is one `auditLog()`
   call away; it was not retro-instrumented across unrelated modules.
2. **`/admin/activity` is left as-is.** It is the task/employee/settings feed;
   Logs is the new general append-only log beside it.

---

## 1. What it is

```
        browser (IndexedDB buffer) ──batched HTTP──► /api/logs/ingest
                                                          │
   server actions / routes ──auditLog()──────────────────┼──► activity_logs (immutable)
   login · logout · idle · access-denied · export · CRUD ┘          ▲
                                                                    │ trigger: no UPDATE/DELETE
   daily_sessions (per employee per IST date) ◄── counters rolled up at ingest/logout
```

- `activity_logs` — the log. Append-only, enforced by a database trigger.
- `daily_sessions` — one row per employee per IST calendar date; a rollup of the
  day's first login, last activity, logout, counters and estimated minutes.

## 2. Database (migration 0245)

**Tables:** `daily_sessions`, `activity_logs`.

- `daily_sessions`: `employee_id`, `date_ist`, `first_login_at`,
  `last_activity_at`, `logout_at`, `logout_type` (NORMAL / INACTIVITY_TIMEOUT /
  SESSION_EXPIRED / FORCED_LOGOUT / NOT_RECORDED), `total_estimated_minutes`,
  `total_event_count`, `modules_visited_count`, `pages_visited_count`,
  `records_viewed_count`, `actions_performed_count`, `status` (active / closed /
  finalized), `finalized_at`. Unique on `(employee_id, date_ist)`.
- `activity_logs`: `daily_session_id`, `employee_id`, `event_at` (the brief's
  `timestamp` — renamed because `timestamp` is an SQL reserved word),
  `event_type`, `module`, `page`, `route`, `resource_type`, `resource_id`,
  `resource_name`, `action`, `status`, `reason`, `changes` (jsonb), `metadata`
  (jsonb), `request_id`, `operation_id`, `client_event_id` (dedupe key),
  `actor_type`. Indexed on employee, session, time, module, event type, status,
  resource, request id, operation id, and a partial unique on `client_event_id`.

**Immutability:** a `BEFORE UPDATE OR DELETE` trigger raises
`activity_logs is append-only (no UPDATE, no DELETE)`. No application route or
screen exposes edit/delete/bulk-delete/clear/reset. `employee_id` is nullable so
a LOGIN_FAILED for an unknown email and SYSTEM events can be recorded.

## 3. Files created

- `db/migrations/0245_global_logs.sql`
- `lib/logs/events.ts` — the event vocabulary + labels + action/visit classifiers.
- `lib/logs/sanitize.ts` — strips credential keys from `changes`/`metadata`.
- `lib/logs/module-map.ts` — `classifyRoute` (route → module/page via the
  permission catalogue) + the filter's module tree.
- `lib/logs/filters.ts` — pure URL ⇄ filter parsing, quick ranges, sort, `nodesToMatches`.
- `lib/logs/ist.ts` — IST calendar-date helpers (pure, testable).
- `lib/logs/sessions.ts` — daily-session upsert / touch / close / finalize.
- `lib/logs/audit.ts` — `auditLog`, `auditAccessDenied`, `auditAction`.
- `lib/logs/idb.ts` + `lib/logs/client-tracker.ts` — IndexedDB buffer + batch flush.
- `components/logs/activity-tracker.tsx` — mounts in both layouts, records visits.
- `app/api/logs/ingest/route.ts` — the client tracker's single door.
- `app/api/cron/logs-finalize/route.ts` — midnight finalization.
- `lib/queries/logs.ts` — `listActivityLogs`, `loadLogFilterOptions`, `getLogStats`.
- `app/(admin)/admin/logs/page.tsx` + `app/(admin)/admin/logs/export/route.ts`.
- `components/admin/logs/` — `logs-screen.tsx`, `multi-select.tsx`, `log-detail-panel.tsx`.
- `tests/unit/logs-*.test.ts` (4 files, 26 tests).

## 4. Files modified

- `db/schema.ts` — `dailySessions`, `activityLogs` + types.
- `app/api/auth/session/route.ts` — LOGIN + LOGIN_FAILED audit, open daily session.
- `app/api/auth/signout/route.ts` — LOGOUT / INACTIVITY_TIMEOUT (via `?reason=idle`), close session.
- `components/auth/idle-timer-client.tsx`, `components/auth/sign-out-button.tsx`,
  `components/hub/hub-signout.tsx` — flush the buffer before sign-out; idle passes `reason=idle`.
- `app/(app)/layout.tsx`, `app/(admin)/admin/layout.tsx` — mount `ActivityTracker`.
- `components/admin/admin-nav-config.ts` — "Logs" in the System group.
- `lib/permissions/catalog.ts` — `admin.system.logs` node (`/admin/logs`).
- `lib/permissions/resolve.ts` — `ACCESS_DENIED` at the module-permission choke point.
- `app/(admin)/admin/employees/actions.ts` — UPDATE with field-level before/after.
- `lib/incentive/workflow-server.ts` — APPROVE / REJECT / REVERSE / PUBLISH.
- `app/(admin)/admin/access-control/actions.ts` — CONFIG_CHANGE on grant/revoke.

## 5. The tracker and the inactivity flush

Page visits / record views / searches / filters are queued in IndexedDB, flushed
in batches (20 events or 30 s) to `/api/logs/ingest`, and deleted only after a
2xx. On `pagehide` the flush uses `fetch(..., { keepalive: true })`. A failed
flush keeps the rows and retries with backoff — never silently discarded. On
inactivity timeout and normal logout the sign-out path calls
`flushActivityNow()` **before** the session is killed, so buffered events always
land, with their original timestamps preserved. `client_event_id` makes a
replayed batch a no-op.

## 6. Midnight finalization

`/api/cron/logs-finalize` (CRON_SECRET bearer) closes every `daily_sessions` row
whose date is before today and not yet `finalized`, stamping NOT_RECORDED where
there was no logout. Idempotent — a missed cron is repaired by the next run. It
never logs anyone out.

## 7. Excel export + export audit

`GET /admin/logs/export` honours the same filter parser as the page and also
accepts `?month=YYYY-MM` for a whole IST month. The `.xlsx` is built
server-side with `exceljs` (styled header, frozen top row, autofilter, all audit
columns incl. before/after changes). Exporting itself writes an immutable EXPORT
log (who, when, filters, date range, count, format, outcome).

## 8. Verification

- `pnpm db:migrate` applied `0245`. `npx tsc --noEmit` clean; `npx eslint` clean
  on all touched files; `npx vitest run` — the 26 new unit tests green, and the
  permission-catalogue + incentive suites still green (the catalogue test now
  walks the new `admin.system.logs` node).
- Live, against the running dev server and real data:
  - `GET /admin/logs` → 200, renders the full filter bar + empty state.
  - `POST /api/logs/ingest` → accepted a synthetic PAGE_VISIT; the row landed
    with `module="Admin Panel"`, `page="Logs"`, the acting employee set, and
    `client_event_id` preserved.
  - The daily-session rollup opened for 2026-09-22 with events=1, pages=1,
    estimated 2 minutes.
  - `GET /api/cron/logs-finalize` → 401 without the cron secret.
  - A direct `UPDATE activity_logs` → rejected by the trigger with
    `activity_logs is append-only (no UPDATE, no DELETE)`.

## 9. Constraints / decisions

- **`employee_id` nullable** — required for LOGIN_FAILED(unknown email) and
  SYSTEM events; the brief's bare list implied non-null.
- **`timestamp` column named `event_at`** — `timestamp` is a reserved word.
- **SESSION_EXPIRED / FORCED_LOGOUT** have no existing flow to hook; present as
  enum values + audit support, wired when such a flow exists.
- **Module/page filter is two levels** (module + deepest page label) rather than
  the full three-level tree — the catalogue's three levels collapse into
  `module` + `page` on each row, so "WMS → Tasks → Kanban" records as
  module "WMS", page "Kanban". Selecting a module matches all its pages.
- **Org fields are joined live** from `employees` (function via `departmentId`,
  designation via `designationId`, entity via `payingEntityId`) — no snapshot
  duplication, per "do not duplicate employee data".
