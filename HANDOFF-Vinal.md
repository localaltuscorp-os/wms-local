# HANDOFF — `Vinal` branch

**Updated:** 2026-09-17
**Repo:** `https://github.com/localaltuscorp-os/wms-local` · branch `Vinal`
**Audience:** team, lead, and whoever runs the SQL in Supabase.

---

## 1. Branch state

**Everything described below is committed and pushed.** `Vinal` and
`origin/Vinal` are the same commit — nothing is parked in a working tree, a
stash or a second checkout. `git fetch && git checkout Vinal` gets you all of
it.

| Commit | When | What |
|---|---|---|
| `35497680` | 17 Sep, 13:13 | Tailwind reads three directories, not the whole project |
| `49fc490e` | 17 Sep, 12:41 | Stop Tailwind reading documentation as a source of classes |
| `f7c7bc42` | 16 Sep, 22:47 | Rebuild DCC from a written spec; Initiator Status gains Archived; JD speaks Google Calendar — 131 files, +7724 / −7133 |
| `0b7b3807` | 16 Sep, 13:14 | Merge `origin/main` into `Vinal` |

> **The code is on the branch; the database is not.** Section 2 lists four
> migrations that still have to be run by hand. Until they are, the DCC screens
> show an explicit "not set up yet" notice and picking **Archived** fails at the
> database. That is the only thing standing between this branch and working
> software.

---

## 2. Run this SQL in Supabase

Three of these five are new on this branch (`0234`, `0235`, `0236`); the other two have been outstanding since 15 September. **All are idempotent** (`if not exists` / `do $$` guards), so they are safe to run twice.

| File | What it does | Needed before |
|---|---|---|
| `db/migrations/0234_initiator_status_archived.sql` | Adds **Archived** as a sixth Initiator Status verdict | Picking "Archived" on a task / goal / project |
| `db/migrations/0235_dcc_call_logs.sql` | Creates `dcc_call_logs` — the SP1 call log | The SP1 sheet on the DCC Dashboard, which is both where calls are typed and where they are read |
| `db/migrations/0236_recruitment_jd_roles.sql` | Creates `recruitment_jds` and `recruitment_jd_sends`, keyed by the role's own `slug` | Saving or sending anything in Operations → Masters → Recruitment JD. Until it runs, the page shows all eight JDs read-only and names the file |

Supabase Dashboard → SQL Editor → New query → paste the file → Run.

> 🔴 **Still outstanding from 2026-09-15** and blocking two DCC features:
> `db/migrations/0229_dcc_calendar_events.sql` (Google Calendar sync) and
> `db/migrations/0230_dcc_master_items.sql` (DCC Masters). Both screens
> currently show an explicit "not set up yet" notice instead of throwing — run
> these two and the notices disappear.

**Order to run:** `0229` → `0230` → `0234` → `0235` → `0236`.

### 0234 — Archived verdict

```sql
alter type approval_status add value if not exists 'archived';

do $$
begin
  if to_regclass('public.goal_approver_statuses') is not null then
    alter table goal_approver_statuses drop constraint if exists goal_approver_statuses_approval_status_check;
    alter table goal_approver_statuses add constraint goal_approver_statuses_approval_status_check
      check (approval_status in ('approved','not_approved','on_hold','archived','cancelled'));
  end if;
  if to_regclass('public.weekly_goal_approver_statuses') is not null then
    alter table weekly_goal_approver_statuses drop constraint if exists weekly_goal_approver_statuses_approval_status_check;
    alter table weekly_goal_approver_statuses add constraint weekly_goal_approver_statuses_approval_status_check
      check (approval_status in ('approved','not_approved','on_hold','archived','cancelled'));
  end if;
end $$;
```

The `project_nodes` constraint is re-added **`NOT VALID`**, exactly as `0204` wrote it — that table has rows older than the constraint which were never checked, and a validating constraint would scan the table and fail on one of them.

### 0235 — the SP1 call log

```sql
create table if not exists dcc_call_logs (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id) on delete cascade,
  log_date date not null,
  disposition text not null,
  count integer not null default 0 check (count >= 0),
  note text,
  filled_by_id uuid references employees(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists dcc_call_logs_uq
  on dcc_call_logs (employee_id, log_date, disposition);

create index if not exists dcc_call_logs_date_idx
  on dcc_call_logs (log_date, employee_id);
```

**No CHECK on `disposition`** — deliberately. The fifteen outcomes live in `lib/dcc/sp1.ts`, the write path validates against them, and the grid drops anything it does not recognise. A constraint here would mean a migration every time Jeevan's sheet gains a row.

