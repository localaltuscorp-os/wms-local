# Operation Butter — Make Altus *feel* like Linear (and survive 2 years of growth)

**Milestone owner:** Manan · **Engineer:** Hetesh + Claude · **Date:** 2026-06-29
**Companion:** `docs/PERFORMANCE_AUDIT_2026-06-29.md` (the measured audit this builds on).

> The objective is not a Lighthouse score. It's a **feeling**: click → instant, open → instant, assign → instant, dashboard → instant. And we optimize for **500 employees / multi-company / always-on AI agents**, not just today's 29 — so we add the architectural *seams* now and never pay a rewrite.

---

## 1. Why it isn't "butter" today (the *feel* root causes)

Linear feels instant because the UI **never waits for the server to think**. Altus waits, in four places (all from the measured audit):

1. **Every mutation does a server round-trip + `router.refresh()`** → the click waits for the action AND a full server re-render before the screen updates. (Linear: the click updates local state in <16 ms; the server confirms in the background.)
2. **Interactive actions block on external side-effects** — status/assign/punch `await` email + WhatsApp + Slack + push + Google Calendar before returning.
3. **Every navigation pays a serial 5–7 query gate chain** before first byte.
4. **The dashboard cache is busted on every write** (`revalidatePath("/")` + one mega tag), so it re-scans instead of serving warm.

None of these is a slow query — Postgres answers in **0.3–6.4 ms**. The lag is **architecture making the UI wait for work the user shouldn't have to wait for.**

## 2. The Linear playbook, mapped to Altus

| Linear's trick | Altus today | Butter change |
|---|---|---|
| **Optimistic mutations** — UI updates instantly, server reconciles async | server action → `router.refresh()` round-trip | Optimistic local update + **targeted** cache write; reconcile on response, roll back on error |
| **Local cache / instant reads** — data already on client renders with zero wait | RSC re-fetch on every refresh | Warm 60s cache that survives writes (scoped tags) + client cache; reads are instant |
| **Async everything** — side-effects never block the interaction | email/WhatsApp/Calendar awaited inline | Durable queue; the action returns the instant the DB row is written |
| **Prefetch + no blocking gate** — next screen is ready before you click | serial gate chain per page | Batch + cache the gate chain; prefetch likely routes |
| **Scoped realtime deltas** — only the affected client/row updates | table-wide sub → global `router.refresh()` | Scoped, debounced, per-team/per-row deltas — no global re-render |

**The single biggest "feel" lever:** replace `router.refresh()`-on-mutation with **optimistic UI + targeted `revalidateTag`**. That one pattern is most of the Linear feeling.

---

## 3. The 2-year questions — answered

### Q1 — Can this architecture support 500 employees?
**The engine: yes, easily. Today's *patterns*: no — they collapse first.**
- Data: ~758 tasks for 29 people → ~13K active / a few hundred K lifetime at 500. Postgres handles millions trivially **with the right indexes + rollups**. Not a concern.
- **What breaks first (in order):** (1) the **realtime fan-out** — global `router.refresh()` is O(users) per write → at 500 it's an N² re-render storm; (2) **org-wide cache invalidation** — every write busts everyone's cache, so the cache stops helping exactly when you need it; (3) **scan-on-read analytics** — dashboards that scan all tasks/events go from 5 ms to hundreds of ms as rows grow; (4) **unbounded tables** (`task_events`, `notifications`, `dispatch_log`, `dcc_entries`) become millions of rows.
- **Verdict:** 500 is comfortably reachable **after** P0 (scope realtime + scoped cache) + **rollup tables** for analytics + **retention/partitioning** on event tables. The connection pool (Supavisor txn-pooler, `prepare:false` already set) multiplexes thousands of clients onto few PG connections — it is *not* the limit; the storm is.

