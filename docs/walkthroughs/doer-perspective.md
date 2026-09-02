# Doer perspective — your day on Altus Corp Dashboard

This walkthrough is for a regular employee at Altus Corp — someone who *does* the work, rather than someone who hands it out. It walks you through every screen you'll touch in a normal week, in the order you'll meet them. Every button name, colour and message below is the exact text the system shows you today, so you can follow along on the live site without guesswork.

---

## A. Your very first sign-in

You don't sign yourself up — your admin creates your account first. The moment they do, you receive an email.

**The email.** Subject line: **"You've been invited to Altus Corp Dashboard"**, from *Altus Corp Dashboard*. The body opens with "Hi *[Your name]*, *[Admin's name]* has invited you to the Altus Corp Dashboard — the work-management tool Altus Corp is using to track tasks across the team." There's a single red button: **"Set password and sign in"**. The link is valid for 24 hours.

**Step 1 — Set your password.** Clicking the button drops you on the **Set your password** page. It shows the email it's setting the password *for*, then two fields: *New password* and *Confirm*. The password must be at least 8 characters and the two fields have to match. Press the red **Save and sign in** button. Behind the scenes the system is talking to Firebase to record the password, then immediately trading the result for a session cookie so you don't have to log in again.

**Step 2 — The Welcome screen.** Once your password sticks, you land on `/welcome`. You see "Welcome, *[First name]*" and a short cheat-sheet:

- **Tasks** — your work, ordered by due date.
- **Dashboard** — KPIs across the team.
- **Inbox** — `/inbox` — every notification on tasks you're part of: assignment, status change, comment, approval, decline. Email + Slack + WhatsApp + browser push fan out from the same event (whichever channels you've opted into at `/profile`).

Press the red **Take me in** button — this drops you on `/` (the team Dashboard). Behind the scenes this is the only time you'll ever see the Welcome screen: the database stamps a `joinedAt` time on your record so future sign-ins skip straight to the dashboard.

**Empty-state caveat.** If your company has just rolled the system out and there are literally no employees and no tasks in the database yet, the dashboard renders a single centred card titled **"Welcome."** with the body *"No data yet. Once tasks start being logged, this dashboard becomes the single source of truth for the team."* That branch only fires when both the employee list and the task list are empty, so most new joiners won't see it.

---

## B. Reading the Dashboard (the `/` page)

The Dashboard is read-only data. Six visual sections, in order:

**1. KPI strip — six cards across the top.** Each card is a coloured tile with an emoji, a number and a tiny sparkline of the last 30 days. Click any card to jump into a filtered Task list:

- **Total** *(All Tasks, blue, clipboard emoji)* — every task in the system.
- **Pending** *(In Progress, amber, hourglass)* — tasks in `Initiated` or `Follow Up`.
- **Not Started** *(Awaiting Pickup, amber, badge)* — never opened.
- **Need Help** *(Blocked, red, SOS)* — someone has flagged a blocker.
- **Done** *(Done + Approved, green, tick)* — finished work, approved or not.
- **Not Approved** *(Sent Back, red, warning)* — the initiator declined the work and bounced it back.

**2. Velocity hero.** A large 480-pixel-tall chart titled with the team's recent throughput. Each day is two values: tasks *created* vs tasks *completed*. If the green "completed" line trails the orange "created" line, the team's accumulating backlog.

**3. Status Distribution + Top Performers (side-by-side).** On the left, horizontal bars per status — colour-coded the same way as the pills on the task list. On the right, the top contributors by completed tasks for the period.

**4. Status Table.** A per-person breakdown — each row is an employee, columns are status totals. The Department column comes from the employee record.

**5. Aging Heatmap.** A grid where rows are status buckets and columns are age windows (0-3 days, 4-7, 8-14, 15+ etc.). Hot cells = old tasks in pending statuses. Click into any cell to see those specific tasks.

