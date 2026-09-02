# Altus Corp WMS — Complete Technical Audit

> Audience: a senior engineer performing a production **performance** audit **without repo access**.
> Generated 2026-06-20 from a direct read of the codebase. Where a number is an estimate it is marked *(est.)*.
> The app is live at `https://wms.mananvasa.com`.

---

# 1. Project Overview

| Item | Value |
|---|---|
| **Framework** | **Next.js 16.2.6**, **App Router** (RSC + Server Actions). NOT Vite/CRA/Angular. |
| **UI runtime** | React **19.2.6** / react-dom 19.2.6 |
| **Language** | **TypeScript 6.0.3** (strict). All app code is `.ts`/`.tsx`. |
| **Package manager** | **pnpm 10.33.0** (declared `packageManager`) |
| **Build tool** | Next's built-in compiler. **Turbopack** for `next dev`; production `next build` (Webpack/Turbopack per Next 16 default). |
| **Deployment platform** | **Vercel** (serverless / Fluid Compute). |
| **Deploy mechanism** | The deployed app does NOT build from this repo directly. It is copied into the monorepo **`github.com/MananVasa-support/Manan-Vasa`**, branch `main`, subdirectory **`task-management/`**, via `scripts/ship.sh` (delta-only push since the `last-ship` git tag). Vercel builds that subfolder and auto-promotes (~1–3 min). |
| **Env** | Node serverless on Vercel; local dev on Windows. Single shared Supabase DB used by BOTH local and prod (`.env.local` `DATABASE_URL` points at prod). |
| **Project purpose** | Internal **Work Management System** for Altus Corp: tasks, weekly goals, daily checklist, projects, attendance + biometric punch, salary, incentives, outstanding-receivables tracking, document store, dynamic forms, org admin. ~30 employees. |

**Critical performance context up front:** the database is **tiny** (≈734 task rows, 30 employees, ~56 daily-checklist rows). This system is **NOT data-volume bound**. Every performance symptom observed to date is **connection / round-trip bound** against the Supabase transaction pooler. Keep this front-of-mind for the whole audit.

---

# 2. Tech Stack

**Frontend:** React 19, Next 16 App Router (RSC-first; most pages are async Server Components), Tailwind CSS v4 (`@tailwindcss/postcss`), `tailwind-merge`, `clsx`. Fonts via `next/font/google` (Roboto, Bricolage Grotesque, JetBrains Mono, Fraunces).

**Backend:** Next.js Server Actions + Route Handlers (`app/api/**/route.ts`). No separate backend service. Node runtime (`serverExternalPackages: firebase-admin, pdfkit`).

**Database:** **PostgreSQL on Supabase**, accessed through **Drizzle ORM 0.45.2** over **postgres-js 3.4.9**. Connection string = the **Supabase Transaction Pooler (Supavisor), port 6543, `prepare:false`**. `@supabase/supabase-js`/`@supabase/ssr` are present but are **NOT** used for table reads — only for Storage + one Realtime channel.

**Authentication:** **Firebase Auth** (client `firebase` 12.13, admin `firebase-admin` 13.9) wrapped by **`next-firebase-auth-edge` 1.12** (edge middleware verifies a signed `__session` cookie). Employee identity is the join of Firebase UID → `employees.firebase_uid`.

**Storage:** **Supabase Storage** — buckets **`avatars`** and **`documents`** (documents bucket also holds outstanding attachments + salary-policy PDFs). Accessed via a service-role Supabase JS client (`lib/supabase/admin.ts`).

**Realtime:** Minimal. **One** Supabase Realtime channel in `components/layout/live-indicator.tsx` (`.channel('tasks-changes-…')`) powering the header "Live" dot. No other realtime.

**Hosting:** Vercel (functions default 300s timeout, Fluid Compute). PWA (manifest + service worker for installability, not data caching).

**Analytics / RUM:** `@vercel/speed-insights` (real-user Core Web Vitals). `@sentry/nextjs` is a dependency but is **not** wired in `next.config.ts` (no `withSentryConfig`); error reporting via Sentry is effectively dormant/partial.

**State management:** **TanStack Query 5** (`components/providers.tsx`, client-only widgets); **nuqs 2** (URL-as-state for filters/tabs); React `useState`/`useTransition` locally. No Redux/Zustand/Jotai. Most state is server state (RSC).

**UI libraries:** Radix UI (dialog, dropdown-menu, popover, separator, slot, tabs, tooltip), `cmdk` (⌘K palette), `lucide-react` (icons), `sonner` (toasts), `motion` 12 (framer-motion; entrance/spring animation), `@dnd-kit/*` (kanban drag), `react-day-picker` (dates), `react-window` 2 (list virtualization), `@tanstack/react-table` (tables), `ogl` (lightweight WebGL — login poster mosaic), `@heroui/framer-utils`.

**Charts:** **recharts 3.8**.

**Editors:** No rich-text/code editor. Forms via **react-hook-form 7.78** + **@hookform/resolvers** + **zod 4**.

**AI APIs:** **None** in the runtime app. (No OpenAI/Anthropic/Gemini SDKs.)

**Third-party APIs:** Firebase (auth), Supabase (DB/Storage/Realtime), **Resend** (`resend` 6 + `@react-email/*`) for transactional email, **Meta WhatsApp Cloud API** (`lib/whatsapp/*`, raw fetch), **Slack Web API** (`@slack/web-api`), **Google** (Calendar sync, Sheets read for incentive/billing dashboards, Drive for nightly backup — `lib/google/*`, `lib/backup/drive.ts`), **web-push** (VAPID browser push), **@simplewebauthn** (biometric attendance), `pdfkit` + `xlsx` + `exceljs` (export generation), `csv-parse`/`csv-stringify`.

---

# 3. Folder Structure

