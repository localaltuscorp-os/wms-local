# 03 — Team / User scope on the Billing area

**Requirement:** the Incentive → Billing area must follow the same scope model as Dashboard and Targets. Team = the manager's own data plus their whole transitive downline; User = the signed-in user's own data; company-wide/admin only where existing permissions allow. Server-side enforcement, not UI filtering. No empty Team mode for someone without a team.

---

## The problem being fixed

The Billing ledger reads a Google Sheet (`lib/queries/billing.ts`, `SHEET_ID`, range `Billing!A2:BD1000`). It was **unscoped inside a scoped module**: every employee entitled to the Incentive module saw every deal in the company. The audit recorded this as `§11.2.4` and it was an open product question. This change answers it.

---

## The shape of the fix

The Billing ledger's only identity column is the **salesperson's typed name** (sheet column `AG`, index 32). It cannot be joined to `employees.id`. So the scope has to arrive as a set of names, matched on the same normalised key the rest of the module already uses.

### `lib/incentive/analytics/visible-names.ts` (new)

```ts
export async function visibleNameKeysFor(scope: AnalyticsScope): Promise<ReadonlySet<string> | null>
```

Returns:

- `null` for a company-wide viewer — **no filter**, the caller passes nothing down;
- a real set (possibly empty) for everyone else, built by reading the names of `scope.employeeIds` and running each through `nameKey`.

`null` and an empty set are deliberately different. `null` means "this viewer sees everyone"; an empty set means "this viewer may see nobody" and must empty the screen. Conflating them is the classic way to widen a query by accident.

**Why it is its own module and not part of `scope.ts`:** `scope.ts` holds the identity rules and is unit-tested for the pure ones (`applyAnalyticsView`); its test stubs the one module it imports for the org chart (`@/lib/weekly-goals/hierarchy`). Adding a `@/lib/db` import to `scope.ts` broke that test with an env-var failure. Keeping the DB-touching helper in a separate file keeps `scope.ts`'s import surface — and therefore its test — intact. This was caught and corrected during development.

### `lib/queries/billing.ts` — filtering before aggregation

```ts
export async function getBillingDashboard(
  year: number,
  opts: { visibleNames?: ReadonlySet<string> | null } = {},
): Promise<BillingSummary & { error?: string }> {
  const matrix = await readSheetValues(SHEET_ID, RANGE);
  const visible = opts.visibleNames ?? null;
  const deals = mapBillingDeals(matrix).filter((d) => {
    if (d.month && Number(d.month.slice(0, 4)) !== year) return false;
    if (!visible) return true;
    return visible.has(nameKey(d.salesperson));
  });
  return aggregateBilling(deals);
}
```

**The filter runs BEFORE `aggregateBilling`, and that ordering is the whole point.** Aggregating first and filtering after would leave the four KPI cards, the monthly series and both tables reporting company money under a "User" label. Because everything downstream is derived from `deals`, narrowing the input narrows every figure on the screen coherently.

The signature change is source-compatible: existing callers (e.g. `app/(app)/billing/page.tsx:116`) call `getBillingDashboard(year)` and get the previous behaviour exactly.

### `app/(app)/incentive/billing-actions.ts` (new) — the reload

The Billing ledger is read **live** from a sheet, so switching scope cannot be a client-side re-render of cached data: it has to re-read. `fetchIncentiveBilling({ year, view })` is a server action that does exactly that, and nothing else.

```ts
const me = await requireUser();
if (!(await canViewModule("employees.incentive"))) return { ok: false, error: "…" };
const limited = rateLimitOrError(me.id, "read");
if (limited) return limited;
const parsed = BillingInput.safeParse(input);           // { year: int 2020..2100, view?: "team"|"user" }
const base = await incentiveAnalyticsScopeFor(me);      // the SHARED resolver
const scope = applyAnalyticsView(base, parsed.data.view ?? "team");
const names = await visibleNameKeysFor(scope);
const data = await getBillingDashboard(parsed.data.year, { visibleNames: names });
```

It mirrors `fetchIncentiveAnalytics` deliberately: same module gate, same rate limit, same `Result` shape, same "absent view means team" default (so an old client or a replayed request behaves unchanged).

### `app/(app)/incentive/page.tsx` — the streamed Billing tab

