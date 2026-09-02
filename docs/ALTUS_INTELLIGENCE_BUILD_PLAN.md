# Altus Intelligence — End-to-End Build Plan

> **For agentic workers:** Execute module-by-module with `superpowers:subagent-driven-development`. Each module is an independently shippable subsystem with its own exit gate. Steps use checkbox (`- [ ]`) tracking. This is the **master program plan** — execute on the founder's word, in the phase order of §13.

**Goal:** Turn Altus from a system-of-record into an **agentic AI operating system** — one AI layer (Claude) that reads and acts across every module, plus an automated marketing/sales engine, intelligence layer, and a Performance Management System.

**Architecture:** The existing typed data layer (`lib/queries/*` + server actions) becomes the **agent tool registry**. A Claude Opus 4.8 tool-use loop runs **as the signed-in user** (inherits RBAC); reads stream, writes are human-confirmed + audited. New automation (WhatsApp/voice/lead-gen/incentives) rides the same tool layer + a daily-cron + event spine. Everything is off the dashboard load path.

**Tech Stack:** Next.js 16 (App Router, server actions, route handlers) · Drizzle + Postgres (Supabase) · Firebase auth · **Claude Opus 4.8** (`claude-opus-4-8`) for agent reasoning · **Gemini 2.5 Flash** (already wired, `lib/ai/gemini.ts`) for cheap bulk/voice · WhatsApp Business API (Meta) · Twilio/voice for calling · Razorpay/Stripe for payouts · @dnd-kit, motion/react, charts/SVG for UI.

## Global Constraints (apply to EVERY module)

