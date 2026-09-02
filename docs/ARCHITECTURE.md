# Altus — Engineering Architecture Constitution

**Status:** Ratified 2026-06-29 (co-authored, Manan [CTO] + Claude). **Non-negotiable.** Every architectural decision and PR is judged against this document, not personal opinion. Companion docs: `OPERATION_BUTTER.md` (the performance milestone), `PERFORMANCE_AUDIT_2026-06-29.md` (the measured evidence), `ALTUS_INTELLIGENCE_BUILD_PLAN.md` (the agentic program).

> **Identity:** *Altus is an AI-native operating system that turns everything a company does into one living memory — and an agent layer that acts on it — so every process runs, measures, and improves itself.*
> **What Altus is NOT:** not an SAP/Workday enterprise clone, not a CRM/ERP point-tool, not a federation of CRUD pages. We win on **unified data + agency + WhatsApp-native for SMEs**, built as **engines, not pages.**

---

## The layered architecture (destination)

```
                              Users
                                │
                       Presentation Layer        ← never computes business aggregates live (Law 10)
                                │
        ┌───────────────────────┴───────────────────────┐
   Projection Layer (read models)            Knowledge Layer (semantic)     ← SIBLINGS (Law 6)
   exact, structured, RBAC                    embeddings · graph · RAG
   rebuildable, per-engine                    notes/voice/docs/relationships
        └───────────────────────┬───────────────────────┘
                       Business Event Log            ← immutable · append-only · versioned · domain-owned (Law 3)
                        (events only — facts)
                                │  published by the Relay
                       Transactional Outbox          ← event written IN the same txn as the row (Law 2)
                                │
                       Operational Database          ← SOURCE OF TRUTH (Law 1)
                        tasks · goals · attendance · sales · CRM · training · people-gives · ambassadors

   Commands (external effects) ──► Command Dispatcher ──► email · WhatsApp · calendar · payment
   exactly-once · NEVER replayed (Law 8) — projections/knowledge never subscribe to these
```

- **Truth flows up, never down.** Operational DB → (outbox, same txn) → Event Log → {Projections | Knowledge} → Presentation/AI.
- **Projections and Knowledge are peers**, both derived consumers of the Event Log — not a stack.
- **Commands are a separate channel** from events; replaying the log rebuilds derived state and **fires zero external actions.**
- **AI agents read projections/operational for exact facts, the Knowledge Layer for semantic recall — never operational SQL directly, never embeddings for exact facts.**

---

## The Engineering Laws

**Law 1 — Operational DB is the source of truth.** Projections, caches, knowledge, and AI are all derived and disposable.

**Law 2 — Transactional outbox.** Every business change writes the operational row **and** an outbox event **atomically in one DB transaction** (Drizzle `db.transaction`). A separate **relay** publishes from the outbox to workers. Never emit an event outside the transaction (`after()`-style post-response emit is forbidden for truth events — it can drop, corrupting the log forever).

**Law 3 — Events are immutable, append-only, versioned, domain-owned.** Never mutate history; append. Each event has a version (`TaskCompletedV2`) and is owned by exactly one business domain (no shared namespace). Old versions are read through **upcasters** (Vn→Vn+1 at read time) so consumers only ever see the latest shape.

**Law 4 — Projections are derived, rebuildable, never the source of truth.** Any projection can be dropped and rebuilt from the event log. If a projection and the log disagree, the log wins.

**Law 5 — Lazy materialization behind a stable interface.** Every engine exposes a stable metrics/projection **interface** from day one; the implementation starts as a cached query and graduates to a materialized projection **only when a measurable consumer exists.** Consumers never know which it is. (Ownership now, materialization on demand.)

**Law 6 — Know your source: structured vs semantic.** Exact, structured facts (status, balance, commission, counts) come from **projections/operational with RBAC**. Semantic understanding (notes, voice, docs, relationships, behavior) comes from the **Knowledge Layer** (embeddings/graph/RAG). AI must know which it is querying; **never route an exact fact through embeddings.**

