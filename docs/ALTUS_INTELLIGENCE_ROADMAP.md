# Altus Intelligence — Agentic AI & Flagship Module Roadmap

**Author:** Hetesh + Claude · **Date:** 2026-06-28 · **Status:** Vision/architecture for review.

> The thesis in one line: **Altus already has the data and the modules — the next leap is an AI layer that doesn't just *show* you the business, it *runs* errands across it.** Turn the WMS from a system-of-record into a system-of-action.

---

## 0. Where we are (the moat we've already built)

Eighteen months of WMS work means we have something most companies our size don't: **one clean database with every operational signal in it.** Tasks, weekly goals, daily checklists, DCC KPIs, attendance, salary, the Ambassadors partner pipeline, Outstanding receivables, People Gives, Training, Accounts — all in one Postgres, all behind one typed data layer (`lib/queries/*`, server actions), all permission-aware (`requireUser`, `loadWritable*`, workspace gates), all already searchable (⌘K, pg_trgm/tsvector). Gemini is wired (`lib/ai/gemini.ts`). Google Calendar + nightly backup run on crons.

**That data layer is the unlock.** Every function we wrote to render a page is also a *tool an AI agent can call*. We don't need to "add AI" — we need to give Claude a steering wheel onto the platform we already built. That's the whole roadmap.

---

## PART A — The Agentic Core: "Altus Copilot"

One AI layer, surfaced everywhere, that can **read and act** across every module on behalf of the signed-in user — within their permissions.

### A.1 What it feels like
- Press ⌘K and type, or tab to a chat dock, or text the Altus WhatsApp number:
  - *"What's at risk this week?"* → it reads goals + DCC + receivables and answers with the 4 things actually slipping.
  - *"Assign 3 tasks each to Rohan's team for the Shastra launch."* → it drafts 12 tasks, shows them, you hit Enter, they're created + calendar-synced.
  - *"Who hasn't filled their DCC today?"* → a list, with one tap to nudge them on WhatsApp.
  - *"Summarise the Ambassadors pipeline and tell me who to chase."* → narrative + the 3 highest-value stalled referrals.

### A.2 Architecture (real, not hand-wavy)

```
 ⌘K / chat dock / WhatsApp ──▶  /api/agent (Claude tool-use loop)
                                      │
                    Claude Opus 4.8 (adaptive thinking, effort=high)
                                      │  tool calls
        ┌─────────────────────────────┼──────────────────────────────┐
   READ tools                    WRITE tools (gated)            ANALYTICS tool
   listTasks, goalStatus,        createTask, assignTasks,       safeReadQuery
   ambassadorPipeline,           setGoal, recordPayout,         (parameterised,
   receivables, dccToday,        logActivity, nudge,            read-only SQL →
   attendanceToday, …            createFollowUpTask             chart)
        └─────────────────────────────┼──────────────────────────────┘
                       the EXISTING lib/queries + actions layer
                       (runs AS the user → inherits RBAC + audit)
```

- **Model:** `claude-opus-4-8` for the agent's reasoning/tool loop (adaptive thinking, `effort: "high"`, `xhigh` for hard multi-step asks). It's the strongest tool-use/agentic model and the platform is already Claude-native. **Keep Gemini 2.5 Flash** (already wired, free tier) for cheap, high-volume, non-agentic work — bulk summaries, voice transcription, the per-record AI summaries we already ship. Haiku 4.5 is the cost option for simple structured calls. *Right tool per job, not one model for everything.*
- **Tools = our data layer, curated.** Each tool is a thin wrapper over an existing `lib/queries/*` read or a server action, with a typed JSON schema. Reads are parallel-safe and unrestricted (already permission-scoped). Writes are **dedicated, gated tools** (the agent-design "promote to a tool so the harness can gate/audit it" pattern) — never a raw SQL escape hatch.
- **Permissions for free.** The agent executes inside a normal authenticated request, so every tool reuses `requireUser` / `loadWritableAmbassador` / `goalScopeFor` / workspace gates. A salesperson's Copilot literally cannot touch another team's data — the same code that guards the UI guards the agent.
- **Human-in-the-loop on every write.** Destructive or outward-facing actions (create tasks, record a payout, send a WhatsApp nudge) use the **manual tool-use loop** with a confirmation gate: the agent proposes, the UI renders the diff, the user approves. Reads stream instantly; writes wait for a tap. Everything writes an audit row.
- **Cost control.** Prompt-cache the (stable) system prompt + tool definitions so each turn pays ~0.1× on the big prefix; only the conversation tail is full-price. Gate expensive agent runs behind explicit user intent (never on a page load). Off the dashboard load path entirely — `DB_LOAD_PATH` stays sacred.
- **Hosting:** the **Claude API tool-use loop inside Next.js route handlers** for interactive use (we host the compute, data stays in our VPC, we own the write-gates). For **scheduled / long-horizon** runs (the Morning Brief, overnight anomaly sweeps) a daily cron route runs the same loop — or graduate to **Claude Managed Agents** when we want Anthropic to run a multi-step container (e.g. "build this month's board deck").
- **Memory:** structured data is read live via tools (no stale RAG). For documents (Ambassador files, Accounts CA-handover, Training materials) add one retrieval tool over embeddings. A small per-user memory ("Manan prefers numbers first, no preamble") makes it feel personal.

