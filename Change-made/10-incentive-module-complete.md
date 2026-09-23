# 10 — The Incentive module, traced end to end

This change set answers one brief: *do not just modify the UI — trace each
feature through frontend → API → business logic → database → permissions →
Accounts/Billing → notifications, and fix inconsistencies at the source.*

Five rules were carried through every file touched:

* **No hardcoded product lists.** Products come from Admin → Products; shifts
  from Admin → Shift Types.
* **No frontend-only permissions.** Every read that names a person is re-scoped
  on the server from the signed-in identity.
* **No duplicate incentive calculations.** One ledger, one payable derivation,
  one ranking.
* **No duplicate schedulers.**
* **No duplicate access-control systems.** One grant table, two domains.

---

## 1. Sales Pitch — the form itself

`lib/incentive-fields.ts` is the single definition of every incentive form, and
it is what the server validates against, so a change here is a change in both
places at once.

| Field | Before | After |
|---|---|---|
| Workshop | "Workshop Name" | **"Introducer Workshop Name"** — this form only |
| Product Sold | free text | **multiselect from Admin → Products** |
| — | — | **Shift** (select, from Admin → Shift Types) |
| Cell / Email | top of the right pane | **bottom of the left column**, with Shift |
| — | — | **CTC per Month** — read-only, from the salary profile |

The other four forms keep the plain "Workshop Name": they name the workshop the
*participant* came through, and renaming those would mislabel them.

**Product Sold** stores the chosen names joined with `", "` — the same shape the
free-text rows already used, so old and new read the same way. It is validated
against the live master on the server: a product the admin has retired cannot be
filed, and a product added there becomes valid with no deploy. Duplicates
collapse rather than reject (it is a double-click, not a mistake worth a
message), and the stored value is normalised to **master order**, so the same
picks always produce the same record.

**Shift** reads Admin → Shift Types through `lib/queries/shift-types.ts`, cached
under the `shifts` tag, and the form defaults to the requester's own shift. An
empty shift master fails closed and says where to fix it.

**CTC per Month** is a `static` field: it is never validated, and
`validateIncentiveDetails` now *drops* it rather than storing it, so a browser
that posts a figure for it changes nothing. It is read from the employee's own
salary profile (annual CTC ÷ 12) — the same arithmetic the analytics layer uses
for "% of CTC", so the figure on the form and the percentage the incentive is
judged on cannot disagree.

---

## 2. The requests table

The main table now shows **Incentive Name, Prospect Name, Introducer Name and
Product Code** directly. Product Code is a short code (`PS`, `BSS`, `2-Day`)
resolved from the master through `listActiveProductCodes` — name → code — never
from a list kept in the component, and it falls back to the product's name when
the master has no code.

---

## 3. KPI cards

The top metrics are seven `IncentiveKpi` cards — **All Employees, Incentive
Amount, Target, A, B, C, D** — in a `grid` that steps 2 → 4 → 7 columns, so each
card has room at every width instead of seven cramped cells. Grade letters come
from `INCENTIVE_GRADE_BANDS`, not from a second list of thresholds. CTC is
deliberately NOT a card. Every figure is the one that was already there.

---

## 4. Visibility — an admin is not a reason to see everyone

`lib/incentive/analytics/scope.ts` no longer treats `me.isAdmin` as a widener.
The rule is now one rule, shared with the Tasks module:

| Viewer | Sees |
|---|---|
| Super-admins, and the incentive reviewer (Manan Vasa) | everyone |
| Everyone else | themselves + their downline (transitively) |
| …plus whatever Admin Panel → Access Control grants them | a branch, or the organisation |

The resolver lives in `lib/access/visibility.ts` and reads `visibility_grants`.
It is called **on the server, from the session identity, on every read** — never
from a parameter a browser controls. The refusal is enforced in the queries
themselves (what is never loaded cannot be serialised into the page) and again in
the two named-read server actions:

* `getPersonDetail` — the drill-down. An administrator with no reporting line to
  the person is refused like anybody else.
* `getIncentiveEntryStatus` / the status ledger — scoped through the same ceiling.

