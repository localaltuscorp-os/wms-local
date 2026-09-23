# 13 — Salary Statement on the web, and a fixed three-page PDF

**Branch:** `Om` · **Repo:** `https://github.com/localaltuscorp-os/wms-local`
**Migration needed:** none. This change is presentation only — no new columns, no
new tables, no backfill.
**Supersedes:** [`11-three-page-salary-slip.md`](./11-three-page-salary-slip.md) in
part — see [What this replaces](#what-this-replaces) below.

---

## What the problem was

The salary statement existed **only as a PDF**, and that PDF had been made to
behave like an application. `lib/pdf/layered-form.ts` drew one hidden source page
per VIEW — every week, every incentive window, every individual incentive — then
stacked them on the same physical page as PDF optional-content layers, switched
by AcroForm dropdowns carrying JavaScript actions.

The result was the set of symptoms the brief lists:

1. Page 2 carried the day-by-day table of **every** week at once.
2. The document grew with the data, so its layout was fragile.
3. Page 3 printed five near-identical incentive windows, so a month with no
   incentives printed "no incentive payment" four times over.
4. It could not be trusted to say the same thing as the screen, because the
   screen did not exist.
5. Print dialogs and non-Adobe readers are not reliable places for
   optional-content layers and JavaScript.

Two views of one month, built by two different code paths, is the shape a
mismatch grows out of. That is what this change removes.

---

## The new architecture

```
        attendance engine ──┐
        salary engine ──────┤
    incentive module ───────┼──► loadSalarySlipData(employeeId, month) ──► SalarySlipData
 reimbursement module ──────┘                                                │
                                                                             ├──► WEB  (interactive)
                                                                             └──► PDF  (3 fixed pages)
```

`lib/salary/salary-slip-data.ts` already was the single assembler of that object;
it is unchanged. **Both** renderers now consume it and nothing else:

| | Web | PDF |
|---|---|---|
| Path | `app/(app)/my-salary/statement/page.tsx` → `components/salary/salary-statement.tsx` | `app/(app)/salary/earnings/[employeeId]/route.ts` → `lib/salary/salary-slip-pdf.ts` |
| Reads | `loadSalarySlipData` | the same object, passed in |
| Arithmetic | none | none |
| Interactivity | URL query params | none — it is a document |

Neither renderer queries the database, and neither divides a rupee. That is
asserted, not merely intended: see the "no second calculation" tests.

---

## The web statement

`Employee → My Salary → Salary Statement` (`/my-salary/statement`).

Three cards, in the brief's order:

1. **Salary Slip** — employee details, salary summary (Monthly CTC, Salary / Day,
   Payable Days, Salary Earned), earnings, deductions, the large **Net Salary
   Payable** band, and **Total Earnings This Month** (salary + incentive paid,
   read from the data, not re-summed).
2. **Attendance & Salary Calculation** — the month's figures, a **View** select,
   and either the weekly summary or one week in detail.
3. **Incentive Statement** — the four tiles (Earned / Paid / Payable / Negative
   Payable Adjustment), a **View** select over the five windows, the records, the
   payments, and the individual-incentive breakdown.

### The week options are generated from the data

The View select on card 2 is built from `ledger.weeks` — the engine's own buckets:

```tsx
{(ledger?.weeks ?? []).map((w) => (
  <option key={w.index} value={`week-${w.index}`}>Week {w.index} · {w.rangeLabel}</option>
))}
```

A four-week month gets four options, a six-week month gets six. Nothing is
hardcoded at five. `Week N` is `LedgerWeek.index`, the same number the Daily
Salary Report shows, so the statement and the report cannot disagree about which
week is which.

### Weekly summary vs one week

The default is **Weekly Summary**: one row per week (Present, Half Day, Absent,
Weekly Off, Worked / Target, Salary Earned, Deduction / Additional Pay) with the
month total beneath it. The month total row is `viewTotals(weeks, hasMoney)` —
the same function the Daily Salary Report already uses to total the weeks it is
showing. The days are **not** printed under it.

Choosing `Week 3` replaces the table with that week's days and a
**Week 3 calculation** block (Target Hours, Worked Hours, Hours Difference,
Salary / Day, Attendance Salary, Deduction, Additional Pay, Final Week Salary).
Only one week is ever on the page.

### One empty state

Card 3 shows `No incentive records for this period.` **once**, before any table
is drawn. There is no per-window repetition and no empty table with a header and
no rows.

### State lives in the URL

`?month=`, `?view=`, `?inv=` are the state. The page stays server-rendered, any
view is a link somebody can send, and the PDF link carries the month being
viewed. `?emp=` still resolves through `resolveSalaryTarget` (the same server-side
gate My Salary uses), so a hand-typed id cannot widen anybody's reach.

---

## The PDF

Three `addPage()` calls, always: slip, attendance calculation, incentive
statement. No form fields, no JavaScript, no layers — `lib/pdf/layered-form.ts`
is **deleted**.

Page 2 carries the weekly summary and the **Month Calculation** block instead of
the week-by-week dump; page 3 prints this month once, from the request records
and the Accounts ledger.

### The fixed page count versus growing data

A fixed page count means content cannot spill onto page 4. Every table therefore
**measures** its rows against the space left on the page and stops, printing how
many rows it left out (`fitRows` / `omittedNote`). A short honest table beats a
clipped one.

### Column widths are part of the contract

Each table's `flex` fractions sum to 1 and were rebalanced so that no cell
truncates on real content: the weekly summary's first column has to clear
"Month total" in bold, and the record table's Product column has to clear
`Pitch Service (PS)` — a **name and a code** per product, both from the Product
Master. The PDF tests read the rendered page text back, so a starved column fails
the suite rather than printing an ellipsis.

---

## Files

**New**

- `app/(app)/my-salary/statement/page.tsx` — the statement route.
- `components/salary/salary-statement.tsx` — the three-part web statement.
- `tests/unit/salary-statement-render.test.tsx` — 21 tests, jsdom.
- `Change-made/13-salary-statement-and-pdf-redesign.md` — this file.

**Changed**

- `lib/salary/salary-slip-pdf.ts` — rewritten: three fixed pages, no layers, no
  form fields, no scripts. `fitRows` / `omittedNote` added.
- `lib/salary/salary-people.ts` — `resolveSalaryTarget` extracted, shared by My
  Salary and the statement so the two cannot disagree about `?emp=`.
- `app/(app)/my-salary/page.tsx` — uses `resolveSalaryTarget`.
- `components/salary/my-salary-view.tsx` — "Salary Statement" link per month.
- `tests/unit/salary-slip-pdf.test.ts` — rewritten for the new contract
  (35 tests).

**Deleted**

- `lib/pdf/layered-form.ts` — the dropdown/layer builder. Nothing imports it;
  the rewritten suite asserts the file stays gone.

---

## Verification

```
npx vitest run tests/unit/salary-slip-pdf.test.ts        # 35 passed
npx vitest run tests/unit/salary-statement-render.test.tsx # 21 passed
npx tsc --noEmit                                          # clean
npx eslint <changed files>                                # clean
```

The PDF suite renders a synthetic month, inflates each page's content stream and
reads the drawn text back (pdfkit writes text as hex `TJ` arrays, so the streams
must be decoded before they can be searched). It pins:

- exactly 3 pages for 4, 5 and 6 weeks, for 12 incentives, for both at once, and
  for a month with no day record at all;
- page 1 is the slip, page 2 the attendance calculation, page 3 the incentives —
  each checked by its own text, and each checked *not* to carry the others;
- page 2 carries the weeks the ledger produced, and the day-by-day strings are
  absent;
- the empty state appears **once**, and no table is drawn above or below it;
- no form fields, no `OCProperties`, no `/JavaScript`, no `/AcroForm`,
  no `/OpenAction`, no `/Launch` in the bytes;
- the renderer touches no database and performs no division.

The web suite renders the component and reads the DOM back: the week options are
the weekly summary plus one per week (4, 5 and 6 weeks), the default is the
summary, choosing a week shows that week and no other, and a month with no
incentives shows the empty state once.

### Verified against the running application, on real data

With migration `0244` applied (see file 12), the dev server was checked end to
end for Vinal Patil, September 2026:

- `GET /my-salary/statement` renders the three cards for real. The View select
  offers `Weekly Summary` plus `Week 1 · 01 Sep – 06 Sep` … `Week 5 · 28 Sep –
  30 Sep` — five options, because that is how many weeks the ledger produced.
- `GET /my-salary/statement?view=week-3` returns the week-3 day table with
  `week-3` selected and **no** weekly summary on the page (`Week 1`, `Month
  total` absent from the HTML).
- `GET /salary/earnings/<id>?month=2026-09` returns `application/pdf`, **3
  pages**, **0 form fields**, no `OCProperties`, no `/JavaScript`, no
  `/AcroForm`, no `/OpenAction`, no `/Launch` — and page 3 carries the single
  empty state, because this employee had no incentives.

### Full-suite note

`npx vitest run` reports 14 failures across 8 files on a loaded machine
(`task-actions`, `done-on-time`, `global-search-provider`,
`device-exemption-login`, `delegated-access-authorization`,
`bulk-entry-keeps-drafts`, `daily-salary-report-render`,
`invite-employee-credentials`, `reset-employee-password`). All of them pass in
isolation, and the first five fail on a clean tree too — they are pre-existing
and load-flaky. None is in the files this change touches.

---

## What this replaces

[`11-three-page-salary-slip.md`](./11-three-page-salary-slip.md) describes the
three-page slip with **VIEW dropdowns backed by PDF layers**. The three-page
structure, the page order and the `SalarySlipData` single-source rule from that
document still hold. The dropdowns, the layers and
`lib/pdf/layered-form.ts` do not: browsing moved to the web statement, and the
PDF became a document again.

---

## Known divergence — the rupee sign

The **web** statement formats money with `inr` from `lib/salary/day-ledger.ts`,
which prints `₹`. The **PDF** formats with `inr` from
`lib/salary/pdf-house-style.ts`, which prints `Rs ` because pdfkit's built-in
Helvetica has no rupee glyph in WinAnsi — it would render as a box or `¹`.

The **values** are identical; only the symbol differs, and only in the PDF. This
is pre-existing house behaviour shared with every other salary PDF in the
module, not introduced here.

---

## The stray quote that real data found

Verifying against a real slip —
`GET /salary/earnings/<id>?month=2026-09` — page 1's Net Salary Payable caption
came out as:

```
Rs 412 gross + Rs 0 additions " Rs 0 deductions  ·  not yet paid
```

The caption's subtraction used **U+2212** (the character typography prefers).
Helvetica has no glyph for it in WinAnsi, so pdfkit wrote byte `0x22` — an ASCII
double-quote — in the middle of a sentence. Fixed to the ASCII `-` the rest of
the file already uses (`signedInr`, `signedHm` carry a comment about exactly this
rule), and `tests/unit/salary-slip-pdf.test.ts` now asserts the caption spells it
that way.

This was the only drawn string in `lib/salary/salary-slip-pdf.ts` containing
U+2212; the other occurrences are in comments.

---

## Not changed

No attendance rule, salary rule, weekly-target rule, holiday rule, weekly-off
rule, overtime rule, deduction rule, incentive rule, payment rule, approval rule
or eligibility rule was touched. No calculation was added anywhere in the two
new renderers. No backend calculation bug was found in the course of this work.
