# Altus Corp Dashboard — walkthroughs

This folder is the entry point for anyone seeing the dashboard for the first time. Three documents, in reading order:

1. **[setup.md](./setup.md)** — How to run the app end-to-end on your own machine. Covers Supabase + Firebase + Resend accounts, every key in `.env.local`, migrations, bootstrap-admin, seed, and `pnpm dev:full`. Read this first if you intend to actually open a browser.

2. **[admin-perspective.md](./admin-perspective.md)** — The full admin journey: sign in, invite an employee, create + assign + edit + approve + reassign + transfer + cancel a task, watch the audit feed grow, and re-read the dashboard as it reacts in real time. Use this to demo the system to a stakeholder.

3. **[doer-perspective.md](./doer-perspective.md)** — The day-to-day team-member view: accept an invite, glance at the dashboard, work tasks through the pending lane (not started → initiated → follow-up → done), request help, comment, see your work get approved (or declined and bounced back), and find archived work.

## The shape of the system

Altus Corp Dashboard is a "Light Vibrant" work-management app for the Altus Corp team. It replaces a single-file HTML dashboard. The current build covers:

- **Auth foundation (M2.0)** — Firebase email/password via next-firebase-auth-edge, admin-only employee invite + reset-password flows, Supabase RLS gating reads.
- **Task CRUD (M2.1)** — `/tasks/new`, `/tasks/[id]`, edit-in-place with optimistic locking, full audit-event provenance.
- **Task workflow (M2.2)** — pure-function status-transition matrix, Approve/Decline/Reassign/Transfer-externally/Cancel/Comment all as Server Actions writing `task_events` rows, and a per-task audit feed UI.
- **Notifications + Inbox (M2.3)** — `/inbox` route, per-action fan-out, 11 React Email templates, Vercel cron daily overdue digest at 09:00 IST.
- **Admin panel (M3 + M5.1)** — tabbed `/admin/settings` (General · Statuses · Integrations · Notifications), `/admin/departments` (real table, replacing the enum), `status_settings` CRUD with label + color overrides, integration health cards with send-test, event×channel notification matrix. Admin audit tables `employee_events` + `settings_events` write on every mutation.
- **Imports + multi-channel (M4)** — `pnpm import:legacy` one-time CSV importer + 4-channel dispatch (Resend email + Slack DM + WhatsApp Cloud API + Web Push PWA). `dispatch.notify()` is a `Promise.allSettled` across all four arms with per-notification `delivered_channels` audit.
- **Admin power + session timeout (M5.2)** — unified `/admin/activity` UNION across `task_events` + `employee_events` + `settings_events` (Source filter, per-source icons), `/admin/notifications` delivery log against `notification_matrix`, 3 CSV exports (`/tasks/export`, `/admin/employees/export`, `/admin/activity/export` — UTF-8 BOM, 10k cap), 10-min `IdleTimer` (admin-tunable), browser-close sign-out via session cookies + Firebase `browserSessionPersistence`.
- **Polish** — default `/tasks` and `/archived` to "My tasks" for non-admins; row-action `#hash` deep-links auto-open the matching dialog on `/tasks/[id]`; Light Vibrant styled 403/404/500 error pages; per-employee notification channel prefs at `/profile`; PWA install + browser push opt-in.

## Open follow-ups

- **M5.3** — Sentry, structured logging, performance pass (next milestone, not started).
- **Operational** — set up custom domain for the production deployment; invite emails for the imported employees; WhatsApp template Meta Business Manager approval. See CLAUDE.md for the running list.

The app is deployed on Vercel at the default `altus-corp-dashboard.vercel.app` URL (custom domain pending) against prod Supabase, seeded with 14 imported employees + 240 imported tasks.

## Demo flow (15 minutes)

For an end-to-end demo from cold start:

1. **Setup once** (~30 min, real accounts) — follow `setup.md` end-to-end, including `pnpm bootstrap-admin -- --email <you> --name "<you>"`. Skip if `.env.local` and the DB are already populated, or just hit the live URL above.
2. **Sign in as admin** — open `http://localhost:3000`, follow the reset-password email link, land on `/welcome`, click "Take me in".
3. **Walk the admin journey** (~5 min) — follow `admin-perspective.md` sections A–H. Invite a second employee; create one task; observe the audit feed populate; open `/admin/activity` to see the unified feed; open `/admin/notifications` to confirm dispatch landed.
4. **Switch to doer** — sign out, sign in as the second employee, follow `doer-perspective.md` sections A–I. Move the task through the pending lane, mark done, add a comment; check `/inbox` for the per-action notification.
5. **Switch back to admin** — sign out, sign in again, approve the task. The dashboard updates in real time via Supabase Realtime.

Everything in those two journeys is wired today; no placeholder buttons, no half-built screens.
