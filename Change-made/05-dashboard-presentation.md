# 05 — Dashboard presentation

**Requirement:** final dashboard adjustments — the summary bar must be significantly larger and easier to scan; the status KPIs must read as proper cards; the target warning must sit above the Team/User control; the six period options and the six status buckets must stay; **do not introduce another KPI row**; do not change grading, analytics, status filtering, Team/User logic, target logic, hierarchy or the underlying data.

All of this is presentation only. No calculation, query, permission or rule was touched.

---

## What was already correct (verified, not changed)

| Requirement | State found |
|---|---|
| The "Fill your incentive target for this month and next month" warning sits **above** the Team/User control | Already true — `TargetWarningBar` renders at line 149, the control row at 154. A test now pins the ordering so it cannot drift back. |
| Team / User switch offered, and hidden for a viewer with no team | Already true — `canSwitchView = data.scope.canSeeTeam`, computed server-side, hidden not disabled. |
| Current Month · Specific Month · Last 3 Months · Last 6 Months · YTD | Already true — `PERIOD_KINDS` in `lib/incentive/analytics/periods.ts:26`. |
| Six status buckets: Not Approved · Approved · Due · Not Due · Paid · Unpaid | Already true — `STATUS_KEYS` in `lib/incentive/analytics/model.ts:68`, rendered as one `IncentiveKpiRow cols={6}`. |

## Something that was NOT found

The requirement also said to **remove** top KPI cards labelled **Earned / Paid / Unpaid / Attainment**. **No such cards exist in this tree.** The dashboard has exactly one KPI row — the six status buckets above, which the requirement says to keep. Elsewhere:

- Incentive → Targets has **Target · Actual · Attainment** (`components/incentive/incentive-targets.tsx:210-259`).
- Incentive → Billing has **Billed · Collected · Outstanding · Salespeople** (`components/incentive/billing-dashboard.tsx:222-252`).
- Incentive → Status report shows **Booked · Accrued · Paid** per window (`components/incentive/incentive-status-report.tsx`).

None of these is an "Earned / Paid / Unpaid / Attainment" row, and all are scoped areas with their own requirements. The likely explanation is that the earlier UI restructure already removed those cards (the audit records `DASH-01 / DASH-02` — "two time controls, two contradictory KPI rows" — as addressed, with the KPI row now computed from the same period-scoped data as the cards below it). **Nothing was deleted for this requirement.** If a specific screen still shows those four cards, it was not found in this repository and should be pointed out.

---

## Change 1 — the team summary bar

**File:** `components/incentive/analytics/incentive-analytics-dashboard.tsx`, `TeamSummary`

The screenshot showed the bar pinned to the left with a large empty area to its right: `flex flex-wrap items-start gap-x-8` with 20px figures and a 10.5px label — four figures of equal visual weight clustered in the left third of the card.

**Before**

```tsx
<section className="flex flex-wrap items-start gap-x-8 gap-y-3 rounded-2xl border border-hairline bg-surface-card px-4 py-4">
  <Metric label="Employees">
    <span className="text-[20px] font-black …">{data.summary.people}</span>
    <span className="text-[12.5px] font-semibold text-ink-subtle">{data.scope.all ? "All employees" : "Your team"}</span>
  </Metric>
  … Incentive … Target … Grades (11px pills) …
</section>
```

**After**

```tsx
<section className="rounded-2xl border border-hairline bg-surface-card px-5 py-5 max-md:px-4 max-md:py-4">
  <div className="grid gap-x-8 gap-y-5 sm:grid-cols-2 lg:grid-cols-[auto_auto_auto_minmax(0,1fr)] lg:items-center">
    <Metric size="lg" label="Employees"> … </Metric>
    <Metric size="lg" label="Incentive"> … </Metric>
    <Metric size="lg" label="Target">    … </Metric>
    <div className="lg:border-l lg:border-hairline lg:pl-8">
      <Metric size="lg" label="Grades"> … A/B/C/D pills at size="lg" … </Metric>
    </div>
  </div>
</section>
```

What changed, and why each part helps scanning:

- **A four-column grid instead of a wrapping flex row.** On a wide screen the four figures occupy the full width, so the empty right half is gone. It still steps down: two columns on small screens, one implicit column on narrow phones.
- **Figures at `text-[clamp(26px,2vw,34px)]`**, up from a flat 20px — roughly 70% larger at desktop width, and still bounded so it does not overflow at 1280px.
- **Labels at 11.5px / `tracking-[0.12em]`**, up from 10.5px / `0.1em`, and values are `items-baseline` aligned so a figure and its caption sit on one line.
- **A hairline rule before the grade spread** (`lg:border-l lg:pl-8`) separates "how many people and how much" from "how they are distributed", which is a different kind of fact.
- **Grade pills at `size="lg"`** — 14px text, `px-3 py-1.5`, and a `min-w-[68px]` so the four pills line up regardless of digit count, which is what makes the A/B/C/D distribution readable as a shape rather than four ragged chips.