### A.3 Why this is the foundation, not a feature
Build the tool registry + loop + gate + audit **once**, and every module below is "add 2 tools + a prompt." The Copilot is the platform; the modules are apps on it.

---

## PART B — The flagship modules (the jaw-drops)

Each is built on Part A's tool layer. Ordered roughly by impact-per-effort.

### B1. Altus Copilot ⌘K + chat dock *(the headline)*
"Ask anything, tell it to do anything." The single most visible AI feature. First build target.

### B2. The Morning Brief — daily executive intelligence
Every morning a cron runs the agent per person and writes a **role-aware brief**:
- **Manan:** company pulse in 6 numbers, what's at risk, who's behind, ₹ owed + ₹ at risk, top 3 opportunities, top 3 decisions to make today.
- **A manager:** their team's pulse, who needs a nudge, which goals are slipping.
- **An employee:** today's 5 commitments + what's overdue, framed as a plan.

Delivered in-app + WhatsApp + optionally read aloud. **This replaces "open 6 dashboards and squint."** It's the feature Manan will feel every single morning.

### B3. The WhatsApp Agent — meet the team where they live
The team runs on WhatsApp. An Altus number that:
- Answers "what are my tasks today?" / "mark #1042 done" / "I'm on leave today."
- Fills the **daily checklist by voice note** (Gemini transcribe → plan).
- Lets a manager assign tasks by text ("give Danyal 3 tasks for the audit").
- Nudges people who haven't punched in / filled DCC / updated goals.

This is a genuine jaw-drop: it **structures the WhatsApp chaos we've been trying to kill** instead of fighting it. (Webhook → agent loop → reply. Outbound nudges already have a notification spine.)

### B4. Revenue & Cash Intelligence — see the money before it moves
Predictive layer over Outstanding + Ambassadors + payment cycles:
- **Cash-flow forecast:** "₹X expected by month-end, ₹Y at risk, here are the 5 receivables to chase first and the draft follow-ups."
- **Pipeline → revenue:** Ambassadors' weighted pipeline projected to closed commission.
- **Collections autopilot:** the agent drafts the chase message per overdue client; you approve; it logs + schedules the follow-up task.

### B5. Performance Intelligence + Auto-coaching
Per-person narratives from DCC + weekly goals + tasks + attendance:
- Who's thriving, who's slipping, **early attrition-risk signals** (DCC drop + goal stall + attendance dip).
- Manager review drafts auto-generated from the quarter's actual data (we already store goal actuals daily now).
- A private "how am I doing?" view for each employee with concrete next actions.

### B6. Meeting → Action
Drop a meeting recording or notes → agent extracts decisions, **creates the tasks, assigns them, sets goals, schedules follow-ups** (rides the Google Calendar sync we just hardened). The gap between "we discussed it" and "it's in the system" disappears.

### B7. Anomaly Watch
A daily agent sweep over every stream — attendance dips, collection slippage, goal-completion drops, Ambassador churn, DCC non-compliance — that **proactively flags + recommends an action** (in-app + WhatsApp), instead of waiting for someone to notice on a dashboard.

### B8. "Ask the Business" — natural-language analytics
"Revenue by salesperson this quarter vs last" → the agent uses a **safe read-only query tool** (parameterised / programmatic-tool-calling, never free SQL) → runs it → renders a chart inline. Self-serve BI without building 50 dashboards.

---

## PART C — Build order