Above all of this sits a **Filter bar**: date range, employee multi-select, department, priority, subject. Hit **Reset** to clear it; the filters are kept in the URL so you can share a filtered view.

The dashboard is the same for everyone — there's no "show me my numbers only" view. To see only your work, head to **Tasks** in the top nav.

---

## C. The Tasks list (`/tasks`)

Click **Tasks** in the centre nav. You'll see the page title **"Tasks"**, the count (e.g. "*23 tasks*"), then a wide table. Columns are: **Task** (clickable title), **Doer**, **Initiator**, **Department**, **Priority**, **Status**, **Subject**, **Created**, **Due**, **Age** in days, and a "more" button at the right end of each row.

**Status pills and their colours.** Each row carries a colour-coded pill. Memorise this map; it's the same on the detail page and audit feed:

| Pill | Colour | What it means |
|---|---|---|
| Not Started | amber | Nobody's opened it yet |
| Initiated | amber | You've picked it up |
| Follow Up | amber | You're chasing someone for input |
| Need Help | red | You're blocked — flag it for the initiator |
| Done | green | You've finished; awaiting approval |
| Approved | green | Initiator signed off |
| Not Approved | red | Initiator declined; it's bounced back |
| Cancelled | rose | Killed before completion |
| Transferred | purple | Handed off outside the system |

**Defaults to *your* work.** When you (a non-admin) open `/tasks` with no URL filters, the list is scoped to tasks where you're the doer or initiator — sorted by newest. A **My tasks / All tasks** segmented chip lives in the Filter bar; flip it to **All tasks** to see the company-wide view (URL gains `?emp=all`), and your choice sticks via the URL so the link is bookmarkable. The employee multi-select still works on top — explicit `?emp=<id>` or a comma-list overrides the segmented chip in either direction. Admins are unscoped by default and see every task. The same defaulting applies on `/archived`.

**The row-action menu (the three dots).** Click the **`…`** at the right of any row. The menu always offers:

- **Archive** (or **Unarchive** if it's already archived) — moves the row off `/tasks` into `/archived`. A toast confirms it with an **Undo** action.
- **Mark Done / Mark Approved / Mark Not Approved / Mark Cancelled** — direct status changes. The button is *shown* on every row, but the server still gates it. If you're not allowed to make that transition you'll see a "permission" error toast; nothing changes. As a doer, the legitimate one for you is **Mark Done**.
- **Change Priority** — sub-menu with the four Eisenhower quadrants. "Important + Urgent" appears in red.
- **Reassign Doer** — sub-menu with the team list. Picking a colleague hands the task off to them. Use this only if it's truly someone else's job.

Below those, if you're the task's doer or initiator, you'll see context-aware shortcuts: **Approve / Decline…**, **Reassign…**, **Transfer externally…**, **Cancel task…** — clicking any one of these opens the detail page **with that dialog already open** (a `#approve` / `#reassign` / `#transfer` / `#cancel` hash on the URL triggers auto-open, gated by the same permission booleans). For a doer on your own task, **Reassign…** is usually the only one that shows. Every status, priority, doer, archive, restore and approval change made from this menu writes a row to the task's audit feed — same-value changes are idempotent (no event written).

---

## D. Opening a task — the detail page (`/tasks/<id>`)

Click any task title. The detail page is the workhorse — read top to bottom:

**Header card.** The title in large italic serif. A status pill in the top-right (same colour rules as the list). Below the title, the subject (if any) and the description in full (preserving line breaks).

**Meta grid.** A two-column block under a thin divider: **Doer**, **Initiator**, **Priority** (the "Important + Urgent" pill renders as a red **Critical** badge), **Due** (e.g. *Mon, May 18, 2026*), **Created** (date plus who created it), **Archived** (Yes / No). If the task has internal notes, they show below in their own block titled *Internal notes*.

**Action bar (top-right of the card).** Only buttons you're allowed to use show up. For a doer on a pending task you'll see **Edit** — and only Edit. If the task is in `done`, **Approve / Decline** appears for the initiator (so you, the doer, won't see it on your own task). The Edit form lets you change Title, Priority, Due, Subject, Description and Internal notes. Save commits the changes via an optimistic-lock; if a colleague edited the row in the meantime you'll see "*This task was changed by someone else. Reload to see the latest version.*" — reload and try again.

**Activity feed.** Below the meta card, a vertical timeline titled **Activity**. Every action ever taken on this task lives here, newest at top, with a coloured dot per event type — blue for *created*, amber for *status changed* and *priority changed*, green for *commented*, purple for *reassigned*, rose for *archived/restored*. Each row shows who did it and when (e.g. "*Priya moved status: Initiated → Done — 2 hours ago*").

**Comment box.** At the very bottom: an **Add a comment** textarea (max 4000 characters) and a red **Post comment** button. Anyone on the task — creator, doer, initiator, or any admin — can post. Strangers can't.

---

## E. Working the pending lane

Almost all your day-to-day is moving a task through the four "pending" statuses. The system enforces an explicit transition matrix; here's your menu as a doer:

- **Not Started → Initiated** — "I've picked this up." Open the task, three-dots → **Mark Initiated**.
- **Initiated → Follow Up** — "I'm waiting on someone." Useful when you've sent a chase email and the ball isn't in your court.
- **Initiated / Follow Up → Need Help** — "I'm blocked." This is the red flag the initiator watches for.
- **Any pending → Done** — "Work's finished, please review." Only you (the doer) can mark Done.

Every move writes one row in the Activity feed: "*[You] moved status: From → To*". The pill colour on `/tasks` updates immediately. Behind the scenes, moving *into* `Done` also stamps the `completedAt` timestamp; moving *out* of Done (back into rework) clears it.

You **cannot** approve your own work, transfer externally, or cancel a task — those are initiator/admin actions. If you tap them by mistake the server replies with a "permission" error toast and nothing changes.

---

## F. Asking for help, leaving a comment

Two reflexes worth building:

1. **Stuck?** Move the task to **Need Help** (three-dots → Mark Need Help isn't in the quick menu; open the detail page and switch). The red pill is a visual flare to your initiator.
2. **Need to explain context?** Drop a comment on the detail page. Type into **Add a comment**, hit **Post comment**. A green dot appears at the top of the Activity feed with your words verbatim. The textarea clears, a "Comment posted." toast confirms, and the page refreshes so your colleagues see it next time they reload.

A comment isn't a status change — it doesn't reorder the row or change the pill. It's just the audit-trail equivalent of speaking up in a meeting.

---

## G. Marking work done, then waiting

When the work's actually finished:

1. From `/tasks`, click the three-dots on the row → **Mark Done**. (Or open the detail page; the same option is in the action menu there.)
2. A toast confirms *"Status set to Done."*
3. The pill flips to green **Done**.
4. The Activity feed gains a *"status_changed: Initiated → Done"* row.

Now you wait. **Done is not the end.** The initiator opens the task and sees a green **Approve** button next to a white **Decline** button (the doer never sees these — that's intentional, you can't sign off on your own work). They click one of the two:

- **Approve** → status flips to **Approved** (green). The audit feed records "moved status: Done → Approved". The task is, for your purposes, finished.
- **Decline** → a small dialog asks *"Why is this being declined?"* — they type an optional note, hit the red **Decline** button. Status flips to **Not Approved** (red), and the task lands back in your queue on `/tasks` with the red pill. The Activity feed shows the move plus their note. You pick it up again, move it through the pending lane (`Not Approved → Not Started / Initiated / Follow Up / Need Help` are all allowed for you), fix what they flagged, and mark it Done again.

---

## H. Life after approval

The moment a task goes **Approved**:

- The pill on `/tasks` flips to green.
- The Activity feed shows the final "status_changed: Done → Approved" row, with the initiator's name as the actor.
- The task **does not yet** leave `/tasks` automatically — it's still there, just green. Archiving is a separate, manual step (the row-action menu's **Archive** entry). In practice, the initiator or an admin will archive it after a quick visual confirmation; once they do, the row disappears from `/tasks` and appears in `/archived` instead. Both navigation pills in the header carry a live count, so you can watch the numbers move.

You don't have to do anything once it's Approved. Move on to the next task.

---

## I. The Archived view (`/archived`)

Click **Archived** in the top nav. The page looks identical to `/tasks` — same columns, same filter bar, same row-action menu — except every row is a task whose `archived` flag is `true`. Typically these are terminal-state tasks (Approved, Cancelled, Transferred) plus the occasional Done-then-archived-before-approval edge case.

**Can you restore?** Yes — open the row-action menu and pick **Unarchive**. The task re-appears in `/tasks` immediately, and a toast offers an **Undo** if you fat-fingered. Restoring doesn't change the status — an Approved task stays Approved, it just isn't archived anymore.

You can also re-open an archived task's detail page directly; the audit feed and meta are fully intact, and (if your role allows) you can still comment on it. Most doers will rarely touch `/archived` — it's mainly for admins reconciling end-of-month numbers.

---

## J. Inbox, notifications, and channel prefs

Click **Inbox** in the header to see `/inbox` — a vertical timeline of every notification on tasks you're part of. Each row is one event (assigned, status change, comment, approval, decline, transfer, cancel) with a coloured dot, the actor, the task title, and a "Mark all read" button at the top-right. Notifications are written to the `notifications` table by `dispatch.notify()` whenever an action fires; the same event fans out to Email + Slack + WhatsApp + browser push in parallel, governed by the org's `notification_matrix` and your personal opt-ins.

Open `/profile` to toggle which channels you want:

- **Email** — defaults on. Goes to your Firebase email via Resend.
- **Slack DM** — link your Slack workspace handle; the server resolves it to a `slack_user_id` and DMs land in a channel called *Altus Corp Dashboard*.
- **WhatsApp** — supply your phone number + opt in. WhatsApp Cloud API sends through an approved template; reply STOP to opt out, and the webhook flips you off.
- **Browser push** — click **Enable browser push** to register this device with the service worker (`public/sw.js`). Per-device — repeat on every browser you use.

You also get a daily overdue digest at 09:00 IST via Vercel cron — that lands in whatever channels you've enabled.

---

## Known rough edges

A few things are half-built or a touch unintuitive in the current build:

- **Status menu shows actions you can't perform.** The three-dots row menu always lists Mark Done / Approved / Not Approved / Cancelled. The server quietly rejects the ones your role can't perform; you'll see a "permission" error toast and no change. Hiding disallowed entries is still on the polish list.
- **Approved tasks don't auto-archive.** A Done-then-Approved task stays on `/tasks` (green pill) until someone manually archives it. That's by design, but it surprises people.
- **The "Live" indicator** in the header is wired to Supabase Realtime — if your admin hasn't enabled Realtime on the `tasks` table in the Supabase dashboard, the indicator may sit grey rather than pulsing. Refresh manually if you suspect you're seeing stale data.
- **Welcome screen runs only once.** If you ever clear cookies and sign back in, you go straight to `/` — the cheat-sheet doesn't re-appear. Bookmark this walkthrough instead.
- **Browser-close sign-out + 10-min idle timeout.** Closing the browser ends your session (no `Max-Age` on the cookie); after 10 minutes of no activity an idle timer signs you out and bounces you to `/login?next=...`. Admins can raise the idle window in `/admin/settings → General`.
- **Inbox is SSR-only today.** New notifications appear on next page load (or on the next `router.refresh()` from the Live indicator) — there's no websocket push to the inbox yet.
