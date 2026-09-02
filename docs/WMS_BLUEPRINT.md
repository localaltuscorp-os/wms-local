# WMS Blueprint — Work Management System

A complete specification of the Altus Corp Dashboard, written so it can be
handed to an AI assistant or a new engineering team to **stand up an equivalent
system for a different client**.

---

## How to use this document

**To launch a new client WMS:** paste this entire file into a fresh Claude chat,
followed by:

> Build this Work Management System for **\<CLIENT NAME\>**, a
> **\<INDUSTRY\>** business with **\<N\>** employees. Start with the Phase 1
> modules only. Ask me for the client-specific values in the Launch Checklist
> before writing any code.

**To extend the existing system:** use it as an architecture reference. Ground
truth is always `db/schema.ts`, `db/enums.ts` and the route tree.

**Scale of the reference implementation:** 216 pages · 143 API routes ·
238 tables · 211 migrations · 34 scheduled jobs. This is a large system —
do not attempt to build it all at once. Follow the phasing in §11.

---

## 1. What the system is

An internal operations platform for a professional-services firm. It replaces
the spreadsheet-and-WhatsApp layer most small firms run on, with a single
status-coded surface covering work, people, money and compliance.

The organising principle is **accountability, not task tracking**. Every unit of
work has a *doer* and an *initiator*, an explicit status, an age, and an audit
trail. The founder's stated framing is *"delegate ownership, not just tasks."*

### Who uses it

| Role | What they do |
|---|---|
| **Employee (doer)** | Own tasks, punch attendance, commit weekly goals, submit HR forms, view salary |
| **Initiator** | Assign work, approve or decline completion, review goals |
| **Manager** | Team dashboards, approve leave and remote work, appraisals |
| **HR** | Hiring pipeline, onboarding, letters, policies, tickets |
| **Accounts** | Billing, outstanding, salary runs, compliance calendar |
| **Admin / Founder** | Everything, plus org configuration and cross-company analytics |

### Non-negotiable product rules

1. **Invite-only.** No public sign-up, ever. Admins create employees; the
   employee receives a branded email and sets their own password.
2. **Nothing is deleted.** Archive, don't destroy. History is the product.
3. **Status is authoritative and admin-editable**, not hardcoded in the UI.
4. **Every list is filterable by doer, initiator, status, date and age.**
5. **Empty state is a first-class screen.** The system ships with no seed data.

---

## 2. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js 16** (App Router, RSC, Server Actions) | `pnpm dev` Turbopack; `pnpm build` webpack |
| Language | **TypeScript**, strict | |
| UI | **React 19**, Tailwind v4, Radix primitives | Custom editorial design system |
| Data | **Drizzle ORM** on **Supabase Postgres** | `postgres` driver, pooled connection |
| Auth | **Firebase Auth** + `next-firebase-auth-edge` | Identity only; app data lives in Postgres |
| Tables | TanStack Table + TanStack Query | |
| Charts | Recharts | |
| Editor | TipTap | Letters, policies, rich notes |
| Email | Resend + React Email | |
| Files | Supabase Storage | |
| Errors | Sentry | |
| Testing | Vitest (unit) + Playwright (visual) | |
| Hosting | Vercel — **region must match the DB region** | |
| Mobile | Kotlin / Jetpack Compose, Room, offline sync | Optional |

### Why Firebase for auth and Postgres for data

Firebase issues identity; a 5-day `__session` cookie carries it, minted by
`admin.auth().createSessionCookie()`. Middleware verifies every request with
`checkRevoked: true`, so deactivating an employee locks them out immediately.
Firebase ID tokens are passed to `supabase-js` via its `accessToken` callback so
RLS policies evaluate `auth.jwt() ->> 'sub'` against Firebase UIDs.

You could do this entirely in Supabase Auth. The split exists because Firebase's
session-revocation and email flows were more mature at the time.

---

## 3. Architecture