| Phase | Ships | Why first |
|---|---|---|
| **1 — Agentic core + Copilot (B1)** | tool registry, tool-use loop, write-gate + audit, ⌘K command + chat dock, ~12 read tools + ~5 gated write tools | The platform everything rides. Immediately demo-able ("watch me run the company by typing"). |
| **2 — Morning Brief (B2) + WhatsApp Agent (B3)** | daily brief cron + role prompts; WhatsApp webhook + voice checklist | Highest *daily-felt* impact; meets the team on WhatsApp; the "I can't go back" features. |
| **3 — Cash Intelligence (B4) + Performance Intelligence (B5)** | forecasting queries + collections autopilot; per-person narratives + review drafts | The executive jaw-drop — money and people, predicted. |
| **4 — Meeting→Action (B6), Anomaly Watch (B7), Ask-the-Business (B8)** | the proactive + analytical layer | Compounds on the foundation; turns Altus from reactive to anticipatory. |

Each phase is independently shippable and independently impressive.

## D. Cost, safety, load (the honest part)

- **Cost:** Opus API isn't free, but prompt caching (stable system+tools prefix at ~0.1×), Gemini Flash/Haiku for cheap bulk work, `effort` tuning, and gating agent runs behind explicit intent keep it modest — and dwarfed by the hours saved. We'll meter per-feature spend.
- **Safety:** agent runs as the user (full RBAC), every write is human-confirmed + audited, no raw-SQL tool (only parameterised/whitelisted reads), outward actions (WhatsApp) double-gated. Kill-switch per surface, like our gate features.
- **Load:** 100% off the dashboard load path. Agent work is on-demand or on daily crons (the only cadence Vercel allows us). The DB pool stays untouched — the lesson we've already paid for.

## E. Why this is the career move (the pitch to Manan)

This isn't "we added a chatbot." It's **Altus becoming an AI-native company**:
- **Hours back, daily:** no more checking six dashboards, no manual task assignment, no WhatsApp archaeology. The Morning Brief + Copilot alone save every manager real time every day.
- **Money protected:** receivables chased on time, Ambassadors retained, cash forecast instead of guessed.
- **Decisions faster & better:** the business answers questions in plain English, in seconds.
- **A moat, and maybe a product:** the same engine that runs Altus could be sold to every other firm that lives on WhatsApp and spreadsheets. We'd have built an operating system, not a dashboard.

Hetesh is the architect of that transformation. That's the raise.

---

*Next step: pick the Phase-1 scope (which ~12 read tools + ~5 write tools to expose first) and the first surface (⌘K vs WhatsApp), then this becomes a build spec.*

---

# PART F — The Marketing & Sales Agentic Layer (founder's cut)

A full agentic-marketing vision (lead capture → qualify → convert → reward, all agent-driven) was drafted. Below is the **founder's edit**: what we keep because it builds on what we already own, what I'm adding, and — just as important — **what we are deliberately NOT building** (the discipline is in the cuts).

## F.1 The unify-don't-rebuild insight
We do **not** need a new CRM or a public REST/GraphQL layer. ~70% of the proposed "unified marketing data model" already exists:

| Proposed entity | Already in Altus |
|---|---|
| Referral, Ambassador, Commission, Payout | **Ambassadors module** — `amb_referrals` (prospect = the lead), `amb_ambassadors`, `amb_products`, `amb_payouts` (+ settle ledger), `amb_activities` |
| Contact / Intro | **People Gives** — `pg_introductions` |
| IncentiveRule, Payout | **Incentive module** + `weekly_goals.incentive_type` / `incentive_catalog` |
| Task, Employee, Goal | **WMS** core |
| Receivables / "payment received" gates | **Outstanding** |

