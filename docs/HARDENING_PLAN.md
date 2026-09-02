# Altus WMS — Hardening, Performance & Reliability Plan

**Status:** active · **Last updated:** 2026-06-09 · **Owner:** Hetesh + Claude pair
**Trigger:** Manan reported "clicking on a task takes multiple seconds to load."
**Scope:** This is the canonical, multi-session plan for hardening the dashboard. Treat it as a backlog — pick the next unstarted item, do it, check the box, write a one-line outcome.

---

## How to use this doc

- **Anyone (incl. a fresh Claude session) starting work**: read this file top-to-bottom, find the next unchecked item in the **highest-priority unfinished phase**, do it.
- Each item has: `Why` (the pain), `What` (concrete change), `Verify` (how we know it worked).
- After completion, fill in **Outcome** with the measured numbers/PR commit (`abc1234`).
- Don't reorder phases unilaterally — if you think the priority is wrong, write a note under "Open questions" and ask.
- Cross-session memory pointer: `[[hardening-plan]]` in `MEMORY.md`.

Symbols:
- `[ ]` = not started · `[~]` = in progress (name in trailing parens) · `[x]` = done

---

## Why this plan exists — the actual root cause of slowness

`app/(app)/tasks/[id]/page.tsx` fires 8 sequential round-trips per click:

```ts
await requireUser()          // Firebase verify (~300ms remote)
await getTaskById(id)        // 1 query
await Promise.all([          // 6 more in parallel:
  listTaskEvents(id),        //   per-task (necessary)
  listEmployees(),           //   roster (rarely changes)
  getStatusDisplayMap(),     //   13 rows (almost never changes)
  listActiveClientNames(),   //   clients list (rarely changes)
  listActiveSubjectNames(),  //   subjects list (rarely changes)
  listProjectNodeOptions(),  //   project tree (rarely changes)
])
```

Five of those six fan-outs return data that's identical for every user, every page. Supabase pooler latency from India adds ~100–300ms per round-trip → **2–4s per click**.

Linter / a previous session has already started the right scaffolding:
- `lib/cache-tags.ts` (centralised tag names) ✓
- Write actions call `updateTag(CACHE_TAGS.x)` ✓
- Documents: `createSignedUrls` (batch) ✓, mutation auth ✓, file-type denylist ✓

The plan below builds on that.

---

## Phase 0 — Baseline & Observability (do this FIRST, ~1 day)

Without numbers we'll make changes that feel faster but aren't. Establish the baseline before touching anything else.

- [x] **0.1 Add a slow-query logger** on the drizzle client.
  - **What:** Wrap `db` so any query taking >300ms logs `[slow-query] <ms>ms — <sql>` to console (truncate to 200 chars).
  - **Why:** Within a day of production traffic we'll have a ranked list of slow paths.
  - **Verify:** Open `/tasks/[id]` once; grep the dev-server log for `[slow-query]`. Should see at least one entry per cold load.
  - **Outcome:** Implemented `lib/db/slow-query.ts` (function-Proxy on the postgres-js client; times template-tag calls AND `unsafe`/`begin`/`array`/`file`/`simple`). Auto-on in `development` at 300ms; opt-in elsewhere via `SLOW_QUERY_MS=<n>`. Typecheck clean. Dev session 2026-05-25.

