# Admin perspective — running Altus Corp Dashboard

This walkthrough is for *you* — the person who owns the system. As an admin you get the full keyboard: inviting people, watching the team's day unfold on the dashboard, and stepping into any task to approve, reassign, cancel or transfer it. Below is every screen you'll see on a demo, in the order you meet them.

---

## A. First login (after invite)

Your account is set up the same way everyone else's is — another admin invites you, your inbox gets the email, you set a password. The only difference is the **Admin** flag on your `employees` row, which unlocks an extra menu and side panel.

**The `/login` screen.** Visit the root URL with no session; the `requireUser()` guard in `app/(app)/layout.tsx` bounces you to `/login?next=/`. A centred white card on a soft off-white canvas: a brand **ALTUS** pill next to *Altus Corp Dashboard* in serif, the heading **"Sign in"**, the line *"Use the email your admin set up for you,"* two fields — **Email** and **Password** — a red gradient **"Sign in"** button, and a "Forgot password?" link. On success the form calls Firebase Auth, POSTs the ID token to `/api/auth/session` to swap it for a server-side session cookie, and redirects you to `/`.

**Access control on `/admin`.** The admin route group has its own server-side `requireAdmin()` guard. If a signed-in non-admin visits `/admin` (or any subroute), the guard throws "Forbidden" and `app/(admin)/admin/error.tsx` catches it to render a styled **403** page — an "Admin only" headline on the Light Vibrant canvas with two CTAs (**Go to dashboard** and **Try again**). The unsigned-in case still falls through to `/login?next=...` as before. The matching `app/not-found.tsx` and `app/error.tsx` provide the same treatment for 404 and 500.

**The Dashboard.** The dark-navy header has two soft radial gradients (red bottom-left, purple top-right) and a rainbow gradient strip across the bottom edge. Left: a brand caps line *"Altus Corp · Operations Dashboard"*, the big serif italic *"Altus Corp"* headline (*India* in a brand gradient), and a shimmering "Altus Corp" pill. Centre: three nav pills — **Dashboard**, **Tasks** (live count), **Archived** (live count). There's no "Admin" pill; admin lives in the user menu. Right: the red **"+ New task"** button, your avatar, a green/amber **Live** dot for the Supabase Realtime channel, and *"Updated X seconds ago"*.

As an admin you also see a dedicated red **Admin** pill in the header (`components/header/admin-pill.tsx`) that jumps straight to `/admin` — the Admin entry in the avatar dropdown is the same target, but the pill makes it one click.

Below the header sits a **Filter bar** (date range, employee multi-select, department, priority, subject) and six sections in fixed order:

1. **KPI strip** — six tinted cards: *Total* (blue), *Pending* (amber), *Not Started* (amber), *Need Help* (red), *Done* (green), *Not Approved* (red). Each shows a count, sparkline, and previous-period number, and deep-links into a pre-filtered `/tasks` view.
2. **Velocity hero** — a 480 px combo chart. Weekly bars for created vs completed, plus a 7-day rolling-average line.
3. **Status Distribution + Top Performers** side-by-side: bars per status (left), leaderboard by approved-completion count (right, top six).
4. **Status Table** — one row per employee, columns by status, Department from `employees.department`.
5. **Aging Heatmap** — rows are pending statuses, columns are age windows (0-3, 4-7, 8-14, 15-20, 21-30, 31-45, 46-60, 60+ days). Click any cell for a popover of those tasks.

With no employees and no tasks, the six sections collapse into one **"Welcome."** card with a single **"Open Supabase Studio"** CTA so you can seed real data from the database side.

**Opening the admin side.** Click the red **Admin** pill in the header, or open the avatar dropdown and choose **Admin panel** — both land you at `/admin`. The entry is rendered only when `isAdmin = true`.

---

## B. Invite a new employee

The Admin section has its own layout: a dark sidebar with the Altus Corp brand block, an identity chip with your avatar, and six nav links — **Overview**, **Activity**, **Notifications**, **Employees**, **Departments**, **Settings** — followed by **"← Back to app"** and **Sign out**.

**`/admin` — Overview.** A serif *"The shape of the team today."* headline with four KPI tiles (*Active employees*, *Pending invites*, *Open tasks*, *Overdue* — computed by `getAdminOverview()`; Overdue counts non-archived pending-status tasks past their `due_at`), a **Quick actions** strip (*Invite employee*, *New task*, *View activity*, *Settings*), and a **Recent activity** preview that streams from the unified UNION query.

