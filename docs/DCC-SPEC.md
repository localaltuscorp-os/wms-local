# Daily Compliance Checklist (DCC) — build specification

**Status:** authoritative. Supersedes every earlier DCC note in this repo.
**Written:** 2026-09-16, from the account holder's brief, Jeevan's SP1 sheets and
Rudra's Hand-holding form.

**Rule for this build:** the old DCC screens were deleted on purpose and none of
them come back. Where a *pure calculation* already exists and is tested — date
maths, the 11:59 pm window, the delete guardrail, the position-template
reconciler — it is reused, because those are invisible, tied to unique indexes
that already exist in the database, and re-deriving them would only add bugs.
**Every screen, every colour and every layout is built new.**

---

## 0 · The brief, restated

Eight instructions were given. Each becomes a numbered step below.

| # | Instruction | Step |
|---|---|---|
| 1 | DCC Dashboard like the WMS Dashboard — every feature worth having | Step 9 |
| 2 | Report of all employees in Jeevan's SP1 format, emailed 10 pm daily. Manan Sir gets everyone below him; a Team Lead gets everyone below them; each person gets their own | Step 10 |
| 3 | Only Manan Sir may change a past entry. Everyone else locks at 11:59 pm on the day | Step 6 |
| 4 | DCC Masters for a Position, and a specific DCC for an Employee — exactly the way Master JD and Person-specific JD work | Steps 3 & 4 |
| 5 | The Daily Compliance dashboard follows Jeevan's SP1 sheet | Steps 7 & 8 |
| 6 | Every entry appears in Rudra's Hand-holding calendar | Step 12 |
| 7 | Every entry sits in each employee's Altus Google Calendar | Step 11 |
| 8 | Team Leads may add compliances for themselves and anyone below them, but may not delete one Manan Vasa gave | Step 5 |

---

## 1 · Vocabulary

Three different things get called "DCC". They are kept apart everywhere in this
build, because they answer different questions about the same day.

**Compliance (KPI).** A recurring duty a person owes — "Log every client call",
"Sign off yesterday's numbers". Section, code, title, frequency, optional target
and unit. Stored in `dcc_kpi_items`.

**Entry.** What happened to one compliance on one day: Done · Not done · NA ·
Pending, plus a note and an optional number. Stored in `dcc_entries`. **This is
what the 11:59 pm lock protects.**

**Call log (SP1).** A separate daily count: of the calls this person made today,
how many landed on each of fifteen outcomes. Not a compliance, no Done/Not-done —
fifteen numbers. Stored in `dcc_call_logs`. **This is Jeevan's sheet.**

A person can owe compliances and never make a call, or make calls and owe no
compliances. The module shows both without pretending they are one thing.

---

## 2 · Navigation

DCC is the **first** section under **Employees**, with three doors:

```
Employees
 ├─ DCC ─ My Day        /dcc                    ← fill your compliances
 │  ├─ Dashboard        /dcc/dashboard          ← the SP1 sheet: fill it, read it
 │  └─ DCC Masters      /dcc/masters            ← Position + Person templates
 …then Leaves, Attendance, and the rest
```

**There is no SP1 door and no Call Log door** (account holder, 2026-09-17). The
SP1 sheet *is* the dashboard, and the fifteen numbers are typed into that sheet,
so either entry would be a second route to one screen — exactly the kind of
duplicated door this list exists to prevent. `/dcc/sp1` and `/dcc/call-log`
survive as **redirects** to `/dcc/dashboard`, because both addresses are in
bookmarks and in mail already sent; neither is navigation.

They are **siblings, not nested**. The board is where you fill your day; the
dashboard is where you read the org. Burying the second inside the first hides it
behind a screen most people open once and leave.

The list lives once, in `lib/dcc/nav.ts`, and is rendered by both the global rail
and the module's own quick-nav row — so the two can never advertise different
doors.

**Permission matrix:** `employees.dcc` with children `dashboard` and `masters`.
The dashboard node owns `/dcc/sp1` and `/dcc/call-log` as well, so neither
redirect becomes a hole in the matrix. Hiding a rail entry is presentation only; every page
calls `requireModuleView` itself, so a hidden door is shut to a direct URL too.

---

## 3 · DCC Master for a Position

**Mirrors Master JD exactly.** A Position (a `designation`) carries a template of
compliances. Anyone holding that position gets them; change position and the
compliances swap with the seat.