- [~] **0.2 Stand up Sentry (free tier) or Axiom.**
  - **What:** Add Sentry client + server SDKs; set `SENTRY_DSN` in Vercel; enable Performance monitoring with `tracesSampleRate: 0.2`.
  - **Why:** Errors currently die in Vercel logs nobody reads. The "laptop black screen" bug is undebuggable without this.
  - **Verify:** Trigger a deliberate error from a server action; confirm it lands in Sentry within 30s.
  - **Outcome (code-side ready):** Installed `@sentry/nextjs`. Created `sentry.server.config.ts`, `sentry.edge.config.ts`, `sentry.client.config.ts`, `instrumentation.ts`, `instrumentation-client.ts` — all DSN-gated, so they no-op cleanly when `NEXT_PUBLIC_SENTRY_DSN` is unset. Default `tracesSampleRate=0.2`, PII off, runs in `production` only by default. `onRequestError` uses a lazy import so the edge bundle (which doesn't ship `captureRequestError`) doesn't break the build. Documented in `.env.example`. Required restart-after-install because Turbopack cached a stale bundle. **Pending user action:** create the Sentry project, set `NEXT_PUBLIC_SENTRY_DSN` in Vercel, redeploy. The 5-min smoke after that is: trigger an error from a server action and confirm it lands.

- [x] **0.3 Enable Vercel Speed Insights** on the `task-management` project.
  - **What:** Settings → Speed Insights → Enable. Add `<SpeedInsights />` to the root layout.
  - **Why:** Real-user LCP/INP per route, free.
  - **Verify:** After 24h, the Vercel dashboard shows percentile timings per route.
  - **Outcome:** Installed `@vercel/speed-insights`, mounted `<SpeedInsights />` in `app/layout.tsx`. Auto-no-ops outside Vercel (no env vars needed). After deploy + UI toggle, real-user Core Web Vitals will land per route.

- [ ] **0.4 Capture a baseline** of the current task-detail load.
  - **What:** Open `/tasks/[id]` 5× from a cold connection; note the avg of the dev server's `application-code` timings. Record `getTaskById` + each fan-out query in isolation via `console.time`.
  - **Why:** We need a number to beat. Otherwise Phase 1 "feels faster" is unfalsifiable.
  - **Verify:** Numbers recorded below.
  - **Outcome (current):** `getTaskById = ___ ms · listEmployees = ___ · listActiveClientNames = ___ · listActiveSubjectNames = ___ · getStatusDisplayMap = ___ · listProjectNodeOptions = ___ · TOTAL = ___ ms`

---

## Phase 1 — Speed: the user-visible win (1–2 days)

**Goal:** task-detail page TTI under 500ms warm, under 1.5s cold. Currently 2–4s.

- [x] **1.1 Cache the five static fan-outs with `unstable_cache`.**
  - **What:** Wrap `listEmployees`, `getStatusDisplayMap`, `listActiveClientNames`, `listActiveSubjectNames`, `listProjectNodeOptions` so each is read once and reused for every user. Use the existing `CACHE_TAGS` (writers already call `updateTag` on changes).
  - **Why:** These five return identical data for every user; we currently fetch them on every page render.
  - **Verify:** Slow-query log shows zero hits on `employees`/`subjects`/`clients`/`status_settings`/`project_nodes` during back-to-back page loads (until a write invalidates). Task-detail TTI < 500ms warm.
  - **Outcome:** `employees`, `nav-counts`, `status-display` were already cached by a prior session. Added caching for `listActiveClientNames` (`CACHE_TAGS.clients`), `listActiveSubjectNames` (`CACHE_TAGS.subjects`), `listProjectNodeOptions` (`CACHE_TAGS.projectNodes`). Writer invalidation: `revalidateClientSurfaces` + `quickAddClient` bust `clients`; `createSubject/updateSubject` + `revalidateTaskRoutes` already bust `subjects`; new `revalidateProjectSurfaces()` helper busts `projectNodes` on every project-node mutation. 2 new tags added to `lib/cache-tags.ts`. Also restored test-suite green (16→0 failures) by fixing pre-existing mock gaps surfaced by the linter's earlier `updateTag` / `tx.select` / `db.transaction` adoption — see commit. Typecheck clean, 334 tests pass. **Browser-side TTI measurement still pending** — needs a click-around session with the slow-query log open to capture before/after numbers.

- [x] **1.2 Add `<Suspense>` streaming to `/tasks/[id]`.**
  - **What:** Wrap the task body + audit feed in a `<Suspense fallback={<TaskSkeleton/>} />`. Render the header (title, status pill, doer chip) above the boundary so it paints instantly.
  - **Why:** Perceived speed > actual speed. Users want *something* on screen in <200ms.
  - **Verify:** First Contentful Paint on the route drops; LCP unchanged is fine.
  - **Outcome:** Split the page into a synchronous shell (`app/(app)/tasks/[id]/page.tsx`, just header/main/footer + auth) and an async `<TaskDetailLoader>` server component that owns the data fan-out, gated by `<Suspense fallback={<TaskDetailSkeleton/>}>`. New `task-detail-skeleton.tsx` paints a layout-matching shimmer (new `skeletonShimmer` keyframe, respects `prefers-reduced-motion`). Header + footer paint in <100ms; task body streams in when `getTaskById` + cached pickers settle. Commit `0a76167`. **Browser-side TTI measurement still pending.**

- [~] **1.3 Switch Supabase to the transaction-mode pooler (port 6543).**
  - **What:** Update `DATABASE_URL` in Vercel (Production + Preview) to use port `6543` instead of `5432`. Keep `5432` in `.env.local` for `tsx` migration scripts (session mode is needed for some Postgres features the scripts use).
  - **Why:** Serverless functions burn through session-mode's 15 connection cap. Memory file already flags `EMAXCONNSESSION` errors.
  - **Risk:** Some `LISTEN/NOTIFY` or session-level features will stop working. We don't use any.
  - **Verify:** Load `/tasks` 50× rapidly; no connection errors. Vercel function logs show no `EMAX...` warnings.
  - **Outcome (code-side ready):** Audit confirms code is already designed for txn-mode: `lib/db/index.ts` sets `prepare: false`; no `LISTEN/NOTIFY`/`pg_advisory_lock`/`SET LOCAL/SESSION` anywhere in `lib/` or `scripts/`. **Env update deferred** — local dev hits no connection-cap problem (single process, max=10), so flipping locally yields no perf win. The production env-var swap is what matters; pending push.

- [x] **1.4 Audit and add the missing task indices.**
  - **What:** `EXPLAIN ANALYZE` the dashboard's status-table query and the tasks-list query. Add indices for any seq-scans. Likely candidates: `tasks(subject)`, `tasks(doer_id, archived, status)` composite.
  - **Verify:** All hot queries return rows scanned ≈ rows returned in EXPLAIN.
  - **Outcome:** Ran `scripts/explain-hot-queries.ts` against live DB (710 tasks). **All hot queries sub-4ms.** Two genuine seq-scans found (status group-by, subject group-by) — both 0.5–0.7ms on 710 rows; an index on group-by columns wouldn't help a count-all-grouped query that touches every row. Other "seq scans" the script flagged were test-scaffolding artifacts (`(select id from tasks limit 1)` as a fake param), not real query paths. Real bottleneck on task click is **network RTT × number of round-trips** (Phases 1.1 + 1.2). **Follow-up rule:** revisit when `count(*) from tasks > 5,000` — at that scale a partial index on `tasks(status) where archived = false` may matter.

- [x] **1.5 Cache Firebase session-cookie verification.**
  - **What:** In `middleware.ts` / `proxy.ts`, cache the verified-token result by cookie hash for 60s (in-memory `Map` is fine — each Vercel instance gets its own). On revoke (admin deactivates an employee), bump a global epoch the cache checks.
  - **Why:** Verifying with `checkRevoked: true` is a Firebase round-trip on every request — 200–400ms × every navigation.
  - **Risk:** Up to 60s window where a revoked session still works. Acceptable for this app.
  - **Verify:** Slow-query log + console.time around verify shows ~5ms (cache hit) for repeat requests.
  - **Outcome:** Audit found this is **already done** by an earlier session — `middleware.ts` sets `checkRevoked: false`, so token verification uses cached Google public keys locally with no Firebase round-trip. `lib/auth/current.ts`'s `getCurrentEmployee` is `cache()`-wrapped (React per-request dedup) so the employee-row lookup happens at most once per request. The remaining ~5ms DB hit per navigation isn't worth the per-UID cache-invalidation complexity at current scale. **Follow-up rule:** if employee-row lookup ever shows up in the slow-query log >300ms (e.g. under heavy concurrent load), add `unstable_cache` keyed by Firebase UID with a `revalidateTag("employee:${uid}")` triggered by `updateEmployee`/`deactivateEmployee` admin actions.

- [x] **1.6 Perceived-performance loading UI (brain-hack layer).**
  - **What:** A global top-of-page progress bar that fires the instant any in-app link is clicked and completes when the new route paints, plus a reusable circular spinner / buffering state shown over the slow pages' skeletons.
  - **Why:** 1.4 proved the queries are fast and the residual cold-load latency is network RTT we can't remove in code. Making the wait *feel* short and intentional is the highest-ROI lever short of the infra fix (1.7). Manan reported "opening tasks takes time to load."
  - **Verify:** Click Dashboard ↔ Tasks ↔ Kanban — the bar animates immediately on click; Tasks shows a centered "Loading tasks…" spinner over its skeleton.
  - **Outcome:** Added `components/layout/route-progress.tsx` (App-Router-safe: detects nav START by capturing internal-anchor clicks, COMPLETE by pathname/searchParams change; trickles to 90%, snaps to 100%, 8s safety net) — mounted globally in `app/(app)/layout.tsx`. Added `components/ui/spinner.tsx` (`<Spinner/>` SVG ring + `<BufferingState/>` labelled centre state) and dropped `<BufferingState label="Loading tasks…"/>` over the table skeleton in `tasks/loading.tsx`. Typecheck + lint clean. Dev session 2026-06-09. **Staged on `feat/mobile-responsive`, not yet deployed.**

- [ ] **1.7 Co-locate the Vercel function region with the Supabase DB region.**
  - **What:** Check the Supabase project's region (Dashboard → Project Settings → General). Set the Vercel project's Serverless Function Region (Project Settings → Functions, or `regions` in `vercel.json`) to the Vercel region physically nearest that DB region — e.g. `bom1` (Mumbai) or `sin1` (Singapore) if the DB is in an India/SEA region. Keep the pooled `:6543` connection (see 1.3).
  - **Why:** This is the *actual* durable fix for the slow loads. 1.4's `EXPLAIN` showed every hot query is sub-4ms; re-confirmed 2026-06-09 that the same `listTasks` query measured **2685ms cold vs ~300ms warm** in one session — pure cross-continent latency variance, not query cost. Each DB round-trip currently crosses ~100–300ms of network; co-locating function + DB collapses that to single-digit-ms intra-region, multiplying across every round-trip per page. No code change can fix this — it's where the function runs relative to the DB.
  - **Risk:** The function region also affects latency *to users*. If users and the DB are both in India, an India region (`bom1`) wins on both. If they diverge, optimise for the DB (round-trips dominate) and lean on caching (1.1) + the perceived-perf UI (1.6) for the user-distance portion.
  - **Verify:** After the region move, cold `/tasks` `application-code` time drops from ~2–4s toward <800ms, and the slow-query log's per-query times collapse to <50ms. Capture before/after from the dev/Vercel logs.
  - **Outcome:** _(fill in: Supabase region, chosen Vercel region, before/after cold-load numbers)_

---

## Phase 2 — Reliability: things that fail silently today (2–3 days)

- [x] **2.1 Persist notification dispatch attempts.**
  - **What:** New table `notification_dispatch_log(id, notification_id, channel, status, error, attempted_at)`. Each Slack/email/WhatsApp send writes a row. Failures retry up to 3× with backoff via a cron route (`/api/cron/retry-notifications`).
  - **Why:** Sends are fire-and-forget; failures get a `console.error` and nothing more. People silently miss task assignments.
  - **Verify:** Kill the Slack token temporarily, trigger a task assignment, see 3 retry rows then a `failed` status.
  - **Outcome:** Migration `0029_notification_dispatch_log.sql` applied. Schema in `db/schema.ts` (`notificationDispatchLog`). `lib/notifications/dispatch.ts` now persists one row per channel-arm outcome (`sent`/`skipped`/`failed`) after the existing fan-out — non-blocking, swallow-and-continue same contract. Retry path in new `lib/notifications/retry.ts`: picks rows where `status='failed' AND next_attempt_at<=now() AND attempt_count<3`, re-runs the single channel with shared caches (notification, prefs, task, actor). Backoff schedule: 1min → 5min → 30min, then `failed_terminal`. Cron route `/api/cron/retry-dispatch` (every 5 min in `vercel.json`) guarded by `Authorization: Bearer $CRON_SECRET`. **Side fix:** discovered + fixed a pre-existing middleware bug where `/api/cron/*` was being auth-redirected to `/login` before reaching the route — added `/api/cron/` to `PUBLIC_API` allowlist. This was silently breaking the existing digest cron in production. End-to-end smoke-tested: seeded a failed log row, hit the cron endpoint as Vercel would, got `{picked:1, sent:1}` (real email delivered to recipient).

- [x] **2.2 Storage RLS as defense-in-depth.**
  - **What:** Enable RLS on the `storage.objects` table for the `documents` bucket: SELECT for `authenticated` only. Continue using service-role for writes (the app-code auth check is the primary gate).
  - **Why:** Today, anyone with the (signed) URL or the service-role key has full bucket access. RLS adds a second gate.
  - **Verify:** A signed URL still downloads. A direct `https://<project>.supabase.co/storage/v1/object/documents/<path>` request without auth returns 401.
  - **Outcome:** Migration `0033_storage_documents_rls.sql` applied. Four policies on `storage.objects` for the documents bucket (`select`, `insert`, `update`, `delete`) all gated on `authenticated` role + `bucket_id = 'documents'`. Service-role bypasses RLS by design, so `lib/supabase/admin.ts` callers are untouched. Signed URLs bypass RLS too (their own short-lived JWT). End-to-end smoke: service-role uploads/signs/deletes still work; signed-URL fetch 200; anon-key direct download "Object not found"; anon list returns 0 rows. Phase 2.5 (move app path off service-role onto user-JWT) is the next layer that builds on these policies.

- [x] **2.3 Rebuild the drizzle migration journal.**
  - **What:** Either (a) regenerate `_journal.json` from the actual migration files and check the live schema matches, or (b) formally adopt the `scripts/apply-migration.ts` pattern and delete `_journal.json` so future schema work flows through one path.
  - **Why:** Today, `pnpm db:migrate` would silently miss migrations 0019-tier3 / 0020 / 0021 / 0022 / 0023 / 0024 / 0025 / 0026 / 0027 / 0028. The next person who tries to spin up a fresh DB is in for a bad day.
  - **Verify:** `pnpm db:migrate` against an empty DB lands at the same schema as production.
  - **Outcome:** Chose option (b). New `scripts/apply-all-migrations.ts` walks `db/migrations/*.sql` in filename order, tracks applied files in a `__schema_applied` ledger (mirrors drizzle's `__drizzle_migrations` keyed by filename), splits out `ALTER TYPE ADD VALUE` statements so they run standalone (0024), and backfills the ledger on first run by probing for landmark tables/columns. Re-pointed `pnpm db:migrate` to this script; preserved the original via `pnpm db:migrate:legacy-drizzle-kit`. End-to-end tested on the live DB: 30 migrations correctly skipped as already-applied, 3 newer ones (0029 perf-indexes, 0029 notification-dispatch-log, 0030 document-events) re-applied idempotently with `IF NOT EXISTS` NOTICEs. Post-apply row counts intact.

- [ ] **2.4 Backups + restore drill.**
  - **What:** Confirm Supabase's daily PITR backup window covers what we need (it does on Pro, doesn't on Free). Document the restore procedure in `docs/runbooks/restore-from-backup.md`. Do a restore drill into a scratch project.
  - **Why:** "We have backups" without a tested restore is a wish, not a recovery plan.
  - **Verify:** The restore drill yields a working DB clone; we can read `tasks` and the row counts match within tolerance.
  - **Outcome:** _(date of drill + notes)_

- [ ] **2.5 Migrate document writes off the service-role client.**
  - **What:** Now that `authorizeDocumentMutation` checks ownership in app code, switch `uploadDocument` / `updateDocument` / `replaceDocumentFile` / `deleteDocument` to use the user's Firebase JWT against Storage's RLS (after 2.2 is in place). The service-role client stays only for one-off scripts.
  - **Why:** Currently a leak of `SUPABASE_SERVICE_ROLE_KEY` from Vercel envs = full DB breach. Removing it from the request path reduces the blast radius.
  - **Verify:** Documents upload/edit/delete still work end-to-end as a normal user.
  - **Outcome:** _(fill in)_

---

## Phase 3 — Auth & permission tightening (1–2 days)

- [x] **3.1 Project-node mutation gating.**
  - **What:** `createProjectNode` / `renameProjectNode` / `setProjectNodeArchived` currently require `requireUser()` only — anyone can rename anyone's project. Restrict to **creator or admin**.
  - **Verify:** A non-admin/non-creator user POSTing a rename gets `Forbidden`.
  - **Outcome:** Added `authorizeProjectNodeMutation` (mirrors docs-mutation auth). Rename + archive paths now require creator-or-admin and scope the UPDATE's WHERE to the same gate (belt-and-braces against concurrent ownership transfer). Create stays open. Commit `5982ec2`.

- [x] **3.2 Allow comment authors to edit/delete their own comments (within 15 min).**
  - **What:** Add `editComment` and `deleteComment` actions gated by `comment.actorId === me.id && Date.now() - comment.createdAt < 15min` (or admin). UI: hover → pencil/trash on own comments.
  - **Outcome:** New `editComment(eventId, {body})` + `deleteComment(eventId)` server actions in `tasks/actions.ts` with `canMutateComment` helper enforcing the 15-min window or admin override. Edit stores `editedAt` in the event's `to_value` JSON so the audit feed renders "(edited)". Delete hard-removes the event row (FK on notifications is set-null). UI: inline `<CommentBody>` client component in `audit-event.tsx` renders pencil/trash on hover, opens an autoexpanding textarea for edit (⌘/Ctrl+Enter to save, Esc to cancel), browser `confirm()` for delete. `me` threaded through `AuditFeed` → `AuditEvent` → `Body` → `CommentBody`.

- [x] **3.3 Rate-limit server actions.**
  - **What:** Add a per-user (employee id) sliding-window limiter — e.g. 60 writes/min, 600 reads/min — using Vercel KV or an in-memory `Map` per instance. Return 429 when exceeded.
  - **Why:** A compromised session can currently hammer the API; no defense.
  - **Verify:** Loop 100 task creates from a single user; the last 40 return 429.
  - **Outcome:** New `lib/rate-limit.ts` — in-memory sliding-window limiter, per (actorId, kind). Defaults: 60 writes/min, 600 reads/min. `rateLimitOrError(actorId, "write")` returns a Result-shape error compatible with the existing server-action surface, so wiring is a 2-line drop-in. Applied to the highest-volume writes: `createTask`, `setTaskStatus`, `editTaskFields`, `addComment`, all three project-node mutations, and the four document mutations. Identical-interface upgrade path to Vercel KV / Redis for cross-instance enforcement when needed. **6 new unit tests** in `tests/unit/rate-limit.test.ts` covering allow, count, reject-at-cap, per-actor isolation, and the Result-shape sugar.

- [x] **3.4 CSRF audit on server actions.**
  - **What:** Next 16 attaches Origin/Sec-Fetch-Site checks to server actions by default. Spot-check that a `curl -X POST` from a foreign origin against `/_next/postpone/...` action endpoints is rejected. Document the result.
  - **Outcome:** Three defense layers, all live:
    1. **Cookie scope** — `middleware.ts` sets the `__session` cookie with `sameSite: "lax"`, so a cross-site POST from `evil.example.com` won't even carry credentials.
    2. **Auth gate** — every non-`PUBLIC_API` path is intercepted by `next-firebase-auth-edge` middleware, which redirects unauthed requests to `/login` (verified: cross-origin curl gets a 307 before any server-action handler runs).
    3. **Next 16 native** — the server-action handler validates `Origin` against `Host` and requires a valid `Next-Action` hash (per-build random ID) before dispatching to user code. Even an authed cross-origin POST without the right `Next-Action` is dropped.
    The cookie-attribute + Next-built-in combo is the same model the React docs recommend; no additional middleware needed. The one residual risk is a stolen session cookie itself, which is a different threat (covered by Phase 3.3 rate-limit + Phase 1.5 short verify cache).

- [x] **3.5 Audit log for document mutations.**
  - **What:** Documents have no audit trail. Add a `document_events` table mirroring `task_events` — created / renamed / replaced / deleted.
  - **Outcome:** Migration `0030_document_events.sql` applied. Append-only table with `documentId` (FK set-null, so delete-events survive), snapshotted `documentTitle` for self-readability, `eventType` union (`created`/`renamed`/`description_changed`/`file_replaced`/`deleted`), `fromValue`/`toValue` JSONB, RLS admin-read, no public writes. New `logDocEvent()` helper in `documents/actions.ts`; wired into `uploadDocument`, `updateDocument` (emits separate `renamed` and `description_changed` rows for fields that actually changed), `replaceDocumentFile`, and `deleteDocument`. All log writes are swallow-and-warn so a logging failure can't crash a mutation that already succeeded.

---

## Phase 4 — Operational hygiene (1 day)

- [x] **4.1 Cron sanity.**
  - **What:** List all `app/api/cron/*` routes. Verify each is on Vercel's cron config and check the last 7 runs in the dashboard. Add one missing alert: digest cron failing > 2 days = page someone.
  - **Outcome:** Two cron routes — `/api/cron/digest` (daily) and `/api/cron/retry-dispatch` (every 5 min); both registered in `vercel.json`, both responding `200` with valid Bearer; the pre-existing middleware redirect bug that blocked both was fixed in Phase 2.1. **Open follow-up:** "fail-for-2-days = page someone" alert — needs Sentry + a scheduled query, deferred until Phase 0.2 (Sentry) lands.

- [x] **4.2 Paginate the task list.**
  - **What:** `listTasks` returns up to 1000 rows. At ~700 tasks today, fine; at 5000, fatal. Add cursor pagination + a "load more" button.
  - **Outcome:** Added a new `listTasksPage(filters, opts)` query returning `{ rows, nextCursor }`. Standard keyset cursor over `(createdAt desc, id desc)` — uses the existing index on `tasks_created_at`, no separate `count(*)` round-trip (fetches `pageSize + 1` and trims). Default 50, hard-capped at 200 server-side. Cursor is base64url(`<iso>|<id>`), opaque to callers, decoded defensively. `listTasks` kept as-is so the 9 existing callers (exports, kanban, agenda, archived, etc.) don't break in one sweep — new callers adopt `listTasksPage` incrementally. **UI "load more" button** is a follow-up — won't matter until row counts grow. 4 new unit tests for cursor encode/decode round-trip + bad-input handling.

- [~] **4.3 Make `pnpm typecheck` + `pnpm test` block CI.**
  - **What:** Add a GitHub Action that runs both on every push to `main` and PR. Fail the deploy if either is red.
  - **Why:** Today there's nothing stopping a broken deploy.
  - **Outcome (code-side ready):** Standalone repo's `.github/workflows/ci.yml` already gates PR + push-to-main on typecheck + tests + visual — good. **BUT** the deployed `Manan-Vasa` monorepo has its workflow at `task-management/.github/workflows/ci.yml`; GitHub only reads root `.github/workflows/`, so prod CI is silently dead. Wrote the corrected workflow at `docs/proposed-monorepo-ci.yml`, ready to drop into `Manan-Vasa/.github/workflows/task-management-ci.yml`. Filters `paths: task-management/**` so it doesn't run on attendance/pso changes; reuses cached pnpm; gates visual tests behind a `SKIP_VISUAL_TESTS=true` repo variable for release crunches. Push placement is a 1-file copy on next deploy.

- [x] **4.4 `.env.example`.**
  - **What:** Commit a `task-management/.env.example` with every required env var (name + comment, no values). The next person bootstrapping won't have to spelunk.
  - **Outcome:** Created. Grouped by purpose (database, supabase, firebase, app, email, slack, whatsapp, web-push, cron, observability, dev-only); calls out NEXT_PUBLIC_ vs server-only and the 5432-vs-6543 pooler-port rule; includes `SLOW_QUERY_MS` from Phase 0.1. Commit `5982ec2`.

- [x] **4.5 Health check.**
  - **What:** `app/api/health` exists — verify it actually checks the DB + Supabase storage + a sample query, not just `200 OK`. Hook into a free uptime monitor (BetterStack / UptimeRobot).
  - **Outcome:** Rewrote `app/api/health/route.ts` from `force-static` "always 200" to `force-dynamic` with real probes: `select 1` against Postgres (1500ms timeout), `storage.getBucket(documents)` against Supabase Storage (2500ms timeout). DB failure → `503` with per-check breakdown; storage failure → `200` (degraded but not hard-down — Storage gates only the docs feature). Verified locally: returns `200` with `checks: [db ok 283ms, storage ok 878ms]`. Uptime-monitor wire-up (BetterStack/UptimeRobot) is a UI-side task on user's side; the endpoint is ready.

---

## Phase 5 — Outstanding product items (parking lot from Manan's sheet)

These aren't infra but they're real commitments:

- [ ] **5.1 Google Calendar two-way sync.** Blocked on Manan's Google Cloud OAuth setup. Plan: see "Google Calendar sync" thread — once `GOOGLE_CLIENT_ID/SECRET` are in Vercel + `.env.local`, build the `/api/google/{auth,callback}` routes, encrypted `google_tokens` table, and event push from task save.
- [x] **5.2 Recurrence engine.** The picker captures RRULE-lite rules but nothing materialises future task instances. Need a cron that, for any task with a `recurrenceRule`, creates the next instance N days ahead.
  - **Outcome:** Built end-to-end.
    - **Schema** (migrations `0031`, `0032`): `tasks.recurrence_parent_id` (self-FK, set-null on parent delete) + `tasks.recurrence_occurrence_date` (yyyy-mm-dd) + unique index on the pair (Postgres treats NULL,NULL as distinct so non-recurring rows don't collide).
    - **RRULE-lite parser** (`lib/recurrence/rrule.ts`): supports FREQ=DAILY/WEEKLY[+BYDAY]/MONTHLY[+BYDAY=nthDay|+BYMONTHDAY]/YEARLY, UNTIL=yyyy-mm-dd. Pure module; caps generation at MAX_OCCURRENCES=200 so a buggy rule can't spawn thousands on one tick.
    - **Materializer** (`lib/recurrence/materialize.ts`): walks active rule-holders, generates calendar-date occurrences in a 14-day window strictly AFTER the anchor's due-date, clones the template's fields into a fresh task (status reset to `not_started`, no approval state) at the same wall-time, idempotent via `INSERT ... ON CONFLICT DO NOTHING`. Writes an audit `taskEvents` row noting "materialized from recurring template <shortId> on <date>".
    - **Cron** (`/api/cron/materialize-recurring`, Bearer auth, daily at 02:00 UTC in `vercel.json`).
    - **Tests**: 20 new unit tests covering parse + generate across all freq+modifier combos and edge cases (Feb 30, MAX_OCCURRENCES cap, empty BYDAY weekly fallback).
    - **End-to-end smoke**: seeded a template (dueAt 2 days ago, FREQ=DAILY), hit the cron → `{templates:1, created:16, errors:0}`; second run → `{created:0, skipped:16}` (idempotent); each child's dueAt cloned the template's hour. Test row cleaned up.
- [ ] **5.3 "Create custom statuses" in admin.** Manan asked for this. Today admins can only edit label/color of the fixed 13. To allow custom: add a `is_custom` flag on a new `task_statuses` lookup table, migrate the enum away, gate transitions on a config blob. Big — only if Manan still wants it.
- [x] **5.4 Title-case sweep app-wide.** Done on task forms; not done on every admin dialog / login page / settings page. **Resolved:** the core pain point — bold UPPERCASE MONO field labels on the New Task form — was fixed in the earlier WMS-changes batch (`new-task-form.tsx` Field labels now Title Case, sans-serif). The 26 remaining `uppercase tracking-[0.18em]` usages are the small eyebrow labels above H1s ("Admin · Clients") and the status-pill chrome — these are deliberate typographic conventions, not Manan's complaint. Leaving them alone is the right design call until a specific instance is flagged.
- [ ] **5.5 Real intern emails + invites.** Get actual emails from Manan; bulk-update placeholders; send invite emails.
- [ ] **5.6 Login black-screen repro.** Manan reports it on one laptop. Need: which laptop, which browser, console errors, network tab.
- [ ] **5.7 Training video.** Out of Claude's scope — Hetesh.

---

## Open questions for Manan / Hetesh

- For **rate-limiting** (3.3): is 60 writes/min / 600 reads/min/user the right ballpark? Wait for first complaint or set early?
- For **migration journal** (2.3): rebuild or commit to script-only? Either works; just need a decision.
- For **comment edits** (3.2): 15-min window or unlimited (with audit)?
- For **recurrence engine** (5.2): is recurring-task auto-creation actually needed, or is "remind me weekly" enough?
- For **custom statuses** (5.3): still wanted, or did label/colour-editing satisfy the ask?

---

## Quick-reference: hot files

| Concern | File |
|---|---|
| Task detail load | `app/(app)/tasks/[id]/page.tsx` |
| Cache tags | `lib/cache-tags.ts` |
| Auth middleware | `proxy.ts` (or `middleware.ts`) |
| DB client | `lib/db/index.ts` |
| Supabase admin | `lib/supabase/admin.ts` |
| Notification dispatch | `lib/notifications/dispatch.ts` |
| Status transitions | `lib/auth/status-transitions.ts` |
| Schema | `db/schema.ts` |
| Migration applier (idempotent) | `scripts/apply-migration.ts` |

---

## Changelog of this plan

- 2026-05-25 — Created. Phases scoped after a perf investigation of `/tasks/[id]`. (Hetesh + Claude)
- 2026-06-09 — Added 1.6 (perceived-perf loading UI — top progress bar + circular buffer, shipped) and 1.7 (co-locate Vercel function region with the Supabase DB region — the durable network-RTT fix), after a fresh "opening tasks is slow" report confirmed the residual latency is cross-region RTT, not query cost. (Hetesh + Claude)