**Law 7 — Workers are idempotent and reorder-tolerant.** Delivery is at-least-once; events can arrive duplicated or out of order. Every event/projection handler must produce the same result regardless (dedupe keys, version/sequence checks).

**Law 8 — Commands ≠ Events.** Things that cause external side effects (email, WhatsApp, calendar, payment) are **commands** on a separate, **exactly-once-delivered** channel with a sent-ledger, and are **NEVER replayed.** Projections and the Knowledge Layer subscribe to **events only.** Replaying history must never repeat an external action.

**Law 9 — Correlation IDs everywhere.** Every business workflow carries one correlation ID across tasks, notifications, calendar, AI, and integrations, so any story (and the AI) can be reconstructed without guessing.

**Law 10 — The presentation layer never aggregates live.** Dashboards/pages consume projection interfaces; no page computes expensive business aggregates on the read path. No user action makes another user's app refresh (the realtime law).

**Law 11 — Tenancy & privacy are first-class in the log.** Every event carries `org_id` (tenant partition). PII inside events is **crypto-shredded** (encrypted under a per-subject key; "delete" = destroy the key), so the log stays immutable/append-only **and** a tenant/employee can exercise data ownership + right-to-delete. "Immutable forever" must coexist with "deletable on request" — crypto-shredding is how.

---

## Performance corollaries (Operation Butter)

- **Persist, then return.** A write awaits only the durable row (+ the outbox event, same txn) and returns. Everything else is async (command channel / workers).
- **Optimistic UI.** The interface updates in <16 ms locally; the server confirms via **targeted** revalidation (never `router.refresh()` of the whole tree); roll back + dedupe the realtime echo on error. Scope to safe single-field mutations first.
- **Targeted updates only.** A write busts narrow, scoped cache tags (`tasks:org:<id>` / `:user:<id>`), never the whole dashboard for everyone; realtime ships **row deltas**, not "go re-read" signals.
- **Three rungs, climbed only as measurement forces:** cached query → SWR + single-flight (kills the cold-cache herd) → materialized projection (for expensive knowledge aggregates).
- **Measure first, enforce always.** Instrument before optimizing (slow-query log, cache-hit, queue depth, realtime volume, projection lag).

## Execution path

- **Phase A (now): stop the crash.** Kill the realtime refresh storm; narrow cache invalidation (remove `revalidatePath("/")`, scoped tags); defer single-task side-effects off the request; instrument before/after. *No DB pool / `DATABASE_URL` changes — ever.*
- **Phase B (measured, months): the constitution, incrementally.** Transactional outbox + versioned/typed event contracts + correlation IDs → SWR + single-flight → lazy per-engine projections (self-describing, rebuildable) → Knowledge Layer (semantic sibling) → command channel split (events vs commands) → idempotent workers → projection registry tooling when count justifies → org_id + crypto-shred as multi-tenant approaches.

## How this is enforced (a constitution needs teeth)
- **PR review checklist:** new module is an *engine* (state/rules/events/interface), not a page; writes use the outbox (event in the same txn); side-effects are commands, not inline awaits; dashboards read projection interfaces; exact reads not routed through embeddings; events carry `org_id` + correlation ID.
- **Lint/CI rules:** ban `revalidatePath("/")`; ban `router.refresh()` inside mutation handlers; flag direct cross-engine helper calls (require `emit()`); flag operational aggregation inside presentation components; flag event emit outside a transaction.
- **The DB load-path remains off-limits** (pool/`DATABASE_URL` changes restart the pooler = outage). Non-negotiable, forever.

---
*This is the architecture of an AI-native company operating system: truth is an immutable, transactionally-written event log; dashboards and agents read rebuildable derived models; external actions are replay-safe commands; every engine owns its slice; tenancy and privacy are built into the log. It holds on Supabase today and any infrastructure in five years.*
