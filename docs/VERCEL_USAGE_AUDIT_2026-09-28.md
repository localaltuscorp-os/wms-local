# Altus-OS Vercel invocation and CPU audit

Date: 2026-09-28  
Scope: `Altus-corp/Altus-OS` only  
Mode: read-only audit; no application code or Vercel configuration was changed.

## Executive summary

The repository alone cannot attribute the observed one million function invocations to individual routes. The available Vercel screenshot is team-wide (Altus OS, Altus Contacts, and Altus Tribe), and `vercel usage` returns `Costs not found (404)` for the Hobby team. Any route-volume ranking below is therefore an inference from architecture and call patterns, not measured production traffic.

The 43 configured schedules produce roughly 700-750 scheduled entries per month. They cannot directly explain one million invocations. They can, however, explain disproportionate Fluid Active CPU because several jobs do large serial loops, render PDFs per employee, synchronize Google APIs, export all tables/files, or chain more function invocations.

The strongest invocation finding is the proxy boundary:

- The matcher sends almost every non-static request through `proxy.ts`.
- `/api/mobile/*` then immediately bypasses cookie authentication inside the proxy, but every mobile route independently calls `authenticateMobileRequest()`, which verifies a Firebase bearer token, loads the employee, checks active/candidate status, and enforces registered-device access.
- `/api/cron/*` also bypasses proxy authentication, and every configured cron route independently fails closed on `Authorization: Bearer <CRON_SECRET>`.
- Health, authentication endpoints, and the WhatsApp webhook also enter the proxy before taking a public branch; their actual security or validation is implemented in their route handlers.

Moving these verified independent-auth route families out of the matcher removes one redundant proxy execution per request while preserving their real authentication. The exact production reduction cannot be calculated without route-level Vercel data. It is potentially high if mobile traffic is material; cron-only savings are only about 700-750 invocations per month.

The largest repeat-render finding is 474 `router.refresh()` calls across 265 files. Most are post-mutation consistency refreshes and should not be removed blindly. The highest-risk automatic refresh is `LiveIndicator`: every task-table realtime event can trigger a full Server Component refresh for every mounted client, rate-limited to once per four seconds. High-frequency task activity can therefore multiply server renders across all connected browsers. Other concentrated areas are Tasks (56 occurrences), Admin (49), Goals (41), Operations (29), Project Plan (26), and Training (24).

The most credible CPU outliers are:

1. Full backup: exports all database tables to Google Sheets and all storage files to Google Drive nightly.
2. Module backup: exports 15 modules and deliberately self-invokes when a five-minute function budget is nearly exhausted.
3. DCC calendar sync: scans connected employees and historical DCC data, then makes Google Calendar calls; it runs twice daily in addition to live post-write sync.
4. Per-employee PDF/report crons: attendance statements, salary slips, and goals reports render documents serially inside functions.
5. On-demand Chromium routes: rich HR letters and billing PDF/PNG/email routes launch headless Chromium synchronously.
6. Server-proxied file uploads and work-camera snapshots: files are buffered through Vercel before being uploaded to Supabase Storage.

## Evidence and limitations

Repository evidence used:

- `proxy.ts` matcher, public-path logic, and auth middleware.
- All route handlers under `app/api/mobile`, `app/api/cron`, `app/api/auth`, `app/api/health`, and `app/api/whatsapp`.
- All 43 entries in `vercel.json` and their implementations/helpers.
- An exhaustive source search for `router.refresh()`, `setInterval`, `force-dynamic`, `no-store`, Chromium/Puppeteer/PDF/Excel/image processing, file buffering, and storage uploads.
- Client activity tracker and `/api/logs/ingest` implementation.

Unavailable evidence:

- Per-project and per-route Vercel invocation counts.
- Per-route Fluid CPU duration.
- Production request logs covering a representative billing period.
- The share of team-wide usage attributable specifically to Altus OS.

Before claiming numeric savings, open Vercel Observability for `altus-os` and capture route/function invocations, CPU duration, status codes, and request sources for at least seven representative days.

## A. Critical findings

### A1. The proxy runs for independently authenticated API families

Current matcher (`proxy.ts:361-365`):

```ts
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|xlsx|woff2|woff|ttf|otf|css)$).*)",
  ],
};
```

This matches all pages and API paths except the listed Next/static assets and file extensions. `PUBLIC_API` does not prevent proxy invocation; it only makes an already-running proxy return `NextResponse.next()`.

Current flow for mobile and cron:

```text
request
  -> proxy function starts
  -> isPublic() recognizes /api/mobile or /api/cron
  -> proxy returns NextResponse.next()
  -> API route function starts
  -> route performs its own bearer/secret authentication
  -> database/external APIs
```

Proposed flow:

```text
request
  -> API route function starts
  -> route performs its own bearer/secret authentication
  -> database/external APIs
```

Verified safe-to-exclude families:

| Path | Route-level security | Security conclusion |
|---|---|---|
| `/api/mobile/*` | Every mobile route calls `authenticateMobileRequest()`. It verifies Firebase ID token, employee enrollment/active state, rejects candidate accounts, and enforces device registration. Only device enrollment deliberately skips the device check while retaining bearer authentication. | Safe to bypass cookie proxy. Do not weaken `authenticateMobileRequest()`. |
| `/api/cron/*` | Every configured cron route compares `Authorization` with `Bearer ${CRON_SECRET}` and fails closed when the secret is missing. | Safe to bypass cookie proxy. Add a shared constant-time verifier later for consistency, but not required for matcher exclusion. |
| `/api/health` | Intentionally public; runs liveness checks and returns booleans/latencies without raw database errors. | Safe from an auth perspective, but rate-limit because it performs database work. |
| `/api/whatsapp/webhook` | GET validates Meta verify token; POST checks `x-hub-signature-256` with an HMAC and timing-safe comparison before processing. | Safe to bypass cookie proxy. Keep raw-body signature verification intact. |
| `/api/auth/login` | Validates credentials, account state, and device/session rules itself. | Must remain publicly reachable; safe to bypass proxy. Apply rate limiting. |
| `/api/auth/two-step/*` | Challenge/verification logic is route-owned because the user does not yet have a session. | Safe to bypass proxy. Apply per-handle/IP attempt limits. |
| `/api/auth/session` | Verifies Firebase ID token and employee/device state before minting cookies. | Safe to bypass proxy. |
| `/api/auth/signout` | Resolves/revokes tokens and clears cookies itself. | Safe to bypass proxy. |
| `/api/approve/[token]` | Route comments and code define a public capability URL: GET only peeks; POST atomically consumes an unguessable, expiring, single-use token before executing the handler. | It should bypass session auth, but preserve token entropy, expiry, atomic consumption, and rate limiting. This path is not currently in `PUBLIC_API`, so current behavior should be functionally tested before changing the matcher. |