**`/admin/employees` — the people list.** A serif *"Employees"* heading, an "*N total*" line, and a right-aligned red **"+ Invite employee"** button. The table has six columns: Name, Email, Role (doer/initiator/both), Department, Admin (tick), and Status — a green **"Active"** chip if the person has accepted (`joinedAt` is set), amber **"Invited"** if not, or red **"Deactivated"** if `isActive = false`. Each row also has a kebab on the right for the row-action menu described below.

**Sending an invite.** Click **"+ Invite employee"**. A modal opens titled *"Invite employee"* — *"They'll receive an email to set their password."* Fields: **Full name**, **Work email**, **Task role** (Doer / Initiator / Both, defaults to Doer), **Department** (optional), and an **"Admin (can manage employees + settings)"** checkbox.

Press the red **"Send invite"** button. The `inviteEmployee` Server Action (`app/(admin)/admin/employees/actions.ts`) does four things: creates the Firebase user (no password yet); sets a `role: "authenticated"` custom claim for Supabase third-party auth; inserts the `employees` row with `invitedAt = now()` and `joinedAt = null`; generates a Firebase password-reset link pointed at `/welcome`, emailed via Resend. DB-insert failure rolls back the Firebase user; email failure keeps the row, and `resendInvite` handles retries.

**What the invitee sees.** A "Altus Corp Dashboard" email with one red **"Set password and sign in"** button. It drops them at `/set-password` for a password (min 8 chars, confirmed). On save they auto-redirect to `/welcome`, which stamps `joinedAt` and shows a one-time card before forwarding to `/`. Future sign-ins skip the welcome card.

**Row actions on the employees table.** The kebab on each row opens a small menu. Which entries are visible depends on that employee's state:

- **Resend invite** — shown only when `joinedAt` is null (i.e. they haven't accepted yet). Confirm dialog: *"Resend the invitation email to this person?"* On confirm, the `resendInvite` Server Action generates a fresh Firebase password-reset link and emails it via Resend. The row's `invitedAt` is bumped so the audit trail tracks the retry.
- **Deactivate** — shown when `isActive = true` and the row isn't *you*. Confirm dialog: *"Deactivate this employee? They'll be unable to sign in until reactivated."* On confirm, `deactivateEmployee` flips `isActive = false` in the DB and calls Firebase `updateUser({ disabled: true })` so their session cookie can't be refreshed. If Firebase fails, the DB write is rolled back so the table never gets out of sync with auth.
- **Reactivate** — shown when `isActive = false`. Confirm dialog: *"Reactivate this employee?"* On confirm, the inverse happens: `isActive = true` in the DB and Firebase `updateUser({ disabled: false })`. Same rollback safety on failure.

You can't deactivate yourself — the menu hides the entry on your own row to prevent locking yourself out.

---

## C. Create a task and assign it

Create a task from anywhere via the red **"+ New task"** button in the header. The trigger (`components/header/new-task-trigger.tsx`) pre-fills *you* as the initiator.

**The quick-create dialog.** A 640-px modal titled *"New task"* — *"Quick-create. Press Esc to cancel."* Fields: **Title** (required), **Doer** (required), **Initiator** (required, pre-set to you), **Priority** (Eisenhower quadrant: *Important & Urgent*, *Important, Not Urgent*, *Not Important, Urgent*, *Not Important, Not Urgent* — defaults bottom-right; drives sorting and the critical badge), **Due** (required, defaults 7 days), **Subject** (optional category like "KYC"), and optional **Description** and **Internal notes**.

Press the red **"Create task"** button. `createTask` (`app/(app)/tasks/actions.ts`) inserts a row with `status = "not_started"` and `created_by_id` = your id, writes one **`created`** event to `task_events`, and pushes you to `/tasks/<id>`.

**The full-page alternative.** `/tasks/new` renders the same form in a normal page with a serif *"New task"* header and the one-liner *"Create a task and assign it to a doer. The initiator approves it once it's done."*

---

## D. Manage a task through its lifecycle

Open `/tasks/<id>` from a row title, from the create redirect, or directly. The page renders in a centred 960-px column: **action rail**, **Task detail** card, **Audit feed**, **comment composer**.

**The detail card.** Title in big serif, optional subject below, and a status pill colour-coded by family — **green** (done/approved), **red** (need_help/not_approved), **amber** (pending lane), **rose** (cancelled), **purple** (transferred). Below: the description, then a two-column meta grid (Doer, Initiator, Priority — Important & Urgent shows a critical badge — Status, Created, Due, Subject, Notes).

**The action rail.** As admin you see the full set: **Approve** (green, check) and **Decline** (white, X) — both only when status is `done` — plus **Reassign** (Users), **Transfer externally** (up-right arrow), **Cancel task** (Ban), and **Edit** (pencil). Visibility comes from `lib/auth/task-permissions.ts`; non-admins see only the controls their role and current status permit.

**Editing fields.** Click **Edit**. The card swaps for the *Edit task* form (same shape as create, minus doer/initiator). `editTaskFields` runs with an `expectedUpdatedAt` optimistic lock — if someone touched the task mid-edit you get *"Task changed by someone else. Reload to see the latest"* and the row is left alone. Each changed field writes a separate **`field_updated`** event.

**Posting a comment.** The *Add a comment* card at the bottom is a textarea with a red **"Post comment"** button. Submit calls `addComment`, which writes a **`commented`** event with the body in `to_value.body`. The task row isn't touched, so commenting never trips stale-data errors.

---

## E. Approve doer's work

The everyday happy path. A doer marks their task **Done** — that writes a `status_changed` event from the old pending state to `done` and stamps `completed_at`. The moment that lands, `canApprove()` becomes true for the initiator (and any admin), and **Approve** and **Decline** appear on the action rail.

**Approving.** Click the green **Approve**. The `approveTask` Server Action runs immediately with `decision: "approved"`, setting `status = "approved"`, `approved_by_id` to you, `approved_at = now()`, and appending one **`status_changed`** event (`done` → `approved`). A toast flashes *"Approved."*

**Declining.** Click the white **Decline**. A modal titled *"Decline task"* opens with *"Add an optional note for the doer."* Type a reason, press the red **Decline** button. `approveTask` runs with `decision: "not_approved"`: status moves to `not_approved`, the approval note is stored, and the audit feed gets `status_changed: Done → Not Approved` with your note attached. The doer can bounce it back into the pending lane.

Once you approve or decline, the decision is immutable: to reverse, the doer reworks and you decide again, producing a second `status_changed` row. There is no "edit approval" path by design.

---

## F. Reassign, Transfer externally, Cancel

Three workflow actions, each in its own dialog. All honour the optimistic lock — if another user just touched the task, the call returns `{ error: "stale" }` and the dialog shows *"Task changed by someone else. Reload first."*

**Reassign.** Doer, initiator, or admin, while in the pending lane (or, for admins, `not_approved`). Dialog: *"Reassign task"* — *"Pick the new doer. You can optionally reset the status to 'Not Started.'"* Two controls: a **New doer** dropdown (current doer filtered out) and a **"Reset status to 'Not Started'"** checkbox. Press the red **Reassign**. `reassignTask` records the old doer in `transferred_from_id`, swaps in the new one, and writes a **`reassigned`** event from `{ doerId: <old> }` to `{ doerId: <new>, resetStatus: <bool> }`. If you ticked reset and the status wasn't `not_started`, a second **`status_changed`** event is written.

**Transfer externally.** Initiator or admin, only from a non-terminal status. Dialog: *"Transfer externally"* — *"Use this when the work leaves the system (handed off to an external party). The task moves to 'Transferred' permanently."* Single required **Reason** textarea, purple submit. `transferTaskExternal` sets status to `transferred`, writes a **`transferred_external`** event with the reason in `note`, and locks the task.

**Cancel.** Initiator or admin, only from a non-terminal status. Dialog: *"Cancel this task?"* — *"The task moves to 'Cancelled' permanently. Add an optional note for the audit log."* The note is optional; rose **"Cancel task"** submit. `cancelTask` flips status to `cancelled` and writes a **`status_changed`** event with the optional note attached.

---

## G. Bulk visibility on `/tasks`

Click **Tasks** in the centre nav. `/tasks` shows every non-archived task in a wide table with a count line ("*N tasks*"). Columns: title, doer, initiator, department, priority, status pill, subject, created, due, age in days, and a kebab trigger. As an admin you are *unscoped* — you see every task by default. Non-admin doers, by contrast, now land on a "My tasks" default (their own assignments only) and can flip a **My tasks / All tasks** segmented chip in the filter bar to switch. URL params still win: `?emp=<id>` / `?emp=all` / a comma-separated list overrides the default in either direction.

Clicking the kebab opens a dropdown: **Archive**/**Unarchive**; a flat list of status moves — Mark Done, Mark Approved, Mark Not Approved, Mark Cancelled — each going through `setTaskStatus`; a **Change Priority** submenu with the four Eisenhower quadrants (Important & Urgent styled red as a danger action); a **Reassign Doer** submenu listing every employee for one-click reassignment; and a trailing set of links — **Approve / Decline…**, **Reassign…**, **Transfer externally…**, **Cancel task…** — that jump to the detail page with a hash anchor (`#approve`, `#reassign`, `#transfer`, `#cancel`) that now auto-opens the matching dialog on arrival, gated by the same permission predicates as the action rail. Every one of these mutations — status, priority, doer, archive/restore, approval — writes a `task_events` row, so the audit feed on the detail page reflects row-menu changes the same way it reflects detail-page changes. Same-value writes are idempotent (no event row).

The filter bar at the top is the same shape as the dashboard's; state lives in the URL so a filtered view is shareable.

**`/archived`.** Same table component pointed at `archived = true` rows. "Archived" is a separate boolean flag, *not* the same as terminal status (done/approved/cancelled/transferred). A done task is archived only when you hit Archive in the row menu.

---

## H. Dashboard re-read — the loop closes

Walk back to **/** via the **Dashboard** pill. Every section is recomputed from the database the workflow actions wrote to seconds ago: the **KPI strip** updates counts and sparklines (your new task bumps Total; if still `not_started`, also Not Started); the **Velocity hero** moves the current week's "created" bar up by one (and "completed" too if approved); the **Status Distribution** bars redraw; the **Status Table** updates the relevant doer's cell (Important & Urgent tasks add to the Critical column with the red badge); the **Aging Heatmap** drops the new task into the **0-3 days** column for its pending status.

**Live indicator.** The green dot near your avatar is wired to a Supabase Realtime channel listening for *any* change on the `tasks` table. When another user (say, the doer on a phone) flips a status, a 1.5 s debounce kicks in and the page silently re-fetches via `router.refresh()`. Sparklines reanimate, the Status Table re-tints, the heatmap repaints — all without you touching refresh. On the demo, ask Hetesh to flip a task from a second device while you watch the dot.

---

## I. The rest of the admin panel

Four sub-pages live behind the sidebar in addition to **Overview** and **Employees**:

**`/admin/activity`** — the unified audit timeline. UNION across `task_events` + `employee_events` + `settings_events`, with a **Source** multi-select (Tasks / Employees / Settings), per-source icons and copy, and the same filter shape as `/tasks`. Each row deep-links back to the task or employee it describes. CSV export (UTF-8 BOM, 10k cap) lives at `/admin/activity/export`.

**`/admin/notifications`** — the delivery log. One row per `notifications` record, with per-channel chips (✉ Email · 💬 Slack · 📱 WhatsApp · 🔔 Push) coloured green/grey based on `delivered_channels`. The filter bar narrows by kind, channel, or recipient. Use this to verify dispatch actually landed — what the M5.2 design calls "trust-but-verify the fan-out."

**`/admin/departments`** — list of real departments (migration 0012 moved this from an enum to a table). Create / rename / soft-delete from a small dialog; employees pick from this list when invited.

**`/admin/settings`** — four tabs:
  - **General** — `org_settings` single-row (org name, default timezone, idle timeout in minutes, etc.)
  - **Statuses** — `status_settings` CRUD: per-status custom label + colour overrides. Pipes through to email / Slack / WhatsApp templates.
  - **Integrations** — health cards for Resend, Slack, WhatsApp, Web Push with a **Send test** button (`forceChannels`) that fires a single-recipient probe.
  - **Notifications** — the event × channel matrix, persisted to `org_settings.notification_matrix`. Toggle which channels fire for which event kinds.

Every settings mutation writes to `settings_events`; every admin-side employee mutation writes to `employee_events`. Both feed the unified `/admin/activity` view.

---

## Known rough edges

A few things to expect during the demo that are by design or not yet finished:

- **`/archived` filters by the `archived` boolean, not by terminal status.** Terminal tasks remain on `/tasks` until someone hits Archive in the row menu.
- **No admin-only dashboard view.** Admins see the same six sections as everyone else; filtering by employee in the filter bar is the closest equivalent.
- **Notification retry not yet wired.** `/admin/notifications` shows which channels delivered, but failed sends can't be retried from the UI — that's deferred to a later milestone alongside structured logging.
- **Status add/remove not exposed.** `/admin/settings → Statuses` only lets you customise label + colour; the 9 status IDs themselves are locked in code.
- **No bulk-employee CSV invite UI.** Imports today go through `pnpm import:legacy`; a UI for it is "M5 polish" territory.
- **No Sentry / structured-log dashboard yet.** Observability (M5.3) is the next milestone — until then, errors surface only in Vercel's logs.
