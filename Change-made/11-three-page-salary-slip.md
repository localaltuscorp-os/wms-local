# 11 — The employee salary slip, redesigned to exactly three pages

> **PARTLY SUPERSEDED — see [13](./13-salary-statement-and-pdf-redesign.md).**
> The three-page structure, the page order and the `SalarySlipData`
> single-source rule described here still hold. The **VIEW dropdowns backed by
> PDF layers** do not: browsing moved to the web Salary Statement
> (`/my-salary/statement`) and the PDF became a plain document again.
> `lib/pdf/layered-form.ts`, described below, is deleted.

The employee-facing salary PDF is now three pages, each answering one question:

| Page | Title | Answers |
|---|---|---|
| 1 | **SALARY SLIP** | What was earned, what was deducted, what is payable. |
| 2 | **ATTENDANCE & SALARY CALCULATION** | How the salary on page 1 was worked out, week by week. |
| 3 | **INCENTIVE STATEMENT** | What the incentive module owes, what it paid, and any negative payable adjustment. |

The document is served by the SAME route as before —
`GET /salary/earnings/[employeeId]?month=YYYY-MM[&view=1]` — and the same route
now feeds all three consumers, so there is one slip in the application:

* **Employee → My Salary → Generate Salary PDF** (the human-facing button),
* the **monthly-slips cron** (`app/api/cron/monthly-slips/route.ts`), and
* the **paid-notice mailer** (`lib/salary/notify-paid.ts`).

`lib/salary/combined-earnings.ts` and `lib/salary/combined-earnings-pdf.ts` are
deleted: they were the previous document, and keeping them beside the new one
would have meant two slips that could disagree.

---

## 1. Nothing is calculated here

Every figure is read from the engine that already owns it.

| Page | Source |
|---|---|
| 1 — salary, days, net | `loadMySalaryMonths` (the engine behind Employee → My Salary) |
| 1 — incentive paid, reimbursement, retention | the Accounts ledger, the Reimbursements module, the retention store |
| 2 — hours, weeks, per-day status, per-day money | the same month's `DayLedger` (`buildDayLedger`) |
| 3 — earned / paid / payable / adjustment | `getIncentiveAccountsLedger` → `deriveIncentivePayable` |
| 3 — target vs achievement (this month / last 3 / FY) | `getIncentiveTargetVsPaidForPerson` |
| 3 — prospect, introducer, product codes | the employee's own `incentive_requests` + the Product Master |

`lib/salary/salary-slip-data.ts` assembles them and does no arithmetic beyond
rounding for display. `lib/salary/salary-slip-pdf.ts` draws. A structural test
pins both: the renderer contains no `annualCtc`, no `PT_AMOUNT`, no division of
a salary figure, and the data layer calls no payroll formula.

**One relationship the page-1 arithmetic now closes on.** The engine's rule is
`net = gross − pt − tds − advances + pendingBalanceIn` (`lib/salary/compute.ts`),
so the slip prints a positive pending balance as an **Addition** and only a
negative one as a deduction — and the attendance shortfall is **not** a
deduction line at all, because `gross` is already net of it (it is the monthly
CTC less the shortfall). Printing it as a deduction printed the same rupees
twice and left "gross − deductions" hundreds of rupees away from the net. The
shortfall is now a caption under the gross, in the engine's own words.

---

## 2. Two VIEW controls, and exactly three pages

Pages 2 and 3 carry a dropdown. A PDF cannot swap visible content on a dropdown
without JavaScript, so the options are pre-rendered as **layers** (Optional
Content Groups) of which one is ON:

* page 2 — `Weekly Summary` · `Week 1` … `Week N` (one per real week)
* page 3 — `Monthly Summary` · `This Month` · `Last 3 Months` · `Year To Date` ·
  `Individual Incentive`, plus a second dropdown listing the month's incentives

The chosen layer is drawn; the others are not. The dropdown's action is a
two-line state toggle
(`lib/pdf/layered-form.ts` → `toggleScript` / `incentiveViewScript` /
`incentivePickScript`): no evaluation, no I/O, nothing that can run long.

**The static fallback is the file itself.** The reader applies
`/OCProperties /D`, which marks the summary layer of each page ON and everything
else OFF. A reader that ignores the action — or PDF JavaScript entirely — shows
the Weekly Summary and the Monthly Summary, which is what the brief asks for.
Verified with poppler, which honours `/D` and hides the OFF layers.