```
altus-dashboard/
├─ app/
│  ├─ layout.tsx                  # root layout: fonts, Providers, Nuqs, SpeedInsights, getCurrentEmployee()
│  ├─ loading.tsx
│  ├─ globals.css                 # Tailwind v4 + design tokens + .wg-*/.ledger-paper utilities
│  ├─ privacy/ , terms/           # public legal pages
│  ├─ fill-weekly-goals/page.tsx  # standalone (referenced by gate; gate now renders inline)
│  ├─ t/[shortId]/route.ts        # short-link → task redirect
│  ├─ (auth)/                     # PUBLIC group — login, forgot-password, set-password, welcome
│  │  ├─ layout.tsx
│  │  ├─ login/ forgot-password/ set-password/ welcome/
│  ├─ (app)/                      # AUTHENTICATED group — gated by (app)/layout.tsx
│  │  ├─ layout.tsx               # auth gate + weekly-goals gate + daily-plan gate + idle timer
│  │  ├─ page.tsx                 # MAIN DASHBOARD
│  │  ├─ loading.tsx
│  │  ├─ tasks/ (page, loading)
│  │  │  ├─ [id]/ (page, loading), [id]/focus/, new/, import/, agenda/, kanban/, duplicates/
│  │  │  ├─ export/route.ts, export.xlsx/route.ts, export.pdf/route.ts
│  │  ├─ projects/ , projects/[id]/
│  │  ├─ weekly-goals/ , weekly-goals/dashboard/
│  │  ├─ daily-checklist/
│  │  ├─ attendance/ , attendance/dashboard/, attendance/leave/, attendance/export.{xlsx,pdf}/
│  │  ├─ salary/ , salary/policy/, salary/payslip/[runId]/, salary/export.xlsx/
│  │  ├─ incentive/ , reimbursements/, participant-breakthrough/, record-reference/, index-hub/
│  │  ├─ outstanding/ , outstanding/contracts/, outstanding/export.{xlsx,pdf}/
│  │  ├─ inbox/ , documents/, profile/, archived/
│  ├─ (admin)/admin/             # ADMIN group — gated by (admin)/layout.tsx
│  │  ├─ layout.tsx, page.tsx, loading.tsx
│  │  ├─ employees/(+export), departments/, designations/, clients/, subjects/
│  │  ├─ settings/, notifications/, activity/(+export), holidays/, salary-profiles/
│  │  ├─ paying-entities/, outstanding-entities/, outstanding-payment-modes/,
│  │  │  outstanding-products/, outstanding-responsibles/
│  └─ api/
│     ├─ auth/session/route.ts, auth/signout/route.ts
│     ├─ health/route.ts
│     ├─ profile/avatar/route.ts
│     ├─ push/subscribe/route.ts, push/vapid-key/route.ts
│     ├─ google/connect/route.ts, google/callback/route.ts
│     ├─ whatsapp/webhook/route.ts
│     ├─ cron/{digest,backup,retry-dispatch,materialize-recurring,weekly-goals}/route.ts
│     └─ mobile/{me,dashboard,task-form,tasks,tasks/[id],tasks/[id]/{status,comment},
│                attendance,attendance/punch}/route.ts
├─ components/
│  ├─ providers.tsx               # TanStack QueryClientProvider
│  ├─ dashboard/                  # kpi-strip, collapsible-velocity, status-table, status-distribution,
│  │                              #   top-performers, aging-heatmap, welcome-hero, my-day-card,
│  │                              #   mobile-today, punctuality-card (D16), dashboard-load-error
│  ├─ tasks/                      # task-detail-view, task-detail-loader, action-rail, kanban-board,
│  │                              #   inline-status-cell, focus-workspace, bulk-action-bar, ...
│  ├─ weekly-goals/ , daily-checklist/ , attendance/ , outstanding/ , salary/ , incentive/ ,
│  │  forms/ , admin/ , layout/ (header, main-nav, main-nav-group, filter-bar, footer, live-indicator,
│  │  route-progress, display-scale-provider), header/ (global-search), ui/ (select, sonner-toaster), pwa/
├─ lib/
│  ├─ db/                         # index.ts (drizzle+postgres-js client), slow-query.ts, with-timeout.ts
│  ├─ auth/                       # current.ts, session.ts, super-admin.ts, status-transitions.ts, mobile.ts
│  ├─ firebase/                   # admin.ts, client.ts
│  ├─ supabase/                   # admin.ts, server.ts, browser.ts  (Storage + Realtime only)
│  ├─ queries/                    # ~42 query modules (see §8/§9)
│  ├─ transforms/                 # pure dashboard aggregations (kpi, aging, velocity, punctuality, ...)
│  ├─ tasks/ (create-task, set-status, effective-due), weekly-goals/ (gate, gate-cadence, hierarchy,
│  │  effective, as-task-row, task-sync, task-sync-map, week), daily-checklist/ (gate),
│  ├─ google/ , backup/ , whatsapp/ , slack/ , web-push/ , notifications/ , email/ , exports/ ,
│  │  validators/ , filters.ts, cache-tags.ts, env.ts, geo.ts, webauthn/ , format.ts, appearance.ts
├─ db/
│  ├─ schema.ts                   # ~2000 lines, ~63 tables (single source of truth)
│  ├─ enums.ts                    # TASK_STATUSES, priorities, etc.
│  ├─ migrations/                 # 72 .sql files (0000 → 0071) — journal is STALE (see §8)
├─ scripts/                       # apply-*.ts migration runners, ship.sh, seed, import, diagnostics
├─ tests/                         # vitest unit tests + fixtures; playwright visual
├─ middleware.ts                  # next-firebase-auth-edge gate
├─ next.config.ts , tailwind/postcss config, drizzle.config.ts, vitest config
└─ public/                        # manifest.json, sw.js, icons, login posters
```

---

# 4. Routing

Route groups `(auth)`, `(app)`, `(admin)` are URL-transparent. **Protection model:** `middleware.ts` runs `next-firebase-auth-edge` on every non-public path; an invalid/absent `__session` cookie → 307 redirect to `/login?next=…`. So **everything except the public allow-list is auth-protected at the edge.** On top of that, `(app)/layout.tsx` re-checks the employee and applies two workflow gates, and `(admin)/layout.tsx` requires `isAdmin`.

**Public (no auth):** `/login`, `/forgot-password`, `/set-password`, `/welcome`, `/terms`, `/privacy`, `/manifest.json`, `/sw.js`, `/api/auth/session`, `/api/auth/signout`, `/api/health`, `/api/cron/*` (bearer-secret auth), `/api/mobile/*` (bearer firebase-token auth).

**Pages (all protected unless noted):**

| Route | Group | Notes |
|---|---|---|
| `/` | (app) | **Dashboard**. `dynamic="force-dynamic"`, has `loading.tsx`. |
| `/tasks` | (app) | list; `loading.tsx`. |
| `/tasks/[id]` | (app) | task detail (dynamic); `loading.tsx`. |
| `/tasks/[id]/focus` | (app) | focus workspace |
| `/tasks/new`, `/tasks/import`, `/tasks/agenda`, `/tasks/kanban` (admin-only nav), `/tasks/duplicates` | (app) | kanban has `loading.tsx` |
| `/projects`, `/projects/[id]` | (app) | |
| `/weekly-goals`, `/weekly-goals/dashboard` (rendered as a `?view=dashboard` VIEW of the same route) | (app) | |
| `/daily-checklist` | (app) | |
| `/attendance`, `/attendance/dashboard` (admin), `/attendance/leave` | (app) | |
| `/salary`, `/salary/policy` | (app) | |
| `/incentive`, `/reimbursements`, `/participant-breakthrough`, `/record-reference`, `/index-hub` | (app) | dynamic forms + ecosystem |
| `/outstanding`, `/outstanding/contracts` | (app) | |
| `/inbox` (loading.tsx), `/documents`, `/profile` (loading.tsx), `/archived` (loading.tsx) | (app) | |
| `/admin` + 18 sub-pages | (admin) | employees, departments, designations, clients, subjects, settings, notifications, activity, holidays, salary-profiles, paying-entities, outstanding-* rosters |
| `/fill-weekly-goals` | root | legacy standalone gate target (gate now renders inline) |

**API route handlers:** auth (session/signout), health, profile/avatar, push (subscribe/vapid-key), google (connect/callback OAuth), whatsapp/webhook, **5 cron** (digest, backup, retry-dispatch, materialize-recurring, weekly-goals), **mobile** (`/api/mobile/*` — me, dashboard, task-form, tasks CRUD + status/comment, attendance + punch), and several **export** routes (tasks/outstanding/attendance/salary → xlsx/pdf), `/t/[shortId]` short-link redirect, admin exports.

**Lazy/code-split:** Next App Router code-splits **per route segment automatically** (each `page.tsx` is its own chunk). There is little manual `next/dynamic`/`React.lazy` (a few heavy client widgets only). Server Components ship **zero** JS for their own logic.

**Nested routes:** standard App Router nesting — `app/layout` → `(group)/layout` → `page`. Notable: `(app)/layout.tsx` wraps every authed page and runs blocking gate queries (see §5/§7).

---

# 5. Authentication Flow

**Identity chain:** Firebase user → `__session` signed cookie → middleware verifies → server reads claims → `employees.firebase_uid` lookup → `Employee` row (carries `isAdmin`, `isActive`, prefs).