### Verifying afterwards

```sql
-- All four tables present?
select table_name from information_schema.tables
where table_schema = 'public' and table_name like 'dcc%'
order by table_name;

-- Archived accepted by the enum?
select unnest(enum_range(null::approval_status));
```

---

## 3. Work delivered (16–17 September)

Items 1–7 landed on 16 September in `f7c7bc42` and the merge before it; items 8 and 9 are from 17 September.

### 1. Merged `origin/main` into `Vinal`
- **What changed**: Resolved 4 conflicts (`HANDOFF.md`, `vercel.json`, `lib/hr/console-nav.ts`, `app/(app)/api/google/callback/route.ts`). Merge commit `0b7b3807`.
- **Why**: The branch had drifted behind the team's work and the two calendar integrations were about to collide.
- **SQL**: None.

### 2. JD Frequency picker now speaks Google Calendar
- **What changed**: The Job Description frequency field offers date-derived presets (Does not repeat · Daily · Weekly on ⟨day⟩ · Monthly on the ⟨nth⟩ ⟨day⟩ · Annually on ⟨date⟩ · Every weekday) plus a **Custom recurrence** dialog — repeat every N days/weeks/months/years, weekday chips, and Ends Never / On ⟨date⟩ / After N occurrences. The shared vocabulary lives in `lib/recurrence/google-recurrence.ts` and the dialog in `components/recurrence/custom-recurrence-dialog.tsx`, so Tasks and JD cannot drift apart.
- **Why**: Account holder: the frequency section must behave like Google Calendar's.
- **Note**: `lib/jd/recurrence.ts` matches an RRULE **in closed form** rather than generating occurrences — the generator in `lib/recurrence/rrule.ts` caps at 200 occurrences, which makes it the wrong tool for "is this due on this day?".
- **SQL**: None — the rule is stored in the existing `recurrence` column.

### 3. "General JD" renamed to "Master JD"
- **What changed**: The label in the Operations masters rail and everywhere else it is user-visible.
- **Why**: Account holder's wording.
- **SQL**: None.

### 4. Initiator Status — renamed, gains **Archived**, and N/A for self-raised work
- **What changed**: "Approver / Initiator Status" is now **Initiator Status** across WMS Tasks, Goals and Projects. The verdicts are Pending · Approved · Not Approved · On Hold · **Archived** · Cancelled. When the initiator IS the doer, the column reads **Not Applicable** — an admin or super-admin may still overrule, nobody else can.
- **Why**: Account holder's brief, including "keep the Pending option".
- **Bug fixed on the way**: Goals and Tasks disagreed about self-raised work — Goals set `isDoer: false` for the raiser, which let somebody approve their own goal. Both now go through one explicit `isSelfRaised` flag instead of fudging `isDoer`.
- **SQL**: `db/migrations/0234_initiator_status_archived.sql`.

### 5. JD — person picker replaces the left rail
- **What changed**: Person-specific JD picks the person from a searchable dropdown beside the heading (`components/operations/job-description/jd-person-picker.tsx`) instead of a 68-line left rail of names. Full keyboard support, `role="listbox"`, its own scroll container.
- **Why**: The rail cost a whole column on every screen width to answer a question you ask once per visit.
- **SQL**: None.

### 6. DCC removed from the Employees module
- **What changed**: The whole old DCC surface deleted — 46 files: nav entries, `app/(app)/dcc/`, `components/dcc/`, three crons, the permission branch, the `/dcc` workspace mapping. **Three app-wide gates came out with it**: the post-login "fill your DCC" wall, the manager review wall, and the Google-Calendar connect prompt that fired ahead of every other login gate.
- **Why**: Account holder: "remove all the dcc section from employees completely — we will make that again".
- **SQL**: None. **No table was dropped and no data was touched.**

### 7. DCC rebuilt from a written specification
- **What changed**: The module rebuilt against **[`docs/DCC-SPEC.md`](./docs/DCC-SPEC.md)**, which is now authoritative. Three doors under Employees, all generated from one list (`lib/dcc/nav.ts`) that the sidebar and the module's own tab row both render:

  | Door | What it is |
  |---|---|
  | `/dcc` | My Day — today's compliances, four-way status, saves per row |
  | `/dcc/dashboard` | Jeevan's SP1 sheet at full width — **typed into**, not just read — then the WMS-style KPI strip, heatmap, trend, leaderboards |
  | `/dcc/masters` | By Position and By Person, mirroring Master JD / Person-specific JD |

  **`/dcc/dashboard?demo=1`** fills every section with a generated fortnight of nine invented people (`lib/dcc/demo-data.ts`) so the layout can be judged before anyone has filled a real day. Nothing is written to the database — this checkout points at live Supabase — the sheet is read-only in that mode, and a loud amber bar at the top says the numbers are invented. A "Preview with sample data" link on the real dashboard turns it on.

  **No SP1 door and no Call Log door** (account holder, 2026-09-17) — the sheet *is* the dashboard and the call log *is* that sheet's open cells. `/dcc/sp1` and `/dcc/call-log` only redirect there now, for old bookmarks and already-sent mail. `app/(app)/dcc/call-log/actions.ts` stays put: `saveCallLog` is still the one write path, now called from the sheet.