Do not broadly exclude every `/api/*` route. Cookie-authenticated web APIs such as `/api/logs/ingest` call `requireUser()`, but the proxy also enforces the daily two-step pass and session-cookie self-healing. Bypassing it changes security semantics unless those checks are moved into a shared route guard.

Security-sensitive behavior that occurs before `isPublic()`:

- Android mobile-browser rewriting to `/get-app`.
- Development/local bypass handling.

Excluding public pages such as `/c/*`, `/terms`, `/privacy`, and `/login` from the matcher would also bypass the Android rewrite. That might be desirable for candidate links but is a behavior change, so it needs product/security acceptance and browser tests. Start with independently authenticated API routes, not page paths.

### A2. Realtime task events can fan out full server refreshes

`components/layout/live-indicator.tsx` subscribes each mounted instance to all changes on the `tasks` table. Every event schedules `router.refresh()` after four seconds. The code notes that the component may be mounted twice (header and mobile drawer), using separate channels.

Effect:

```text
one task write
  -> Supabase broadcasts to every connected browser/instance
  -> each active client performs a full RSC refresh
  -> proxy + page/layout server work + database reads
```

The four-second leading-edge limiter prevents unlimited refreshes per client, but it does not prevent fan-out across clients. Replace the global full refresh with scoped row/cache updates or a single application-level subscription. Until route-level metrics are available, this is the highest-priority refresh candidate.

Risk: task counters, dashboards, gates, and lists may become stale if the replacement updates only the visible row. Verification must cover task lists, Kanban, dashboard counts, header badges, manager views, and cross-user updates.

### A3. Nightly backups can dominate CPU despite low schedule count

`/api/cron/backup` calls `runFullBackup()`, which performs:

- every database table -> Google Sheets;
- every Supabase Storage file -> Google Shared Drive.

`/api/cron/module-backup` exports 15 modules incrementally. It has `maxDuration = 300` and calls its own URL when unfinished. A single scheduled entry can therefore produce multiple long-running function invocations. It is the clearest reason why “cron count” and “cron cost” must be treated separately.

Do not delete either backup without confirming recovery requirements. First establish whether they duplicate each other, Supabase backups/PITR, and HR-record Drive sync. Prefer changed-object manifests, incremental database exports, and a non-request worker for large copies.

### A4. Large synchronous document pipelines consume Fluid CPU

Headless Chromium is launched synchronously for rich HR letter PDFs and billing document PDF/PNG/email rendering. PDFKit/pdf-lib routes build and merge full documents in memory. Monthly crons render a separate PDF for each employee. These operations are relatively rare but CPU-heavy.

Generated immutable outputs should be stored in Supabase Storage and reused by a content/version hash. Do not cache documents only by URL if permissions or underlying data can change.

### A5. The app has 474 explicit full refresh calls

The exhaustive search found 474 calls in 265 files. Most follow a successful mutation and are correctness mechanisms, not accidental polling. Removing them wholesale would cause stale lists, totals, approval state, permissions, and gate state.

The concentrated domains are:

| Domain | Occurrences |
|---|---:|
| Tasks | 56 |
| Admin | 49 |
| Goals | 41 |
| Operations | 29 |
| Project Plan | 26 |
| Training | 24 |
| Attendance | 22 |
| HR | 16 |
| Profile | 15 |
| Salary | 15 |
| Appraisal | 14 |
| Billing | 14 |
| Accounts | 13 |
| PMS | 12 |
| Ambassadors | 11 |

The number is a refactoring backlog, not proof of one million requests. User-triggered refreshes cost only when users perform the corresponding action. Automatic/realtime/focus-triggered refreshes deserve priority.

## B. High-impact changes

### B1. Exclude verified API families from the proxy matcher

Recommended exact first-phase matcher (proposal only):

```ts
export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/mobile(?:/|$)|api/cron(?:/|$)|api/health(?:/|$)|api/whatsapp/webhook(?:/|$)|api/auth/login(?:/|$)|api/auth/two-step(?:/|$)|api/auth/session(?:/|$)|api/auth/signout(?:/|$)|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|xlsx|woff2|woff|ttf|otf|css)$).*)",
  ],
};
```

Treat `/api/approve/*` as a separate change after an end-to-end test because the route says it is public but it is not in the current proxy public list.

Verification:

1. Unit-test matcher inclusion/exclusion.
2. Verify mobile valid/invalid/missing bearer tokens and approved/revoked/unidentified devices.
3. Verify cron valid/invalid/missing secrets.
4. Replay Meta webhook verification and signed POST fixtures.
5. Verify login, two-step, session mint, logout, stale-cookie recovery, and Android behavior.
6. Compare Vercel proxy and API invocation counts for seven days before/after.

### B2. Replace global task-table refresh fan-out

Use one Supabase channel per browser application, scope subscriptions where possible, and apply task deltas to client state/query caches. If a full reconciliation remains necessary, refresh only the affected route and coalesce for a longer window when the tab is hidden.

