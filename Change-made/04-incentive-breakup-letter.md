# 04 — Incentive Breakup Letter on the payment edge

**Requirement:** after a successful incentive payment, generate an Incentive Breakup Letter following the same information hierarchy as the Salary Slip / CTC Breakup Letter, reusing existing salary/document components; available to the employee after payment; historical data stable; no duplicated calculation logic; triggered from the successful payment flow.

---

## What already existed (verified, not rebuilt)

A complete Incentive Breakup document was already in the working tree:

| Piece | Path |
|---|---|
| Data query | `lib/incentive/breakup.ts` → `getIncentiveBreakup(employeeId, month)` |
| PDF renderer | `lib/incentive/breakup-pdf.ts` → `renderIncentiveBreakupPdf(data, meta)` |
| On-demand route | `app/(app)/salary/incentive-breakup/[employeeId]/route.ts` |

It already follows the salary house style — it imports `lib/salary/pdf-house-style.ts` (`newDoc`, `drawChrome`, `drawMasthead`, `drawTitleBand`, `drawSectionHeading`, `drawSignatoryBlock`, `drawFooter`, `amountInWords`) and `lib/salary/signatories.ts`, the same primitives the payslip, combined-earnings statement, annual statement and exit letter use. The PDF carries INCENTIVE / DATE / APPROVED / PAID / NET columns per line, a highlighted "NET INCENTIVE THIS MONTH" total, a reversal line in brand red where one exists, amount in words and a signatory block.

It is served with the correct authz (`me.isAdmin || me.id === employeeId`, else 403) and an optional `?view=1` inline disposition.

**What was missing:** it was reachable only from the admin payout panel, and nothing triggered it on payment. Both are now fixed.

---

## Change 1 — mailed on the payment edge

### `lib/incentive/notify-breakup.ts` (new)

```ts
export async function mailIncentiveBreakup(input: {
  employeeId: string;
  month: string;
  paidTotal: number;
}): Promise<"sent" | "duplicate" | "inactive" | "failed" | "skipped">
```

Flow:

1. Load the employee (name + `email`, `official_email`, `personal_email`, `is_active`, `employment_status`).
2. **Active check** through the shared predicate `isActiveEmployee` (`lib/incentive/notifications/eligibility.ts`), which delegates to `isCurrentEmployee` (`lib/incentive/master.ts`) — the same rule every other incentive notification uses. Inactive or former employees return `"inactive"` and are not mailed.
3. Resolve addresses with `employeeEmailTargets` (`lib/email/recipients.ts`), which dedupes login / official / personal. No address on file → `"skipped"`, and **no claim is taken**, so fixing the address later still delivers.
4. **Claim** a row in `incentive_notification_deliveries`:

```ts
const versionKey = `breakup:${input.month}:${input.paidTotal.toFixed(2)}`;
const [claim] = await db.insert(incentiveNotificationDeliveries)
  .values({ eventType: "incentive_breakup", subjectId: input.employeeId,
            recipientId: input.employeeId, versionKey })
  .onConflictDoNothing()
  .returning({ id: incentiveNotificationDeliveries.id });
if (!claim) return "duplicate";
```

5. Render and send: `getIncentiveBreakup` → `renderIncentiveBreakupPdf` → `sendIncentiveBreakupEmail`.
6. On send error or a thrown render, **release the claim** and return `"failed"` so a genuine retry can still deliver.

### Idempotency, and why the amount is in the key

`breakup:<month>:<paid>`. A replay of the same payout claims nothing and sends nothing. A genuine **top-up** in the same month — which the payout planner allows, since `payNow = max(0, ceiling − alreadyPaid)` — moves the total and legitimately sends a new letter with the new figures. This mirrors the paid notice's existing `<leg>-paid:<amount>:<date>` scheme and the payout path's `payout-event:<audit.id>`.

### Never throws

By the time this runs the money has already moved. A mail or render failure must not surface as a failed payout and tempt a second press. Every path returns a status; the single internal `throw` is a re-throw inside the function's own `try`, swallowed by the outer `catch`.

### Reuses the shared claim table

`incentive_notification_deliveries`, unique on `(event_type, subject_id, recipient_id, version_key)` (`db/schema.ts:2812`). The same table the weekly report cron claims against. No new table.

---

## Change 2 — the trigger

`app/(app)/salary/incentive-payout/actions.ts`, after the payout transaction commits:

```ts
if (result.paidNotices.length > 0) {
  const notices = result.paidNotices;
  afterResponse(() => notifyIncentivesPaid(notices));      // pre-existing
}

// The document that goes WITH the money, on the same edge.
const breakupFor = result.breakup.employeeId;
if (result.paidCount > 0 && breakupFor) {
  const { month } = result.breakup;
  const paidTotal = result.totalPaid;
  afterResponse(() => mailIncentiveBreakup({ employeeId: breakupFor, month, paidTotal }));
}
```

