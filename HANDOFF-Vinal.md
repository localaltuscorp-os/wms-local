# HANDOFF — `Vinal` branch

**Updated:** 2026-09-16
**Repo:** `https://github.com/localaltuscorp-os/wms-local` · branch `Vinal`
**Audience:** team, lead, and whoever runs the SQL in Supabase.

---

## 1. Run this SQL in Supabase

Two new migrations today. **Both are idempotent** (`if not exists` / `do $$` guards), so they are safe to run twice.

| File | What it does | Needed before |
|---|---|---|
| `db/migrations/0234_initiator_status_archived.sql` | Adds **Archived** as a sixth Initiator Status verdict | Picking "Archived" on a task / goal / project |
| `db/migrations/0235_dcc_call_logs.sql` | Creates `dcc_call_logs` — the SP1 call log | The DCC Call Log and SP1 Report screens |

Supabase Dashboard → SQL Editor → New query → paste the file → Run.

> 🔴 **Still outstanding from 2026-09-15** and blocking two DCC features:
> `db/migrations/0229_dcc_calendar_events.sql` (Google Calendar sync) and
> `db/migrations/0230_dcc_master_items.sql` (DCC Masters). Both screens
> currently show an explicit "not set up yet" notice instead of throwing — run
> these two and the notices disappear.

**Order to run:** `0229` → `0230` → `0234` → `0235`.

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

## 2. Work Delivered Today (2026-09-16)

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
- **What changed**: The module rebuilt against **[`docs/DCC-SPEC.md`](./docs/DCC-SPEC.md)**, which is now authoritative. Five doors under Employees, all generated from one list (`lib/dcc/nav.ts`) that the sidebar and the module's own tab row both render:

  | Door | What it is |
  |---|---|
  | `/dcc` | My Day — today's compliances, four-way status, saves per row |
  | `/dcc/call-log` | **New** — enter the fifteen call outcomes for a day |
  | `/dcc/sp1` | Jeevan's grid: Mon→Sat, Weekly Total, rows 1–23, no Sunday column |
  | `/dcc/dashboard` | The SP1 day card + WMS-style KPI strip, heatmap, trend, leaderboards |
  | `/dcc/masters` | By Position and By Person, mirroring Master JD / Person-specific JD |

- **The missing half**: the old module could *report* call outcomes but had no way to *enter* them, so the report was permanently empty. `/dcc/call-log` is that screen.
- **11:59 pm IST lock** now governs the call log as well as compliance entries, through the same `checkDccEntryWindow`. Only `dcc.edit_past_entries` (Manan Sir) reaches a closed day, for any employee.
- **Team Leads** author compliances for themselves and their transitive downline; a compliance **Manan authored is his alone to delete** (`dcc.protected_kpi_author`, fails closed toward the ordinary rule). The Person view shows the author on every row so the refusal is legible before anyone tries.
- **10 pm report** (`30 16 * * *` = 22:00 IST) now **leads with the SP1 tables** and puts the compliance summary under them. Each person gets their own day, every Team Lead everyone below them transitively, the owner everybody. Still preview-only until `DCC_DAILY_REPORT_LIVE=true`.
- **Google Calendar** sync restored on the entry write and the nightly cron. **The connect-gate is not back** — sync is a benefit of connecting, not a toll on entering the app.
- **Hand-holding calendar**: already read DCC entries via `lib/queries/hh-calendar.ts`; verified intact, not rebuilt.
- **SQL**: `db/migrations/0235_dcc_call_logs.sql`.

### 8. Fixed: `localhost` returning 500 on every page
- **What changed**: Nothing in the source. `.next` was deleted and rebuilt.
- **Why**: Tailwind v4 auto-detects its sources across the whole project, **markdown included**. A note in this very file quoted a broken z-index utility verbatim; Tailwind read it as a real class candidate and emitted invalid CSS, which failed the PostCSS transform of `app/globals.css` and took every page down with a build error. `globals.css` itself was never modified — `git diff` on it is empty.
- **The durable fix**: `app/globals.css` now carries `@source not "**/*.md"`, so documentation can never again inject a utility class into the stylesheet. Class names in notes are also written as code spans without the bracket syntax.
- **Action needed**: none beyond pulling. Restart the dev server if it is still showing the old error.
- **SQL**: None.

---

## 3. Verification

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

## 4. Two things to decide

1. 🟡 **Jeevan's reference sheet has drifted from the calendar.** It labels `13-Sep-2026` as "Monday"; that date is a **Sunday**. The whole Day row is one step off, so the sheet's six-day blocks are really Sun–Fri while claiming Mon–Sat. This app derives the weekday from the date, so its columns will not line up with the sheet's labels. The structure was copied (six working days, weekly total, Sunday omitted); the typo was not.

2. **The Connected partition is a judgement call**, in one constant in `lib/dcc/sp1.ts`. Rows 1–11 count as Connected — including *Not Interested* and *DND*, on the grounds that a person declining is not a call that failed to reach anybody. Rows 12–15 (*No Busy, Ringing, Call Back, Wrong Number*) reached nobody. One line to change if that is wrong.