Verification: two users editing the same task; Kanban moves; dashboard totals; task detail comments/checklists; manager queues; inactive/background tabs.

### B3. Split and deduplicate backup workloads

- Compare full backup, module backup, HR records Drive backup, and Supabase native recovery coverage.
- Stop copying unchanged storage objects; persist source version/hash and destination ID.
- Avoid rewriting every database table to Sheets nightly if an incremental/audit export meets the requirement.
- Prevent module-backup self-chain storms with an explicit queue/run ledger and a hard per-night invocation cap.
- Consider weekly full plus daily incremental only if recovery objectives permit it.

Verification: restore drill, missing/deleted file behavior, interrupted run resume, Drive-token expiry, duplicate detection, and measured CPU/run duration.

### B4. Cache generated documents by immutable version

For rich letters, issued forms, salary slips, invoices, and reports:

- Compute a version from document ID + updated timestamp/template version.
- Reuse a stored PDF/PNG when the version matches.
- Render once, store in Supabase Storage, return a signed URL or stream the stored object.
- Keep permission checks before issuing signed URLs.

Do not cache editable previews as final documents. Ensure regeneration on source/template/signature changes.

### B5. Move large uploads directly to storage

The native mobile API already has `/api/mobile/storage/sign`. Several web Server Actions and API routes still call `file.arrayBuffer()` and upload the entire buffer from Vercel to Supabase. Extend the signed-upload design to training media, task attachments, candidate/onboarding files, documents, work-camera images, and other large uploads.

Vercel should authenticate/authorize and issue a constrained path/content-type/size token; the browser then uploads directly. Verify ownership, path traversal prevention, MIME/size constraints, cleanup of abandoned uploads, and post-upload database finalization.

## C. Medium-impact changes

### C1. Replace post-mutation refreshes in dense workspaces

Highest-density files:

| File | Calls | Observed pattern | Recommended direction |
|---|---:|---|---|
| `components/tasks/kanban-board.tsx` | 13 | Writes optimistically, then schedules full reconciliation; stale/error paths also refresh. | Keep stale/error fallback; replace normal reconciliation with returned row/version and targeted counters. |
| `components/project-plan/plan-board.tsx` | 12 | Many tree/board mutations settle through full refresh. | Return changed nodes/ancestors and update normalized client state; retain refresh after bulk/import operations initially. |
| `components/projects/projects-workspace.tsx` | 10 | Project create/edit/status/member operations refresh the workspace. | Update the affected project/card locally; use targeted query invalidation for aggregate panels. |
| `components/weekly-goals/weekly-goals-board.tsx` | 7 | Goal edits/reviews/carry operations refresh server truth. | Local update for single-goal writes; retain refresh for week-wide carry/import. |
| `components/events/masters/masters-workbench.tsx` | 7 | Master CRUD refreshes full workbench. | Update the affected master/batch in local state. |
| `components/operations/recruitment-jd/recruitment-jd-workbench.tsx` | 7 | JD workflow mutations and fallback branches refresh. | Use returned JD state; keep refresh on cross-workflow transitions until all dependent panes are mapped. |
| `components/salary/salary-breakup-table.tsx` | 6 | Multiple salary edits recalculate server-derived figures. | Return recalculated row/totals; retain refresh for bulk/sync paths because financial stale state is high risk. |
| `components/index-hub/index-hub-board.tsx` | 6 | Hub item changes refresh broad server data. | Patch item plus affected counters; targeted tag invalidation. |
| `components/billing/document-form.tsx` | 2 | One refresh occurs whenever the window regains focus. | Highest-priority removal/replacement: refresh only after returning from a known external workflow, or compare document version first. |
| `components/goals/board/goal-table-view.tsx` | 1 delayed | A 700 ms timer performs full refresh after changes. | Replace with debounced targeted cache update; retain version-conflict fallback. |

Refresh categories and safe handling:

- Single-row CRUD: usually replaceable with action-returned row and optimistic/local state.
- Bulk import, cascade, carry-forward, payroll generation: retain initially; many rows/totals change.
- Permission, identity, session, temporary access, device registration: retain or use full reload; security context spans layouts.
- Error-boundary retry: retain; its purpose is to rerun server rendering.
- Stale/version-conflict branch: retain as correctness fallback.
- Realtime task update: replace because it is automatic and fan-outs.
- Focus-triggered billing refresh: replace because focus events can happen without data changes.

### C2. Reduce client logging write amplification

The activity tracker records:

- `PAGE_VISIT` on first mount and every pathname change;
- `MODULE_VISIT` on first mount and when the classified module changes;
- types for `VIEW_RECORD`, `SEARCH`, and `FILTER_APPLIED` exist, but no production call sites were found beyond the global hook.

Behavior:

- IndexedDB buffer.
- Flush threshold: 20 events.
- Timer: every 30 seconds, but it sends nothing when the buffer is empty.
- Page hide/visibility hidden also flushes, often producing underfilled batches.
- Server limit: 200 events.
- Each accepted batch performs session resolution, `ensureDailySession`, one batch insert, and one session roll-up update.
- Retries are exponential up to five minutes; unique `client_event_id` prevents duplicate rows.

There is no explicit duplicate navigation hook. However, first mount in each separate app/admin layout creates a new page/module event, and crossing layout trees can record another first visit. The `estimatedMs` for the previous page is attached to the new pathname, which is an analytics correctness issue rather than an invocation issue.

Estimated volume formula:

```text
normal batches ~= ceil((page events + module-transition events) / 20)
                 + underfilled page-hide flushes
                 + retries after failures
```

This endpoint is unlikely to generate one request every 30 seconds because empty flushes return before `fetch`. It can still be material for many short sessions/tabs because visibility changes flush tiny batches. Increase the threshold only after checking data-loss tolerance; a better first change is a minimum batch size on visibility hide unless the user is signing out, plus sampling/removing low-value page events if the audit product does not need every navigation.

