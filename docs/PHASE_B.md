# Phase B — the event spine (status)

Implements the foundation of `ARCHITECTURE.md` (Laws 1–11), **tasks engine as the
fully-wired pilot**. All additive; nothing user-facing changed.

## What shipped

| Piece | File(s) | Law |
|---|---|---|
| Event log (outbox + immutable log in one append-only table; no FKs, global `seq`) | `db/migrations/0094_event_spine.sql`, `db/schema.ts` (`eventLog`) | 2, 3 |
| Typed, versioned, domain-owned event contracts | `lib/events/types.ts`, `task-events.ts` | 3 |
| Transactional `emit(tx, …)` (event in the SAME txn as the row) | `lib/events/emit.ts` | 2 |
| Upcaster seam (Vn→Vn+1 at read; identity today) | `lib/events/upcasters.ts` | 3 |
| Relay — cursor per consumer, per-event txn (cursor advances WITH the effect → exactly-once), poison-tolerant | `lib/relay/relay.ts`, `consumers.ts`, `run.ts` | 4, 7 |
| Projection — `task_metrics_daily` rollup, rebuildable, stable read interface | `lib/projections/task-metrics*.ts` | 4, 5, 10 |
| Command channel — exactly-once `command_log` (unique `dedupe_key`) + worker | `lib/commands/dispatcher.ts`, `derive.ts`, `worker.ts` | 8 |
| Relay cron (DAILY backstop — Vercel rejects sub-daily on this plan) + after-commit nudge (real-time) | `app/api/cron/relay/route.ts`, `lib/relay/nudge.ts` | 7 |
| Tasks engine wired to dual-write events in-txn | `lib/tasks/create-task.ts`, `set-status.ts`, `app/(app)/tasks/actions.ts` | 2 |
| Backfill from history + rebuild + **shadow-verify** | `scripts/backfill-event-log.ts`, `rebuild-task-metrics.ts`, `verify-task-metrics.ts` | 4 |

## Verified (prod data, 2026-06-29)
Backfilled 1661 task events from 758 tasks → rebuilt the projection → **verify
passed with zero drift**: created 758, done 197, approved 127, not-approved 25
across 352 (day,doer) keys. Projection == fold of the log (Law 4).

## Kill-switches (env)
- `OUTBOX_EMIT_OFF=true` — stop emitting (task writes behave exactly as pre-Phase-B). First line of defence.
- `RELAY_OFF=true` — relay/nudge no-op (events accumulate, nothing lost).
- `COMMANDS_VIA_LEDGER` — **default off**. The command channel is built + tested but OFF, because the live notifications still flow through the existing `afterResponse(notify)` path; enabling it without removing that path would double-send. Migrate per-effect: enable + remove that effect's `afterResponse` call.

## What is NOT cut over (deliberately)
No read is served from a projection yet. The exec dashboard is a per-filter
aggregate the audit proved is already fast (0.3–6 ms; its old slowness was the
pool storm, fixed in Butter P0), so per Law 5 ("materialize only when a
measurable consumer exists") it stays on the live path until a projection that
serves it is built and shadow-verified. The verify harness is the gate.

## Next engines (mechanical repeat of the tasks pattern)
For each engine (goals, attendance, salary, DCC, ambassadors, outstanding, …):
define its event contracts, `emit()` inside its existing mutation txns, register
a projection consumer, backfill, rebuild, **verify**, then cut its read over
behind a kill-switch. Attendance/salary emit-in-txn must be verified per engine
before enabling (an emit bug there would roll back a clock-in) — do them one at a
time, not in a single blind push.

## Operate
```
# apply schema (additive, idempotent)
pnpm tsx --env-file=.env.local scripts/apply-0094-event-spine.ts
# (re)sync the log from the task audit history, then rebuild + verify
pnpm tsx --env-file=.env.local scripts/backfill-event-log.ts
pnpm tsx --env-file=.env.local scripts/rebuild-task-metrics.ts
pnpm tsx --env-file=.env.local scripts/verify-task-metrics.ts   # must print ✅
```