- Screen: `/dcc/masters`, tab **By Position**.
- Pick a position → Section · Code · Title · Frequency · Target · Unit · Sort.
- Saving **reconciles every holder**: the row is materialised into
  `dcc_kpi_items` for each holder and recorded in `dcc_master_links`.
- A materialised row is **read-only on the person's own screen**, badged "From
  the ⟨Position⟩ master". Editing it there would silently fork the template.
- Removing a master row **archives** the holders' copies — never deletes. The
  entries already recorded against it are the record.
- Reconcile also runs when a designation changes (salary profile edit, salary
  import) and nightly, so a designation edited by any other route is picked up
  by the next day at the latest.

## 4 · Person-specific DCC

**Mirrors Person-specific JD exactly.**

- Screen: `/dcc/masters`, tab **By Person**.
- A **dropdown beside the heading** picks the person — searchable, scrollable,
  keyboard-operable. No left rail of names eating a column.
- That person's **whole** DCC, in three groups, in this order:
  1. **From their position** — master rows, read-only, badged.
  2. **Given to them** — rows somebody else authored for them by name.
  3. **Their own** — rows they added themselves.
- Each row shows who authored it. That is what makes Step 5's delete rule legible
  instead of a surprise.

---

## 5 · Who may add, and who may delete

**Adding.** You may add a compliance for yourself always; for anyone in your
downline if you are a Team Lead / manager; for anyone at all if you are an admin
or super-admin. Downline is read transitively from `employees.manager_id` — never
from a role flag.

**What a new compliance reaches, and when.** Adding, editing or removing one
now calls `scheduleDccCalendarSync(owner)` from the action — it did not before,
so a compliance created at 10 am did not reach Google until the midday cron even
though `lib/dcc/calendar-sync.ts` claimed "every KPI add / edit / delete
schedules a sync". The Handholding calendar needs no call at all: it reads
`dcc_kpi_items` live on every render.

**Where.** Two doors onto one form (`components/dcc/compliance-form.tsx`):
**My Day** carries "New compliance for myself", because that is the screen people
already open daily; **DCC Masters → By Person** carries the same form for anyone
you may author for. One component, so the two can never offer different fields.

**Editing.** A compliance can be changed in place — title, section, code,
schedule, target, unit. It passes **exactly the gates a delete passes**
(`guardItemWrite`): a master row is refused, and a row Manan authored is refused
to everyone but him. An edit free to rename a row to anything would otherwise be
a way straight around the delete rule.

**The schedule is picked, never typed.**

> This closes a real bug. `frequency` is free text, and the old add form wrote
> only that — leaving `weekdays` NULL and `schedule_kind` on its default. But
> `scheduledDueOn` reads a NULL mask as **due every day**, so a compliance
> created as "Every Friday" was due seven days a week and one created as "Adhoc"
> was too. The row said one thing and the board did another.

`lib/dcc/frequency.ts` now produces the text and both columns from one call, and
the form prints the result back in plain words — "Due on Monday, Wednesday and
Friday. Next on Friday, 18-Sep-2026." Three choices, all of which produce a
`scheduled` row that actually reaches My Day:

| Choice | Stored as | Mask |
|---|---|---|
| Every working day | `Daily` | Mon–Sat |
| Every day | `Mon, Tue, Wed, Thu, Fri, Sat & Sun` | all seven |
| Chosen days | `Mon, Wed & Fri` | those days |

**Weekly, monthly and ad-hoc are deliberately not offered.** `scheduledDueOn`
admits only `scheduled` items to a day and nothing in this module surfaces the
other kinds, so those options would create a compliance that never appears
anywhere — a worse failure than not offering them. Imported sheet rows still
carry them; `parseFrequency` remains the reader for those.

**Deleting.** The ordinary rule is: you may delete what you may add. One
exception, and it is the whole point of this step:

> **A compliance authored by Manan Vasa may be deleted by Manan Vasa alone.**
> Not by the person who holds it, not by their Team Lead, not by another
> super-admin.

A capability (`dcc.protected_kpi_author`) held by one email address, not a role.
It **fails closed toward the ordinary rule**: if the author cannot be resolved,
the normal permission applies rather than an accidental lock.

---

## 6 · The Daily Board, and the 11:59 pm lock