Do not exclude `/api/logs/ingest` from the proxy until daily two-step/device security semantics are preserved in a shared guard.

### C3. Consolidate compatible notification schedules

Several reminder/report jobs share roster reads and email/notification dispatch. A single authenticated daily dispatcher could run due job definitions and reduce cold starts. Expected invocation reduction is low because the current total is below 1,000/month; the primary benefit is shared queries and operational clarity.

Do not combine long PDF or Google synchronization jobs into one function, because one failure/timeout would affect unrelated work.

## D. Low-impact changes

- Cron entry consolidation by itself: saves hundreds, not hundreds of thousands, of invocations monthly.
- Image transformation tuning: current screenshot shows 47/5,000.
- Deployment storage: 143.26 MB/10 GB in the screenshot.
- Fast data transfer and origin transfer: well below allowances.
- Static template downloads: useful to cache, but unlikely to explain high CPU.
- Removing second-by-second UI timers: the identified elapsed-time and localStorage heartbeat timers are client-only and do not call the server.

## E. Cron assessment: all 43 schedules

Cost labels are relative: Low = bounded DB work/no external fan-out; Medium = roster loops or external calls; High = file generation, whole-dataset scans/copies, or possible chained invocations. “Critical” describes business impact inferred from behavior and should be confirmed by the owner.