`Metric` gained an optional `size?: "md" | "lg"` (default `"md"`), so **`MyPerformance` above it renders exactly as before**. `IncentiveBadge` gained an optional `size?: "sm" | "lg"` (default `"sm"`), so the other consumers across the module are unchanged.

---

## Change 2 — the status KPI cards

**File:** same, `StatusKpi` and its one call site.

The requirement: clear KPI hierarchy, larger primary number, clear label, visible entry count, consistent height, compact spacing, aligned layout, clickable behaviour unchanged.

**Before** — `min-h-[88px]`, figure `clamp(19px,1.4vw,24px)`, and the entry count buried inside a caption string:

```tsx
caption={
  <>
    {s.count} {s.count === 1 ? "entry" : "entries"}
    {s.unvaluedCount > 0 && ` · ${s.unvaluedCount} amount not set`}
  </>
}
```

Both figures arrived as one 12px `font-medium text-ink-subtle` line.

**After** — `min-h-[116px]`, figure `clamp(24px,1.9vw,31px)`, and the count promoted to its own prop:

```tsx
<StatusKpi label={s.label} value={formatInr(s.amount)}
           count={s.count} unvaluedCount={s.unvaluedCount}
           tone={SUMMARY_TONE[s.key] ?? "slate"}
           selected={active === s.key}
           onClick={() => setActive(active === s.key ? null : s.key)} />
```

and inside the card:

```tsx
<span className="flex flex-col gap-0.5">
  <span className="text-[12.5px] font-bold text-ink-soft tabular-nums">
    {count} {count === 1 ? "entry" : "entries"}
  </span>
  {unvaluedCount > 0 && (
    <span className="text-[11.5px] font-medium text-ink-subtle">{unvaluedCount} amount not set</span>
  )}
</span>
```

Reading the card top to bottom: label (dot + uppercase 10.5px) → the money figure (up to 31px, `--font-display`, 800) → the entry count in bold ink → an optional secondary "N amount not set" line. Three levels of hierarchy, no level competing.

**Consistent height** comes from `min-h-[116px]` plus `flex-col justify-between`, so cards with and without the second line are the same height and their contents align across the row. `IncentiveKpiRow` already handles the responsive steps (`2 → 3 → 6` columns).

**Clickable behaviour is unchanged**: still a `<button>` with `aria-pressed` and the same `setActive` toggle, still `data-status-card={s.key}`, still the same selection border. No test asserts on this markup, and none needed to change.

**The KPI row count is unchanged** — the dashboard still renders exactly one `<IncentiveKpiRow>`, now pinned by a test.

---

## What was explicitly left alone

- `INCENTIVE_GRADE_BANDS` still supplies the band legend. The component never calls `gradeFor`, `competitionRanks` or `periodCtc` — it prints figures the server already computed. A test asserts the absence of those calls.
- Status filtering (`activeCard` → `StatusTable`), the grade report table, the person drill-down, `MyPerformance`'s visibility rule (`showMine`), the period/scope loading logic in `load()` — untouched.
- `lib/incentive/analytics/*` — untouched except one additive field, `scope.viewerId`, documented in `04-incentive-breakup-letter.md`.

---

## Verification

Covered by `tests/unit/incentive-payout-breakup.test.ts` (dashboard section):

- the target warning renders **above** the Team/User control (index ordering),
- exactly **one** `IncentiveKpiRow` on the dashboard,
- all five period labels still present,
- every status card receives `count` and `unvaluedCount`, and the singular/plural switch is intact,
- the team summary uses `size="lg"` for Employees, Grades and the grade pills,
- the band legend still comes from `INCENTIVE_GRADE_BANDS`, and no grading/ranking function is called.

```
npx tsc --noEmit    exit 0
npx eslint          clean (one pre-existing warning elsewhere in the Incentive page, see 07)
```

---

## Risk

The summary bar's largest figure, `formatInr(data.summary.earned)`, can be a long string (e.g. `₹1,23,45,678`). At `clamp(26px,2vw,34px)` inside an `auto`-sized grid column on a 1280px screen this is comfortable, but a figure in the crores plus a four-pill grade row on a narrow laptop is the case to eyeball. If it wraps awkwardly, the fix is to lower the `clamp` floor or let the Grades column wrap beneath — not to shrink the other three figures.
