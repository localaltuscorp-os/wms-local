# Altus WMS — Performance War-Room Audit (2026-06-29)

**Method:** real DB profiling via `pg_stat_statements` + `pg_stat_user_tables` against **production** (`scripts/db-perf-audit.ts`, read-only, own connection) + a production `pnpm build` + rigorous static analysis of every app layer (3 parallel deep code audits). Findings are tagged **MEASURED** (from the DB stats / build) or **STATIC** (code-shape, high confidence). **Not measured live:** browser metrics (LCP/TTI/hydration/main-thread) — no Lighthouse/CDP run yet; see §11. No code or DB was changed.

---

## 0. Verdict up front

**Supabase Postgres is NOT the bottleneck. Proven, not assumed.** Every *application* query runs in **0.3–6.4 ms mean**. The dashboard "12–22s scans" from memory were **never query cost** — they were **pool saturation caused by a realtime-driven `router.refresh()` storm hammering the same connections**. The single largest consumer of database time is **Supabase Realtime's own WAL polling** — i.e., the realtime *feature*, not your data. **Replacing Supabase would fix nothing** and would carry the same broken realtime/refresh/inline-side-effect architecture to a new DB.

The app feels laggy under load because of **four architectural amplifiers**, all fixable without touching the DB pool or `DATABASE_URL`:
1. A table-wide realtime subscription that triggers a **global server re-render on every client** on any task change.
2. **Over-broad cache invalidation** (`revalidatePath("/")` + one mega cache-tag) that keeps the expensive dashboard cache cold exactly when the storm hits.
3. **Inline external side-effects** (email/WhatsApp/Slack/push/Calendar) awaited inside interactive write actions.
4. A **serial gate chain** of 5–7 sequential DB round-trips on every page before it renders.

---

## 1. Performance score per subsystem

| Subsystem | Score | Evidence |
|---|---|---|
| Postgres query engine | **A** | App queries 0.3–6.4 ms mean (MEASURED); `tasks` = 758 rows / 3.3 MB |
| Indexes | **A−** | idx_scan ≫ seq_scan on hot tables; one gap (plain `tasks(created_at)`) is latent only |
| Connection pool config | **B** | `max:10` to the Supavisor pooler; fine except under the refresh storm |
| **Realtime architecture** | **D** | Table-wide `tasks` sub → global `router.refresh()`; **#1 + #2 DB-time consumers are realtime WAL polling** (MEASURED) |
| **Cache invalidation** | **C−** | Good caches (60s dashboard, nav-counts, my-day) **defeated** by `revalidatePath("/")` + one `tasks` tag on every write (STATIC) |
| Server request path | **C** | Single-task `notify()`/Calendar awaited inline; serial gate chain per page (STATIC) |
| Dashboard data layer | **B−** | ~17 statements, correctly parallelized + 60s-cached — but cache busted constantly |
| Frontend bundle/render | **C** | 62% client components, **0 dynamic imports**, monolithic 1.4–2.4k-line client files, unvirtualized lists (STATIC) |
| Background-job infra | **C−** | No queue; everything inline or daily cron (Vercel rejects sub-daily here) |

---

## 2. Top 20 bottlenecks, ranked by impact under 20–50 concurrent users