| # | Endpoint / schedule (UTC) | Actual work | Cost / external effects | Criticality | Classification and rationale |
|---:|---|---|---|---|---|
| 1 | `/api/cron/digest` `30 4 * * *` | Loads pending items and active employees; creates in-app notifications; sends digest by email, Slack, and WhatsApp according to preferences. | Medium; DB + multi-channel calls per recipient. | High | **KEEP / REVIEW**. Batch/parallelize with provider limits; consolidate roster/prefs reads with other morning notifications only if isolation remains. |
| 2 | `/api/cron/materialize-recurring` `0 2 * * *` | Scans active recurrence templates, loads children per template, creates missed/current/one future task occurrence, writes events; idempotent. | Medium DB; N+1 child queries by template. | High | **KEEP / MOVE TO DATABASE/SUPABASE (candidate)**. Optimize set-based queries first; DB scheduling fits but recurrence/application logic is nontrivial. |
| 3 | `/api/cron/task-auto-archive` `40 2 * * *` | Finds approved tasks older than a prefilter, computes working-day eligibility, bulk archives, inserts events. Feature flag. | Low-medium DB, bounded by candidates. | Medium | **MOVE TO DATABASE/SUPABASE (candidate)** or keep. Pure DB business rule, idempotent; preserve exact working-day semantics and audit actor. |
| 4 | `/api/cron/retry-dispatch` `30 4 * * *` | Picks up to 50 failed notification channel deliveries and retries email/Slack/WhatsApp/web-push with cached context. | Medium external I/O. | High | **KEEP / REVIEW**. Better queue/event-driven worker; daily frequency may delay notifications. Not a deletion candidate. |
| 5 | `/api/cron/backup` `30 20 * * *` | Exports all DB tables to Google Sheets and all storage files to Shared Drive. | **High** CPU/I/O/API; whole-system copy. | Critical | **REVIEW / REDUCE FREQUENCY** after restore/RPO review. Incrementalize; determine overlap with module and native Supabase backups. |
| 6 | `/api/cron/incentive-digest` `0 5 1 * *` | Loads monthly summaries and active roster; emails employees with incentive data. | Medium monthly email fan-out. | Medium-high | **KEEP**. Already monthly and skips empty recipients. |
| 7 | `/api/cron/incentive-weekly-report` `30 5 * * 0` | Loads weekly report + roster, claims idempotency delivery rows, emails each eligible employee. | Medium weekly fan-out. | Medium-high | **KEEP**. Delivery claim prevents duplicates; optimize only with evidence. |
| 8 | `/api/cron/dcc-daily-report` `30 16 * * *` | Loads DCC and SP1 inputs, plans recipient emails, sends serially with gaps. | Medium-high DB + serial email. | High | **KEEP / REVIEW**. Consider shared daily-report dataset and provider batch strategy; preserve throttling. |
| 9 | `/api/cron/compliance-reminders?job=daily` `31 16 * * *` | Loads due WCC/MCC compliance and team structure; plans and sends daily reminders. | Medium DB + email. | High | **CONSOLIDATE** with founder mode in a due-job dispatcher only for cold-start/query sharing; same implementation already. |
| 10 | `/api/cron/compliance-reminders?job=founder` `32 16 * * 3,6` | Builds founder overview for relevant date windows and emails it. | Low-medium twice weekly. | High | **KEEP / CONSOLIDATE** with #9 dispatcher. Separate cadence is business-driven. |
| 11 | `/api/cron/calendar-sync` `20 3 * * *` | Selects up to 40 tasks needing Google Calendar reconciliation and processes each. | Medium-high external Google calls. | High | **KEEP / EVENT-DRIVEN candidate**. Retain reconciliation sweep as repair path even if live sync improves. |
| 12 | `/api/cron/ambassador-reminders` `0 4 * * *` | Queries due/stalled ambassador referrals/activities and inserts in-app notifications, updating reminder timestamps. | Low-medium DB. | Medium | **MOVE TO DATABASE/SUPABASE (candidate)**. Pure DB notification generation; preserve dedupe timestamps. |
| 13 | `/api/cron/relay` `0 3 * * *` | Runs every registered event consumer, then drains up to 100 commands; kill switch accumulates events safely. | Medium; DB plus command dispatch. | High | **KEEP / EVENT-DRIVEN candidate**. Daily cadence may create backlog; queue worker is preferable, with cron as recovery. |
| 14 | `/api/cron/goals-carry-forward` `45 18 * * *` | Carries forward unreviewed goals when feature flag enabled. | Low-medium DB. | High | **KEEP / MOVE TO DATABASE candidate**. Daily idempotent repair is reasonable; measure scanned rows. |
| 15 | `/api/cron/goals-weekly-carry` `0 4 * * 1` | Carries unfinished weekly goals from prior week to current week; feature flag. | Low-medium weekly DB. | High | **KEEP**. Weekly schedule matches domain event. |
| 16 | `/api/cron/weekly-goals?job=monday` `30 4 * * 1` | Loads roster/week goals, sends assignment reminders and inserts notifications. | Medium weekly fan-out. | High | **KEEP / CONSOLIDATE** with weekly-goal dispatcher; do not remove. |
| 17 | `/api/cron/weekly-goals?job=fill` `30 12 * * 6` | Reminds employees to fill goals; skips those without applicable goals. | Medium weekly fan-out. | High | **KEEP / CONSOLIDATE** implementation, not cadence. |
| 18 | `/api/cron/weekly-goals?job=incomplete` `15 4 * * 0` | Notifies employees with incomplete weekly goal marking. | Medium weekly fan-out. | Medium-high | **REVIEW** alongside #19. Sunday and Monday may be intentional escalation/retry, but code runs the same job. Confirm product intent and dedupe behavior. |
| 19 | `/api/cron/weekly-goals?job=incomplete` `15 4 * * 1` | Same handler/job as #18 one day later. | Medium weekly fan-out. | Medium-high | **CONSOLIDATE / POSSIBLY REMOVE one schedule** only if notification rows/provider sends are not intentionally repeated. Verify idempotency and desired escalation first. |
| 20 | `/api/cron/pms-quarterly` `0 5 10 1,4,7,10 *` | Scores active roster and sends quarterly reports via email and WhatsApp. | Medium-high quarterly external fan-out. | High | **KEEP**. Already low frequency; optimize scoring query/dispatch only if measured. |
| 21 | `/api/cron/attendance-confirm-reminder` `0 4 * * 1` | Builds eligible roster, issues approval tokens, sends email and WhatsApp confirmation requests. | Medium weekly external fan-out. | High | **KEEP**. Tokens and reminders are business workflow/security-sensitive. |
| 22 | `/api/cron/goals?job=commit-reminder` `0 12 * * 6` | If gate enabled, inserts commit reminders for active employees. | Low DB. | Medium-high | **MOVE TO DATABASE/SUPABASE (candidate)** or consolidate with goal dispatcher. |
| 23 | `/api/cron/goals?job=approve-reminder` `30 3 * * 1` | If gate enabled, inserts approval reminders for managers. | Low DB. | Medium-high | **MOVE TO DATABASE/SUPABASE (candidate)** or consolidate with goal dispatcher. |
| 24 | `/api/cron/attendance-autoout` `29 18 * * *` | Finds missing logouts, creates automatic punch-out/half-day state, and inserts audit records; feature flag. | Medium DB. | Critical payroll/attendance | **KEEP**. Could move to DB only with transaction/audit parity. Do not reduce frequency blindly. |
| 25 | `/api/cron/attendance-weekly` `0 12 * * 0` | For each salary profile builds a weekly report, emails employee, and sends roster report. | Medium-high DB + email per employee. | High | **KEEP / REVIEW**. Cache shared date/roster data; parallelize conservatively. |
| 26 | `/api/cron/attendance-weekly-rollup` `30 3 * * 0` | Builds team rollup and emails managers/founder. | Medium DB + emails. | High | **CONSOLIDATE** data loading with #25 if semantics/timezones allow; keep separate delivery failure boundaries if needed. |
| 27 | `/api/cron/attendance-monthly?job=statement` `0 4 1 * *` | If enabled, computes each employee’s month report, renders PDF, emails statement. | **High** CPU + DB + email per employee. | High | **KEEP / REVIEW**. Cache/store immutable PDFs, queue per employee, avoid one long serial invocation. |
| 28 | `/api/cron/attendance-monthly?job=freeze` `0 4 2 * *` | If enabled, freezes the prior attendance month. | Low-medium DB, critical mutation. | Critical | **KEEP**. Separate day from statements is sensible; move to DB only with audit/rollback plan. |
| 29 | `/api/cron/monthly-slips` `0 5 12 * *` | Loads each salary profile/data, renders salary-slip PDF, emails it. | **High** CPU + email per employee. | Critical payroll | **KEEP / REVIEW**. Store versioned slip once; use queued/batched delivery and resumable ledger. |
| 30 | `/api/cron/goals-spillover` `0 3 1 * *` | If enabled, scans active employees/month goals, checks duplicates per goal, clones eligible goals forward. | Medium-high DB; nested queries. | High | **KEEP / OPTIMIZE**. Set-based duplicate checks/clone transaction; DB scheduling candidate after parity tests. |
| 31 | `/api/cron/goals-sunday-report` `30 3 * * 0` | Per manager builds rollup, renders PDF, emails it, optionally uploads/sends via WhatsApp. | **High** CPU + external calls per manager. | High | **KEEP / REVIEW**. Persist report artifact, queue per manager, reuse PDF across channels. |
| 32 | `/api/cron/hr-confirmations` `0 4 * * *` | If enabled, finds due probation/confirmation employees, atomically claims reminders, inserts admin notifications. | Low-medium DB. | High HR | **MOVE TO DATABASE/SUPABASE (candidate)**; current claim logic must remain atomic. |
| 33 | `/api/cron/time-autoclose` `0 19 * * *` | If enabled, closes stale task time sessions using configured idle cap. | Low-medium DB. | High timekeeping | **KEEP / MOVE TO DATABASE candidate**. Daily cadence is reasonable. |
| 34 | `/api/cron/work-session-cleanup` `45 20 * * *` | Pages stale work-session snapshots, removes Supabase Storage blobs, then deletes DB rows. | Medium storage + DB; bounded pages. | Medium privacy/storage | **KEEP / REDUCE FREQUENCY candidate** based on retention SLA and daily volume. Deletion ordering is important. |
| 35 | `/api/cron/meet-reconcile` `0 21 * * *` | Loads recent Meet-linked work sessions, calls Google Meet participant sessions, updates attendance/session records. | Medium-high external calls. | High | **KEEP / REVIEW**. Event-driven completion may help, but retain repair sweep. |
| 36 | `/api/cron/ecos-publish` `15 4 * * *` | Publishes up to 25 due broadcasts. | Low-medium DB/notification effects. | High communications | **KEEP**. Bounded and event-time dependent. Increase frequency only if delayed publishing matters. |
| 37 | `/api/cron/ecos-reminders` `45 4 * * *` | Finds active broadcasts and pending recipients, sends notifications/FCM, escalates, updates reminder state. | Medium external fan-out. | High | **KEEP / REVIEW**. Batch recipient queries and provider calls; event-driven due queue candidate. |
| 38 | `/api/cron/retention-anonymise` `0 21 * * 0` | If retention policy enables purge, anonymizes due former employees transactionally and logs settings events. | Medium DB, sensitive/destructive. | Critical compliance | **KEEP**. Weekly low frequency; do not move/remove without legal and restore tests. |
| 39 | `/api/cron/dcc-calendar-sync` `35 18 * * *` | Reconciles DCC masters and synchronizes connected employees/days with Google Calendar, with retries and a 240s budget. | **High** DB + Google calls. | High | **REVIEW / REDUCE FREQUENCY**. Live post-write sync already exists; this can be a repair sweep. Determine why twice daily is needed. |
| 40 | `/api/cron/dcc-calendar-sync` `30 6 * * *` | Exact same handler as #39, second daily repair run. | **High** DB + Google calls. | High | **POSSIBLY REMOVE one schedule** after measuring failures repaired by each run. Keep one daily repair unless business requires both. |
| 41 | `/api/cron/hr-records-drive` `30 21 * * *` | Checks schedule settings/due date; resumably exports employee HR records/storage to Google Drive under a lock and budget. Usually no-ops unless due/partial. | Low on no-op days; high when due. | Critical backup | **KEEP / REVIEW**. Entry is daily but configured interval controls real work. Check overlap with full/module backups. |
| 42 | `/api/cron/ce-reference-reminders` `0 4 * * 1` | Finds references needing weekly reminder, inserts notification, stamps `lastRemindedOn`; skips unlinked collectors. | Low DB. | Medium-high | **MOVE TO DATABASE/SUPABASE candidate** or keep; already weekly and inexpensive. |
| 43 | `/api/cron/module-backup` `35 21 * * *` | If enabled/connected, resumes unfinished exports then incrementally exports 15 modules to Drive; self-invokes near timeout. | **Very high** when active; multiple 5-minute invocations possible. | Critical backup | **REVIEW / REDUCE FREQUENCY / redesign worker**. Add hard chain cap, changed-data detection, and compare coverage with #5/#41. |