`visibility_grants` replaces `task_view_grants`: **one** table, `domain` of
`'tasks'` or `'incentive'`, one screen with two panels, one grant path, one audit
scope. A second permission system was explicitly not built.

---

## 5. "Reversal" is now "Negative Payable Adjustment"

The rename is user-facing only. `incentive_entries.reversed`,
`salary_payments.method = 'reversal'`, the `reverse` decision action and the
`reversed` status value are **identifiers** and are unchanged, so no query,
filter, API or stored row moved.

Renamed where a person reads it: the entries and status editors (badge, dialog
title, confirm button, toasts, row aria-labels), the Accounts incentive table
(column, status badge, filter), the salary payout page (column and copy), the
breakup PDF and its covering email, the incentive notifications (title, summary,
chip, quote label) and the web-push payload. A reversal on an incentive request
— the reviewer's decision — now reads as the same phrase, because it is the same
thing. Unrelated reversal concepts (the credit-card `Chg Reversed?` column, its
export header) were left alone.

---

## 6. Accounts and the salary slip

Accounts already ordered its sections **Incentive (0)** then **Reimbursement
(1)**. What was missing was on the earnings slip:

* a **Reimbursement** section, read from the Reimbursements module's own records
  (`lib/salary/reimbursement-earnings.ts`) and placed between Incentive and
  Retention. `paidThisMonth` joins Total Earnings; an approved-but-unpaid claim
  is listed and deliberately **not** counted — approval is not payment;
* the **per-incentive lines** for the month — name, amount, paid, state, and any
  negative payable adjustment — read from the Accounts ledger's own derivation
  (`deriveIncentivePayable`), so the slip cannot disagree with the Accounts
  screen about any figure. There is no second calculation.

Payment states are `payable / paid / part paid / unpaid / negative payable
adjustment`, and the negative adjustment **reduces** the payable — it can push
it below zero, which the Accounts screen shows as "To recover".

---

## 7. Paid notifications fire on payment, never on approval

`notifyIfPaidIncreased` is the only path that sends an "incentive paid" notice.
It fires when a save **raises** the paid amount, with a version key of
`leg-paid:<total>:<date>` claimed in `incentive_notification_deliveries`, so
re-saving the same amount cannot notify twice. A decision (approval, due,
negative payable adjustment) uses its own `decision:<id>` key and never sends a
paid notice.

**The gap this change closed:** the Entries, entry-status, project-leg and split
editors wrote `incentive_entries.paid_amt` and nothing to `salary_payments` — the
table Accounts and the payout ledger read. A payment recorded by hand therefore
appeared as if no money had moved. `lib/incentive/record-manual-payment.ts` now
writes the ledger row *and* its audit event, **inside the caller's
transaction**, and writes only the **increase** (so re-saving writes nothing).
It uses `method: "manual_entry"`, distinct from the salary run's
`with_salary`, so a payroll report can still tell the two apart.

---

## 8. Ranking is by percentage

The app ranks on **% of CTC** — the same figure the grade comes from
(`competitionRanks`, `pctOfCtc`). The Trends leaderboard did not: it was
`perEmployee.slice(0, 10)`, a sort by **raw amount**, so the leaderboard and the
dashboard beside it could order the same people differently. It now takes its
rows from the analytics model (`incentiveLeaders`) — already ranked, already
scoped — and prints the percentage, with the amount secondary. The
Target-vs-Actual list is likewise ordered by attainment percentage, with people
who have no target last.

---

## 9. What was verified rather than changed

* **Sunday 11:00 AM IST** — `vercel.json` already schedules the weekly employee
  report card at `30 5 * * 0` (UTC), which is 11:00 IST, and it respects the same
  visibility ceiling.
* **Monthly / 3M / 6M / YTD, grade, hierarchy** — all still on the dashboard,
  unchanged; only the ranking basis moved.
* **Approval ≠ paid** — confirmed on both sides: the workflow writes a decision
  event, the paid notice is a separate edge.
* **Product Master** — the seven products exist and are manageable at
  `/admin/products`; the Sales Pitch form consumes them dynamically.

---

## Migrations