Screen: `/dcc` — the one screen most people open daily.

- Opens on **today**, in **IST**. A server in UTC must never decide whose day it
  is.
- Lists the compliances **due today**, frequency-resolved — not the whole bank.
- Each row: title, section, code, target, a four-way status (Done · Not done ·
  NA · Pending), a note, and a number where the compliance has a target.
- Yesterday and earlier are **visible but read-only**, and say why.

| Who | May edit |
|---|---|
| Anyone | their own entries, **today only**, until **23:59:59 IST** |
| Manan Sir (`dcc.edit_past_entries`) | **any** employee's entry, **any** date |
| Everyone else, incl. super-admins | never a closed day |

One pure function, shared by the website and the mobile API. A client-side guard
alone would leave the app free to rewrite last week.

---

## 7 · The SP1 Call Log — entering the day

**Where it lives: the sheet at the top of `/dcc/dashboard`. You type into the
sheet itself** (account holder, 2026-09-17: "add the call log in the dcc
dashboard only, don't put it in the sidebar"), exactly as in the Google Sheet
tab "2. Mitul Call Log" the screen replaces. It had its own screen until that
date; it does not any more, and a separate entry form beside a grid of the same
fifteen rows would have put two copies of one thing on one page.

**This is the half the old module never had: it could report call outcomes but
had no way to enter them, so the report was permanently empty and looked
broken.**

Fifteen outcomes, in the sheet's exact order and colour:

| # | Outcome | Tone | Counts as |
|---|---|---|---|
| 1 | Registered | green | Connected |
| 2 | Registered for Next | green | Connected |
| 3 | Verbal Yes | green | Connected |
| 4 | Tentative | peach | Connected |
| 5 | Tentative for Next | peach | Connected |
| 6 | Call for Next | cream | Connected |
| 7 | I will get back if I want | rose / red ink | Connected |
| 8 | Not Interested | solid red | Connected |
| 9 | DND | solid red | Connected |
| 10 | Past Attended | rose / purple ink | Connected |
| 11 | Old Gratuate | rose / purple ink | Connected |
| 12 | No Busy | plain | Could Not Connect |
| 13 | Ringing | plain | Could Not Connect |
| 14 | Call Back | plain | Could Not Connect |
| 15 | Wrong Number | dark grey | Could Not Connect |

> **The one judgement call, stated openly so it can be corrected in one line:**
> rows 1–11 count as *Connected* — a human answered, whatever they then said.
> "Not Interested" is a person declining, not a failed call. Rows 12–15 never
> reached anyone. `Old Gratuate` keeps the sheet's spelling so the two documents
> map to each other unambiguously. Both facts live in one constant in
> `lib/dcc/sp1.ts`.

- One number per outcome per date. **Blank means zero.**
- A cell is typeable only when all three hold: **one person is selected** and you
  may fill for them, **the day has not closed**, and **the table exists**. Every
  other cell is plain text. "Everyone" sums the roster into each cell and a
  summed cell has no single owner to write back to, so it is never typeable.
- The same 11:59 pm IST lock as Step 6, same capability for Manan Sir — so
  "yesterday" means one thing across the whole module. The page computes which
  columns are open; `saveCallLog` checks the same three conditions again, so the
  open cell is an affordance and never a permission.
- Totals update **as you type** — the eight calculated rows *and* the Weekly
  Total column, rebuilt by the same `buildSp1Grid` the server and the 10 pm email
  use, so the person sees their own day resolve.
- **Save writes whole days**, one upsert each, and stops at the first refusal
  rather than letting a rejected Tuesday vanish while Wednesday saves.
- Storage is **one row per person per day per outcome**, uniquely keyed: a
  double-submit is harmless, and a sixteenth outcome is a data row, not a
  migration.

## 8 · The SP1 sheet — Jeevan's grid

**Where it lives: the top of `/dcc/dashboard`,** at full width, as the first and
largest thing on the page. Image 1 of the brief, reproduced. It had its own
screen until 2026-09-17; it does not any more.

- **Rows:** the fifteen outcomes in sheet order and sheet colour, numbered 1–15,
  then the calculated block numbered 16–23.
- **Columns:** **Monday to Saturday**, then a **Weekly Total**, then the next
  week. **Sunday is not a column** — the sheet omits it, and a permanently empty
  stripe would drag every weekly ratio toward a day nobody works.

| # | Row | Formula |
|---|---|---|
| 16 | Total Calls | sum of all fifteen |
| 17 | Connected | sum of rows 1–11 |
| 18 | Could Not Connected | sum of rows 12–15 |
| 19 | Connected Ratio | Connected ÷ Total Calls |
| 20 | Not Connected Ratio | Could Not Connected ÷ Total Calls |
| 21 | Connected to Not Connected Ratio | Connected ÷ Could Not Connected, as `X.XX : 1` |
| 22 | Registered to Connected Ratio | **Registered alone** ÷ Connected |
| 23 | Tentative to Connected Ratio | **Tentative alone** ÷ Connected |

> Rows 22 and 23 mean rows 1 and 4 **only**, not their whole colour band. Folding
> "Verbal Yes" into the conversion measure would quietly inflate it.

- **A day with no calls prints an em-dash — never `0%`, never `#DIV/0!`.** Zero
  percent reports a real failure on a day nobody worked, and would then be
  averaged into the weekly total and the ranking. The sheet's `#DIV/0!` is the
  bug being fixed, not the behaviour being copied.
- The Weekly Total **recomputes its ratios from summed counts**, never by
  averaging days — averaging weights a 3-call day the same as a 60-call one.
- Scope: yourself, your downline, everyone for a super-admin. `?person=` narrows,
  `?weeks=1|2|4` sets how many blocks are shown, `?week=` moves the window back.
  A positive `?week=` is clamped to 0 — a window in the future is empty columns.
- The table scrolls sideways in its own container; the page never does.
- It is drawn as a **spreadsheet**, not as app furniture: a numbered gutter, a
  `Date` row over a lavender `Day` row, the sheet's eight label colours and
  hairline cell borders. It is read aloud beside the Google Sheet it replaces
  — "row 19 is down" — so being recognisably the same sheet is the feature.

## 9 · The DCC Dashboard

Screen: `/dcc/dashboard`. **The dashboard is the SP1 sheet** (account holder,
2026-09-17) — §8's grid, full width, first. Brief item 1 also asked for the WMS
Dashboard's treatment of the same data; that lives **under** the sheet. Both
instructions were given and both are kept: the sheet answers "what did the calls
do", the sections answer "who is complying", and the sheet leads because it is
the one read out on the evening call.

**It is also where the day is filled** — §7's call log is the sheet's open
cells, not a second widget. **One window control governs the whole page**,
measured in weeks rather than loose days, because the sheet's shape is Monday→Saturday plus a Weekly Total.
Two controls would let the top and the bottom of one page describe two different
stretches of time. The sections stop at today; the sheet still shows the rest of
the current week as the empty columns it genuinely is.

**Under the sheet:**

| Section | What it answers |
|---|---|
| KPI strip | Compliance %, Filled %, Total Calls, Connected Ratio — each against the previous window |
| Compliance heatmap | person × day, coloured by outcome — where the gaps are |
| Daily trend | compliance % over the window with call volume behind it |
| Top / Bottom performers | by compliance % and streak, global rank preserved under filtering |
| Most-missed compliances | which duties the org drops, not which people |
| Section breakdown | compliance by section, so a whole area failing is visible |
| Status by person | the four statuses per person |
| Call-outcome mix | the fifteen outcomes as a share of the window |

Every section filters by person, team and window, and degrades to an empty state
rather than taking the page down.

**`?demo=1` — sample data, in memory only.** Every section is empty until the
module has been in use for weeks, and an empty dashboard cannot be judged. The
flag swaps BOTH reads for a generated fortnight of nine invented people
(`lib/dcc/demo-data.ts`) and runs it through the same `computeDccDashboard`, so
the sample page is the real page with different numbers rather than a second
implementation that can drift.

- **It writes nothing.** This repo points at the live database, so the only safe
  place for invented employees is memory; closing the tab is the whole cleanup.
- **It is deterministic** — seeded per person, date and field — so a screenshot
  is reproducible and "the heatmap looks wrong" can be checked twice.
- **The sheet is read-only in that mode**: there is no real person behind an
  invented column to save against.
- **It says so, loudly, at the top of the page.** A dashboard full of invented
  numbers that does not announce itself is the most expensive thing this flag
  could produce.

---

## 10 · The 10 pm report

A cron at **22:00 IST** (`30 16 * * *` UTC) sends one email per recipient, in
**Jeevan's SP1 layout** — the fifteen outcomes, the calculated block, and the
day's compliance summary, in the same colours as the screen.

| Recipient | Contents |
|---|---|
| Every employee with a DCC | their own day |
| A Team Lead / manager | their own day + **everyone below them**, transitively |
| Manan Sir | **everyone below him** — in practice the whole org |

- Sent to the **Altus work address** where one exists, falling back to personal.
- **One email per recipient**, not one per person reported: a manager of nine gets
  one email with nine people in it.
- Clipped safely before Gmail's 100 KB limit with a "view the rest online" link,
  rather than being silently truncated by Gmail.
- Idempotent per day — a re-run does not double-send.

---

## 11 · Google Calendar — the employee's Altus calendar

Every person-day's DCC becomes **one all-day event** in that employee's connected
Altus Google Calendar: `DCC — n of m done`, with the day's compliances and their
outcomes in the body.

- One event per person per day, tracked in `dcc_calendar_events`, so a re-sync
  updates rather than duplicates.
- Idempotent under a **Postgres advisory lock** — two crons, or a cron and a live
  edit, must never both create the event.
- A revoked grant **disconnects quietly** and never blocks the entry write.
  Filling your DCC must not fail because a calendar token expired.
- Runs on entry write (deferred, best-effort) and on a nightly catch-up cron.

> **No connect-gate.** The old module put a full-screen "connect your calendar"
> wall ahead of every other login gate. It is not coming back. Calendar sync is a
> benefit of connecting, not a toll on entering the app.

## 12 · Rudra's Hand-holding calendar

The Hand-holding week calendar already renders weekly calls from the **Add
Employee / Intern** form (image 3): Employee or Intern · Product · Batch No. (PS
and BSS only) · Start and End Date · repeating Weekly Calls of Type + Day +
Duration.

**What this step adds:** every DCC entry for that person lands on the same
calendar, on its own date, beside the weekly calls — so one week view answers both
"what calls does this person have" and "did they do their compliance".

- A Hand-holding roster name is typed text while a DCC belongs to an employee, so
  names are linked: automatically on an exact active-employee name match, by hand
  otherwise (Admin and Ruchita).
- An entry on hold, or outside its Start/End window, generates no occurrences.

---

## 13 · Data model

Everything below exists already except `dcc_call_logs`.

| Table | Holds |
|---|---|
| `dcc_kpi_items` | the compliances a person owes |
| `dcc_entries` | one outcome per compliance per day (per subject) |
| `dcc_master_items` | the Position template |
| `dcc_master_links` | which of a person's compliances came from a master |
| `dcc_clients` / `dcc_subjects` / `dcc_item_subjects` | the client and participant axes |
| `dcc_reviews` | a manager's sign-off of a person-day |
| `dcc_calendar_events` | the Google event per person-day |
| **`dcc_call_logs`** | **new (0235)** — one count per person per day per outcome |

**Migrations `0229` and `0230` are not applied to the live databases**, and
`0235` is new. Until each is applied its feature degrades to an explicit "not set
up yet" notice rather than throwing.

---

## 14 · Acceptance — how to know it is done

1. The Employees rail opens on DCC, three doors, each one loads, and **neither
   an SP1 nor a Call Log door is among them**. `/dcc/sp1` and `/dcc/call-log`
   both redirect to the dashboard.
2. A position master row saves and appears, read-only and badged, on every
   holder's person page.
3. A Team Lead adds a compliance for a report; it shows on that person's board.
4. That Team Lead is refused when deleting a compliance Manan authored, with a
   message that says why.
5. Today's entry saves; yesterday's is read-only and says so; Manan can edit
   yesterday's.
6. Fifteen numbers typed into today's column of the sheet save, and row 16 and
   the Weekly Total move as they are typed.
7. With "Everyone" selected, or on a closed day, no cell accepts typing and the
   sheet says why in one line.
7. A day with no calls prints `—` in every ratio, not `0%`.
8. The weekly column's Connected Ratio is computed from summed counts.
9. The dashboard renders every section, and no section can take the page down.
10. The 10 pm cron plans one email per recipient with the right people in it.
11. `tsc --noEmit`, `next build`, ESLint and the unit suite are all clean.