Cron conclusions:

- Keep business schedules unless measurements and owners show redundancy.
- First CPU reviews: #43 module backup, #5 full backup, #39/#40 DCC sync, #27 monthly statements, #29 monthly slips, #31 goals PDF report.
- First duplication reviews: two DCC sync schedules and two identical weekly-goals incomplete schedules.
- Best database-scheduler candidates are pure DB sweeps/reminder inserts, not Google/PDF/email jobs.

## F. Proxy assessment

### Requests currently passing through proxy

Everything except:

- `/_next/static/*`
- `/_next/image/*`
- `/favicon.ico`
- paths ending in `svg`, `png`, `jpg`, `jpeg`, `gif`, `webp`, `ico`, `xlsx`, `woff2`, `woff`, `ttf`, `otf`, or `css`

This includes all HTML/RSC requests, Server Action requests, all API routes, cron routes, mobile routes, webhooks, health checks, login/session routes, token routes, and file types not explicitly excluded (for example PDF, CSV, ZIP, JS, JSON, MP4).

### Proposed first phase

Exclude only the independently authenticated/validated API families shown in B1. Do not exclude generic cookie-authenticated APIs or application pages yet.

### Invocation impact

| Exclusion | Function invocation reduction | CPU reduction | Risk |
|---|---|---|---|
| `/api/mobile/*` | Potentially high; exactly one proxy execution removed per mobile request | Medium | Low if the mobile auth invariant test passes |
| `/api/cron/*` | Numerically low (~700-750/month) | Low | Low |
| auth endpoints | Traffic-dependent, likely low-medium | Low | Medium because login/session behavior is sensitive |
| webhook | Traffic-dependent | Low | Low if signature tests pass |
| health | Depends on monitoring frequency | Low-medium because health performs DB probes | Low with rate limiting |

## G. `router.refresh()` assessment

### Exhaustive inventory method

The source contains 474 explicit calls in 265 files. Reproduce the exact line inventory with:

```powershell
rg -n "router\.refresh\(\)" app components lib --glob "*.ts" --glob "*.tsx"
```

All occurrences were grouped by trigger semantics:

1. Automatic/realtime/focus refreshes: review first.
2. High-frequency inline/board mutations: replace successful-path refresh with returned data; keep stale/error fallback.
3. Ordinary form/CRUD completion: medium priority.
4. Bulk/cascade/payroll/import workflows: retain until dependencies are mapped.
5. Security/session/access changes and error retries: retain/full reload.

### Highest-impact automatic calls