Two supporting details:

- **One letter per run, not one per paid leg.** A salary run pays one person and may settle several legs (entry, project supervisor, project intern, participants). They belong on one letter, and `getIncentiveBreakup` already assembles them per employee+month. A test asserts the action contains exactly one `mailIncentiveBreakup(` call.
- **`employeeId` and `month` travel out of the transaction on the result**, because `run` and `month` are scoped to the transaction callback:

```ts
return { kind: "ok", paidCount, totalPaid, skipped, remainderAfter: plan.remainderAfter,
         paidNotices,
         breakup: { employeeId: run.employeeId, month } };
```

---

## Change 3 — email template and sender

### `lib/email/report-emails.ts` — `sendIncentiveBreakupEmail`

Placed beside `sendMonthlySlipsEmail`, in the reporting module that is deliberately kept out of the transactional `resend.ts` (which renders React-Email components). Same shape and same no-op-when-unconfigured behaviour: returns `{ id, error }`, never throws, attaches the PDF, and sends to several addresses for **one** employee.

The body shows Paid / Net payable as tiles, and renders the reversal tile **only when there is one** — a clawback is the one line on this document a reader must not have to infer.

### Why a direct send rather than a new notification kind

The incentive notification registry has exactly twelve kinds, pinned by `tests/unit/incentive-notifications.test.ts`, and `notify()`'s email arm (`sendNotificationEmail`) carries no attachments. The weekly report cron takes the same route for the same reason: it calls `sendIncentiveWeeklyReportEmail` directly and claims its own delivery row. This change follows that precedent exactly.

---

## Change 4 — the employee's own entry point

`components/incentive/analytics/incentive-analytics-dashboard.tsx`, in the "Your performance" block:

```tsx
{viewerId && (
  <a href={`/salary/incentive-breakup/${viewerId}?view=1`} target="_blank" rel="noreferrer" …>
    <FileText size={13} … /> Incentive breakup letter
  </a>
)}
```

- Rendered **only** inside the viewer's own block, which itself only renders when the view is genuinely theirs (`showMine`).
- The id comes from `data.scope.viewerId`, newly added to the serialized scope in `lib/incentive/analytics/model.ts`. That value is set from the signed-in identity when the scope is resolved and is **never** derived from anything the browser sent. It is the viewer's own id only.
- The route re-checks ownership (`me.isAdmin || me.id === employeeId`) — the link is a door, not the lock.

The route's `defaultMonth()` is the previous complete IST month, which is the month most likely to have been paid.

---

## Historical stability

Nothing about the letter is stored or snapshotted. It is rendered on demand from `incentive_entries` and `salary_payments` for the requested month, so:

- a letter generated today and a letter generated in six months for the **same month** are identical unless the underlying ledger rows changed,
- a reversal posted after the fact appears as a reversal line on the next render — which is the correct behaviour for a financial record, since the reversal is itself a dated row rather than an edit.

`paid_amt` is never rewritten by the reversal path (the reversal is a separate negative row), so the "Paid" column keeps its historical value and the reversal shows beside it.

---

## Verification

`tests/unit/incentive-breakup-mail.test.ts` — 12 tests:

- sends once and reports `"sent"`,
- **a replay of the same payout sends nothing** (`"duplicate"`),
- **a genuine top-up in the same month DOES send** — the amount moved,
- **a failed send releases its claim** so a retry can still deliver,
- inactive and former employees are not mailed, and take no claim,
- no address on file: skips **and takes no claim**,
- never throws (a thrown breakup query returns `"failed"` and releases the claim),
- a missing employee row is `"inactive"`, not a crash,
- every address on file for one employee is used,
- the reversal is carried into the mail so a clawback is never silent.

`tests/unit/incentive-payout-breakup.test.ts` also pins the **trigger contract**: the call is deferred until after the transaction commits (`afterResponse`), guarded by `paidCount > 0`, fires once per run, and the notify module contains no second PDF renderer (`not.toMatch(/new PDFDocument|pdfkit/)`) — it must keep reusing `renderIncentiveBreakupPdf`.

---

## Risks

1. **No test renders the actual PDF.** `renderIncentiveBreakupPdf` and `getIncentiveBreakup` have no unit test in the repository (pre-existing gap). The new tests mock both, so a rendering regression would not be caught here — it would be caught on the on-demand route, which serves the same bytes.
2. **`incentive_payout_events` and `salary_payments` are both written on payout**, and the letter reads the ledger plus `salary_payments`, not the audit events. Consistent with `lib/incentive/breakup.ts`'s existing implementation; noted so a future reader does not assume the audit table is the source.
3. **Two emails now go out on a payout** — the pre-existing paid notification (in-app + email) and this letter with the PDF. They carry different information and the salary side already behaves this way (a "marked paid" salary sends a slip email), but if the noise is unwanted the letter could instead be linked rather than attached.