### Q2 — 50 task updates per second?
**Writes to the DB: trivially yes (9 ms each, PG does thousands/sec). The current *fan-out*: no.**
- 50 writes/sec × N clients each running `router.refresh()` = up to **50·N full dashboard re-renders/sec** (at N=500 → 25,000/sec — meltdown). Plus 50/sec × (≤3 recipients × 4 external HTTP) = **hundreds of blocking outbound calls/sec** holding request slots.
- **Verdict:** achievable with three changes — **(a)** durable **queue** for side-effects (write path = DB-insert only), **(b)** **scoped + batched realtime deltas** instead of global refresh, **(c)** **optimistic UI** so clients don't refetch on every event. Also: high-frequency task updates shouldn't ride Postgres-WAL realtime (already our #1 DB-time consumer) — use lightweight broadcast deltas or client optimism + targeted revalidation.

### Q3 — Multi-tenant SaaS (multiple companies)?
**Not today — it is strictly single-tenant. There is no `org_id` / `tenant_id` on any table; one Firebase project; RBAC is per-user within one implicit company.**
- **Recommended model:** shared database + **`org_id` column on every tenant-owned table + Postgres Row-Level Security (RLS)** (the standard SaaS "pool" model). DB-per-tenant (silo) is too heavy on Supabase; schema-per-tenant is a fallback.
- **The debt trap you're warning about is real here:** retrofitting `org_id` into ~60 tables and *every* query after they've multiplied is a massive, dangerous migration. **So: add the SEAM now, build the feature later.** Concretely, *now*:
  - Put **`org_id` in the auth/session context** (one `currentOrg(me)`), and make **every query + every agent tool scope by it** through the existing `requireUser`/`loadWritable*` choke points (they're the perfect insertion point).
  - Add `org_id` to new tables from here on, and plan one backfill migration for existing tables (default to the single "Altus" org).
  - Enforce with **RLS policies** keyed off a session GUC (`set_config('app.org_id', …)`), so isolation is at the DB, not just the app.
- **Verdict:** not now, but make it **multi-tenant-READY now** (the org-scoping seam) so the later switch is *additive*, not a rewrite. Don't build billing/onboarding/per-org auth until there's a second customer (YAGNI) — but never write another query that isn't org-scoped.

### Q4 — Continuous AI agents reading & writing?
**Yes — *if* agents are treated as first-class concurrent actors, which is the same hardening that makes humans feel instant.**
- Agents are just more concurrent "users." Their **writes hit the exact same fan-out amplifiers** — so P0/P1 (scoped realtime, queued side-effects) protect agent load too.
- Agent-specific seams to add: **(a)** a separate **rate + cost + connection budget** so agents can't starve human requests (connection priority / a dedicated pool lane / a **read replica** for heavy agent reads); **(b)** all agent writes through the **gated, audited** tool path (already the plan — no raw DB); **(c)** **event-driven, not polling** — agents react to queue/webhook events, never loop on the DB; **(d)** prompt-cached + metered (already in the agentic plan).
- **Verdict:** yes, on the same architecture — plus a read replica and an agent rate/connection budget so continuous agents never contend with the human "instant" path.

### Q5 — What becomes a bottleneck *even though it isn't today*?
1. **Unbounded event/log tables** (`task_events`, `notifications`, `notification_dispatch_log`, `auth_sessions`, `dcc_entries`) → millions of rows → slow aggregations. *Fix-ahead: time-partition + retention/archival + windowed queries.*
2. **Scan-on-read analytics** (dashboard scans all tasks/events per load). *Fix-ahead: precomputed **rollup/materialized tables** (`metrics_daily`) refreshed on a cadence — "materialize, don't scan."*
3. **One global cache tag** → useless at scale. *Fix-ahead: scoped tags (per-org, per-team, per-user).*
4. **Realtime over Postgres WAL** → already the #1 DB-time consumer. *Fix-ahead: scoped/broadcast deltas, not table-wide WAL.*
5. **No durable queue** → inline side-effects cap write throughput. *Fix-ahead: Upstash/QStash.*
6. **No `org_id` seam** → exponentially harder to retrofit. *Fix-ahead: add the seam now (Q3).*
7. **Single Postgres for OLTP + analytics + agents** → contention later. *Fix-ahead: a read replica for analytics/agents (Supabase supports it); keep writes on primary.*
8. **No client code-splitting / growing client bundle** → every new module bloats first-load. *Fix-ahead: dynamic imports per module (already in the audit).*
9. **Single Firebase project / no org SSO** → SaaS needs per-org auth domains + SSO. *Fix-ahead: design auth context to carry org now.*
10. **Removed timeouts/retries on the dashboard path** → at scale, need proper timeouts + circuit breakers around external calls.

---

## 4. The "design now, build later" line (avoid the debt, don't over-build)

**Add the SEAM now (cheap now, ruinous later):**
- `org_id` in the auth context + every query/tool scoped through `requireUser`/`loadWritable*` (multi-tenant readiness).
- A **durable queue** abstraction for side-effects (even if it starts as `afterResponse`, put the *interface* in so swapping to QStash is one change).
- **Scoped cache tags** (`tasks:org:<id>`, `tasks:user:<id>`) from the start of the refactor.
- **Rollup table** pattern for any new exec aggregate (don't add another scan-on-read dashboard).

**Build later (YAGNI until the trigger):**
- Actual multi-tenant onboarding/billing/per-org auth (trigger: a 2nd customer).
- Read replica (trigger: agents or analytics measurably contending — watch the slow-query log we'll enable).
- Table partitioning (trigger: an event table crosses ~1–5M rows).
- Horizontal anything (not needed within one Postgres for years at this size).

---

## 5. Operation Butter — phased plan (feel + future-proof, interleaved)

Every phase is load-safe (no pool / `DATABASE_URL` changes) and ships via `ship.sh`.

- **Butter P0 — Kill the storm + warm the cache** *(the audit's P0)*: scope realtime (no global `router.refresh()`), drop `revalidatePath("/")`, **scoped cache tags**. → dashboards serve warm; the under-load lag disappears. *Feeling: dashboard instant under concurrency.*
- **Butter P1 — Optimistic mutations**: the marquee "feel" change. Click updates the UI in <16 ms (local), server confirms via **targeted `revalidateTag`** (not refresh), rolls back on error. Apply to status change, assign, daily-checklist, goal %. → *Feeling: click → instant, assign → instant.*
- **Butter P2 — Async side-effects (queue seam)**: move notify + Calendar off the request to the queue interface. → *Feeling: every write returns the instant the row is saved.*
- **Butter P3 — Instant navigation**: batch+cache the gate chain; prefetch likely routes; RSC payload reuse. → *Feeling: open → instant.*
- **Butter P4 — Client weight**: dynamic-import charts/dnd/xlsx; memoize/virtualize boards + lists; fix prop→state clobbering. → *Feeling: no jank, fast first paint.*
- **Butter P5 — Future-scale seams**: `org_id` seam + RLS scaffolding; first `metrics_daily` rollup replacing a scan-on-read dashboard; turn on prod slow-query logging; read-replica-ready data layer. → *Feeling stays buttery as you grow to 500 + add agents + a 2nd company.*

**Order rationale:** P0 removes the pain everyone feels now; P1–P3 deliver the Linear *feeling*; P4 polishes; P5 makes the feeling *durable* at 10× scale.

---

## 6. Standing ready
This is the charter, not the diff. On your word ("execute Butter P0"), I start — calculated, measured, one phase at a time, each verified (tsc + build + data-layer e2e + authed render + a before/after felt-latency check) before the next. Nothing touches the DB pool or load path without proof.