**Login lifecycle:**
1. `/login` (client, `lib/firebase/client.ts`, `browserSessionPersistence`) calls Firebase `signInWithEmailAndPassword` → gets an **idToken** in the browser.
2. Browser `POST /api/auth/session` `{ idToken }`. The route (`runtime=nodejs`) `verifyIdToken`s it with admin SDK, confirms the email maps to an **active employee**, reconciles `firebase_uid`, then `setAuthCookies` mints the signed `__session` cookie (sameSite=lax, httpOnly, secure in prod, **session cookie — no maxAge**, cleared on browser close). It records a hashed session row in `auth_sessions`.
3. Client redirects to `/` (or `?next=`).

**`getSession()` / `getUser()` equivalents:** This app does **not** use Supabase auth (`supabase.auth.getSession/getUser`). The analogues are:
- **Middleware** (`next-firebase-auth-edge`): verifies the cookie's JWT **locally** against cached Google public keys. **`checkRevoked:false`** — so it does **NOT** call Firebase on each request (deliberate, to avoid per-navigation round-trips). One local verify per request.
- **`readSession()`** (`lib/auth/session.ts`): reads the verified claims from the cookie on the server.
- **`getCurrentEmployee()`** (`lib/auth/current.ts`): `readSession()` → **one** `employees.findFirst(firebase_uid)` DB query. **Wrapped in React `cache()`** → deduped to a SINGLE DB call per request even though it's called from the root layout, the `(app)` layout, and pages.

**Auth requests per dashboard page load (server side):**
- 1 edge middleware token verify (local, no network).
- 1 `employees` DB lookup (root `layout.tsx` `getCurrentEmployee` + `(app)/layout.tsx` `requireUser` + page `getCurrentEmployee` all collapse to **1** via `cache()`).
- 0 Firebase network calls (checkRevoked off).

So auth itself is cheap. **However**, every authed render also pays the `(app)/layout.tsx` **gate queries** (weekly-goals gate + daily-plan gate) and `getOrgSettings` — these are DB round-trips on the critical path of **every** page (see §7). Each is now wrapped in a hard timeout (`lib/db/with-timeout.ts`) so a stale-connection hang can't freeze the whole app.

---

# 6. Data Loading Flow (per page)

General pattern: pages are **async Server Components** that `await Promise.all([...])` of query functions, then stream HTML. Client interactivity is hydrated islands. **No client-side data fetching on initial load** except the ⌘K search and a couple of polling widgets. No REST/GraphQL client; data = Drizzle queries executed server-side.

| Page | Initial server queries | Parallel? | Dependent? | Polling / Realtime | Pagination |
|---|---|---|---|---|---|
| **`/` Dashboard** | `(app)` layout: requireUser, weekly-goals gate, daily gate, orgSettings (gated, sequential-ish in layout). Page: `Promise.all` of **listEmployees, loadDashboardData (itself 6 scans), getStatusDisplayMap, getMyDayCounts, getMyTodayTasks, listDistinctSubjects, listWeekGoalsAsTasks**, then a `designations` join. | Yes (one big `Promise.all`, wrapped in 18s `withTimeout`). `loadDashboardData` internally `Promise.all`s 6 task scans. | `getCurrentEmployee` first; departments map fetched inside loadDashboardData. | Header `live-indicator` opens a Realtime channel; no dashboard polling. | None |
| **`/tasks`** | `listTasks(filters)` (cached 30s, tag `tasks`) + filter option lists. Goals surfaced as virtual rows via `listWeekGoalsAsTasks`. | Yes | filters from URL (nuqs) | — | client-side via `@tanstack/react-table` + `react-window` virtualization; server returns the filtered set |
| **`/tasks/[id]`** | `getTaskById`, status display map, employees (for reassign), audit/comments. Wrapped by `TaskDetailLoader` in Suspense. `markTaskRead` fired. | Yes | task → events | `audit-event.tsx` polls every **60s** to refresh the activity feed | — |
| **`/tasks/kanban`** | `listBoardTasks` (cached 30s) | Yes | — | dnd-kit local | column-bounded |
| **`/weekly-goals`** | `Promise.all`: employees, client names, subject names, status map, **loadBoardGoals (LEFT JOIN tasks for linked-task)**, incentive catalog; then a `designations` join. | Yes | scope → rows | — | week-scoped |
| **`/daily-checklist`** | `DailyChecklistView`: `Promise.all`(getTodayItems, getOverdueItems, listPullableGoals) wrapped in 12s `withTimeout`. | Yes | — | — | day-scoped |
| **`/attendance`, `/salary`, `/outstanding`, `/incentive`, admin pages** | each `Promise.all`s its own roster/list queries server-side. Some incentive/billing dashboards **read a live Google Sheet** via the backup service account (network-bound). | Yes | some sheet-dependent | — | mostly full-list (small tables) |
| **`/inbox`** | notifications list; may poll/refresh. | — | — | refresh on focus/interval | list |

**Infinite scroll:** not used; lists are virtualized (`react-window`) or fully rendered (small datasets). **Realtime subscriptions:** exactly one (tasks-changes live dot). **Cron** (server, not page load): digest, backup, retry-dispatch, materialize-recurring, weekly-goals.

---

# 7. Dashboard Loading — exact timeline

Opening `/` runs this sequence (server-side, then stream):