| File/line | Trigger | What happens | Assessment |
|---|---|---|---|
| `components/layout/live-indicator.tsx:50` | Any `tasks` table realtime event, per mounted subscriber, max once/4s | Full current route/layout RSC rerender and DB work | Highest priority. Replace with scoped deltas/cache invalidation; fan-out risk. |
| `components/billing/document-form.tsx:129` | Browser window focus | Full document page refresh even if no data changed | Replace with explicit “returned from external flow” flag/version check. |
| `components/goals/board/goal-table-view.tsx:2304` | Debounced 700ms reconciliation | Full route refresh after table changes | Return updated goal and affected rollups; keep conflict fallback. |
| `components/dashboard/widget-boundary.tsx:89` | User retries failed widget | Reruns server render | Necessary; keep. |
| `components/ui/section-error-boundary.tsx:100` | User retries failed section | Reruns server render | Necessary; keep. |

### High-density mutation calls

Tasks/Kanban already contains `scheduleReconcile()` and comments explaining stale-response protection. Preserve refresh on `res.error === "stale"`; normal success paths should consume returned authoritative rows and update the board locally. Project Plan has similar cross-node dependencies, so implement a normalized state update before removing refresh. Salary/attendance refreshes carry financial correctness risk and should come after lower-risk task/board work.

### What could break

- Server-derived permissions/gates may remain stale.
- Aggregate counts can diverge from rows.
- Cross-user changes may not appear.
- Reordered/cascade tree state can become inconsistent.
- Financial/attendance calculations can show stale results.
- Server Action cache invalidation does not automatically update a client-owned copy.

Every replacement needs an end-to-end test comparing mutated row, list, counters, dependent panels, second browser, and reload truth.

## H. Highest-invocation route shortlist

This is inference only.

| Suspect | Why it may be high volume | Confidence |
|---|---|---|
| Proxy function | Runs for nearly every page/API request and may add a function execution before independently authenticated APIs. | High architectural confidence; volume unknown |
| `/api/mobile/*` | Large API surface used by a native app; every request currently crosses proxy plus route and every auth call also reads employee/device state. | High architectural confidence; production share unknown |
| RSC page requests caused by `router.refresh()` | 474 explicit calls; realtime task change can fan out to every connected client. | High |
| Server Actions | Hundreds of mutations can trigger an action invocation plus subsequent RSC refresh. | High architecture, unknown traffic |
| `/api/logs/ingest` | Every navigation/module event is buffered; short/hidden sessions can create underfilled batches. | Medium; batching limits volume |
| `/api/health` | Public and performs DB health work; monitoring/bots can hit repeatedly. | Medium |
| Auth/session endpoints | Login can involve credential validation, token exchange/minting, employee/device checks, and activity session writes. | Medium; normally user-session bounded |
| Public `/c/*` and token URLs | Dynamic, database-backed capability pages may be crawled or brute-forced. | Medium |
| WhatsApp webhook | External inbound traffic/retries; signature validated. | Medium-low unless webhook volume is high |
| Work-camera snapshot actions | Periodic per active work session; each image crosses Vercel and Supabase. | Medium CPU/bandwidth |

## I. Expensive CPU/file-operation audit

| Route/area | Operation | Synchronous function work | Cache/reuse/direct-upload recommendation |
|---|---|---|---|
| `app/api/hr/letters/{pdf,email-pdf,send-letter-email,issue-rich}` + `lib/hr/letters/render-rich.ts` | Chromium rich-letter render; PDFKit structured render; email/upload | Yes | Store issued/versioned PDF; reuse for email/download. Preview remains uncached. |
| `app/(app)/billing/documents/[id]/{pdf,png,email}` + `lib/billing/invoice-sheet-render.ts` | Chromium page render, screenshot/PDF, local asset reads | Yes | Cache by document updated/version + output format; reuse same artifact for email. |
| HR policies/docket/forms/resume routes | PDFKit/pdf-lib rendering, download and merge of many source PDFs | Yes, memory-heavy | Persist completed docket/form versions; cap source count/bytes; stream where supported. |
| Attendance monthly statement cron | Report query + PDF per employee + email | Yes, serial loop | Queue per employee; store immutable monthly statement and resend same artifact. |
| Monthly salary slips cron | Salary query + PDFKit per employee + email | Yes, serial loop | Store by employee/month/payroll version; resumable delivery ledger. |
| Goals Sunday report cron | Rollup + PDF per manager + email + WhatsApp upload | Yes | Generate once per manager/week, store once, reuse for both channels. |
| Excel/template/export routes | ExcelJS/XLSX workbook generation | Yes | Static templates: CDN/cache long. Dynamic exports: short private caching or stored snapshot only when data version is explicit. |
| Full/module/HR Drive backups | Whole datasets/files and Google API uploads | Yes, long-running | Incremental manifests, worker/queue, dedupe overlapping backup products. |
| Training/profile/candidate/task/document uploads | Buffers entire file in Vercel then uploads to Supabase | Yes | Signed direct upload after authorization; finalize metadata separately. |
| Work-camera uploads | Periodic image capture sent through Server Action | Yes | Signed direct upload with strict session/path/size constraints. |
| AI transcription | Base64/form-data audio handling and external processing | Yes | Direct temporary storage upload, async job, idempotent result. |

Playwright is a development/test dependency and no production route launches it. Client-side XLSX parsing does not consume Vercel CPU, though it affects browser performance.

## J. Caching opportunities

| Candidate | Current behavior | Suggested cache | Staleness/business risk |
|---|---|---|---|
| Terms/privacy content | Fully static content marked force-dynamic because root layout reads session cookies | Move to a public/static layout or static route; long immutable cache until content version changes | Low, but moving layouts can affect branding/navigation and Android rewrite behavior |
| Built-in template workbooks | Generated/read through dynamic routes and often `no-store` | Public immutable asset or cached generated buffer for 1 day/versioned URL | Low for fixed templates; live dropdown/master-data templates must invalidate on master changes |
| Reference/master data (subjects, products, statuses, shifts, project options) | Some already use `unstable_cache`; many pages remain dynamic | Extend tag-based caches, 30s-5m depending on domain | Moderate: admin edits must call matching tag invalidation |
| Dashboard aggregates | Some task queries have 30-60s tag caches; realtime refresh still rerenders | 30-60s tagged cache plus explicit invalidation | Moderate; operational counters may be briefly stale |
| Health response | Dynamic DB probe on every public hit | CDN cache only if split into cheap liveness and protected deep readiness; 10-30s | Monitoring may miss a very short outage; keep uncached protected deep check |
| Generated immutable PDFs | Re-render on request/cron | Store by source version indefinitely | Low when version key includes all source/template/signature changes |
| Avatar redirect/signed URLs | Route signs/redirects dynamically | Short private/browser cache bounded by signed URL TTL | Permission/revocation risk; never public-cache private content |
| Static export templates | `no-store` download helper | Versioned asset with 1 day/year cache | Low if not populated with live/private data |

