# 01 — Incentive page error fixes

Two defects reported against `/incentive`: one runtime error that broke the page, one console warning. A third (a global console warning) was fixed alongside them.

---

## 1. Runtime error — `column "reversed" does not exist`

### Symptom

Every load of `/incentive` died in the React error boundary:

```
Error [PostgresError]: column "reversed" does not exist
  severity_local: 'ERROR', code: '42703'
  at async listIncentiveEntriesAdmin (lib\queries\incentives.ts:707:27)
```

The failing query was Drizzle's `select()` over `incentive_entries`, which expands to every column the schema declares:

```sql
select "id","src_sr_no","entry_date","incentive_name","period_month","emp_name","employee_id",
       "participant_name","prospect_group_name","amount","approved","approved_amt","paid","paid_amt",
       "paid_date","booked_amt","accrued_amt","client_status","payout_run_id","paid_by_id",
       "reversed","reversed_at","reversed_by_id","note","created_at","updated_at"
from "incentive_entries"
where ("incentive_entries"."period_month" >= $1 and "incentive_entries"."period_month" < $2)
order by "incentive_entries"."period_month" desc, "incentive_entries"."src_sr_no" desc
params: 2026-01-01,2027-01-01
```

### Cause

`db/schema.ts:3716-3720` declares `reversed`, `reversed_at` and `reversed_by_id` on `incentiveEntries`, and `db/schema.ts:3728` declares `incentive_entries_reversed_idx`. The migration that creates them — `db/migrations/0240_incentive_entry_reversal.sql` — **had never been applied to the live database**.

This is the failure mode `scripts/apply-one-migration.ts` documents in its own header: the `__schema_applied` ledger can be wrong, or a migration can simply be sitting unapplied, and every `select()` on the table then dies on the first missing column.

### Fix

Applied the single migration with the repository's targeted applier (not the bulk one — its own header says it re-attempts migrations `0029`–`0104` on a populated database):

```bash
npx tsx --env-file=.env.local scripts/apply-one-migration.ts \
  db/migrations/0240_incentive_entry_reversal.sql --apply
# ✓ applied 0240_incentive_entry_reversal.sql and recorded in __schema_applied.
```

The migration is additive and idempotent:

```sql
alter table incentive_entries
  add column if not exists reversed       boolean     not null default false,
  add column if not exists reversed_at    timestamptz,
  add column if not exists reversed_by_id uuid references employees(id) on delete set null;

create index if not exists incentive_entries_reversed_idx on incentive_entries (reversed);
```

### Verified after the fix

```
incentive_entries indexes:
  incentive_entries_employee_idx, incentive_entries_period_idx,
  incentive_entries_pkey, incentive_entries_reversed_idx
__schema_applied: 0240_incentive_entry_reversal.sql  ✓
```

### Files

- `db/migrations/0240_incentive_entry_reversal.sql` (pre-existing, now applied)
- `db/schema.ts:3716-3728` (pre-existing declaration)

**No code changed for this fix.** It was a database-state fix.

---

## 2. Console warning — `width(-1) and height(-1) of chart should be greater than 0`

### Symptom

18 occurrences in `dev.log`, immediately after each `GET /incentive 200`:

```
[browser] The width(-1) and height(-1) of chart should be greater than 0,
       please check the style of container, or the props width(100%) and height(100%),
       or add a minWidth(0) or minHeight(undefined) or use aspect(undefined) to control the
       height and width.
```

### Cause

`components/incentive/incentive-dashboard.tsx` mounted two recharts components — `IncentiveMonthlyChart` and `IncentiveNameChart` — inside a `<details>` element that is **collapsed by default**. A closed `<details>` hides its children with `display: none`, so `ResponsiveContainer` measures its box as `-1 × -1` on mount and logs one warning per chart. Two charts per load, across nine loads, accounts for the 18 warnings.

### Fix

The band's body now mounts only while the disclosure is open:

```tsx
const [trendsOpen, setTrendsOpen] = React.useState(false);
...
<details
  open={trendsOpen}
  onToggle={(e) => setTrendsOpen(e.currentTarget.open)}
  className="group rounded-2xl border border-hairline bg-surface-card"
>
  <summary>…</summary>
  {trendsOpen ? (
    <div className="space-y-3 border-t border-hairline p-4 max-md:p-3">…</div>
  ) : null}
</details>
```

This matches the band's stated intent — "collapsed by default so it costs nothing until it is wanted" — better than the previous version did, since the charts now genuinely do not render until opened.

**No behaviour change to the toggle itself.** `group-open:rotate-180` on the chevron still works (it keys off the `[open]` attribute, which is still set), and nothing else in the module opens the disclosure programmatically — verified in `components/incentive/incentive-dashboard-drilldown.tsx`, which only handles `[data-incentive-person]` clicks.

### File

- `components/incentive/incentive-dashboard.tsx`

---

## 3. Console warning — `Detected scroll-behavior: smooth on the <html> element`

### Symptom

```
[browser] Detected `scroll-behavior: smooth` on the `<html>` element. To disable smooth scrolling
during route transitions, add `data-scroll-behavior="smooth"` to your <html> element.
```

Six occurrences. Not Incentive-specific — `app/globals.css:539` sets `scroll-behavior: smooth` on `html`, so Next.js warns on every navigation.

### Fix

Added the attribute Next.js asks for, in `app/layout.tsx`:

```tsx
<html
  lang="en"
  className={…}
  data-density={density}
  style={htmlStyle}
  data-scroll-behavior="smooth"
  suppressHydrationWarning
>
```

The router now suspends smooth scrolling for the duration of a route transition only. The app's own anchor jumps keep their animation — the dashboard section nav passes `behavior: "smooth"` explicitly, which overrides.

### File

- `app/layout.tsx`

---

## Verification

```
npx tsc --noEmit                       exit 0
npx eslint on both changed files       clean
incentive unit tests                   458 passed (before the new test files were added)
```

The database fix was verified directly against the live database (columns and index present, migration recorded).
