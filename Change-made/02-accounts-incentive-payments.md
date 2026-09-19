# 02 — Incentive payable inside Accounts, above Reimbursement

**Requirement:** integrate Incentive into Accounts, section above Reimbursement, showing Employee / Incentive / Incentive date / Approved-Due / Paid / Unpaid / Reversal adjustment / Final payable / Payment status, respecting the same scope model as the Incentive module, with the payout logic reused rather than rebuilt.

---

## The payable rule

This is the whole of the arithmetic. It lives in `deriveIncentivePayable()` in `lib/queries/incentive-accounts.ts`, exported so it can be pinned by a test without a database.

```
unpaid       = due − paid
finalPayable = unpaid + reversal          (reversal ≤ 0)
```

Where `due` is `incentive_entries.approved_amt`, `paid` is `incentive_entries.paid_amt`, and `reversal` is the sum of the negative `salary_payments` rows (`method = 'reversal'`) written against that entry.

Worked states:

| State | due | paid | reversal | unpaid | final payable | status |
|---|---|---|---|---|---|---|
| Unpaid | 2000 | 0 | 0 | 2000 | **2000** | `unpaid` |
| Partially paid | 2000 | 500 | 0 | 1500 | **1500** | `part_paid` |
| Fully paid | 2000 | 2000 | 0 | 0 | **0** | `paid` |
| Fully paid, then reversed | 2000 | 2000 | −2000 | 0 | **−2000** | `reversed` |
| Partially paid, then reversed | 2000 | 500 | −500 | 1500 | **1000** | `reversed` |

A fully-paid-then-reversed entry therefore lands at a **negative** final payable. That is deliberate and is the point of the screen: money already disbursed and then reversed is money to **recover**, and a negative last column is how the accountant is told so. `reversal` is clamped with `Math.min(0, reversal)` so a stray positive row (the payout rows share the entry id) can never inflate the payable.

`status` ranks a reversal above the paid/unpaid split: the money moved and came back, which is a different fact from "unpaid".

---

## Where the numbers come from

`getIncentiveAccountsLedger(scope, { year })` in `lib/queries/incentive-accounts.ts` composes the two tables the money path **already** writes. It re-derives nothing:

- `incentive_entries` — the ledger rows the payout action and the Status/Entries editors maintain (`approved_amt`, `paid_amt`, `entry_date`, `period_month`, `paid_date`).
- `salary_payments` — the negative rows the reversal action writes (`app/(app)/incentive/reversal-actions.ts:86`, `method = 'reversal'`, `amount = −paid`), matched by `incentive_entry_id`.

Two queries, not one per row: the entries for the scope, then the negative rows for exactly those entry ids.

This deliberately does **not** reuse `getIncentivePaymentLedger()` (`lib/queries/incentive-payments.ts`), which folds per **employee** (`netPaid = grossPaid + reversal`) and cannot produce the per-entry columns this screen requires (incentive name, date). Both readers of `salary_payments` remain, with different shapes for different questions; neither writes.

---

## Scope — enforced in SQL, not in the component

The page resolves the scope on the server from the signed-in identity:

```ts
const base = await incentiveAnalyticsScopeFor(me);        // who this viewer may see
const requested: AnalyticsView = sp.view === "user" ? "user" : "team";
const scope = applyAnalyticsView(base, requested);        // Team / User narrowing
const ledger = await getIncentiveAccountsLedger(scope, { year });
```

`incentiveAnalyticsScopeFor` and `applyAnalyticsView` are the **same** functions the Incentive Dashboard and Targets use (`lib/incentive/analytics/scope.ts`). No hierarchy logic is duplicated:

- company-wide (`isAdmin || isSuperAdmin || canReviewIncentives`) → `all: true`, no filter,
- everyone else → their own id plus their transitive downline, from `getDownlineIds` (recursive CTE over `employees.manager_id`, `UNION`, cycle-safe, `catch { return [] }` so a failure narrows to self).

The filter is applied in the query:

```ts
if (!scope.all && scope.employeeIds.size === 0) {
  return { rows: [], totals: zeroTotals(), people: 0 };
}
const scopeWhere = scope.all
  ? undefined
  : inArray(incentiveEntries.employeeId, [...scope.employeeIds]);
```

Two safety properties worth keeping:

1. **An empty scope matches nothing, not everything.** `inArray(col, [])` is the classic way to accidentally widen a query, so the empty case is guarded explicitly.
2. **An entry with no `employee_id` cannot be attributed to a scoped viewer**, so it is never shown to one. The failure direction is "show less", never more.

`?view=` selects between the two views the viewer already owns. It cannot name an employee, so a hand-typed `?view=team` buys exactly what an absent parameter would have.

---

## The screen

**Route:** `/accounts/incentive-payments` — `app/(app)/accounts/incentive-payments/page.tsx`

Gated by `requireAccountsAccess()` — super-admins plus the Accounts department, re-asserted in the page itself (the module's rule; see `lib/accounts/access.ts`). Permissions are unchanged.

**Table columns:** Employee · Incentive · Incentive date · Approved/Due · Paid · Unpaid · Reversal adjustment · Final payable · Payment status · Paid on. Filters for status and for "has reversal"; search over employee and incentive; 25-row paging; sticky first column; totals footer row.

**KPI band** (the module's shared `IncentiveKpi`): Approved/Due · Paid · Unpaid · **To recover** / Final payable. The fourth card relabels itself to "To recover" and turns red when the reversal total is negative.

**Paying is not offered here.** Row actions link to `/salary/incentive-payout`, which keeps its existing `requireAdmin()` + `INCENTIVE_PAYOUT` gates and its own rate limit. One door to the money, not two.

### Components

- `components/accounts/incentive/incentive-accounts-table.tsx` — the table
- `components/accounts/incentive/accounts-scope-switch.tsx` — the Team/User control. It reuses the module's `Segmented` (`components/incentive/ui/chrome.tsx:83`), writes `?view=`, and lets the **server** decide what that means; it narrows nothing itself.

---

## Accounts index ordering

`lib/accounts/sections.ts` gains two entries and they lead the module:

```ts
{ slug: "incentive-payments", order: 0, status: "built",  title: "Incentive Payments", … }
{ slug: "reimbursement",      order: 1, status: "link",   href: "/reimbursements", … }
```

- **Incentive above Reimbursement**, and both above `weekly-checklist` (order 2). Pinned by a test.
- Reimbursement is registered as a **`link`**, not a rebuild. It is already a complete module at `/reimbursements`; the Accounts card is a door to it. (`status: "link"` is the existing registry mechanism, used the same way by `collection-master` → `/outstanding`.)

**Note for the reader:** Reimbursement was not previously a section of Accounts at all — it is its own module with its own rail entry. The ordering requirement is satisfied by registering it here so the two employee-money sections are adjacent and correctly ordered, with Incentive first.

---

## Verification

`tests/unit/incentive-accounts-ledger.test.ts` — 16 tests:

- every payable state in the table above, including fully-paid-then-reversed producing a negative final payable,
- partial reversal recovering only the paid portion,
- a positive reversal being clamped away (it must never increase the payable),
- paise rounding on every derived figure,
- the invariant that the reversal never increases the payable, over a sweep of paid amounts,
- structural: the scope reaches the `WHERE` clause, the empty-scope guard exists, and the Accounts section ordering holds.

Also covered by `tests/unit/incentive-payout-breakup.test.ts` (dashboard/trigger assertions).

```
npx tsc --noEmit    exit 0
npx eslint          clean on all five new/changed files
```

---

## Risks and open questions

1. **The page is reachable only by super-admins and the Accounts department**, because `requireAccountsAccess()` is the module's rule. The Team/User switcher therefore matters mainly for Accounts-department managers; a manager outside Accounts cannot open the page. This follows the explicit decision to preserve existing Accounts permissions. Widening it would need a deliberate permission change.
2. **Reversal is visible but not recoverable from this screen.** The negative payable is shown; there is no "create recovery" action, because the reversal action already writes the negative `salary_payments` row that represents the recovery. If a separate recovery *transaction* is wanted, that is a new requirement.
3. **`reversal` is derived from `salary_payments` by `incentive_entry_id`.** An entry whose reversal was written before `incentive_entry_id` was populated (if any exist) would show its `paid` but no adjustment. `lib/incentive/breakup.ts:119` handles that case by falling back to `incentive_entries.reversed`; this query does not. Worth checking against real data if the two ever disagree.