```
Browser
  │  signInWithEmailAndPassword (Firebase client SDK)
  ▼
POST /api/auth/session   { idToken }
  │  verify token → confirm active employee row → mint __session cookie
  ▼
proxy.ts (middleware)    verifies cookie on EVERY request, checkRevoked: true
  │  PUBLIC_PATHS bypass: /login /forgot-password /set-password /welcome
  │  Cron routes bypass, then self-authenticate with Bearer CRON_SECRET
  ▼
Server Components / Server Actions
  │  Drizzle queries against Postgres
  ▼
Supabase Postgres  (RLS as defence in depth; app connects with service role)
```

### Key conventions

- **Server Actions for mutations**, route handlers only for webhooks, cron and
  auth. Actions return a discriminated result (`{ok:true} | {ok:false,error}`),
  never throw to the client.
- **Permission checks live at the route-handler / action layer**, not in RLS.
  RLS is a second gate, not the primary one.
- **`lib/<domain>/`** holds all business logic. Components stay presentational.
- **Enums are centralised** in `db/enums.ts` and mirrored as Postgres enums.
- **Cache tags** (`lib/cache-tags.ts`) drive revalidation.

### Critical failure modes to design around

These cost real production time in the reference implementation:

- **Env validation throws at build**, not runtime. `lib/env.ts` Zod-parses
  `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
  Missing any one fails the build.
- **Function region must match DB region.** A cross-continent default added
  ~200-250 ms per query and roughly doubled TTFB.
- **Auth email domains must be allowlisted** in Firebase, and the email
  from-address must match the *exactly* verified sending domain.

---

## 4. Module map

14 workspaces: `wms · goals · attendance · hr · employees · productivity ·
billing · accounts · training · events · people-allocation · sales · rooms ·
admin`

### Core — build these first

| Module | Routes | Purpose |
|---|---|---|
| **Hub** | `/hub` | Workspace launcher; landing after login |
| **My Day** | `/my-day`, `/daily-checklist` | Personal daily loop |
| **Tasks (WMS)** | `/tasks`, `/kanban`, `/[id]`, `/[id]/focus`, `/new`, `/import`, `/duplicates`, `/time` | The core module |
| **Projects** | `/projects`, `/projects/[id]` | Task grouping, members, nodes |
| **Inbox** | `/inbox` | Notifications |
| **Admin** | `/admin/*` | Employees, departments, designations, clients, holidays, leave categories, subjects, settings |

### People & time

| Module | Routes | Purpose |
|---|---|---|
| **Attendance** | `/attendance`, `/dashboard`, `/live-status`, `/leave`, `/remote-work`, `/devices`, `/insights`, `/confirmations`, `/work-session` | Punch in/out, device allowlist, leave, WFH |
| **Goals** | `/goals/{yearly,quarterly,monthly,weekly,week,day}`, `/cascade`, `/commit`, `/approve`, `/review` | Cascading OKR-style goals |
| **HR** | `/hr/*` — candidates, intake, evaluation, induction, letters, policies, exit, routing, KPI, metrics | Full hire-to-exit lifecycle |
| **Dossier** | `/dossier`, `/dossier/onboarding` | Employee record |
| **Support** | `/support`, `/support/[id]`, `/support/new` | HR ticketing with SLA |

### Money

| Module | Routes | Purpose |
|---|---|---|
| **Salary** | `/salary/{analytics,ctc,documents,policy,incentive-payout}`, `/my-salary` | CTC, breakups, runs, advances, slips |
| **Incentive** | `/incentive` | Catalog, targets, requests, payouts |
| **Billing** | `/billing` | Invoices, payments, cycles |
| **Outstanding** | `/outstanding`, `/outstanding/contracts` | Receivables, follow-ups, installments |
| **Overtime** | `/overtime`, `/overtime/dashboard` | Overtime capture |
| **Reimbursements** | `/reimbursements` | Claims |
| **Accounts** | `/accounts/*` — bank balance, cash, CC tracker, due dates, F&O, shares, SIP, income tax, CA handover | Practice-specific finance |

### Performance

| Module | Routes | Purpose |
|---|---|---|
| **PMS** | `/pms`, `/pms/v3`, `/pms/config`, `/pms/review`, `/pms/signals` | Scorecards, promotion signals |
| **Appraisal** | `/appraisal`, `/admin`, `/config`, `/culture` | Cycles, KPI/skill/attitude scoring |
| **Productivity** | `/productivity`, `/team`, `/report` | Per-person cockpit |
| **DCC** | `/dcc`, `/dashboard`, `/ranking` | Daily client connect |
| **Achievements** | — | Gamified earned badges |

### Growth & knowledge

| Module | Routes | Purpose |
|---|---|---|
| **Training** | `/training/*` — calendar, tests, feedback, induction, self-learning, obligations, share | LMS |
| **Ambassadors** | `/ambassadors/*` — directory, pipeline, commissions | Referral partners |
| **People Allocation** | `/people-allocation/*` | Who is staffed where |
| **Events** | `/events/*` — batches, calendar, masters, obligations | Company calendar |
| **Communications** | `/communications`, `/compose` | Broadcasts with read/ack tracking |
| **Documents** | `/documents`, `/agreements`, `/letters`, `/policies` | Templates, e-sign, compliance |

---

## 5. Core domain concepts

### Task lifecycle — the heart of the system

```
dont_know → not_started → initiated → follow_up → need_help
                                    → need_info → on_hold → done
```

- **`dont_know`** — *"I haven't assessed this yet."* Deliberately first. Most
  systems force a commitment before the doer has looked; this one doesn't.
- **Doer / initiator split.** Both are first-class. Every view filters by either.
- **Aging buckets** (0-3, 4-7, 8-30, 31-60, 60+ days) — the primary lens on
  overdue work.
- **Approval is separate from status.** `approval_status` tracks initiator
  sign-off independently, so "doer says done" ≠ "accepted".
- **Statuses are rows in `status_settings`**, not hardcoded — label, colour
  token and display order are admin-editable.

> **Design note:** the reference implementation once expanded to
> `follow_up_1/2/3`, then collapsed back to a single `follow_up`. Legacy values
> remain in the enum for imported data. **Never remove an enum value** — add and
> deprecate.

### Goals — cascading commitment

`year → quarter → month → week → day`, with `cascade` links so a weekly goal
traces to an annual one. Types: `kpi`, `strategic`, `operational`, `essential`.
Flow is **commit → approve → review**, with carry-forward and spillover crons
for missed periods.

### Attendance

Punch in/out with codes `P · H/D · A · W/O · H · HP · PL · LWP · CO`. Grading by
`day`, `hours` or `session`. Anti-proxy via a **device allowlist** — one approved
laptop and one approved phone per employee, either may punch. Leave (paid/unpaid),
comp-off credits, remote work approval (`wfh`/`client_site`/`field`), month
freeze for payroll cutoff.

### Salary

Profiles → CTC breakups → policies with consent → runs → payments → slips.
Pay bases: `monthly_ctc`, `hourly`, `fixed_fee`. Advances and overtime feed in.
Attendance month-freeze gates the run.

---

## 6. Data model

238 tables. Grouped by domain — build only the groups your phase needs.

| Domain | Representative tables |
|---|---|
| **Identity** | `employees`, `departments`, `designations`, `employee_departments`, `auth_sessions`, `webauthn_credentials`, `mobile_devices`, `punch_nonces` |
| **Tasks** | `tasks`, `task_events`, `task_attachments`, `task_checklist_items`, `task_time_events`, `task_work_sessions`, `task_metrics_daily`, `task_reminder_rules`, `subjects`, `projects_*` |
| **Goals** | `goals`, `goal_links`, `goal_dependencies`, `goal_reviews`, `goal_comments`, `weekly_goals`, `weekly_goal_actuals`, `daily_plan_day` |
| **Attendance** | `attendance_logs`, `attendance_sheet_day/month`, `attendance_week_ack`, `attendance_month_freeze`, `leave_requests`, `leave_categories`, `comp_off_credits`, `remote_work_requests`, `holidays`, `work_sessions` |
| **Salary** | `salary_profiles`, `salary_breakup`, `ctc_breakups`, `salary_runs`, `salary_payments`, `salary_advances`, `salary_policies`, `salary_policy_consents`, `overtime_entries` |
| **Incentive** | `incentive_catalog`, `incentive_entries`, `incentive_targets`, `incentive_requests`, `incentive_payout_events`, `incentive_projects` |
| **HR** | `candidate_intake`, `interview_positions`, `onboarding_submissions`, `employee_documents`, `employee_events`, `hr_tickets*`, `letter_templates`, `policy_documents`, `policy_versions`, `policy_compliance` |
| **Performance** | `pms_*`, `appr_*`, `appraisal_*`, `performance_scorecards`, `kpi_assignments`, `employee_score_daily`, `achievements_earned` |
| **Finance** | `accounts_*` (~25), `outstanding_*` (~9), `obligations`, `vendors`, `paying_entities`, `clients`, `client_locations` |
| **Training** | `tc_*` (~18) — sessions, tests, questions, attempts, materials, feedback |
| **Comms** | `broadcasts`, `broadcast_recipients`, `notifications`, `notification_preferences`, `notification_dispatch_log`, `push_subscriptions`, `device_push_tokens` |
| **Documents** | `documents`, `document_instances`, `document_signatures`, `agreements`, `approval_tokens` |
| **Growth** | `amb_*` (~7), `pa_*` (~6), `pg_*` (~6), `rev_*` (~7) |
| **Platform** | `org_settings`, `settings_events`, `form_configs`, `event_log`, `command_log`, `audit_data_exports`, `sync_runs`, `ai_usage` |

### Conventions

- `id uuid primary key default gen_random_uuid()`
- `created_at timestamptz not null default now()`, `updated_at timestamptz`
- FKs `on delete cascade` for children, `set null` for optional references
- Soft delete / archive flags — **never hard delete**
- Partial indexes for hot filters, e.g.
  `create index ... on tasks (created_at) where status in (...)`
- Postgres enums generated from `db/enums.ts`

---

## 7. Integrations

| Service | Used for | Env |
|---|---|---|
| **Firebase Auth** | Identity, sessions, password reset | `FIREBASE_*`, `NEXT_PUBLIC_FIREBASE_*` |
| **Supabase** | Postgres + Storage | `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY` |
| **Resend** | Transactional email | `RESEND_API_KEY`, `RESEND_FROM_EMAIL` |
| **Slack** | Alerts | `SLACK_BOT_TOKEN` |
| **WhatsApp** (Meta Cloud) | Reminders, digests | `WHATSAPP_*`, `META_WHATSAPP_*` |
| **Web Push** | Browser notifications | `VAPID_*` |
| **Sentry** | Errors | `NEXT_PUBLIC_SENTRY_DSN` |
| **DigiLocker** | Indian document verification | `DIGILOCKER_*` |
| **Aadhaar lookup** | Indian identity verification | `AADHAAR_LOOKUP_*` |
| **OpenRouter / Whisper** | AI insights, audio transcription | `OPENROUTER_API_KEY`, `WHISPER_*` |
| **Google OAuth** | Calendar / Meet sync | `GOOGLE_CLIENT_*` |

Only Firebase, Supabase and Resend are required. Everything else degrades
gracefully when unset.

> **Localisation:** DigiLocker and Aadhaar are India-specific. Drop or replace
> them for other jurisdictions.

---

## 8. Scheduled jobs

34 crons in `vercel.json`, all authenticated with `Authorization: Bearer
CRON_SECRET`.

| Group | Jobs |
|---|---|
| Attendance | `attendance-autoout`, `-weekly`, `-weekly-rollup`, `-monthly`, `-confirm-reminder`, `-log-sync` |
| Goals | `goals`, `goals-carry-forward`, `goals-weekly-carry`, `goals-spillover`, `goals-sunday-report`, `weekly-goals` |
| Tasks | `task-reminders`, `task-auto-archive`, `materialize-recurring`, `time-autoclose` |
| Money | `monthly-slips`, `incentive-digest`, `salary-sync` |
| People | `pms-quarterly`, `hr-confirmations`, `hr-sla`, `dcc-reminder`, `ambassador-reminders` |
| Platform | `digest`, `backup`, `retry-dispatch`, `relay`, `calendar-sync`, `meet-reconcile`, `work-session-cleanup`, `ecos-publish`, `ecos-reminders` |

> ⚠️ **Vercel Hobby allows 2 crons.** Pro is required for anything like this
> count. Budget for it or move scheduling to an external runner.

---

## 9. Launch checklist for a new client

Collect these **before writing code**.

### Identity & branding
- [ ] Company legal name, display name, logo (SVG + PNG), favicon
- [ ] Brand colours; the reference uses a crimson/black editorial palette
- [ ] Primary domain and app subdomain (e.g. `wms.client.com`)
- [ ] Sender identity (`Name <noreply@client.com>`)

### Org structure
- [ ] Departments, designations, reporting lines
- [ ] Employee count and initial roster
- [ ] Role mapping: who is doer / initiator / both; who is admin
- [ ] Working days, shift hours, half-day threshold
- [ ] Leave categories and annual entitlements
- [ ] Holiday calendar

### Money (skip if not in scope)
- [ ] Pay basis, CTC components, payroll cutoff day
- [ ] Incentive scheme
- [ ] Billing cycles, invoice numbering

### Accounts to create
- [ ] GitHub **organisation** (not a personal account — it must survive people leaving)
- [ ] Vercel team — **region matching the database**
- [ ] Supabase project — region closest to users
- [ ] Firebase project — Authentication → Email/Password enabled
- [ ] Resend account + **verified sending domain**

### Configuration
- [ ] All required env vars set for **production and preview**
- [ ] App domain added to Firebase → Authorized domains
- [ ] DKIM + SPF records published for the sending domain
- [ ] `regions` in `vercel.json` matching the Supabase region
- [ ] First admin bootstrapped
- [ ] Branch protection on `main`

### Scope decision
- [ ] Which of the 14 workspaces are in Phase 1?

---

## 10. Per-client customisation points

| What | Where |
|---|---|
| Branding, logo, palette | `app/globals.css`, `lib/appearance.ts`, `public/` |
| Task statuses, labels, colours | `status_settings` table (admin UI) |
| Workspaces enabled | `lib/workspaces.ts` |
| Org config | `org_settings` table |
| Dynamic forms | `form_configs` table |
| Email templates | `emails/` (React Email) |
| Attendance rules | `lib/attendance/`, `org_settings` |
| Salary structure | `salary_config`, `salary_policies` |
| Appraisal weights | `evaluation_weight_profiles`, `appr_config` |
| Navigation | `components/nav/main-nav.tsx` |

**Anything client-specific belongs in a database table, not in code.** The
reference implementation gets this right for statuses and forms, and wrong for
a handful of hardcoded emails and project refs — don't repeat that.

---

## 11. Recommended build phasing

Do **not** attempt all 14 workspaces at once. The reference took ~3.5 months
with a small team and still carries schema drift.

**Phase 1 — Core (4-6 weeks).** Auth, employees, admin config, tasks, kanban,
hub, notifications. This alone replaces most spreadsheet workflows and is
independently valuable.

**Phase 2 — Time & people (3-4 weeks).** Attendance, leave, holidays, dossier,
support tickets.

**Phase 3 — Goals & performance (3-4 weeks).** Goals cascade, weekly commit,
PMS, appraisal.

**Phase 4 — Money (4-6 weeks).** Salary, incentive, billing, outstanding.
The most client-specific and highest-risk area — do it last, when domain
understanding is strongest.

**Phase 5 — Growth.** Training, ambassadors, events, communications.

### Engineering rules that would have saved the reference implementation

1. **Every schema change ships as a migration.** Never touch production schema
   by hand. The reference cannot rebuild its own database because someone did.
2. **Verify a fresh `db:migrate` from empty on every PR** that touches schema.
3. **Never hardcode a project ref, domain or email** outside env/config.
4. **Company-owned accounts from day one** — orgs and teams, never personal.
5. **Document as you go.** A `HANDOFF.md` updated per PR is worth more than any
   retrospective reconstruction.