`force-dynamic` is legitimate for authenticated pages that read cookies and live database state. Removing the declaration alone often does not make them static; authentication/layout dependencies must be separated first.

## K. Public endpoints and bot exposure

| Surface | Risk | Recommendation |
|---|---|---|
| `/api/health` | Public DB-backed endpoint can be polled or attacked cheaply by bots but expensively for the app | Vercel Firewall rate limit; split cheap liveness from protected readiness; early method rejection |
| `/api/auth/login`, two-step resend/verify | Credential stuffing, code guessing, email/SMS abuse | Per-IP + per-account/handle rate limits, exponential lockout, generic errors; ensure legitimate office NAT users are not blocked globally |
| `/c/*` candidate links | Crawlers and token guessing cause DB reads; content may be sensitive | `robots.txt`/`X-Robots-Tag: noindex, nofollow`, rate limit failed tokens, preserve sufficient token entropy and expiry |
| `/api/approve/[token]` | Capability token could be brute-forced/replayed | No indexing, per-IP failed-token limit, atomic single use (already present), short expiry, never log raw token |
| WhatsApp webhook | Forged/replayed requests and Meta retries | HMAC verification is present; add timestamp/replay controls if Meta supports them, idempotency on message ID, rate limit only invalid signatures carefully |
| Public legal/login pages | Generic bot traffic causes dynamic server renders | Static/public layout where possible, CDN cache legal content, firewall obvious abuse |
| Export/PDF/token download routes | Expensive authenticated requests can be repeatedly triggered by valid users or leaked links | Authorization, per-user concurrency limit, artifact reuse, idempotency; avoid simplistic low rate limits that break legitimate bulk HR/payroll work |

Recommended `robots.txt` exclusions include `/c/`, `/candidate/`, `/api/`, `/agreements/sign/`, and other token/capability surfaces. Robots directives do not provide security; they only reduce cooperative crawler traffic.

## L. Expected impact matrix

| Change | Invocation reduction | CPU reduction | Implementation risk |
|---|---|---|---|
| Exclude `/api/mobile/*` from proxy after invariant tests | High if mobile traffic is material | Medium | Low-medium |
| Exclude cron/webhook/health/auth verified paths | Low-medium, traffic-dependent | Low | Low-medium |
| Replace task realtime full refresh fan-out | High under active concurrent use | High | Medium-high |
| Replace normal-success refreshes in Tasks/Project Plan | Medium-high | Medium-high | Medium |
| Remove focus-triggered billing refresh | Low-medium | Low-medium | Low |
| Incrementalize/dedupe backups and cap module self-chain | Low invocation count; possibly medium due to chain | **High** | High due to restore requirements |
| Cache/store Chromium/PDF artifacts | Low-medium | **High** | Medium |
| Queue per-recipient monthly/report generation | Similar total jobs unless offloaded; lower timeout/retry amplification | High | Medium-high |
| Direct-to-Supabase uploads | Medium for server-action processing; request count may stay similar for signing/finalization | Medium-high CPU/bandwidth | Medium |
| Tune activity-log page-hide batches/sampling | Low-medium | Low-medium | Low-medium; audit completeness |
| Consolidate reminder crons | Low | Low-medium | Medium |
| Cache static legal/templates/reference data | Low-medium | Low-medium | Low |
| Firewall/rate-limit public bot surfaces | Potentially high if bot traffic exists; otherwise low | Same | Medium |

## M. Safe implementation order

1. Capture Altus-OS-only Vercel baselines: route invocation count, proxy count, CPU duration, status/error rate, and top paths.
2. Add auth-invariant tests, then narrow the proxy matcher for mobile and cron first.
3. Measure for seven comparable days; only then extend exclusions to health/webhook/auth endpoints.
4. Replace `LiveIndicator` global full refresh with scoped realtime state and one subscription per browser.
5. Refactor normal-success refreshes in Tasks, then Project Plan/Projects; retain conflict/error/bulk refresh fallbacks.
6. Fix billing focus refresh and other automatic refreshes.
7. Measure `/api/logs/ingest` batch-size distribution; tune page-hide flush/sampling only if material.
8. Add artifact caching for Chromium/PDF generation and resumable per-recipient delivery.
9. Extend signed direct uploads to high-volume/large-file web flows.
10. Perform a restore-objective review, then incrementalize full/module/HR backups and cap chained runs.
11. Review duplicate DCC and incomplete-goals schedules with business owners and logs.
12. Move proven pure-DB sweeps to Supabase/database scheduling where operational ownership is acceptable.
13. Add caching and rate limiting with explicit invalidation and legitimate-traffic tests.

## Verification dashboard for every change

Track before/after by Altus-OS project and route:

- function invocations;
- proxy/middleware invocations;
- Fluid Active CPU and duration percentiles;
- error/timeout/retry rates;
- database queries/connections and slow queries;
- Google/email/WhatsApp provider calls and failures;
- average activity-log batch size;
- backup completion/restore success;
- generated-document cache hit rate;
- stale-data and authorization regression tests.

Do not compare a workday after deployment with a weekend baseline, and do not use the team-wide overview to attribute savings to Altus OS.