**The two real gaps to add (small):**
1. **Campaign / Event** table (PSO · BSU · BSS sessions) — date, type, host, attendees, linked referrals. Today these live only in free text.
2. **Top-of-funnel Lead** — a lightweight `leads` row (name/contact/source/status) that **promotes into an `amb_referral`** when it gets assigned to an ambassador/owner. (Don't duplicate the pipeline — leads are the stage *before* a referral.)

Plus one upgrade: **make incentive rules data, not code.** An `incentive_rules` table (condition + threshold + amount + approval-required flag) so the engine — and the agent — can evaluate them. Today the rules from the incentive sheet are half-hardcoded.

## F.2 The event-driven incentive engine (high ROI, low risk)
The marketing program reduces to a handful of quantifiable triggers: **qualified leads (₹100/10), referral calls (₹250/10), PS/BSS sales (₹250–₹2000 with payment-received gates), consulting pitches/sales.** Model them as `incentive_rules` and fire on state change:

`Lead.qualified` / `Referral.created` / `Sale.recorded & payment_received` → evaluate matching rules → **create a Payout in `pending` (never auto-paid)** → notify finance. This is exactly the referral-automation pattern, and it rides our existing notification + daily-cron spine. No manual incentive tracking ever again.

## F.3 Agentic use-cases — KEEP (built on Part A's tool layer)
- **WhatsApp inbound qualification + nudges** *(the single biggest marketing win)* — the team and prospects live on WhatsApp. AI handles the PSO invite + a few qualifying questions, scores the reply (text **or voice note** → Gemini transcribe already wired), and writes a `lead`/`referral` via our tools. Plus outbound *nudges* to participants/ambassadors. (Picky-Assist/Turbodev pattern: capture → qualify → push to CRM.)
- **Lead scoring + routing** — start with a **transparent model** (logistic / rules over engagement signals: replies, attendance, prior conversions), not a black box. Score → route hot leads to the right salesperson by load/territory via our internal tools.
- **Incentive autopilot (compute, not pay)** — agent watches the pipeline, evaluates rules, drafts payouts for human release.
- **Attribution + forecasting** — multi-touch attribution over the unified graph (which channel/ambassador/event drove each sale) feeds the Cash Intelligence module (B4) and the Morning Brief (B2).
- **Campaign ops** — when a PSO/BSU is upcoming, the agent drafts the broadcast + follow-up reminders (human approves the send).

## F.4 What we are NOT building (the founder's cuts — and why)
- **❌ AI cold-calling / autonomous voice dialer.** High cost, real **TRAI/DND + scam-call compliance risk in India**, low trust, brand damage. Calls stay human; AI *preps* the call (brief + talking points), it doesn't *make* it.
- **❌ Scraping-based lead discovery (LinkedIn / social).** ToS violations, legal exposure, low-quality data. Altus's funnel is **relationship-driven (BNI, events, referrals)** — that's the moat; don't dilute it with scraped junk.
- **❌ Fully-automated payouts.** Money movement is **always human-released.** Agent computes + drafts; a person approves the transfer (Razorpay/Stripe) with an audit trail + undo.
- **❌ Auto-generated content (social posts, case studies, reviews, interviews).** Brand-voice risk, low ROI; the incentive items needing human creativity (keynotes, reviews, interviews) stay **manual tracked tasks**, not automated.
- **❌ Telegram / Slack channels.** YAGNI — the team is on WhatsApp. Revisit only on proven need.
- **❌ Public REST/GraphQL API layer.** Over-engineering for a single-tenant internal app — build the **internal agent tool registry** (Part A) instead. Revisit only if we productize Altus for other firms.
- **❌ A model zoo (GPT-4o + Claude + …).** One agent model (**Claude Opus 4.8**, since the app is Claude-native) + **Gemini Flash** for cheap bulk/voice. Don't run five vendors.

## F.5 My added ideas (founder + data-scientist + marketer lens)
- **The incentive engine doubles as a motivation engine.** Surface each participant's *live* incentive progress ("₹900 earned this month, 2 more qualified leads = ₹100") in-app + WhatsApp. Gamified, real-time — drives the behavior the program was designed for.
- **Ambassador "next-best-action" coaching.** The agent already has each partner's pipeline + score; have it tell each ambassador's owner the single highest-value nudge this week.
- **"Where did this sale come from?" one-click attribution** on every won deal — the unified graph makes it trivial and it's a killer exec demo.
- **Voice-note as the universal input.** India team, mobile-first — a voice note to WhatsApp should be able to log a lead, a referral, a daily checklist, or a goal update. One pattern, everywhere.
- **Sell it later.** This exact engine (WhatsApp-native, referral+incentive automation, agentic) is a **product** for every Indian firm running on WhatsApp + spreadsheets. Architect the marketing layer cleanly enough that multi-tenant is a later switch, not a rewrite.

## F.6 Build order for the marketing layer (slots into the master phasing)
1. **Data:** add `campaigns/events` + `leads` + `incentive_rules` tables; migration; backfill the incentive sheet into rules-as-data.
2. **Engine:** event-driven incentive evaluator → pending payouts + live progress UI.
3. **Tools:** expose leads/referrals/campaigns/incentives as agent tools (extends Part A).
4. **WhatsApp agent:** inbound qualify + nudges + voice-note logging (this is also P2 of the master plan).
5. **Intelligence:** lead scoring + routing, attribution, forecasting (feeds B4/B5).

*Cuts are decisions, not gaps. We can always add cold-calling/scraping/auto-pay later — but starting without them is what keeps this shippable, legal, and on-brand.*