- **Making your own compliance**: **My Day** has "New compliance for myself"; **DCC Masters → By Person** has the same form for anyone you may author for, plus **Edit** on every row. One shared component (`components/dcc/compliance-form.tsx`), one shared guard (`guardItemWrite` in `app/(app)/dcc/actions.ts`) for edit and delete alike.
- **Live calendar sync on KPI writes**: `addDccItem` / `updateDccItem` / `deleteDccItem` now call `scheduleDccCalendarSync(owner)`. They never did — only entry fills (`lib/dcc/write.ts`) and the master reconcile did — so a compliance added at 10 am did not reach Google Calendar until the midday cron, despite `calendar-sync.ts` documenting the opposite. The HH calendar was always live (it reads `dcc_kpi_items` on render).
- **Schedule bug closed**: the old add form wrote only the free-text `frequency` and left `weekdays` NULL — which `scheduledDueOn` reads as *due every day*, so "Every Friday" was due seven days a week. `lib/dcc/frequency.ts` now writes the text and both columns from one call, the form reads the schedule back in plain words with the next due date, and `tests/unit/dcc-frequency.test.ts` holds the round trip.
- **The missing half**: the old module could *report* call outcomes but had no way to *enter* them, so the report was permanently empty. The sheet's open cells are that screen — you fill the day where you read it.
- **11:59 pm IST lock** now governs the call log as well as compliance entries, through the same `checkDccEntryWindow`. Only `dcc.edit_past_entries` (Manan Sir) reaches a closed day, for any employee.
- **Team Leads** author compliances for themselves and their transitive downline; a compliance **Manan authored is his alone to delete** (`dcc.protected_kpi_author`, fails closed toward the ordinary rule). The Person view shows the author on every row so the refusal is legible before anyone tries.
- **10 pm report** (`30 16 * * *` = 22:00 IST) now **leads with the SP1 tables** and puts the compliance summary under them. Each person gets their own day, every Team Lead everyone below them transitively, the owner everybody. Still preview-only until `DCC_DAILY_REPORT_LIVE=true`.
- **Google Calendar** sync restored on the entry write and the nightly cron. **The connect-gate is not back** — sync is a benefit of connecting, not a toll on entering the app.
- **Hand-holding calendar**: already read DCC entries via `lib/queries/hh-calendar.ts`; verified intact, not rebuilt.
- **SQL**: `db/migrations/0235_dcc_call_logs.sql`.

### 8. Fixed: every page dying with "Parsing CSS source code failed" *(17 Sep)*
- **What changed**: Nothing in the source. `.next` was deleted and rebuilt.
- **The real cause**: Tailwind v4's automatic source detection walks the **whole project**, and it was reading `.next/dev/cache/turbopack/*.sst` — Turbopack's **binary** cache. Those files hold compressed copies of this codebase, so scanning them yields class names with raw control bytes spliced through the middle. Tailwind emitted them as real utilities, the CSS parser rejected them, and every page died pointing at a line in `app/globals.css` that nobody wrote. `globals.css` was never modified; `git diff` on it was empty throughout.
- **Why it kept coming back**: the bad utilities are regenerated the moment the Turbopack cache refills. A cold start was always clean, and stayed clean only until the cache grew again — which is why clearing caches and restarting appeared to work and then failed a few minutes later.
- **The fix**: `app/globals.css` now declares `@import "tailwindcss" source(none)` and three explicit `@source` directives for `app/`, `components/` and `lib/`. Automatic detection is off, so only real code is ever scanned. Markdown is excluded by the same stroke — a note in this file quoting a broken utility had already caused one separate instance of the same failure.
- **Verified against the condition that used to break it**: a dev server restarted on a populated 1.3 GB Turbopack cache (28 `.sst` files) served 15 routes at 200 with **0** CSS errors and no garbage in the stylesheet. The generated CSS is 410,842 bytes against 411,483 before — the only thing lost is the garbage.
- **⚠️ If you add a directory containing `className` strings**, add it to the `@source` list in `app/globals.css` or its classes will silently not be generated. `grep -rl 'className=' <dir>` is the check.
- **SQL**: None.

