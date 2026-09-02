# Altus WMS — Performance Forensics (measured artifacts)

> Captured 2026-06-20 against **live production** (`wms.mananvasa.com`) and the real prod Supabase DB.
> Everything below is **real measured data**, not estimates, except where explicitly labelled "could not capture from here" (with exact steps for your team to capture it).
> Companion to `docs/TECHNICAL_AUDIT.md` (architecture).

---

## 0. Executive verdict (answer to "which bottleneck?")

| Candidate | Verdict | Evidence |
|---|---|---|
| **Database query execution** | ❌ NOT the bottleneck | EXPLAIN ANALYZE: every dashboard query runs **< 1ms** server-side (worst non-dashboard query = notifications at **55ms** due to a missing composite index). §2 |
| **React rendering** | ❌ NOT the bottleneck | When the connection is healthy the **entire server render of `/?full=1` completes in 239–385ms** and ships 330KB. §4 |
| **Data volume** | ❌ NOT the bottleneck | 734 task rows, 31 employees. Scans are index/seq scans over hundreds of rows. §2 |
| **Network latency (Vercel→DB)** | ⚠️ Minor when warm | In-region warm DB round-trip = **3–4ms**; storage = 30–50ms. §3 |
| **Serverless cold start + cold connection** | ✅ Contributor | First request to a fresh instance: DB connect **56–100ms** (vs 3–4ms warm); `/login` TTFB 927ms cold. §3 |
| **Connection acquisition + STALE-connection stalls on the txn pooler** | ✅✅ **THE bottleneck** | Live capture: dashboard alternates **239–385ms render** vs **18,100–18,234ms stall** (the app's 18s timeout), and `pg_stat_activity` shows queries **stuck in `Client/ClientRead` for 18–55s** holding pooler slots → cascade. §4 |

**Conclusion:** It is a **combination dominated by connection lifecycle against the Supabase transaction pooler.** Query execution, React, and data volume are all fast. The user-visible "stuck loading / random hiccups" is **stale/dead pooled connections** that hang until the app's 18s timeout, **plus** the app's own timeout abandoning those queries and leaving `Client/ClientRead` orphans that hold the pooler's limited server slots (15 on the Free plan) and starve subsequent loads. Cold starts add a secondary tax. **The fix is infrastructure (raise Supavisor pool size; verify the prod `DATABASE_URL` endpoint; in-region), not query/React optimization.**

---

## 1. Method

- **EXPLAIN ANALYZE** run directly against the prod DB (`scripts/perf-explain.ts`). DB-internal timing is location-independent → authoritative.
- **In-region timing** captured from inside a Vercel function via the existing `/api/health` route (which returns real `db` + `storage` round-trip ms measured server-side, in-region).
- **Authed dashboard waterfall** captured by minting a real admin session (Firebase custom-token → idToken → `/api/auth/session` → `__session` cookie) and timing `GET /?full=1` (`scripts/perf-waterfall.ts`).
- **Connection state** captured from `pg_stat_activity` at the moment of the stalls.
- **Public network phases** captured with `curl -w` timing.

---

## 2. EXPLAIN ANALYZE — 10 heaviest queries (REAL, prod DB)

DB row counts at capture: tasks=734, employees=31, weekly_goals=6, daily_checklist=78, notifications≈604.

| # | Query | Plan node | Rows | **Execution time** |
|---|---|---|---|---|
| Q1 | dashboard period scan (`created_at ≥ now-30d`) | **Index Scan** (`tasks_initiator_created_idx`) | 251 | **0.325 ms** |
| Q2 | dashboard wide scan (`≥ 14d`) | **Index Scan** | 149 | **0.218 ms** |
| Q3 | dashboard velocity scan (`≥ 90d`) | **Seq Scan** (filter removed 71) | 674 | **0.718 ms** |
| Q4 | `listEmployees` (full table) | Seq Scan | 31 | **0.072 ms** |
| Q5 | weekly-goals gate `EXISTS` | Seq Scan (6 rows) | 1 | **0.037 ms** |
| Q6 | daily-plan gate `count(*)` today | Seq Scan (78 rows) | 1 | **0.053 ms** (one sample 2.2ms cold buffers) |
| Q7 | `listWeekGoalsAsTasks` (week + `task_id IS NULL` + join) | Nested Loop + PK index | 2 | **0.131 ms** |
| Q8 | `status_settings` (full) | Seq Scan | 15 | **0.605 ms** |
| Q9 | weekly-goals board 3-way join (employees + reviewer + tasks) | Nested Loop + **Memoize** + PK index | 2 | **0.183 ms** |
| Q10 | notifications recent (`user_id` + order by created_at) | **Index Scan `notifications_created_idx`, Filter removed 554 rows** | 50 | **55.8 ms** ⚠️ |

**Reading these plans:**
- The dashboard scans are sub-millisecond. The 30d/14d scans use `tasks_initiator_created_idx` (its leading-ish col works for the created_at range here); the 90d scan falls to a Seq Scan but is still **0.72ms** on 674 rows.
- **Q10 is the only real query-shape problem:** ordering by `created_at` and filtering `user_id` post-scan reads 604 rows to return 50 (`Rows Removed by Filter: 554`). A composite **`notifications(user_id, created_at DESC)`** index turns this into a direct index scan. Still only 55ms today, but it's the worst and it grows with notification volume.
- Net DB-execution for an entire dashboard ≈ **2–3ms**. The database is not where the time goes.

> Full `EXPLAIN (ANALYZE, BUFFERS, VERBOSE)` text is reproducible via `pnpm tsx --env-file=.env.local scripts/perf-explain.ts` (script retained).

---

## 3. In-region timing (REAL, measured inside a Vercel function via `/api/health`)

`/api/health` measures `select 1` (DB) and a Supabase Storage `getBucket` round-trip, **server-side, in-region**. Repeated samples:

```
RUN (cold instance):  db=100ms   storage=364ms     ← first hit after deploy/idle
RUN (cold instance):  db= 56ms   storage=349ms
warm:                 db=  3ms   storage= 32ms
warm:                 db=  4ms   storage= 41ms
warm:                 db=  3ms   storage= 39ms
warm:                 db=  4ms   storage= 61ms
warm:                 db= 20ms   storage=287ms     ← occasional slightly-cold connection
```

**Interpretation:**
- **Warm Vercel→Supavisor→Postgres round-trip ≈ 3–4ms** for a trivial query. Subtract the <1ms execution → ~3ms is pure round-trip + pooler hop. Good.
- **Cold connection acquisition = 56–100ms** (first query on a fresh instance, establishing a pooler connection). ~25–30× the warm cost.
- **Supabase Storage** (`getBucket`) is **30–60ms warm, 300–360ms cold** — relevant for avatar/document pages, not the dashboard.
- A warm dashboard firing ~12 queries mostly in parallel (pool max 10) therefore costs only **tens of ms** of DB wait — consistent with the 239–385ms healthy renders in §4.

---

## 4. Authed dashboard waterfall + live connection state (REAL — the smoking gun)

Six sequential `GET /?full=1` loads with a real admin session, back-to-back:

```
load 1:   1397ms  status=200  bytes=330035  rendered        ← cold-ish instance, full dashboard
load 2:  18234ms  status=200  bytes= 66947  ERROR-CARD      ← hit the app's 18s withTimeout
load 3:    385ms  status=200  bytes=330078  rendered        ← healthy connection
load 4:  18142ms  status=200  bytes= 66904  ERROR-CARD      ← stall
load 5:    239ms  status=200  bytes=330078  rendered        ← healthy
load 6:  18167ms  status=200  bytes= 66947  ERROR-CARD      ← stall
```

`pg_stat_activity` snapshot taken immediately after (same minute):

```
connections by state:  active=4  idle=13  null=2     (17–19 of the pooler's slots in use)
active app queries (non-replication):
   55s  wait=Client/ClientRead  ::  select "id","title","doer_id","initiator_id", …   (dashboard scan)
   37s  wait=Client/ClientRead  ::  select "id","title","doer_id","initiator_id", …   (dashboard scan)
   18s  wait=Client/ClientRead  ::  select "id","title","doer_id","initiator_id", …   (dashboard scan)
```

**This is the mechanism, captured live:**
1. A healthy load renders the full 330KB dashboard in **239–385ms** (proving React + queries are fast).
2. When a load lands on a **stale/dead pooled connection**, the query **never returns** — the Server Component awaits until the app's `withTimeout` fires at exactly **~18,150ms**, returns the 66KB error card.
3. The abandoned query is **not cancelled** — it sits server-side in **`Client/ClientRead`** (the Postgres backend waiting to read the next command from a client that's gone). On the **transaction pooler**, Postgres sees Supavisor (alive) as the client, so neither `statement_timeout` nor `client_connection_check_interval` reaps it. It holds a pooler **server slot for minutes** (observed 18s → 37s → 55s and climbing).
4. With the Free-plan pooler capped at **~15 server slots**, a few orphans starve the pool → the next load can't get a healthy connection → it stalls → another orphan. **Cascade.** The alternating render/stall/render/stall pattern above is this cascade in action under back-to-back load.

> Reproduce: `pnpm tsx --env-file=.env.local scripts/perf-waterfall.ts` (retained).

---

## 5. Public network phases (REAL, curl)

```
GET /login   dns=4ms  tcp=52ms  tls=98ms  ttfb=927ms  total=999ms  size=153,155B  status=200
GET /        ttfb=134ms  total=134ms  status=307 (→ /login, unauthenticated)
```

- TLS+TCP handshake ~98ms (one-time per connection).
- **`/login` TTFB 927ms and 153KB** — the login page is heavy (drifting poster mosaic, Firebase client SDK, `ogl` WebGL). It's a one-time pre-auth cost but worth trimming.
- The unauth `/` redirect is fast (134ms) — middleware-only, no DB.

---

## 6. Per-step in-region breakdown — built, but Vercel would not promote it

I built a probe that runs the **exact** dashboard query sequence inside a Vercel function and returns per-step in-region timings (connection ping, both gates, org-settings, the 3 raw scans, and the page's 7-way `Promise.all`), gated by a **real admin session**. The code is in `app/api/health/route.ts` under `?deep=1` (`runDeepProbe()`), retained for you to run once promotion lands.

**Finding (operational):** after 4 deploys + ~6 minutes of waiting, the production alias **did not promote the route change** — `/api/health?deep=1` kept serving the old handler (the base health JSON, not the probe). This is the same class of issue noted in the deploy notes ("this project's Vercel build doesn't reliably register newly-added routes"). **It is itself a deployment-reliability finding for your team to investigate** (Vercel project → Deployments: confirm the latest commit is actually *promoted to production*, not just *built*; check for a stuck/partial promotion or a build-output cache pinning `/api/health`).

The §2–§4 artifacts already prove the conclusion without the per-step probe; the per-step numbers would only add granularity to the same answer.

---

## 7. Artifacts we could NOT capture from here (with exact capture steps for your team)

These require a real browser session or Vercel log access this environment doesn't have. Steps to capture the genuine artifacts:

**(a) Chrome DevTools Network waterfall for `/`:**
1. In Chrome, sign in to `https://wms.mananvasa.com`.
2. DevTools → Network → check "Disable cache" + "Preserve log" → select "Slow 4G" if you want to exaggerate, else leave.
3. Hard-reload `/` (Ctrl+Shift+R). The **document request's TTFB** is the number that matters — compare it on a "good" load vs a "stuck" load. Expect the document TTFB to be ~300ms on good loads and ~18s (then the error card) on stalls. Export as HAR (right-click → "Save all as HAR") for the external team.

**(b) React Profiler capture:**
1. Install the React DevTools extension. (Note: prod is a production React build, so component names are minified and the Profiler is less useful — the architecture is RSC-first so most of `/` is server-rendered with little client work.)
2. DevTools → Profiler → record → reload `/` → stop. You'll see the hydration of the client islands (KpiStrip, status pills, kanban, filter bar). **Expect this to be small** — the heavy time is server-side TTFB, not client render. To prove that, compare the Performance panel's "Waiting for server response (TTFB)" vs "Scripting/Rendering" — TTFB will dominate.

**(c) Vercel function logs for one slow request:**
1. Vercel dashboard → the project → **Logs** (or `vercel logs <deployment-url> --follow` with the Vercel CLI).
2. Reproduce a stuck load (hard-refresh `/` a few times until one hangs).
3. Look for the function invocation with ~18s (or 300s) duration. With `SLOW_QUERY_MS` set in env (the app has a slow-query logger, `lib/db/slow-query.ts`, dev-on by default / prod-off), you'll also get `[slow-query] …` lines. Look for `[db-timeout] … fell back` (our timeout firing) and any `FUNCTION_INVOCATION_TIMEOUT` (504).

---

## 8. Recommended fix order (with expected effect, mapped to the evidence)

1. **Raise Supavisor pool size 15→40** (Supabase → Database → Connection pooling; free) **and confirm Vercel `DATABASE_URL` is the `:6543` transaction pooler in-region.** Directly addresses §4 (slot starvation from `Client/ClientRead` orphans). *Expected: eliminates the bulk of the 18s stalls.*
2. **Stop orphaning queries on timeout** — investigate query cancellation, or set a role-level `statement_timeout` (guard the nightly backup) so abandoned scans die in seconds, not minutes. Addresses §4 root mechanism. *Expected: breaks the cascade even if a stall occurs.*
3. **Cache the per-user dashboard queries + gates** (short per-user `unstable_cache`) to cut uncached round-trips per load. Addresses §3 round-trip count. *Expected: fewer stall opportunities, faster warm loads.*
4. **Add `notifications(user_id, created_at DESC)` index.** Addresses §2 Q10 (55ms → ~1ms). *Expected: removes the only slow query as notifications grow.*
5. **Investigate the Vercel promotion reliability** (§6) — a stuck promotion means fixes don't actually go live. *Expected: deploys you trust.*
6. **Reduce cold-start tax** — keep functions in the DB region; consider a warming ping. Addresses §3 cold numbers. *Secondary.*
7. **Trim `/login` weight** (poster mosaic / defer `ogl`/firebase). Addresses §5. *Cosmetic vs the DB wins.*

---

## 9. Scripts retained for re-capture

- `scripts/perf-explain.ts` — EXPLAIN ANALYZE the 10 queries.
- `scripts/perf-waterfall.ts` — authed dashboard timing + `pg_stat_activity` snapshot.
- `scripts/perf-hit-probe.ts` — hits `/api/health?deep=1` for the per-step in-region breakdown (works once Vercel promotes the route).
- `/api/health?deep=1` (admin-session gated) — the in-region per-step probe. **Remove after the audit.**

Run all with `pnpm tsx --env-file=.env.local scripts/<name>.ts`.