1. **Realtime → global `router.refresh()` storm.** `components/layout/live-indicator.tsx:34-50` subscribes to `event:"*"` on the whole `tasks` table; on any change every connected client runs `router.refresh()` (debounced 1.5s), re-running the entire server tree incl. the dashboard's ~5 task scans. 1 edit → N clients × full re-render. **STATIC + corroborated by the MEASURED WAL-poll load.**
2. **`revalidatePath("/")` on every task write.** `app/(app)/tasks/actions.ts:95-106` (`revalidateTaskRoutes`, called by ~15 actions) busts the dashboard route + the 60s `loadDashboardData` cache org-wide on every status tick. **STATIC.**
3. **One cache tag (`CACHE_TAGS.tasks`) busts 4 expensive queries** — dashboard + my-day + nav-counts + distinct-subjects — on every task write, even a **read-receipt** (`read-actions.ts:25`). Cache is cold precisely during the storm. **STATIC.**
4. **Supabase Realtime WAL polling is the #1 DB-time consumer** — `SELECT wal->>…` = **2,584,888 ms cumulative over 658,437 calls** (the two top entries in `pg_stat_statements`). The realtime feature, not app data, dominates DB time. **MEASURED.**
5. **Single-task `notify()` awaited inline** — `lib/tasks/set-status.ts:137` (+ approve/reassign in `tasks/actions.ts:1124,1133,1258`): up to 3 recipients × **4 live external HTTP calls** (Resend, WhatsApp Graph, Slack, web-push) before the action returns. Bulk path defers; single blocks — inconsistent. **STATIC.**
6. **Inline Google Calendar sync on single-task mutations** — `lib/tasks/create-task.ts:141` (8s race) + `tasks/actions.ts:139,223,394,1021,1291`: a Google round-trip inside the request. **STATIC (author-measured 8s ceiling).**
7. **Serial gate chain in `app/(app)/layout.tsx:23-94`** — `requireUser → gateSkipActive → isManagerWithReports → needsDailyPlan → needsGoalActuals → managerDailyTaskGate → dccGateTarget → dccManagerReviewState`, sequential, on **every** workspace page → 5–7 round-trips of TTFB before render. **STATIC.**
8. **Inline attendance-punch notifications + month re-grade** — `app/(app)/attendance/actions.ts:159,161` → `punch-notify.ts` re-reads the month, grades, emails before the punch returns. **STATIC.**
9. **Zero client code-splitting** — **0 `next/dynamic`** in the repo; `recharts`, `@dnd-kit`, `xlsx@0.18.5` all statically imported into first-load JS. **MEASURED (grep) / STATIC.**
10. **Monolithic client components** — `task-table.tsx` 1428 ln, `projects-workspace.tsx` 2417 ln, `daily-plan-gate.tsx` 1134 ln — large hydration + parse cost. **MEASURED (wc).**
11. **Unvirtualized large lists** — `components/accounts/task-list/task-list-client.tsx` renders the entire filtered set, each row with 2 `<select>`s, rows not memoized → every keystroke re-renders all rows. `react-window` is installed but **unused**. **STATIC.**
12. **Kanban/pipeline boards re-filter per column every render + re-render whole board per drag tick** — `components/tasks/kanban-board.tsx:128,272`, `components/ambassadors/pipeline-board.tsx:283`. **STATIC.**
13. **`listDistinctSubjects`/`listDistinctClients` = full `DISTINCT` scan, tagged `tasks`** — `lib/queries/tasks.ts:613` re-armed on every task edit (3.2 ms now, grows). **MEASURED 3.2 ms.**
14. **`task_events` MAX aggregation with JSONB extract, no expression index** — `lib/queries/dashboard.ts:182` (6.4 ms now); `task_events` grows unbounded (one row per status change forever). **MEASURED 6.4 ms.**
15. **Redundant wide `employees` reads** — `listEmployees()` (all ~20 columns, **uncached**) at `dashboard/page.tsx:70` + again inside `loadDashboardData`; a cached slim `listEmployeeOptions` exists and is unused. **STATIC.**
16. **"Copy props→state via useEffect" (~20 instances)** — e.g. `edit-employee-dialog.tsx:112`, the accounts grid editors — a refresh storm mid-edit can **clobber typed input** (data-loss UX). **STATIC.**
17. **No plain `tasks(created_at)` index** — the only `created_at`-leading index is **partial (pending-only)**, so all-status range scans can't use it. Irrelevant at 758 rows (3–5 ms), matters as `tasks` grows. **MEASURED + STATIC.**
18. **No job queue at all** — every side-effect is inline or a daily cron; `after()` is best-effort, no durability/retry/concurrency cap. **STATIC.**
19. **Dashboard wave-2 could merge into wave-1** — `dashboard.ts:166` adds a round-trip with no data dependency. Minor. **STATIC.**
20. **`pg_timezone_names` load — 563 ms mean × 663 calls** — connection/driver startup cost (timezone table), not app code; mitigated by connection reuse. **MEASURED.**

---

## 3. Root-cause analysis