---

### 9. Recruitment JDs — the JDs we send candidates *(17 Sep)*
- **What changed**: A new section at **Operations → Masters → Recruitment JD**. One JD per role we hire for, each with an **original master** (the JD Rutvisha wrote) and a **recruiter copy** that can be edited freely, sent to anyone by **WhatsApp or email**, with every send recorded.
- **The template**: one field list in `lib/operations/recruitment-jd.ts` — a ten-line fact box (Job Title, Department, Location, Job Type, Work Mode, Work Schedule, Duration, Experience, Qualification, Compensation) and twelve body sections (About Altus Corp, Role Summary, Key Responsibilities, Required Qualifications, Technical Skills, Core Competencies, Must Have, Preferred Experience, KPIs, Why Join Altus Corp, How to Apply, ATS Keywords). It drives the editor, the preview, the WhatsApp text and the email, so the four cannot drift apart. **Every JD has the same structure; only the content differs** — a test asserts all eight fill all eighteen core headings, and that a section a role has nothing for stays blank and disappears from the message rather than being padded.
- **ATS Keywords are internal** — editable and copyable for job boards, never included in anything sent to a candidate.
- **The eight roles**: the ten PDFs became eight. Sales and Operations each arrived twice — a polished version and a longer recruiter-facing one — and each pair was merged rather than leaving a recruiter choosing between two JDs for one job.
- **Editing never disturbs the originals**: a recruiter copy identical to the master stores nothing, so master edits keep flowing through until somebody genuinely diverges. *Reset to master* drops the copy; *Restore the original* puts the master back to the shipped text. The originals are inserted once per role and never re-applied, so a deploy cannot silently undo an HR edit.
- **Not keyed to `interview_positions`**: that table is the interview *grade* ladder (Executive, Senior Manager, First-Year Intern). Several of these JDs span two grades at once ("Senior Sales Manager / Sales Manager") and most grades will never have a JD, so a recruitment JD has its own slug-keyed role list with an optional link back to a grade.
- **Moved out of HR the same day**, at the account holder's request: `/hr/recruitment-jd` → `/operations/masters/recruitment-jd` (the old path redirects; the HR rail no longer offers it). It is the third job-description master, beside Master JD and Person-specific JD — those two say what a seat does once somebody is in it, this one says what the seat is while we are still looking.
- **Who may do what**: the Operations room is open to every employee, so **reading is open**, like every other master. **Editing and sending are HR staff only**, enforced in the server actions; everyone else gets the same page marked read-only, with no buttons that would refuse them. This is the split the neighbouring Master JD already uses.
- **SQL**: `db/migrations/0236_recruitment_jd_roles.sql` — see §2. Self-contained and idempotent: it creates both tables whether or not `0232` was ever applied.

---

## 4. Verification

| Check | Result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npx next build` | clean — all five DCC routes and both crons registered |
| `npx eslint` on every new/changed file | clean |
| `npx vitest run --no-file-parallelism` | **3146 passed, 7 skipped, 0 failed** |
| All five DCC routes against the live DB | 200, no server-side errors |
| Routes touched by the removal (`/hub`, `/dashboard`, `/tasks`, `/attendance`, `/profile`, `/goals`, `/operations`, `/people-allocation`, `/inbox`, `/hr`, `/my-salary`, `/incentive`) | all 200 |

**40 new unit tests** across `tests/unit/dcc-sp1.test.ts`, `tests/unit/dcc-sp1-email.test.ts` and `tests/unit/dcc-nav.test.ts`.

---

## 5. Two things to decide

1. 🟡 **Jeevan's reference sheet has drifted from the calendar.** It labels `13-Sep-2026` as "Monday"; that date is a **Sunday**. The whole Day row is one step off, so the sheet's six-day blocks are really Sun–Fri while claiming Mon–Sat. This app derives the weekday from the date, so its columns will not line up with the sheet's labels. The structure was copied (six working days, weekly total, Sunday omitted); the typo was not.

2. **The Connected partition is a judgement call**, in one constant in `lib/dcc/sp1.ts`. Rows 1–11 count as Connected — including *Not Interested* and *DND*, on the grounds that a person declining is not a call that failed to reach anybody. Rows 12–15 (*No Busy, Ringing, Call Back, Wrong Number*) reached nobody. One line to change if that is wrong.