1. **Edge middleware** — verify `__session` JWT locally (cached Google keys). ~ms, no network. Invalid → redirect `/login`.
2. **Root `app/layout.tsx`** — `await getCurrentEmployee()` → **1 DB query** `employees.findFirst(firebase_uid)` (cached for the request). Reads density/accent for CSS vars.
3. **`(app)/layout.tsx`** (wraps the page, runs before it):
   a. `await withTimeout(requireUser(), 10s)` — reuses the cached employee (no new query).
   b. `await withTimeoutOr(hasUnfilledWeekGoals(me.id), 7s, false)` — **1 DB query** (EXISTS over weekly_goals; fail-open). If true → renders the fill gate INSTEAD of the dashboard.
   c. `await withTimeoutOr(needsDailyPlan(me.id), 7s, false)` — **1 DB query** (count today's checklist; fail-open). If true → renders the daily-plan gate instead.
   d. `await getOrgSettings()` — **1 DB query** (5s timeout → DEFAULTS), used for the idle-timer minutes.
4. **`app/(app)/page.tsx`** — builds filters from URL, then **one `Promise.all` wrapped in `withTimeout(…, 18s, "dashboard-load")`** containing:
   - `listEmployees()` — `SELECT * FROM employees` (~30 rows).
   - `loadDashboardData(filters)` — `unstable_cache(60s, tag:tasks)` wrapping an internal `Promise.all` of **6 queries**: `SELECT employees`, **period task scan** (createdAt ≥ 30d, projected cols), **wide scan** (≥14d), **velocity scan** (≥90d ≈ 663 rows), `getEmployeeDepartmentMap`, optional ranking scan. Then in-memory transforms (KPIs, status distribution, aging, velocity, top performers, **punctuality/D16**).
   - `getStatusDisplayMap()` — `unstable_cache` over `status_settings`.
   - `getMyDayCounts(me.id)` — per-user counts (uncached). `.catch→null`.
   - `getMyTodayTasks(me.id)` — per-user list (uncached). `.catch→null`.
   - `listDistinctSubjects()` — `unstable_cache`. `.catch→[]`.
   - `listWeekGoalsAsTasks({employeeIds:[me.id]})` — this week's goals (uncached). `.catch→[]`.
   - then a `designations` join for role badges.
5. **Render** — KpiStrip, MyDayCard, StatusDistribution, TopPerformers, **PunctualityCard**, StatusTable, AgingHeatmap, CollapsibleVelocity. Header (separate) renders nav + global-search + live-indicator (opens Realtime channel client-side).

**Total DB round-trips on a cold dashboard load:** ~**1 (auth) + 3 (gates+settings) + ~12 (page Promise.all incl. loadDashboardData's 6)** ≈ **15–16 queries**, mostly parallel. On a **warm cache** (`loadDashboardData`, status map, subjects cached for 30–60s) it drops to ~**1 auth + 3 gates + 3–4 uncached per-user queries**. Individual queries are <1s on healthy connections; the slowness is connection acquisition / stale sockets, not query time.

---

# 8. Supabase Usage

**Connection / pooling:** App connects via the **Supabase Transaction Pooler (Supavisor, port 6543)**, `prepare:false` (required for txn pooling). postgres-js client config (`lib/db/index.ts`): `max:10`, `idle_timeout:10s`, `max_lifetime:600s`, `connect_timeout:10s`, client cached on `globalThis`. **Pool is to the pooler, not Postgres** — Supavisor multiplexes onto its own server pool (Free plan: **server pool size 15**, max client connections 200) against Postgres `max_connections=60`. **This pooler indirection is the root of the production hang class** (see §15).

**Tables (~63, from `db/schema.ts`):**
`designations, paying_entities, employees, achievements_earned, pinned_items, notification_preferences, auth_sessions, audit_data_exports, departments, employee_departments, clients, subjects, project_nodes, project_members, documents, status_settings, tasks, task_events, notifications, document_events, notification_dispatch_log, push_subscriptions, org_settings, employee_events, settings_events, attendance_logs, mobile_devices, incentive_requests, outstanding_entries, outstanding_followups, webauthn_credentials, holidays, leave_requests, comp_off_credits, outstanding_products, outstanding_entities, outstanding_payment_modes, outstanding_responsibles, outstanding_contracts, outstanding_installments, outstanding_collections, outstanding_attachments, salary_profiles, salary_advances, salary_runs, salary_policies, salary_policy_consents, incentive_catalog, incentive_entries, incentive_projects, weekly_goals, daily_checklist, index_sections, index_links, module_submissions, form_configs, product_options`.

**RPCs (Postgres functions called from app):** **None.** All access is Drizzle queries; no `supabase.rpc()`.

**Edge Functions (Supabase):** **None.** Server logic is Next route handlers / actions.

**Storage buckets:** **`avatars`** (profile photos, signed URLs) and **`documents`** (document store, outstanding attachments, salary-policy PDFs). Managed via service-role Supabase JS client.

**Triggers:** DB-side generated/maintained columns rather than app triggers: `tasks.task_no` (sequence default, mig 0048), `tasks.search_text` (GENERATED STORED, mig 0061) + a `search_tsv` tsvector with a GIN index maintained by the migration. No business-logic triggers in app code (logic lives in Server Actions).

**Views:** None materialized in app code (the "weekly-goals dashboard" is an in-RSC view, not a DB view; `as-task-row` builds VIRTUAL task rows in memory, not a SQL view).

**Indexes (~90, all btree unless noted).** Key ones for performance:
- `tasks`: `tasks_doer_created_idx (doer_id,created_at)`, `tasks_initiator_created_idx`, `tasks_status_created_idx`, `tasks_pending_created_idx (created_at) WHERE pending`, `tasks_archived_idx (archived,created_at)`, `tasks_created_by_idx`, `tasks_approval_status_idx`, `tasks_due_at_idx`, `tasks_approved_by_idx`, `tasks_transferred_from_idx`, `tasks_project_node_idx`, `tasks_origin_goal_idx`, `tasks_search_trgm_idx (GIN on search_text)`.
- `notifications`: `_user_unread_created_idx`, `_user_kind_created_idx`, `_created_idx`.
- `weekly_goals`: `_employee_week_idx`, `_week_idx`, `_carried_from_idx`, `_task_id_idx`.
- `daily_checklist`: `_emp_date_idx`, `_date_idx`. `attendance_logs`: `_date_idx`, `_employee_date_idx`. Plus roster `_active_name_idx` indexes across lookup tables, and `task_events`/`document_events`/`employee_events`/`settings_events` `_*_created_idx`.
- **Notable gap:** no standalone `tasks (created_at)` index — the dashboard's wide/velocity scans (`WHERE created_at ≥ X`) cannot use a composite whose leading col isn't `created_at` (only the partial `tasks_pending_created_idx` leads with it). At 734 rows this is a seq scan that's still <1s, so it's currently harmless, but it will matter as the table grows.

**RLS policies:** RLS helper functions + phase-1 policies exist in migrations `0004`/`0005`/`0008` and `0033` (storage). **However, the app connects through the pooler as the privileged role and enforces authorization in application code** (`requireUser`/`requireAdmin`/`requireSuperAdmin` + the `status-transitions.ts` matrix), not via RLS. Treat RLS as **not the effective access-control layer** for the web app — a security note, not a perf one.

**Migrations:** 72 files (`0000`→`0071`, with a couple of duplicated numbers). **The drizzle journal is STALE** — migrations are applied via idempotent SQL + one-off `tsx` scripts (`scripts/apply-*.ts`), NOT `drizzle-kit migrate`. The same `DATABASE_URL` is prod, so local migration scripts hit prod directly.

---

# 9. Database Queries

Queries live in `lib/queries/*` (~42 modules) + Server Actions in `app/**/actions.ts`. All are Drizzle (parameterized; no string interpolation; `prepare:false`). There is no raw `SELECT *` from app code in the literal SQL sense, BUT several queries select **all columns** via `db.select().from(table)` or `db.query.*.findFirst()` (Drizzle expands to all columns). Representative high-traffic queries:

| Query (module) | Purpose | Generated SQL (essence) | Frequency *(est.)* | All cols? | Indexed? | Optimization |
|---|---|---|---|---|---|---|
| `getCurrentEmployee` (auth/current) | resolve signed-in user | `SELECT * FROM employees WHERE firebase_uid=$1 LIMIT 1` | every request (1×, React-cached) | yes | needs `employees(firebase_uid)` idx (auth_sessions has one; verify employees has it) | select only needed cols; confirm firebase_uid index on `employees` |
| `hasUnfilledWeekGoals` (weekly-goals) | layout gate | `SELECT EXISTS(SELECT 1 FROM weekly_goals WHERE employee_id=$1 AND week=… AND pct_updated_at …)` | every authed page | no | `weekly_goals_employee_week_idx` | fine; on critical path → keep fast/timeout-wrapped |
| `needsDailyPlan` (daily-checklist) | layout gate | `SELECT count(*) FROM daily_checklist WHERE employee_id=$1 AND plan_date=$today` | every authed page | no | `daily_checklist_emp_date_idx` | fine |
| `getOrgSettings` | layout settings | `SELECT * FROM org_settings WHERE id=1 LIMIT 1` | every authed page | yes (1 row) | PK | cache it (currently uncached but timeout+default-wrapped) |
| `loadDashboardData` → period scan | KPIs/tables | `SELECT <all-but-desc/notes/search_text>, COALESCE(revised_target_date,due_at) AS dueAt FROM tasks WHERE created_at ≥ now-30d` | dashboard (cached 60s) | near-all (drops description/notes/**search_text**) | seq scan (no created_at idx) | add `tasks(created_at)`; **search_text now excluded** (was re-shipping desc+notes ×N) |
| `loadDashboardData` → wide scan (14d) + velocity scan (90d ≈663 rows) | sparklines/velocity | same projection, wider window | dashboard (cached 60s) | near-all | seq scan | same; consider narrowing columns to exactly what transforms read |
| `getMyDayCounts`, `getMyTodayTasks` | dashboard My-Day | per-user task filters | every dashboard load (UNCACHED) | partial | uses doer/created idx | **cache briefly per-user** (these run on every load and are a hang surface) |
| `listTasks(filters)` (queries/tasks) | tasks list | filtered tasks select (explicit cols) | `/tasks` + `/tasks/agenda` + `/archived` | explicit cols | doer/status/created idxs | cached 30s, tag `tasks` ✓ |
| `listBoardTasks` | kanban | board projection | `/tasks/kanban` | explicit | idxs | cached 30s ✓ |
| `loadBoardGoals` (weekly-goals/page) | goals board | `weekly_goals LEFT JOIN employees, reviewer, tasks(linked)` | `/weekly-goals` | many | week + task_id idx | fine; watch the 3-way join as goals grow |
| `listWeekGoalsAsTasks` | surface goals in Tasks/My-Day | weekly_goals current-week, `taskId IS NULL` filter | dashboard + tasks (UNCACHED) | many | week idx | cache; runs on dashboard every load |
| global search (queries/global-search) | ⌘K | trigram/tsvector over tasks/clients/projects/people/receivables/docs | on keystroke (debounced, TanStack 30s) | targeted | GIN trgm/tsvector (mig 0061) | fine |

**Cross-cutting query observations:**
- **`db.query.*.findFirst()` / `db.select().from()`** expand to all columns in many lookups (employee, task, org_settings). Harmless on tiny tables; tighten if any grows.
- **The dashboard fans out ~12 concurrent queries** on a cache miss. On the txn pooler under contention, a single stalled connection delays the whole `Promise.all`.
- **Per-user dashboard queries are uncached** (`getMyDayCounts`, `getMyTodayTasks`, `listWeekGoalsAsTasks`) → they hit the DB on **every** dashboard load even when the heavy aggregate is cache-hit. These are the residual hang surface.

---

# 10. React Performance

The app is **RSC-first**, so most "components" ship no client JS and re-render concerns are limited to the hydrated islands. Findings:

- **Unnecessary re-renders:** Low risk overall. The dashboard is server-rendered. Client islands (KpiStrip expansion, status pill, kanban, filter bar) are self-contained.
- **`memo()` / `useMemo` / `useCallback`:** Used where it matters (e.g., `weekly-goals-board` memoizes `displayed`/`grouped`/option lists; `task-detail-view` memoizes role). Some client components recompute label/tone maps per render — cheap. No egregious missing-memo hot path found.
- **Large contexts:** Only two app-wide client providers: **TanStack `QueryClientProvider`** (stable, created once via `useState`) and **`NuqsAdapter`**. No giant React Context holding mutable app state → no context-driven re-render storms.
- **Expensive effects:** The dashboard's expensive work is **server-side** (the scans + transforms), not in `useEffect`. Client `setInterval`s exist: `updated-timestamp`/`punch-card` (1s clock — cheap but constant), `audit-event` (60s refetch), `route-progress` (trickle while navigating), `focus-workspace` timers. The 1s clocks cause a steady 1Hz re-render of small subtrees (negligible, but unnecessary).
- **Infinite loops:** None found. (Historical bug: `router.refresh()` inside `useTransition` kept buttons disabled — fixed by decoupling `pending` from refresh.)
- **Large component trees:** `task-detail-view.tsx` (~900 lines) and `daily-plan-gate.tsx` (~450) are large but render bounded data. `weekly-goals-board` renders all goals (small N). Lists use `react-window` virtualization where long.
- **Motion:** `motion` (framer-motion) entrance animations are GPU-friendly (transform/opacity) and reduced-motion-gated.

**Net:** React-side performance is **not** the bottleneck. The user-visible "loading forever / hiccups" is server/DB-connection, not client render.

---

# 11. State Management

- **Server state (dominant):** RSC fetch-on-render; mutations via Server Actions that call `revalidatePath`/`updateTag(CACHE_TAGS.tasks)` for read-your-writes.
- **Client server-cache:** **TanStack Query** (`staleTime 30s`, `retry 1`, `refetchOnWindowFocus:false`) — used by ⌘K global search and a few client widgets. Single `QueryClient` created once in `providers.tsx`.
- **URL state:** **nuqs** (`NuqsAdapter` in root layout) for filter bars, settings tabs, week navigation, view toggles.
- **Global state:** **None** (no Redux/Zustand/Jotai). Deliberate.
- **Local state:** `useState`/`useReducer`/`useTransition` inside islands (dialogs, pickers, optimistic status changes, the daily-plan gate's optimistic list).
- **Derived state:** computed in-render or via `useMemo` (board filtering, dashboard transforms server-side).
- **Persisted state:** user prefs (density/accent) on `employees` → applied as CSS vars in root layout; auth `__session` cookie; push subscriptions in DB; PWA service worker for offline shell only (not data).

---

# 12. Network Requests (first dashboard load)

Browser-observable requests on a cold `/` load (authenticated):

| # | Request | Type | Parallel? | Resp size *(est.)* | Notes / bottleneck |
|---|---|---|---|---|---|
| 1 | `GET /` (RSC/HTML document) | navigation | — | tens–hundreds KB HTML | **This is where all server time is spent** (auth + gates + ~12 DB queries). TTFB dominated by DB round-trips. |
| 2 | `_next/static/*` chunks (framework, route chunk, shared) | static | parallel | see §13 | CDN-cached, immutable |
| 3 | font files (Roboto, Bricolage, JetBrains Mono, Fraunces) | static | parallel | ~4 families × weights | `display:swap`; 4 families is heavy (see §14) |
| 4 | `GET /api/push/vapid-key` (if push UI mounts) | xhr | after hydrate | tiny | — |
| 5 | Supabase Realtime **WebSocket** (live-indicator) | ws | after hydrate | persistent | one channel; minor |
| 6 | `GET /manifest.json`, `sw.js` register | static | parallel | tiny | PWA |
| 7 | ⌘K search `useQuery` | xhr | on user input | small | not on initial load |
| 8 | SpeedInsights beacon | xhr | post-load | tiny | RUM |

**The single dominant bottleneck is request #1's TTFB** — the server component awaits the gate queries + the dashboard `Promise.all` before streaming. Everything else is static/CDN or deferred. There is **no waterfall of client API calls**; the cost is server-side DB latency, amplified by stale-pooled-connection stalls.

---

# 13. Bundle Analysis

*(No bundle-analyzer report is committed; the following is from the dependency graph and import patterns — run `next build` + `@next/bundle-analyzer` to get exact bytes.)*

**Largest dependencies (client-impacting):**
- `recharts` (3.8) — charting; pulls D3 modules. Heavy; loaded on dashboard/analytics pages.
- `motion` (framer-motion 12) — animation runtime across many client islands.
- `firebase` (12) — client auth SDK on `/login` + anywhere the client SDK is imported; large. Ensure it's only on auth/client surfaces.
- `@dnd-kit/*` — kanban only.
- `cmdk` + `@tanstack/react-table` + `react-window` — tasks/search surfaces.
- `ogl` — WebGL for the login poster mosaic (login route only).
- `lucide-react` (1.14) — icon set; tree-shakes per-icon if imported by name (verify no namespace import).

**Server-only heavies (NOT in client bundle, but affect function cold start / build):** `firebase-admin`, `pdfkit` (both in `serverExternalPackages`), `exceljs` (dev/export), `xlsx`, `googleapis`-style fetch, `@slack/web-api`, `web-push`, `drizzle-orm`, `postgres`, `resend`+`@react-email/*`.

**Largest pages:** dashboard (`recharts` + many islands), tasks (`react-table`+`react-window`+`dnd-kit` on kanban), login (`firebase` + `ogl`).

**Heavy imports to verify:** that `firebase` (client) is not imported into shared/server bundles; that `xlsx`/`exceljs`/`pdfkit` are only in route handlers (server); that `recharts` is dynamically importable where charts are below the fold.

**Dynamic imports / code splitting:** Automatic per-route via App Router. Manual `next/dynamic` is sparse — **opportunity** to dynamically import recharts, dnd-kit, ogl, and the heavy export libs.

**Tree shaking:** ES modules throughout; Next/Turbopack tree-shakes. `lucide-react` named imports tree-shake.

**Potentially unused / reducible:** `@sentry/nextjs` (dep present, not wired — either wire it or drop it). `@supabase/ssr` (only Storage/Realtime used — confirm `ssr` helpers are needed vs `supabase-js` alone). `@heroui/framer-utils` (verify usage). Two spreadsheet libs (`xlsx` + `exceljs`) — consolidate.

---

# 14. Images and Assets

- **Images:** Login poster mosaic (6 real images + generated app-poster tiles) on `/login` — the heaviest image surface, login-only. App-internal pages are largely text/SVG. `next/image` usage should be verified; the middleware matcher **excludes** image extensions from auth, implying static images served directly.
- **Fonts:** **4 Google font families** via `next/font` (Roboto, Bricolage Grotesque, JetBrains Mono, Fraunces) with multiple weights each. `next/font` self-hosts + `display:swap`, but **4 families × many weights is a meaningful first-load cost** and a layout-shift risk. Consider trimming weights / families.
- **Icons:** `lucide-react` (SVG, per-icon import) — good. No emoji icons.
- **Videos:** None.
- **Lazy loading:** Static images via the browser; no evidence of systematic `loading="lazy"`/`next/image` optimization config (no `images` block in `next.config.ts`). PWA icons generated via `scripts/gen-pwa-icons.py`.

---

# 15. Performance Bottlenecks (ranked by real-world impact)

1. **Stale pooled-connection hangs (THE production issue).** On the Supabase **transaction pooler**, a warm Vercel instance can reuse a connection the pooler already bounced. A query on that dead socket neither resolves nor throws (postgres-js waits on TCP keepalive ≈60s), so the awaiting Server Component **hangs on its skeleton**. Mitigated by `lib/db/with-timeout.ts` (hard timeouts on gates, dashboard, daily-checklist) which convert hangs into fast fail-open/retry — but **the timeout abandons the query, leaving a `Client/ClientRead` orphan** that holds one of the pooler's ~15 server slots for ~2 minutes, which under load **cascades** into slot starvation → more stalls. **Durable fix is infra: raise Supavisor pool size (15→40, free) and confirm Vercel `DATABASE_URL` is the 6543 transaction pooler.**
2. **Dashboard fan-out + uncached per-user queries.** ~12 concurrent queries on a cache miss; `getMyDayCounts`/`getMyTodayTasks`/`listWeekGoalsAsTasks` are **uncached** → DB hit on every load. Each is a fresh hang opportunity.
3. **Gate queries on every authed page.** `(app)/layout.tsx` runs weekly-goals gate + daily gate + org-settings on **every** navigation — 3 serial-ish DB round-trips before any page renders. `getOrgSettings` is uncached.
4. **Result-payload bloat (was severe; partially fixed).** Dashboard scans formerly shipped `search_text` (a generated column concatenating title+description+client+subject+notes) ×663 rows, making the **result-send** slow enough to be orphaned mid-send on flaky links. Now excluded from dashboard scans; audit other scans for the same.
5. **No standalone `tasks(created_at)` index** — fine at 734 rows, a future seq-scan cliff.
6. **Cold starts** — serverless function cold start + a fresh pooler connection (`connect_timeout 10s`) can make the first authed request after idle/deploy slow (observed 504 at 300s once during a deploy swap).
7. **Hydration / blocking render:** minimal — RSC streams; the heavy work is server DB time, not client hydration. The 1Hz clock intervals cause trivial constant re-renders.
8. **Google Sheet reads** on incentive/billing dashboards are external-network-bound (seconds) and should be cached.
9. **Jank/frame drops:** not a primary issue; motion is GPU-bound and reduced-motion-gated.

---

# 16. Caching

- **Next data cache:** `unstable_cache` on `loadDashboardData` (60s, tag `tasks`), `listTasks`/`listBoardTasks`/agenda (30s, tag `tasks`), `getStatusDisplayMap`, `listDistinctSubjects`, notification matrix, etc. Mutations call `updateTag(CACHE_TAGS.tasks)` (Server Actions) / `revalidateTag(tag,"default")` (route handlers) for read-your-writes. **Note:** in an active team, frequent task mutations bust the `tasks` tag, so the dashboard cache is cold often → DB hits.
- **TanStack Query (client):** `staleTime 30s`, `retry 1`, no refetch-on-focus. Scope: ⌘K search + small widgets.
- **Browser/CDN cache:** Vercel CDN serves `_next/static/*` immutable. HTML is `force-dynamic` on authed pages (no full-page CDN cache).
- **Service workers:** PWA `sw.js` for installability/offline shell — **not** used for data caching.
- **Supabase cache:** none beyond the above; the pooler doesn't cache.
- **Memoization:** React `cache()` dedupes `getCurrentEmployee` per request; `useMemo` in client islands.

**Opportunity:** cache the per-user dashboard queries (short TTL, per-user key) and `getOrgSettings`; raise the dashboard aggregate TTL for quiet periods.

---

# 17. Current Known Issues

**Open functional/perf items:**
- **Stale-connection hang tail** (~1/3 of cold loads can stall to the timeout) — infra fix pending (pooler pool size / DATABASE_URL verification). See §15.
- **G6** — "Task owned = 0" metric on a person/dashboard view shows wrong number (should count tasks the person *assigned to others*). Not located in code; needs the exact screen.
- **G7** — dynamic-form placeholder/header text overlap; not reproducible from `components/forms/module-page.tsx` alone; needs the exact field/screen.
- **`gate_log` table + garbage-content check (Phase-1 spec item B21)** — designed, never built.
- **Sentry not wired** — `@sentry/nextjs` installed but no config; no error telemetry beyond Vercel.
- **Two spreadsheet libs** (`xlsx` + `exceljs`) coexist.
- **Migration journal stale** — must apply via idempotent SQL scripts, never `drizzle-kit migrate`.
- **RLS not the effective authz layer** — app connects privileged + enforces in code (security note).

**Recently FIXED this cycle (context):** D16 dashboard crash (`computePunctuality` called `.getUTCFullYear()` on a string `dueAt` from a raw-SQL `COALESCE` projection → threw → error card on every load); status dropdown clipped by an `overflow-hidden` card (Done invisible); dashboard `search_text` payload bloat; missing query timeouts (infinite "Loading").

**TODO/FIXME/console:** code is fairly clean of stray `FIXME`; numerous intentional `console.warn`/`console.error` in best-effort paths (notification dispatch, attendance notify, `[db-timeout]`, slow-query logger which is **dev-only**, `[dashboard] data load failed`). These are diagnostic, not bugs. (Run `grep -rn "TODO\|FIXME\|HACK"` for an exact list — primarily in migration/spec comments.)

---

# 18. Deployment

- **Hosting:** Vercel, building the `task-management/` subfolder of `MananVasa-support/Manan-Vasa` `main`. Auto-promotes on push (~1–3 min). `scripts/ship.sh` pushes only the delta since the `last-ship` tag (excludes `mobile/`, `web_page/`, root `package.json`).
- **Build command:** `next build` (prod keeps its own cache-clearing build + trimmed deps). Dev: `next dev --turbopack`.
- **Output size:** not measured here; serverless functions per route + static chunks. `serverExternalPackages: firebase-admin, pdfkit`.
- **Env vars (key):** `DATABASE_URL` (must be 6543 txn pooler), `NEXT_PUBLIC_FIREBASE_API_KEY`, `FIREBASE_PROJECT_ID/CLIENT_EMAIL/PRIVATE_KEY`, `COOKIE_SECRET_CURRENT/PREVIOUS`, `RESEND_API_KEY`/`RESEND_FROM_EMAIL`, `EMAIL_BCC_ADDRESS` (optional, D12), `CRON_SECRET`, WhatsApp Meta creds, Slack token, Google service-account creds, web-push VAPID keys, `NEXT_PUBLIC_SITE_URL` (must include `https://`), `ALLOW_INSECURE_COOKIES` (LAN only), `SLOW_QUERY_MS` (optional).
- **Regions:** single region (Supabase `ap-south-1`/`aws-1-ap-south-1` pooler). Cross-region Vercel→DB latency is part of every round-trip — keep functions in the DB's region.
- **Cold starts:** present; first authed request after idle pays function cold start + fresh pooler connect (up to `connect_timeout 10s`).
- **Serverless functions:** every route handler + RSC render is a function; 5 Vercel **crons** (digest, backup, retry-dispatch, materialize-recurring, weekly-goals) bearer-authed via `CRON_SECRET`.

---

# 19. Dependencies (versions)

**Runtime (`dependencies`):** @dnd-kit/core ^6.3.1, @dnd-kit/sortable ^10.0.0, @dnd-kit/utilities ^3.2.2, @heroui/framer-utils ^2.1.28, @hookform/resolvers ^5.4.0, @radix-ui/react-{dialog ^1.1.15, dropdown-menu ^2.1.16, popover ^1.1.15, separator ^1.1.8, slot ^1.2.4, tabs ^1.1.13, tooltip ^1.2.8}, @react-email/components ^1.0.12, @react-email/render ^2.0.8, **@sentry/nextjs ^10.53.1**, @simplewebauthn/browser ^13.3.0, @simplewebauthn/server ^13.3.1, @slack/web-api ^7.15.2, @supabase/ssr ^0.10.3, @supabase/supabase-js ^2.105.4, **@tanstack/react-query ^5.100.9**, @tanstack/react-table ^8.21.3, @vercel/speed-insights ^2.0.0, clsx ^2.1.1, cmdk ^1.1.1, csv-parse ^6.2.1, date-fns ^4.1.0, **drizzle-orm ^0.45.2**, **firebase ^12.13.0**, **firebase-admin ^13.9.0**, lucide-react ^1.14.0, **motion ^12.38.0**, **next ^16.2.6**, **next-firebase-auth-edge ^1.12.0**, nuqs ^2.8.9, ogl ^1.0.11, pdfkit ^0.18.0, **postgres ^3.4.9**, **react ^19.2.6**, react-day-picker ^10.0.0, react-dom ^19.2.6, react-hook-form ^7.78.0, react-window ^2.2.7, **recharts ^3.8.1**, resend ^6.12.3, server-only ^0.0.1, sonner ^2.0.7, tailwind-merge ^3.5.0, web-push ^3.6.7, **xlsx ^0.18.5**, zod ^4.4.3.

**Dev (`devDependencies`):** @eslint/eslintrc ^3.3.5, @faker-js/faker ^10.4.0, @playwright/test ^1.59.1, @tailwindcss/postcss ^4.3.0, @testing-library/{dom ^10.4.1, react ^16.3.2}, @types/* (node ^25.6.2, pdfkit, pg, react ^19.2.14, react-dom, react-window, web-push), @vitest/ui ^4.1.5, concurrently ^9.2.1, csv-stringify ^6.7.0, dotenv ^17.4.2, **drizzle-kit ^0.31.10**, eslint ^9.39.1, eslint-config-next ^16.2.6, **exceljs ^4.4.0**, firebase-tools ^15.17.0, jsdom ^29.1.1, **tailwindcss ^4.3.0**, tsx ^4.21.0, **typescript ^6.0.3**, vitest ^4.1.5.

**Largest/heaviest to watch:** firebase (client), recharts, motion, exceljs+xlsx, pdfkit, firebase-admin, @slack/web-api.

---

# 20. Performance Recommendations (highest → lowest impact)

1. **Fix the pooler infra (biggest win).** Raise Supavisor **server pool size 15→40** (Supabase → Database → Connection pooling; free) and **verify Vercel `DATABASE_URL` is the 6543 transaction pooler** matching local. *Expected: eliminates the bulk of the intermittent "stuck/Retry" loads — the #1 user complaint.*
2. **Cache the per-user dashboard queries** (`getMyDayCounts`, `getMyTodayTasks`, `listWeekGoalsAsTasks`) with a short per-user `unstable_cache` (10–20s) and cache `getOrgSettings`. *Expected: removes ~3–4 uncached DB hits from every dashboard load → fewer hang surfaces, faster warm loads.*
3. **Reduce gate round-trips.** Combine the two gate EXISTS/COUNT checks into one query, and/or cache `getOrgSettings`. Consider running gates only on navigations that matter (they currently run on every authed render). *Expected: shaves 2–3 round-trips off every page's TTFB.*
4. **Cancel-on-timeout / fewer orphans.** Today's `withTimeout` abandons queries → `ClientRead` orphans hold pooler slots. Investigate per-query cancellation or shorter server-side `statement_timeout` at the role level (guard the backup) so orphans clear in seconds, not ~2 min. *Expected: breaks the starvation cascade under load.*
5. **Trim result columns** on all task scans to exactly the fields transforms read (already done for `search_text`; do the rest). *Expected: smaller payloads, faster sends, fewer send-phase stalls.*
6. **Add `tasks(created_at)` index** before the table grows. *Expected: future-proofs the dashboard scans.*
7. **Dynamic-import heavy client libs** (recharts, dnd-kit, ogl, export libs) and **trim fonts** (4 families → 2). *Expected: smaller initial JS + faster first paint; modest vs the DB wins.*
8. **Wire Sentry** (or remove it) for real error/perf telemetry. *Expected: visibility, not raw speed.*
9. **Cache Google-Sheet-backed dashboards.** *Expected: removes multi-second external calls from those pages.*

---

# 21. Code Samples

> Next App Router has no `main.tsx`/`App.tsx`/router file — the equivalents are the root layout, the authed layout, `middleware.ts`, the DB client, `providers.tsx`, `lib/auth/current.ts`, and the dashboard page + `loadDashboardData`. The most load-bearing ones:

**DB client — `lib/db/index.ts`** (the heart of the perf story):
```ts
const client = globalForDb.__pg ?? postgres(env.DATABASE_URL, {
  prepare: false,            // required for Supabase txn pooler
  max: 10,                   // connections to the POOLER (not Postgres)
  idle_timeout: 10,          // recycle idle conns fast (anti-stale)
  max_lifetime: 60 * 10,     // 10 min
  connect_timeout: 10,
});
// NOTE: no connection:{statement_timeout} — Supavisor ignores startup GUCs.
export const db = drizzle(tracedClient, { schema });
```

**Hard query timeout — `lib/db/with-timeout.ts`** (the anti-hang layer):
```ts
export function withTimeout<T>(work, ms, label="query"): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new DbTimeoutError(label, ms)), ms);
    Promise.resolve(work).then(v => { clearTimeout(timer); resolve(v); },
                               e => { clearTimeout(timer); reject(e); });
  });
}
export async function withTimeoutOr<T>(work, ms, fallback, label) {
  try { return await withTimeout(work, ms, label); }
  catch (e) { console.warn(`[db-timeout] ${label} fell back`); return fallback; }
}
```

**Auth resolver — `lib/auth/current.ts`** (request-deduped via React cache):
```ts
export const getCurrentEmployee = cache(async () => {
  const claims = await readSession();
  if (!claims) return null;
  return (await db.query.employees.findFirst({ where: eq(employees.firebaseUid, claims.uid) })) ?? null;
});
export async function requireUser() {
  const e = await getCurrentEmployee();
  if (!e || !e.isActive) redirect("/login");
  return e;
}
```

**Authed layout — `app/(app)/layout.tsx`** (gates on every page, all timeout-wrapped):
```ts
const me = await withTimeout(requireUser(), 10_000, "requireUser");
const mustFill = await withTimeoutOr(hasUnfilledWeekGoals(me.id), 7000, false, "weekly-goals-gate");
if (mustFill) return <WeeklyGoalsFillView … />;
const mustPlan = await withTimeoutOr(needsDailyPlan(me.id), 7000, false, "daily-plan-gate");
if (mustPlan) return <DailyChecklistView mode="gate" … />;
const settings = await getOrgSettings();   // 5s-timeout→DEFAULTS internally
return <><IdleTimerClient timeoutMinutes={settings.idleTimeoutMinutes}/>…{children}</>;
```

**Providers — `components/providers.tsx`:**
```tsx
const [client] = React.useState(() => new QueryClient({
  defaultOptions: { queries: { staleTime: 30_000, refetchOnWindowFocus: false, retry: 1 } },
}));
return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
```

**Middleware — `middleware.ts`:** `next-firebase-auth-edge` `authMiddleware` with `checkRevoked:false` (no per-request Firebase call), `__session` cookie, public allow-list (login/cron/mobile/PWA), invalid token → `/login?next=…`. Matcher excludes `_next/static`, images, xlsx.

**Dashboard data loader — `lib/queries/dashboard.ts`:**
```ts
export async function loadDashboardData(filters) {
  const data = await unstable_cache(() => loadDashboardDataUncached(filters), keyParts,
    { revalidate: 60, tags: [CACHE_TAGS.tasks] })();
  return { ...data, generatedAt: new Date() };
}
// loadDashboardDataUncached: const {description,notes,searchText, ...BASE}=getTableColumns(tasks)
//   taskCols = {...BASE, dueAt: effectiveDueAtSql()}  // COALESCE(revised_target_date,due_at) → STRING at runtime!
//   Promise.all([ employees, periodScan(30d), wideScan(14d), velocityScan(90d), deptMap, rankingScan ])
//   then computeKpiTotals / computeStatusDistribution / computeAgingByDate / computeTopPerformers /
//        computeVelocity / computeEmployeeStatusTable / computePunctuality(periodTasks, nameById)
```
> **Gotcha captured here:** `effectiveDueAtSql()` is a raw `sql\`COALESCE(...)\`` fragment, so drizzle returns `dueAt` as a **STRING**, not a Date. Any transform calling Date methods on it must coerce (the D16 crash). Unit-test transforms with the **string** the DB returns.

**Dashboard page — `app/(app)/page.tsx`** (resilient fan-out):
```tsx
try {
  [allEmployees,data,statusDisplay,myDay,todayTasks,subjects,myGoals] =
    await withTimeout(Promise.all([
      listEmployees(), loadDashboardData(filters), getStatusDisplayMap(),
      me ? getMyDayCounts(me.id).catch(()=>null) : null,
      me ? getMyTodayTasks(me.id).catch(()=>null) : null,
      listDistinctSubjects().catch(()=>[]),
      me ? listWeekGoalsAsTasks({scope:{employeeIds:[me.id]}}).catch(()=>[]) : [],
    ]), 18_000, "dashboard-load");
} catch { return <DashboardLoadError/>; }   // also catches the 18s timeout
```

---

# 22. Final Assessment (brutally honest)

| Dimension | Score | Why |
|---|---:|---|
| **Architecture** | **7/10** | RSC-first Next 16 with Server Actions is a sound, modern choice; clear separation (queries / transforms / actions / validators); pure testable transforms. But the **Drizzle-over-txn-pooler + Firebase-auth-edge + Supabase-only-for-storage/realtime** stack is unusual and the pooler indirection is under-respected — the architecture fights its own data layer. The deploy pipeline (copy into a foreign monorepo via `ship.sh`, stale drizzle journal, same DB for local+prod) is fragile and non-standard. |
| **Scalability** | **5/10** | Fine for ~30 users / <1k rows. The dashboard's ~12-query fan-out, uncached per-user queries, per-page gate round-trips, and **fixed pooler slot ceiling (15)** mean concurrency — not data size — is the wall. Several seq scans (no `created_at` idx) are latent cliffs. Connection management, not schema, is the scaling risk. |
| **Performance** | **4/10** | The *steady-state* render is fast (<700ms) and RSC keeps client JS lean, but the system has a **chronic, user-visible reliability-of-performance problem**: intermittent multi-second/infinite stalls from stale pooled connections, amplified by query-abandonment orphans. Heavy fonts and undynamic heavy libs add first-load weight. Recent fixes (timeouts, payload trim, crash fix) raised the floor but the tail remains until infra is fixed. |
| **Maintainability** | **7/10** | Strong: TypeScript strict, heavily commented (often with the *why* and incident history), unit-tested pure logic, consistent query/action layering, a single schema source of truth. Weak: a few 500–900-line components, 72 migrations with duplicate numbers + a stale journal, two spreadsheet libs, and tribal deploy knowledge encoded in scripts/comments rather than docs. |
| **Security** | **5/10** | Auth is solid (Firebase + signed httpOnly session cookie, edge verification, super-admin allow-list, role/transition matrix). **But RLS is effectively bypassed** — the app connects privileged through the pooler and relies entirely on app-code authz; one missing `requireX()` is a data-exposure bug with no DB backstop. `checkRevoked:false` means up-to-1-hour stale revocation. Secrets are env-managed (good). For an internal tool this is acceptable; for anything multi-tenant it is not. |
| **Production readiness** | **5/10** | It IS in production and serving a real team, with health checks, crons, backups, Speed Insights, graceful fail-open gates, and timeout guards. But the recurring "stuck loading" incidents, **Sentry installed-but-unwired (no error telemetry)**, the foreign-monorepo deploy hop, and the local-DB==prod-DB setup are real operational hazards. It works, but it's one pooler hiccup away from a bad day. |
| **Technical debt** | **6/10** (moderate) | Concentrated, not pervasive: the connection/pooler handling, the stale migration journal, duplicate libs, the dormant Sentry, a couple of oversized components, and the deploy mechanism. The core domain code is clean and well-tested. Debt is mostly at the **infra/data-layer seams**, which is exactly where the performance pain is. |

**Bottom line for the next engineer:** Don't waste time profiling React or query plans first — **the database is tiny and the queries are fast.** The problem is **connection lifecycle against the Supabase transaction pooler**: stale sockets cause hangs, the app's timeout mitigation creates `ClientRead` orphans that hold the pooler's 15 slots, and that starves concurrent loads. Start by (1) raising the Supavisor pool size and confirming the prod `DATABASE_URL` endpoint, (2) caching the per-user dashboard/gate queries to cut round-trips, then (3) reducing query fan-out and adding cancellation so abandoned queries don't hold slots. Everything else (fonts, dynamic imports, Sentry, the `created_at` index) is secondary polish.