```tsx
async function BillingTab({ year, me }) {
  const base = await incentiveAnalyticsScopeFor(me);
  const scope = applyAnalyticsView(base, "team");
  const names = await visibleNameKeysFor(scope);
  const billing = await getBillingDashboard(year, { visibleNames: names });
  return <BillingDashboard data={billing} year={year} initialView="team"
                           canSeeTeam={Boolean(scope.canSeeTeam)} scopeLabel={scope.label} />;
}
```

The server render is scoped too — **a page refresh is not a way around the switch.** `applyAnalyticsView` is what computes `canSeeTeam` (`incentiveAnalyticsScopeFor` alone does not set it), which is why it is called here even for the initial render.

### `components/incentive/billing-dashboard.tsx` — the control

A scope row above the KPI band, using the module's `Segmented` and matching the analytics dashboard's control row:

- the Team/User switch, rendered only when `canSeeTeam` (hidden, never greyed — this app hides doors that are not yours rather than disabling them),
- a label for the year,
- the scope label on the right, with a spinner while the reload is in flight.

The component holds the summary in state and never narrows anything itself. Every figure — including all four KPI cards — recomputes server-side from the rows this viewer may see. On failure the view snaps back to the one actually on screen and a toast explains, so the buttons never claim a scope whose numbers are not shown.

The empty state also adapts: a scoped viewer seeing nothing is told to switch to Team, rather than being told the company billed nothing.

### A note on `canSeeTeam`

`incentiveAnalyticsScopeFor` returns a scope **without** `canSeeTeam`; only `applyAnalyticsView` sets it, and it computes it *before* narrowing (after narrowing to `user` the scope can no longer tell you). Someone whose downline is empty gets no switcher at all — a "Team" button that showed them their own figures under a second name is the empty Team mode the requirement rules out.

---

## What was NOT changed

- The sheet ID, range, column layout and `mapBillingDeals` parsing — untouched.
- `aggregateBilling` — untouched.
- The KPI content (Billed / Collected / Outstanding / Salespeople), both tables and the monthly trend — unchanged apart from now being computed on the scoped deal set.
- The `link` to `/salary/incentive-payout` in the "By salesperson" section header — unchanged.

---

## Verification

`tests/unit/incentive-billing-scope.test.ts` — 14 tests, against a synthetic sheet matrix:

| Assertion | Why it matters |
|---|---|
| Year filter still keeps only the requested year | no regression in existing behaviour |
| No scope argument reports everyone | company-wide viewer unchanged |
| Scoped: `perSalesperson`, `totals.deals`, `billed`, `paid`, `outstanding` all recompute | the KPIs cannot report company money under a User label |
| Scoped: the **monthly series** narrows too | no company months leak through |
| Scoped: the **deal ledger** narrows too | the table cannot show a deal the KPI excluded |
| Matching goes through `nameKey` (case and padding) | matches the key the rest of the module uses |
| **An empty scope shows nobody** | it must never widen to everyone |
| `null` means no filter, unlike an empty set | the two must stay distinguishable |
| A salesperson with no deals gets an empty board | not a company board |
| The action reuses `incentiveAnalyticsScopeFor` + `applyAnalyticsView` and contains no `manager_id` / `managerId` | no second hierarchy rule |
| The action is gated on `canViewModule` + `rateLimitOrError` | server-side enforcement |
| The **page** scopes the initial render as well as the reload | refresh is not a way in |
| The switcher is hidden without a team (`{canSeeTeam && (`) | no empty Team mode |

---

## Risks

1. **Name-keyed matching is inherited, not introduced.** The billing sheet is matched against `employees.name` via `nameKey` (trim + lower-case; the sheet side additionally collapses internal whitespace in `mapBillingDeals`). An employee whose roster name has internal double spaces would not match their sheet rows. This is the same exposure the rest of the module already has, and it is the reason `resolveEarner` exists for the incentive ledger. Worth a data check if a scoped viewer reports missing deals.
2. **A salesperson not on the roster** appears in no scope except company-wide, because they have no `employees` row to be scoped by. Correct by construction, but worth knowing when reconciling totals.
3. **Scope is not in the URL for the initial render.** The page always renders `team` first and the switcher then writes `?view=`. A deep link carrying `?view=user` is not honoured on first paint. `NAV-11` in the UI audit is the same open item for period/scope elsewhere in the module.