- **Model policy:** ONE agent model — `claude-opus-4-8` (adaptive thinking, `effort: "high"`, `xhigh` for hard multi-step). Gemini Flash for cheap/bulk/transcription; Haiku 4.5 for cheap structured calls. **No multi-vendor model zoo.**
- **No public REST/GraphQL.** Agent capabilities are an **internal tool registry** only (typed wrappers over `lib/queries`/actions). (Revisit only if/when productizing multi-tenant.)
- **No Telegram/Slack** (temporary YAGNI). WhatsApp is the only external chat channel.
- **No automated money movement.** Payouts are **always human-released** with audit + undo. The agent computes and drafts; a person clicks "release."
- **Run-as-user RBAC:** every tool reuses `requireUser` / `loadWritable*` / `goalScopeFor` / workspace gates. The agent can never exceed the acting user's permissions.
- **Human-in-the-loop on writes:** destructive/outward actions (create tasks, send WhatsApp/call, release payout) use the manual tool-use loop with a confirm gate; reads are auto.
- **Audit everything:** every agent action + every automation event writes an `agent_audit` row.
- **Load-neutral:** zero new queries on the dashboard load path; never touch the DB pool / `DATABASE_URL`. AI + heavy analytics are on-demand or daily-cron (Vercel rejects sub-daily crons).
- **Kill-switch per surface** (env var, mirrors `MANAGER_GATES_OFF`/`DCC_GATE_OFF`): `AGENT_OFF`, `WHATSAPP_AGENT_OFF`, `VOICE_AGENT_OFF`, `LEADGEN_OFF`, `INCENTIVE_ENGINE_OFF`.
- **Cost metering:** every LLM call records tokens + model + feature in `ai_usage` (we currently have NO metering — fix this in F4).
- **Migrations:** idempotent SQL + `scripts/apply-00NN-*.ts` (own `max:1` conn); journal is stale; next number = **0094**.
- **Deploy:** `bash scripts/ship.sh "msg"` → Manan-Vasa main → Vercel auto-promote. (Known gotcha: ship.sh `set -e` aborts the SRC commit if the tree is already clean — finish the push from the `_mv_push` clone.)
- **UI:** `altus-premium-ui` brand tokens, keyboard-first, readable, mobile parity.
- **Verification per module (the repo's standard):** (1) `pnpm tsc` clean, (2) `pnpm build` green, (3) unit tests on pure logic, (4) data-layer e2e against prod (seed→assert→clean), (5) authed-render smoke (mint-session Playwright), (6) for agent modules an **eval harness** (golden prompts → expected tool calls).

---

## 1. Program map & dependency graph

```
LAYER 0 — FOUNDATIONS (build first, everything depends on these)
  F1 Agent Core (tool registry + loop + write-gate + audit)
  F2 Unified marketing data (leads, campaigns, incentive_rules + extend Ambassadors/PeopleGives/Incentive)
  F3 Integrations (WhatsApp · Voice · Payout gateway · Enrichment connector · Calendar[exists])
  F4 Observability & cost metering + kill-switches + feature flags

LAYER 1 — SURFACES        LAYER 2 — MARKETING/SALES        LAYER 3 — INTELLIGENCE
  M1 Copilot ⌘K/dock        M4 Lead lifecycle               M9  Morning Brief
  M2 WhatsApp agent         M5 Lead discovery (scrape)      M10 Cash/Receivables forecast
  M3 Voice/AI calling       M6 Incentive engine             M11 Anomaly Watch
                            M7 Payout release (human)       M12 Ask-the-Business (NL analytics)
                            M8 Content automation           M14 Attribution + Lead scoring
                            M15 Ambassador automation

LAYER 4 — WORKFLOWS                 LAYER 5 — PMS
  M13 Meeting → Action               M16 Performance Management System + Performance Audit
```

**Hard dependencies:** F1→(everything agentic). F2→(M4,M6,M14,M15). F3.whatsapp→(M2). F3.voice→(M3). F3.payout→(M7). F3.enrichment→(M5). M4→(M5,M6,M14). M6→(M7). M14→(M9,M10). M3.x intelligence→(M16 PMS).

---

## LAYER 0 — FOUNDATIONS

### F1 — Agent Core

**Purpose:** The reusable agentic engine: a registry of typed tools (wrappers over existing reads/actions), a Claude tool-use loop, a write-confirmation gate, and an audit trail. Every other agentic module is "+2 tools + a prompt" on top of this.

**Files:**
- Create `lib/agent/registry.ts` — `defineTool({ name, description, schema, run, kind: "read"|"write", confirm?: boolean })`; central `TOOLS` array.
- Create `lib/agent/tools/*.ts` — one file per domain (tasks, goals, dcc, attendance, ambassadors, outstanding, leads…), each exporting `defineTool(...)` wrappers over `lib/queries/*` + actions.
- Create `lib/agent/loop.ts` — the manual tool-use loop (Anthropic SDK, `claude-opus-4-8`, adaptive thinking, prompt-cached system+tools); yields events (text, tool_use, awaiting_confirm).
- Create `lib/agent/anthropic.ts` — Anthropic client init + system-prompt builder + prompt-cache breakpoints.
- Create `app/api/agent/route.ts` — SSE endpoint: auth → run loop as user → stream events; write tools pause for confirm.
- Create `app/api/agent/confirm/route.ts` — apply a confirmed write tool-call.
- Schema: `agent_runs` (id, user_id, surface, started_at, status, token_usage), `agent_audit` (id, run_id, user_id, tool, args_json, result_summary, status, created_at). Migration `0094_agent_core.sql`.
- Create `lib/agent/audit.ts` — `recordAudit(...)`.

**Interfaces produced:** `defineTool`, `TOOLS`, `runAgent(messages, {user, surface, onEvent})`, `applyConfirmedTool(runId, toolUseId, user)`, `recordAudit(...)`.

**Build tasks:**
1. Migration 0094 (`agent_runs`, `agent_audit`) + apply script + `pnpm tsc`.
2. `registry.ts` + 6 read tools (listTasks, weeklyGoalStatus, dccToday, attendanceToday, ambassadorPipeline, outstandingReceivables) wrapping existing queries. Unit-test each tool's schema + that it calls the right query.
3. `anthropic.ts` (add `@anthropic-ai/sdk`; `ANTHROPIC_API_KEY` env) + system prompt + prompt caching.
4. `loop.ts` manual loop with read-only tools first; SSE `app/api/agent/route.ts`.
5. Add 3 gated write tools (createTask, assignTasks, nudge) with `confirm: true` + the confirm endpoint + audit.
6. Eval harness `tests/agent/eval.test.ts` — golden prompts → assert expected tool selection (mock the model OR run live behind a flag).

**Testing/checks:** unit (tool schemas + RBAC pass-through: a non-manager's `assignTasks` tool rejects out-of-scope doers); eval harness (10 golden prompts); audit row written per tool call; kill-switch `AGENT_OFF` returns a friendly disabled message; cost recorded in `ai_usage` (after F4).

**Exit gate:** ⌘K-less API can answer "what are my tasks today?" (read) and "create a task for X" (write→confirm→applied→audited), as the signed-in user, with RBAC enforced and tokens metered.

### F2 — Unified marketing data

**Purpose:** Close the small gaps so the marketing pipeline is one queryable graph. ~70% already exists (Ambassadors `amb_referrals`/`amb_payouts`, People Gives `pg_introductions`, Incentive module). Add the missing top-of-funnel + campaigns + rules-as-data.

**Files / schema (migration `0095_marketing_graph.sql`):**
- `leads` (id, name, company, contact_phone, contact_email, source, status [new|contacted|qualified|converted|lost], owner_id→employees, score numeric, enriched_json, created_by, timestamps). Promotes into an `amb_referral` on assignment (add `leads.referral_id` nullable).
- `campaigns` (id, name, type [PSO|BSU|BSS|consulting|other], host_id→employees, scheduled_at, status, notes) + `campaign_attendees` (campaign_id, lead_id?, ambassador_id?, prospect fields).
- `incentive_rules` (id, code, label, event [lead_qualified|referral_made|ps_sold|bss_sold|consulting_sold|content_*], condition_json, threshold int, amount numeric(14,2), requires_payment_received bool, requires_approval bool default true, active bool). Seed from the incentive sheet.
- `incentive_ledger` (id, rule_id, employee_id, lead_id?/referral_id?, amount, status [pending|approved|released|void], evaluated_at, approved_by?, released_by?, payout_ref?). (Distinct from `amb_payouts` which is ambassador-side; this is the participant/intern incentive ledger.)
- Extend `tasks` already has `amb_referral_id`; add `leads.campaign_id`.

**Build tasks:** migration + apply + types; backfill `incentive_rules` from the sheet via a `scripts/import-incentive-rules.ts`; `lib/queries/marketing.ts` (listLeads, getLead, listCampaigns, listIncentiveRules, incentiveLedger) all `withRetry`; pure helpers `lib/marketing/lead-stage.ts` (validateLeadTransition) + unit tests.

**Testing/checks:** migration idempotent (re-run clean); rules backfill totals match the sheet; lead→referral promotion creates the `amb_referral` + links back; data-layer e2e (seed lead→qualify→assert→clean).

**Exit gate:** the marketing graph is queryable end-to-end (lead → campaign → referral → sale → incentive) and the incentive rules are data.

### F3 — Integrations layer

**Purpose:** Outbound/inbound channels + payment + enrichment, each a thin, mockable adapter with a kill-switch. (Calendar already exists in `lib/google/calendar.ts`.)

**Adapters (each `lib/integrations/<x>.ts` with a typed interface + a fake for tests):**
- `whatsapp.ts` — Meta WhatsApp Business API: `sendMessage`, `sendTemplate`, `sendMedia`; inbound webhook `app/api/whatsapp/webhook/route.ts` (HMAC-verify, dedupe). Env: `WABA_TOKEN`, `WABA_PHONE_ID`, `WABA_VERIFY_TOKEN`, `WABA_APP_SECRET`.
- `voice.ts` — Twilio (or OneAI) outbound call + TTS + recording callback `app/api/voice/callback/route.ts`. Env: `TWILIO_*`. **Compliance built in** (see §12): DND/consent check before dialing, IST call-window enforcement, opt-out handling, full recording+transcript audit.
- `payments.ts` — Razorpay/Stripe Payouts adapter: `createPayout` is **only** callable from the human-release action (M7); never from the agent loop. Env: `RAZORPAY_*`/`STRIPE_*`.
- `enrichment.ts` — lead-enrichment/discovery connector (see M5): a provider-abstracted `enrichContact` + `discoverProspects` with rate-limiting, caching, and a ToS/robots-aware fetch policy. Env: provider keys.

**Build tasks:** one adapter at a time, each with: typed interface, real impl, in-memory fake, unit tests against the fake, a `/api/.../webhook` where inbound, signature verification, and a kill-switch.

**Testing/checks:** webhook signature verification (reject forged); idempotent inbound (dedupe by provider message id); adapters never called when their kill-switch is on; secrets only server-side; payments adapter has NO agent-reachable path.

**Exit gate:** can send/receive a WhatsApp message (sandbox), place a test call (sandbox), and the payout adapter exists but is reachable only from M7.

### F4 — Observability, cost metering, flags

**Purpose:** Know what the AI is doing and what it costs; flip features safely.
**Files/schema:** `ai_usage` (id, user_id, feature, model, input_tokens, output_tokens, cost_estimate, created_at) migration `0096`; `lib/agent/meter.ts` (`recordUsage` from every LLM call — wrap the Anthropic + Gemini clients); `lib/flags.ts` (env-var feature flags + per-surface kill-switches); an admin `/admin/ai-usage` page (daily tokens/cost by feature). **This directly answers "how many API calls" going forward.**
**Testing/checks:** every agent + Gemini call writes an `ai_usage` row (assert in e2e); the admin page sums correctly; flags default safe (off) until explicitly enabled.
**Exit gate:** a live dashboard of AI calls + cost by feature, and a kill-switch you can flip without a redeploy where possible.

---

## LAYER 1 — SURFACES

### M1 — Copilot (⌘K + chat dock)
**Purpose:** The headline. Ask anything / do anything from the keyboard.
**Files:** `components/agent/copilot-dock.tsx` (client; streams SSE from `/api/agent`, renders text + tool-confirm cards), hook into the existing ⌘K palette (`components/header/global-search.tsx` → add an "Ask Altus" mode), `components/agent/confirm-card.tsx` (renders a write tool's diff + Approve/Cancel).
**Depends on:** F1, F4.
**Build tasks:** SSE client + streaming render; ⌘K "Ask" mode; confirm cards for write tools; keyboard-first (Enter submit, Esc cancel, arrow through suggestions); mobile dock.
**Testing/checks:** authed-render (dock opens, a read query streams an answer); a write proposal renders a confirm card and only writes on Approve; reduced-motion; tsc/build.
**Exit gate:** "assign 3 tasks to each of Rohan's team" → drafts 12 → Approve → created + audited, from ⌘K.

### M2 — WhatsApp Agent
**Purpose:** Meet the team + prospects where they live. Inbound qualification, nudges, voice-note logging, manager-assign-by-text.
**Files:** `app/api/whatsapp/webhook/route.ts` (inbound → resolve sender→employee/lead → run agent loop with a WhatsApp system prompt → reply via adapter), `lib/agent/surfaces/whatsapp.ts` (maps a WhatsApp thread to an `agent_run`; voice notes → Gemini transcribe → text), `lib/whatsapp/nudge.ts` (outbound nudges, reuse notification spine), templates in `lib/whatsapp/templates.ts` (exists).
**Depends on:** F1, F3.whatsapp, F2 (leads), Gemini transcribe (exists).
**Build tasks:** webhook → agent loop; sender resolution (phone→employee or new lead); voice-note → transcript → intent; write actions gated (a manager assigning tasks gets a WhatsApp confirm step); outbound nudge cron; opt-out handling.
**Testing/checks:** signature-verified + idempotent inbound; "what are my tasks today?" returns the user's tasks; a voice note logs a lead/checklist; non-managers can't assign; opt-out stops messages; kill-switch.
**Exit gate:** an employee runs their day from WhatsApp; a manager assigns tasks by text; a prospect gets qualified into a `lead`.

### M3 — Voice / AI Calling Agent (compliance-gated)
**Purpose:** Outbound AI calling for qualification/reminders at scale.
**Files:** `lib/agent/surfaces/voice.ts` (call script from lead context; Twilio dial; stream/transcribe; update lead), `app/api/voice/callback/route.ts`, `lib/voice/compliance.ts` (DND registry check, consent record, IST window, max-attempts, opt-out).
**Depends on:** F1, F3.voice, F2.
**Build tasks:** compliance pre-flight (block if on DND / no consent / outside window) → dial → AI pitch + Q&A → transcribe → score lead → warm-transfer to a human rep or schedule a follow-up task + calendar event; full recording+transcript stored + audited; per-call human review queue.
**Testing/checks:** compliance gate blocks disallowed calls (unit); no call without consent; transcripts audited; opt-out persists; kill-switch `VOICE_AGENT_OFF`. **§12 compliance review is a hard exit requirement here.**
**Exit gate:** a sandbox call qualifies a lead, logs the transcript, and either books a follow-up or hands off — only when compliant.

---

## LAYER 2 — MARKETING / SALES

### M4 — Lead Lifecycle (capture → enrich → qualify → score → route)
**Purpose:** The funnel state machine on top of F2.
**Files:** `app/(app)/leads/*` (list/board/detail), `app/(app)/leads/actions.ts` (createLead, qualifyLead, convertLead→promote to referral, routeLead), `lib/agent/tools/leads.ts` (lead tools), `components/leads/*` (kanban by status, detail).
**Depends on:** F1, F2, M14 (scoring), M5 (enrich).
**Build tasks:** lead board + CRUD; stage transitions (validated); auto-enrich on create (M5); score on signal change (M14); route to salesperson by load/territory; promote qualified lead → `amb_referral`.
**Testing/checks:** stage-machine unit tests; RBAC (owner/manager/admin); promotion creates referral; data-layer e2e; authed render.
**Exit gate:** a lead flows new→qualified→converted, scored + routed, and becomes an ambassador referral.

### M5 — Lead Discovery (scraping/enrichment, guardrailed)
**Purpose:** Surface prospects from LinkedIn/social/event rosters/BNI lists; enrich contacts.
**Files:** `lib/integrations/enrichment.ts` (F3), `app/api/cron/lead-discovery/route.ts` (daily), `lib/leadgen/sources/*.ts` (per-source connector), `lib/leadgen/dedupe.ts`.
**Depends on:** F3.enrichment, F2.
**Build tasks:** per-source connectors with **rate-limiting + caching + robots/ToS-aware fetch + provider-API-first** (prefer official/licensed data APIs over raw scraping); dedupe vs existing leads/contacts; create `leads` with `source` + `enriched_json`; a review queue (no auto-outreach until a human or the qualification agent vets). Kill-switch `LEADGEN_OFF`.
**Testing/checks:** dedupe correctness; rate-limit respected; disallowed sources skipped; discovered leads land in a review queue, not straight to outreach; PII handling per §12.
**Exit gate:** a daily run adds deduped, enriched leads to the review queue.

### M6 — Incentive Engine (event-driven, rules-as-data)
**Purpose:** Auto-evaluate the incentive rules on pipeline events → create **pending** ledger entries. No money moves here.
**Files:** `lib/incentive/engine.ts` (pure `evaluate(event, rules, context) → LedgerDraft[]`), `lib/incentive/events.ts` (emit on lead_qualified/sale_recorded/payment_received/content_*), wired into the relevant actions (qualifyLead, referral won, outstanding payment-received), `app/(app)/incentives/*` (rules admin + ledger), `app/api/cron/incentive-sweep/route.ts` (daily backstop + payment-received gates).
**Depends on:** F2, F4.
**Build tasks:** pure evaluator + unit tests (each rule from the sheet → expected payout); event hooks; ledger UI (pending/approved/released); live per-participant progress ("₹900 earned, 2 leads to ₹100"); daily sweep for `requires_payment_received` rules.
**Testing/checks:** evaluator unit tests cover every rule + edge (threshold not met, payment not received, duplicate event idempotency); ledger never auto-releases money; data-layer e2e.
**Exit gate:** a qualifying event creates the right pending ledger entry; participants see live progress.

### M7 — Payout Release (human-approved)
**Purpose:** A human reviews pending incentives/commissions and releases payment.
**Files:** `app/(app)/incentives/payouts/*` (review queue → batch approve → release), `app/(app)/incentives/payout-actions.ts` (`approve`, `release` → calls `payments.createPayout` from F3, records `released_by` + `payout_ref`, supports undo/void before settlement).
**Depends on:** F3.payments, M6, Ambassadors `amb_payouts` (reuse for partner side).
**Build tasks:** review queue (filter pending), approve step, release step (the ONLY caller of the payment adapter), idempotent (no double-release), undo/void window, full audit, RBAC (finance/admin only).
**Testing/checks:** double-release prevented (idempotency key); only finance/admin can release; release writes audit + payout_ref; agent has NO path to this; sandbox gateway e2e.
**Exit gate:** a human approves + releases a batch of incentives/commissions with audit; no automated path exists.

### M8 — Content Automation (human-approved)
**Purpose:** Draft marketing content — PSO/BSU broadcasts, follow-up emails, social posts, case-study/interview drafts — for human approval.
**Files:** `app/(app)/marketing/content/*` (compose with AI → edit → approve → send/schedule), `lib/agent/tools/content.ts` (draftBroadcast, draftFollowup, draftPost), uses Gemini Flash for drafting (cheap) + Claude for higher-stakes.
**Depends on:** F1, F3.whatsapp (for broadcast send), Calendar.
**Build tasks:** content composer (brief → draft → human edit), brand-voice system prompt, approval gate, schedule/send (WhatsApp broadcast / email), template library.
**Testing/checks:** nothing sends without approval; brand-voice prompt fixtures; broadcast respects opt-outs; audit.
**Exit gate:** a PSO broadcast is drafted by AI, edited, approved, and scheduled — never auto-sent.

### M15 — Ambassador / Referral Automation
**Purpose:** Layer agent actions onto the existing Ambassadors module (next-best-action coaching, auto-nudges, stalled-referral chase drafts).
**Files:** `lib/agent/tools/ambassadors.ts` (already partly via M-Ambassadors), `lib/ambassadors/nba.ts` (next-best-action per partner), extend `app/api/cron/ambassador-reminders` (exists) with AI-drafted nudges.
**Depends on:** F1, Ambassadors (built), M2 (WhatsApp delivery).
**Build tasks:** NBA computation per ambassador (from pipeline+score+recency); draft the nudge; owner approves → send via WhatsApp; chase drafts for stalled referrals.
**Testing/checks:** NBA deterministic given fixture data; nudges gated by owner approval; audit.
**Exit gate:** each ambassador's owner gets the single best weekly action + a one-tap approved nudge.

---

## LAYER 3 — INTELLIGENCE

### M9 — Morning Brief
**Purpose:** Role-aware AI exec brief every morning (in-app + WhatsApp + optional voice).
**Files:** `app/api/cron/morning-brief/route.ts` (daily), `lib/intelligence/brief.ts` (per-role prompt + data gather), `components/intelligence/brief.tsx`, `briefs` table (user_id, date, role, body, metrics_json).
**Depends on:** F1, F4, M14 (attribution feeds it), all read tools.
**Build tasks:** role prompts (founder/manager/employee); daily cron generates + stores; in-app view + WhatsApp delivery; reduced-motion; opt-in voice readout.
**Testing/checks:** brief generated per active user; numbers match source queries (spot-check); cost metered; kill-switch.
**Exit gate:** Manan gets a 6-number company pulse + risks + decisions every morning.

### M10 — Cash / Receivables Forecasting
**Purpose:** Predict collections from Outstanding + Ambassadors pipeline + payment cycles; collections autopilot (draft chases, human-approved).
**Files:** `lib/intelligence/forecast.ts` (forecast model — start transparent: cycle-based + weighted pipeline), `app/(app)/outstanding/forecast/page.tsx`, chase-draft tool (reuses M8 approval).
**Depends on:** Outstanding (built), Ambassadors (built), F1.
**Build tasks:** forecast computation + unit tests (deterministic on fixtures); forecast page (chart + "chase these 5 first" + draft follow-ups); collections autopilot drafts (human-approved send).
**Testing/checks:** forecast math unit-tested; chase drafts never auto-send; data-layer e2e.
**Exit gate:** "₹X by month-end, ₹Y at risk, chase these 5" with one-tap approved follow-ups.

### M11 — Anomaly Watch
**Purpose:** Daily sweep flags attendance dips, collection slippage, goal-completion drops, ambassador churn, DCC non-compliance → proactive alert + recommended action.
**Files:** `app/api/cron/anomaly-watch/route.ts`, `lib/intelligence/anomaly.ts` (detectors per stream — statistical thresholds, transparent), alert via notification spine + WhatsApp.
**Depends on:** F1, F4, all read tools.
**Build tasks:** per-stream detectors (z-score / week-over-week deltas — reuse existing transforms); alert with a recommended action (a draft tool call); dedupe alerts.
**Testing/checks:** detectors unit-tested on fixtures (true/false positives); alerts deduped; kill-switch.
**Exit gate:** a real dip (e.g., collections down 30% WoW) surfaces an alert + a recommended action.

### M12 — Ask-the-Business (NL analytics)
**Purpose:** "Revenue by salesperson this quarter vs last" → safe read-only query → chart.
**Files:** `lib/agent/tools/analytics.ts` (a **whitelisted/parameterised** read-only query tool — NOT free SQL; uses programmatic-tool-calling over a curated set of aggregations), `components/agent/chart-render.tsx`.
**Depends on:** F1.
**Build tasks:** a constrained analytics tool surface (predefined aggregations with parameters, or a read-only sandboxed query with column/row caps + timeouts); render result as a chart inline in the Copilot.
**Testing/checks:** the tool cannot mutate or read out-of-scope data (RBAC); query timeouts + row caps; injection-safe; eval harness for common questions.
**Exit gate:** a plain-English analytics question returns a correct chart, safely.

### M14 — Attribution + Lead Scoring (data science)
**Purpose:** Multi-touch attribution over the unified graph + transparent lead-conversion scoring.
**Files:** `lib/ds/attribution.ts` (touch→sale attribution), `lib/ds/lead-score.ts` (transparent logistic/rules model over engagement signals), `scripts/train-lead-score.ts` (offline fit from history), `lead_score_model` config table.
**Depends on:** F2, M4.
**Build tasks:** attribution computation (first/last/linear/weighted) + unit tests; lead-score features + a transparent model (coefficients stored as config, explainable); periodic re-fit script; surface score on the lead + "why this score."
**Testing/checks:** attribution sums to 100% of credit; score reproducible from features; model explainability (top contributing signals shown); backtest accuracy reported.
**Exit gate:** every won sale shows its attribution; every lead shows a score + reasons.

---

## LAYER 4 — WORKFLOWS

### M13 — Meeting → Action
**Purpose:** Drop a recording/notes → extract decisions → create tasks/goals + schedule follow-ups (rides Calendar sync).
**Files:** `app/(app)/meetings/*` (upload → AI extract → review → apply), `lib/agent/tools/meeting.ts`, uses Gemini transcribe (exists) + Claude extract.
**Depends on:** F1, Calendar (exists), tasks/goals tools.
**Build tasks:** upload + transcribe; extract action items (owner, due, type); review screen (edit before apply); apply → create tasks/goals + calendar events (human-confirmed batch).
**Testing/checks:** extraction fixtures; nothing applied without review; created tasks calendar-sync; audit.
**Exit gate:** a meeting recording becomes a reviewed set of assigned, scheduled tasks.

---

## LAYER 5 — PERFORMANCE

### M16 — Performance Management System (PMS) + Performance Audit  → **SPLIT OUT (separate initiative)**

> **2026-06-29: PMS is now its own track, executed separately and first — NOT part of this agentic build plan.** The founder flagged it as "totally different." Its real design comes from a dedicated brainstorm + spec (not this sketch). The notes below are retained only as an early reference; the authoritative PMS plan will live in its own `docs/superpowers/specs/…-pms-*.md`. Remove the PMS row from this plan's phasing.

<details><summary>(superseded early sketch — see the dedicated PMS spec instead)</summary>

**Purpose:** Formal performance management — scorecards, review cycles, goal cascade, 360s, and an AI-assisted **performance audit** — built on the signals we already capture (DCC, weekly goals + daily goal-actuals, tasks, attendance, incentives, ambassador/sales outcomes).
**Files / schema (migration `0097_pms.sql`):**
- `pms_cycles` (id, name, period_start, period_end, status), `pms_scorecards` (id, cycle_id, employee_id, composite_score, dimension_scores_json, status), `pms_reviews` (id, scorecard_id, reviewer_id, type [self|manager|peer|skip], ratings_json, narrative, submitted_at), `pms_goals` (cascade link to weekly_goals), `pms_audit_findings` (id, cycle_id, scope, finding, severity, evidence_json).
- `lib/pms/scoring.ts` (pure composite from DCC compliance % + goal attainment + on-time task % + attendance + incentive/sales outcomes — weights configurable) + unit tests.
- `lib/pms/audit.ts` (AI-assisted audit: detect inconsistencies — e.g., high self-rating vs low DCC; goals never updated; sandbagged targets; review-bias patterns).
- `app/(app)/pms/*` (cycle dashboard, per-person scorecard, review forms, calibration view, audit findings), `app/api/cron/pms-*` (reminders).
**Depends on:** DCC (built), Weekly Goals + daily actuals (built), Tasks, Attendance, Incentives (M6), M3.x intelligence (M5/M14 for outcomes), F1 (AI review drafts).
**Build tasks:**
1. Schema + scoring pure-fn + unit tests (composite from real signals).
2. Cycle lifecycle (open → self/manager/peer reviews → calibration → close).
3. Scorecard auto-populated from data; AI-drafted manager review (from the quarter's actuals — we now have daily goal-actuals) for human edit.
4. Calibration view (rank/normalize across a manager's team).
5. **Performance Audit:** AI sweep for inconsistencies + bias + data-integrity findings; severity-ranked; evidence-linked.
6. Employee self-view ("how am I doing + concrete next actions").
**Testing/checks:** scoring unit-tested on fixtures (each dimension + composite); RBAC (employee sees self, manager sees downline, calibration admin-only); AI review drafts are editable + never auto-submitted; audit findings cite evidence; data-layer e2e; authed render.
**Exit gate:** a full review cycle runs — scorecards auto-built from real data, AI-drafted reviews edited by managers, calibrated, closed — plus an audit report of performance-data inconsistencies.

</details>

---

## 12. Cross-cutting: Security, Compliance, Cost

**Security/RBAC:** agent runs as user; every tool reuses existing guards; no raw-SQL tool (M12 is whitelisted/sandboxed read-only); secrets server-only; every action audited; per-surface kill-switches.
**Calling compliance (M3):** DND-registry pre-check, recorded consent before AI calling, IST call-window enforcement, max-attempt caps, immediate opt-out honoring, recording+transcript retention policy. **Legal sign-off is a hard gate before M3 goes live.**
**Scraping/enrichment compliance (M5):** prefer official/licensed data APIs; robots/ToS-aware; rate-limited + cached; PII minimization + retention policy; review queue before any outreach.
**Payments (M7):** human-released only; idempotency keys; no card/bank data stored in our DB (gateway tokens only); finance/admin RBAC; undo/void window; full audit.
**PII/data:** minimize stored personal data; encryption at rest for sensitive fields (reuse the Accounts AES-GCM pattern); retention windows; right-to-delete path.
**Cost:** prompt-cache system+tools (≈0.1× on the big prefix); Gemini Flash/Haiku for cheap work; `effort` tuning; gate agent runs behind explicit intent; per-feature budgets + alerts via `ai_usage` (F4).

## 13. Phased execution order (with exit gates)

| Phase | Modules | Exit gate |
|---|---|---|
| **P0 Foundations** | F1, F2, F4 (F3 adapters as needed) | Agent answers + acts (read+write→confirm) as user, metered + audited; marketing graph queryable |
| **P1 Copilot** | M1 | Run the company from ⌘K |
| **P2 Reach** | F3.whatsapp → M2; F3.voice → M3 (after legal) | Team runs day on WhatsApp; compliant AI calls qualify leads |
| **P3 Funnel** | M4, M5, M14, M15 | Leads captured→enriched→scored→routed→referral; attribution live |
| **P4 Money & Content** | M6, M7, M8 | Incentives auto-computed (pending), human-released; AI-drafted approved broadcasts |
| **P5 Intelligence** | M9, M10, M11, M12, M13 | Morning brief, forecasting, anomaly alerts, NL analytics, meeting→action |

*(PMS + Performance Audit was removed from this plan on 2026-06-29 — it is a separate, standalone initiative with its own spec, executed first.)*

Each module ships independently via `ship.sh` once its exit gate + the standard 6 verification checks pass.

---

## 14. Self-review (coverage / placeholders / consistency)

- **Coverage:** every roadmap item is a module — Copilot(M1), Morning Brief(M9), WhatsApp(M2), Cash(M10), Performance Intelligence→**PMS(M16)**, Meeting→Action(M13), Anomaly(M11), Ask-the-Business(M12); marketing layer (leads M4, discovery M5, incentive engine M6, payouts M7, content M8, ambassador automation M15, attribution/scoring M14); foundations F1–F4; voice M3. Dropped items (auto-payout, Telegram/Slack, public REST/GraphQL, model zoo) are intentionally absent and noted in Global Constraints.
- **Accepted-with-guardrails:** cold-calling (M3 + §12 legal gate), scraping (M5 + §12 ToS/PII), content-gen (M8 + human approval) — included per founder decision, each with its safeguard.
- **No placeholders:** each module names exact files, schema, dependencies, build tasks, and explicit testing/exit gates. (Per-line TDD is deferred to per-module sub-plans at execution time — this is the program plan; the codebase's verification standard from Global Constraints applies to each.)
- **Consistency:** migration numbers sequential (0094 agent, 0095 marketing, 0096 ai_usage, 0097 pms); `incentive_ledger` (participant) vs `amb_payouts` (ambassador) kept distinct; the payment adapter is reachable only from M7 everywhere it's mentioned.