The physical page count is always three, however many weeks or incentives the
month holds: the layers are form XObjects embedded on the same page, never extra
pages. Rendering tests count the pages for four-, five- and six-week months,
twelve incentives, and a month with no ledger at all.

---

## 3. Where the two incentive records are printed as two tables

The incentive module keeps two records that share no key: a **request** carries
what was submitted (prospect, introducer, product, incentive date) and the
**ledger** carries what is owed and paid. There is no foreign key between them,
so page 3 prints both, each from its own source — `INCENTIVE RECORDS` and
`INCENTIVE PAYMENTS` — rather than guessing a link. The page says so in one line
under the tables.

`Individual Incentive` fills the prospect/introducer/product rows only when
EXACTLY ONE submission record bears that incentive's name; otherwise it prints
`—` and says why. A name is not a key, and the wrong prospect beside an amount
is worse than a dash.

The incentive windows are **financial year** (April–March), the same window
`getIncentiveTargetVsPaidForPerson` uses and the one the slip's `FY 26-27`
header names.

---

## 4. Visual language

Unchanged and reused: `lib/salary/pdf-house-style.ts` (`newDoc`, `drawChrome`,
`drawMasthead`, `drawSectionHeading`, `drawStatTiles`, `drawSignatoryBlock`,
`drawFooter`, `COLORS`, `inr`, `fmtDate`, `amountInWords`) and the per-entity
logo and signatory (`entityLogoPath`, `signatoryForEntity`). Every major page
header is centred. Two glyph fixes were needed because Helvetica's WinAnsi
encoding has neither: the dropdown arrow (▼) is **drawn** as a small triangle,
and the minus in signed figures is an ASCII `-` rather than U+2212.

The page count is fixed, so the body of each layer starts at the offset its base
page decided (`ctx.p2BodyY` / `ctx.p3BodyY`) — the base holds the header, the
figures and the controls, and a view draws only under them.

---

## 5. Audit

Run against the live database through the real engines
(`scripts/_tmp_render_slip.ts`, deleted after the audit):

```
8 employees · 2026-08   problems: []   (8 of 8)
5 employees · 2026-04   problems: []
5 employees · 2026-05   problems: []
5 employees · 2026-07   problems: []
Mishtie Kanani · 2026-04 (14 incentive rows, 5 weeks)   problems: []
```

The audit's checks are properties the brief asks to verify, read off the same
data the PDF prints: the ledger reconciles with the run's gross; the weeks sum to
the month in hours and in rupees; the day ledger's total equals its own
attributed earned; `gross + additions − deductions = net`; and Total Earnings
equals salary net + incentive paid + reimbursement paid + retention paid.

Pages were reviewed as images with the layers isolated (PyMuPDF), and the
default view was confirmed against poppler, which respects `/OCProperties /D`.

Test suite: `tests/unit/salary-slip-pdf.test.ts` (20 tests — page count, the
three fields and their options and defaults, layer-per-option, the ON-by-default
configuration, the actions, and the no-second-calculation structural checks).

---

## Files

**Added**

```
lib/salary/salary-slip-data.ts        every figure the slip prints, from its engine
lib/salary/salary-slip-pdf.ts         the three pages, drawn in the house style
lib/pdf/layered-form.ts               layers + dropdowns (pdf-lib), framework-free
lib/incentive/request-display.ts      prospect / introducer / product lookups, shared
tests/unit/salary-slip-pdf.test.ts
```

**Modified**

```
app/(app)/salary/earnings/[employeeId]/route.ts   the new document; ?name= no longer read
app/api/cron/monthly-slips/route.ts               the same document in the monthly mail
lib/salary/notify-paid.ts                         and in the paid notice
lib/salary/my-salary.ts                           MySalaryMonth gains `tds`
components/incentive/incentive-list.tsx           uses the shared request lookups
components/salary/salary-breakup-table.tsx        comment: the route's new name
components/salary/statement-downloads.tsx         comment
```

**Deleted**

```
lib/salary/combined-earnings.ts        the previous document's data
lib/salary/combined-earnings-pdf.ts    the previous document's renderer
```

---

## No database change

Nothing in this change set touches the schema, so there is no migration and no
SQL to run.