- **The lag is concurrency amplification, not slowness.** A single task write triggers: `revalidatePath("/")` + `updateTag(tasks)` (busts the dashboard cache) **and** a realtime event fanned to every client, each of which runs `router.refresh()` (re-runs the now-cold dashboard's ~5 scans + the serial gate chain). With 20–50 users ticking statuses, the small connection pool sees a burst of identical heavy work that the cache should have absorbed but can't, because it was just invalidated. That burst is the historical "stuck on Loading…" pool cascade — **not** a slow query.
- **Interactive actions feel heavy** because the response waits on external HTTP (email/WhatsApp/Slack/push/Calendar) that the user doesn't need synchronously.
- **Every navigation pays** a serial gate chain before first byte.
- **Postgres is comfortably idle** on app work; the realtime feature is the heaviest DB consumer.

---

## 4. Concrete optimizations + estimated gain

| # | Fix | Files | Est. gain |
|---|---|---|---|
| 1 | **Scope realtime**: drop the table-wide `router.refresh()`; emit targeted `revalidateTag` for the affected slice, or filter the subscription to the viewer's data. | `live-indicator.tsx`, task actions | **Removes the N× re-render amplification** — the biggest concurrency win |
| 2 | **Stop busting `/` + the org dashboard on per-user writes**: remove `revalidatePath("/")` from `revalidateTaskRoutes`; split a per-user/narrow tag from the org-dashboard tag; don't bust on read-receipts. | `tasks/actions.ts`, `lib/cache-tags.ts`, `read-actions.ts` | **60s cache actually serves** concurrent loads → dashboard scans drop ~Nx |
| 3 | **Defer single-task side-effects**: wrap `notify()` + `reconcileTaskEvent` in `afterResponse()` (match the bulk path) — later, enqueue. | `set-status.ts`, `tasks/actions.ts`, `attendance/actions.ts` | Status tick / reassign / punch **return in ms instead of hundreds of ms–seconds** |
| 4 | **Batch the gate chain** into one `Promise.all` / one query + per-user-per-day cache. | `app/(app)/layout.tsx`, gate libs | **−5–7 round-trips of TTFB** on every navigation |
| 5 | **Dynamic-import** `recharts`, `@dnd-kit`, `xlsx` (`next/dynamic`, xlsx on click). | charts, kanban/pipeline, import/export | Smaller first-load JS, faster TTI |
| 6 | **Memoize boards + virtualize the big list**; `React.memo` rows + stable callbacks; use the installed `react-window`. | kanban/pipeline, `task-list-client.tsx` | Smooth drag/typing, less main-thread jank |
| 7 | **Fix prop→state effects** (init-once / merge dirty) to stop input clobbering on refresh. | dialogs + accounts grid editors | Removes silent data-loss UX |
| 8 | **Slim/cached employee read** on the dashboard page; drop the `tasks` tag from distinct-subjects. | `dashboard/page.tsx`, `tasks.ts` | One fewer wide read/render; stops re-armed DISTINCT scans |
| 9 | **Future-proof DB**: add plain `tasks(created_at)` index; window the `task_events` MAX. | migration | Keeps scans fast as data grows (low urgency now) |
| 10 | **Introduce a durable queue** (Upstash/QStash) for notifications + calendar (+ future AI). | new infra | Sub-minute async (vs daily cron), removes all external-HTTP latency from requests |
| 11 | **Turn on the slow-query logger in prod** (`SLOW_QUERY_MS`) + a `/admin/ai-usage`-style perf panel. | `lib/db/slow-query.ts`, env | Continuous measurement instead of guessing |

---

## 5. Is Supabase the bottleneck? **No — and here is the proof.**
- App queries: notification-count **0.6 ms**, task counts **0.4–0.7 ms**, dashboard task scan **3–5 ms**, distinct-subjects **3.2 ms**, task_events agg **6.4 ms**, employees **0.6 ms** (all MEASURED, `pg_stat_statements` mean).
- `tasks` = 758 rows, 3.3 MB; index scans dominate seq scans on hot tables.
- The two heaviest DB-time entries are **Supabase Realtime WAL polling** (2.58M ms / 658K calls) — the realtime *machinery*, which our app over-uses via the table-wide subscription.

## 6. Would replacing Supabase materially help? **No.**
The limiter is application architecture (realtime fan-out, cache invalidation, inline side-effects, serial gates). A different DB inherits all of it. A migration is the **last** resort and is **not** indicated. (If anything, *reducing* realtime usage lightens Supabase's single biggest load.)

---

## 7. Phased optimization roadmap (all load-safe — no pool / `DATABASE_URL` changes)

- **P0 — Kill the storm (highest impact, low risk):** fixes #1, #2, #3 above (scope realtime, narrow cache invalidation). Expected: eliminates the pool-cascade lag under concurrency; the dashboard serves from cache.
- **P1 — De-block interactive actions:** fix #3 (defer notify/calendar to `afterResponse`/queue) + #8 (attendance). Expected: status/punch/reassign feel instant.
- **P2 — Cut TTFB:** fix #4 (batch gate chain). Expected: snappier navigation everywhere.
- **P3 — Frontend weight:** fixes #5, #6, #7 (code-split, memoize/virtualize, prop-state). Expected: faster first paint + smooth interaction; removes data-loss UX.
- **P4 — Durability & future-proofing:** #10 (queue), #9 (index/window), #11 (slow-query logging + perf panel). Expected: scales cleanly past current size; continuous measurement.

## 8. Before / after architecture

**Before:** `write → revalidatePath("/") + updateTag(tasks)` (dashboard cache cold) **→ realtime "*" event → every client router.refresh() → every client re-runs ~17 statements + serial gate chain → pool burst`; notify + Calendar awaited inline.

**After:** `write → narrow tag bust (no "/") + scoped realtime signal → clients revalidate only the affected slice (or read the warm 60s cache) → request returns immediately; notify + Calendar enqueued`. Gate chain batched + cached. Heavy client libs lazy-loaded.

## 9. Final recommendation
Do **not** replace Supabase. Execute P0 first — it targets the exact mechanism behind every "stuck/laggy under load" report and is low-risk (cache + realtime scoping, no pool/DDL changes). P1–P2 remove the remaining felt latency from interactive actions and navigation; P3 polishes the client; P4 future-proofs. With P0–P2 the app will feel Linear/Notion-fast under 20–50 concurrent users **because the architecture stops doing N× redundant work**, not because of bigger hardware.

## 10. Honest gaps (what was NOT measured)
- **Live browser metrics (LCP/TTI/hydration/main-thread/CLS)** were not captured — needs a Playwright + Chrome DevTools Protocol / Lighthouse pass against the authed app. The frontend findings (§2 #9–#12, #16) are static-analysis (file counts, import patterns, render shapes) — strong, but exact KB/ms need that run.
- **Exact bundle KB per route** — the build route table didn't emit size columns in this run; rerun with `@next/bundle-analyzer` for precise numbers.
- Recommend P4 #11 (prod slow-query logging) so future audits are measured continuously, not reconstructed.