Two additive, idempotent migrations. Neither drops or rewrites a row.

```
npx tsx --env-file=.env.local scripts/apply-one-migration.ts \
  db/migrations/0242_visibility_grants.sql --apply
npx tsx --env-file=.env.local scripts/apply-one-migration.ts \
  db/migrations/0243_incentive_product_master_rows.sql --apply
```

| Migration | What it does |
|---|---|
| `0242_visibility_grants.sql` | The grants table, for both domains. Renames `task_view_grants` in place if the earlier version of this file had been applied — existing grants keep their ids and belong to the `tasks` domain. |
| `0243_incentive_product_master_rows.sql` | Adds `Key Note (KN)`, `2-Day Workshop (2-Day)`, `Inhouse PS (IPS)` to the product master. `ON CONFLICT (name) DO NOTHING`. |

For production, `Change-made/SQL/05-apply-access-control.sql` is the same DDL as
0242 (upgrade path included), `07-apply-incentive-product-master.sql` is 0243,
and `06-` / `08-verify-*.sql` are read-only.

Without them the changes are inert rather than broken: no grants exist, so
everyone is scoped to themselves and their downline, and the three products
simply are not offered.

---

## Files

**Added**

```
lib/access/visibility.ts                          the one grant resolver (tasks + incentive)
lib/queries/visibility-grants.ts                  reads for the Access Control screen
lib/queries/shift-types.ts                        active shifts + an employee's own
lib/salary/reimbursement-earnings.ts              the slip's reimbursement section
lib/incentive/record-manual-payment.ts            a hand-recorded payment reaches the ledger
db/migrations/0242_visibility_grants.sql          the grants table
db/migrations/0243_incentive_product_master_rows.sql   the three missing products
Change-made/SQL/05-apply-access-control.sql       production DDL (with the upgrade path)
Change-made/SQL/07-apply-incentive-product-master.sql  production rows
tests/unit/incentive-leaders.test.ts
tests/unit/incentive-sales-pitch-form.test.ts
tests/unit/incentive-manual-payment.test.ts
tests/unit/reimbursement-earnings.test.ts
```

**Modified**

```
lib/incentive-fields.ts              multiselect + static field types, Shift, product master
lib/incentive/prepare-request.ts     feeds both masters into the one validation gate
lib/incentive/analytics/scope.ts     isAdmin is no longer a widener
lib/queries/incentive-analytics.ts   incentiveLeaders() — the one leaderboard
lib/queries/incentives.ts            the raw-amount leaderboard removed; TVA ordered by %
lib/queries/incentive-accounts.ts    (read through, not changed)
lib/salary/combined-earnings.ts      incentiveLines + reimbursement in the totals
                                     (SUPERSEDED by the three-page salary slip —
                                     see 11-three-page-salary-slip.md; deleted)
lib/salary/combined-earnings-pdf.ts  the incentive lines and Reimbursement section
                                     (same — deleted in change 11)
lib/incentive/workflow.ts            the decision label and its reason sentence
db/enums.ts                          the `reversed` status label
app/(app)/incentive/page.tsx         leaders threaded; scope passed to every ledger
app/(app)/incentive/admin-actions.ts the Entries editor's ledger row + name gate
app/(app)/incentive/status-actions.ts  entry / leg / split writers, all transacted
components/incentive/incentive-dashboard.tsx   the ranked leaderboard
components/incentive/incentive-tabs.tsx        leaders passed through
components/incentive/incentive-list.tsx        the adjustment reason label
components/incentive/incentive-decision-panel.tsx  the adjustment is final
```

---

## Verification

```
npx tsc --noEmit                       clean
npx vitest run                         3622 passed, 6 pre-existing failures
npx eslint <changed files>             no new warnings
```

The six failures (`done-on-time`, `delegated-access-authorization`,
`task-actions` ×2, `device-exemption-login`, `global-search-provider`) were
confirmed pre-existing by running the same files against a stashed tree. One
further failure, `task-stat-counts`, was caused by this work — the list page now
reaches the visibility resolver, whose import chain needs the `employees` table
in that suite's database stub — and was fixed in the test, not by weakening the
import.
