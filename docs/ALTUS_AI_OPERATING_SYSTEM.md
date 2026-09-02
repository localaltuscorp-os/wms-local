# The Altus AI Operating System — the four-layer blueprint

**Status:** Blueprint (2026-06-30). Companion to `ARCHITECTURE.md` (the ratified
engineering constitution) and `ALTUS_INTELLIGENCE_BUILD_PLAN.md` (the agent
program). This doc fixes the **layer separation** so we never conflate
"operational work," "understanding," "autonomous action," and "delivery."

> **The law (from the constitution):** Engines own data · Events connect engines
> · Intelligence is derived · AI consumes intelligence.

Those four clauses ARE the four layers below. PMS is **Layer 2** — one
intelligence engine among many. The AI does not live inside PMS; the AI *uses* it.

---

## Layer 1 — Operational Systems (where work happens)
The modules people actually use. Each OWNS its operational tables and is the
source of truth for its slice (Law 1).

`Admin · WMS · Employees · Training · Sales · Marketing · Finance · CRM ·
Attendance · Payroll · Ambassadors · Feedback`

Every meaningful change emits a typed, versioned domain event into `event_log`
in the same transaction as the row (Law 2). **Status today:** WMS/tasks emits
live (Phase B). Other engines emit as they're wired (mechanical repeat of the
tasks pattern).

## Layer 2 — Intelligence Systems (where understanding happens)
Rebuildable, derived consumers of `event_log` (Laws 4, 5). They NEVER own
operational data and fire NO external actions — they only *understand*.

- **Employee Digital Twin** — per-employee rollup of every signal (tasks done,
  goals hit, attendance, training, feedback, recognition) folded from the log.
- **Company Digital Twin** — the org-level equivalent.
- **Score Engine** — a transparent, configurable score over the Twin.
- **Promotion Engine / Recognition Engine** — thresholds + signals over the Twin.
- **Growth / Performance / Learning / Knowledge Graphs** — relationships derived
  from the same events.
- **Projections + Analytics** — `task_metrics_daily` (built) is the first; the
  PMS adds `employee_twin`, `employee_score_daily`, etc.

**PMS = this layer, scoped to the Employees module.** It is *one* set of engines
here; Sales/Marketing/Training each get their own intelligence off the same log.

## Layer 3 — Agentic Systems (where autonomous work happens)
Claude-driven agents that **read** Layer 2 (intelligence) + Layer 1 (exact facts
via RBAC) and the Knowledge Layer (semantic), then propose/▶take action through
Layer 4. They STORE NOTHING — they call tools (the typed data layer + commands).
`Marketing · Sales · HR · CEO · Operations · Finance · Recruitment · Customer
Success Agents.` **Not part of PMS.** Deferred (see `ALTUS_INTELLIGENCE_BUILD_PLAN.md`).

## Layer 4 — Delivery Systems (where actions land)
External effects on the exactly-once command channel (Law 8), NEVER replayed.
`WhatsApp · Gmail · Calendar · Slack · Push · Reports · Documents · CRM updates ·
Task creation · Approvals.` Phase B shipped the `command_log` ledger + worker as
the seam; effects migrate onto it per-effect.

---

## The data flow (the only correct direction)
```
Training (Layer 1)  →  event: TrainingCompleted (event_log)
                    →  Employee Twin updated (Layer 2 projection)
                    →  Knowledge Layer updated (semantic sibling)
                    →  Training Agent notices (Layer 3, reads — never writes the twin)
                    →  Manager gets a recommendation (Layer 4 command)
```
NOT `Training → Training AI → Employee updated`. The AI is the last reader, not
the writer. Replaying the log rebuilds all of Layer 2 and fires ZERO Layer-4
actions (Law 8) — so the intelligence is always reconstructable and safe.

---

## How PMS (Employee Intelligence) is built — concretely
1. **Wire the Employees-module engines to emit** (Attendance, Training, Feedback,
   Goals) into `event_log`, same as tasks already do.
2. **Add projections** consumed by the relay: `employee_twin` (current per-person
   profile) + `employee_score_daily` (rebuildable score history). Pure consumers,
   idempotent, rebuildable from the log (Law 4).
3. **Score Engine** = a pure, transparent, *configurable* function over the Twin
   (weights live in data, not code, so leadership tunes them without a deploy).
   Human-released for anything consequential (promotion/recognition) — never auto.
4. **PMS surface** in the Employees module (its own green identity): per-employee
   profile, score trend, recognition + promotion signals, manager review.

The Score/Promotion/Recognition *criteria* are **business policy** — defined by
leadership, stored as data, applied by the pure engine. The architecture is fixed;
the policy is configurable.

---
*This blueprint is the map for every future AI capability. The Employee
Intelligence Platform is one intelligence engine feeding the agents — built on
the event spine that already exists, not a parallel stack.*
