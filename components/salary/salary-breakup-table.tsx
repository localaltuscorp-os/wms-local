"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  Building2,
  ChevronsUpDown,
  Search,
  Check,
  Loader2,
  FileDown,
  IndianRupee,
  Undo2,
} from "lucide-react";
import { Avatar } from "@/components/ui/avatar";
import { fireToast } from "@/lib/toast";
import {
  setSalaryPaid,
  setSalaryAmountPaid,
  setSalaryNote,
  setWaiveOff,
  setPayoutAdjustment,
  type PaymentWriteResult,
} from "@/app/(app)/salary/actions";
import { perDayRate, waiveAddBack } from "@/lib/salary/waive-off";
import {
  amountPaidOf,
  paymentStatusOf,
  totalPayable,
  unpaidBalance,
  PAYMENT_STATUS_LABEL,
  type PaymentStatus,
} from "@/lib/salary/payment";

/* These two were called GREEN / GREEN_DEEP but held the brand RED (#E10600) —
 * and that misnaming is how the payout column, the payslip button and the Paid
 * toggle all ended up shouting in red. On a money table red reads as "deduction"
 * or "error", so a ₹10,639 payout looked like a problem and a full column of
 * filled PDF buttons drowned out the figures. Renamed to what they actually are;
 * red now stays on things that genuinely mean money taken away. */
const BRAND_RED = "#E10600";
const BRAND_RED_DEEP = "#A80400";

/* PAID is a settled, positive state — an actual green, so the toggle stops
 * reading like a warning once pressed. */
const PAID_GREEN = "#047857";
const PAID_GREEN_DEEP = "#065F46";

/** Plain serializable projection of a `salary_breakup` row (server maps it). */
export interface SalaryRow {
  id: string;
  /** The employee id — powers the downloadable payslip PDF link. */
  employeeId: string | null;
  srNo: number | null;
  employeeName: string;
  /** Joined from `employees.avatar_url`; null falls back to initials. */
  avatarUrl?: string | null;
  designation: string | null;
  companyName: string | null;
  present: string | null;
  absent: string | null;
  halfDay: string | null;
  weeklyOff: string | null;
  totalDaysWorked: string | null;
  finalWorkingDays: string | null;
  /** Calendar days in the month (sheet col) — denominator for the per-day rate. */
  daysInMonth: string | null;
  monthlyCtc: string | null;
  payableAfterLeave: string | null;
  pt: string | null;
  payableAfterPt: string | null;
  advance: string | null;
  previousPending: string | null;
  finalPayment: string | null;
  paid: boolean;
  /** Cumulative rupees disbursed against this row. The unpaid balance and the
   *  payment status are DERIVED from this + the payable (lib/salary/payment),
   *  never stored, so they cannot drift from the amounts under them. */
  amountPaid: string | null;
  /** Editable super-admin note (admin_note). Shown in the Remarks column —
   *  the imported joining-date `remarks`/`manan_remarks` are intentionally NOT
   *  projected to the client. */
  adminNote: string | null;
  /** Super-admin "Wave-Off" GRANT: how many attendance days to condone. The view
   *  adds them back at the per-day rate to reduce the deduction. Additive to the
   *  DISPLAYED net only — the base amounts are never mutated. */
  waiveOffDays: string | null;
  waiveOffNote: string | null;
  /** Super-admin signed pre-payout adjustment (+extra / −deduct), Sir #37. */
  payoutAdjustment: string | null;
  payoutAdjustmentNote: string | null;
}

// perDayRate + waiveAddBack now come from the shared @/lib/salary/waive-off so the
// net-to-pay can never drift between the table, CSV, payroll PDF and mobile.

const inr = (v: string | null) =>
  v == null || v === "" ? "—" : `₹${Math.round(Number(v)).toLocaleString("en-IN")}`;
/** Rupees from an already-computed number. The payment columns are derived, so
 *  they never have the "missing" case `inr` renders as an em dash. */
const inrN = (n: number) => `₹${Math.round(n).toLocaleString("en-IN")}`;
/** The effective net to pay — base + wave-off add-back + adjustment. Aliased to
 *  the shared `totalPayable` so the table cannot drift from the server action. */
const netToPay = (r: SalaryRow) => totalPayable(r);
/** Day counts, trimmed of trailing zeros. Only the Wave-Off editor needs it now
 *  that the attendance columns are gone. */
const dec = (v: string | null) => (v == null || v === "" ? "—" : String(Number(v)));
const num = (v: string | null) => (v == null || v === "" ? 0 : Number(v));
/**
 * The signed total of BOTH pre-payout grants — condoned wave-off days converted
 * to rupees, plus the payout adjustment.
 *
 * This is exactly the quantity `netAfterWaiveOff` adds to `final_payment`, so
 * "Payable + this = Final Amount" holds by construction rather than by two
 * places happening to agree. Defining it here, from the same shared helpers the
 * server uses, is what keeps the displayed arithmetic and the paid arithmetic
 * the same arithmetic.
 */
const adjustmentTotal = (r: SalaryRow) => waiveAddBack(r) + num(r.payoutAdjustment);

/* ── Column model ──────────────────────────────────────────────────────── */

type Align = "left" | "right";

interface Col {
  key: string;
  label: string;
  align: Align;
  /** First column of a visual group → hairline separator on its left. */
  groupStart?: boolean;
  sortValue?: (r: SalaryRow) => string | number;
  render: (r: SalaryRow) => React.ReactNode;
  /** Rendered in the sticky totals row (over the *filtered* set). */
  total?: (rows: SalaryRow[]) => React.ReactNode;
  minWidth?: number;
}

function MoneyCell({
  v,
  tone = "plain",
}: {
  v: string | null;
  /** plain · strong · deduction (red when >0) · muted */
  tone?: "plain" | "strong" | "deduction" | "muted";
}) {
  const n = num(v);
  const color =
    tone === "deduction" && n > 0
      ? "var(--color-altus-red)"
      : tone === "strong"
        ? "var(--color-ink-strong)"
        : tone === "muted" || n === 0
          ? "var(--color-ink-subtle)"
          : "var(--color-ink-soft)";
  return (
    <span
      className="tabular-nums text-[13.5px]"
      style={{ color, fontWeight: tone === "strong" ? 700 : 600 }}
    >
      {tone === "deduction" && n > 0 ? `− ${inr(v)}` : inr(v)}
    </span>
  );
}

function MoneyTotal({ rows, pick, tone }: { rows: SalaryRow[]; pick: (r: SalaryRow) => string | null; tone?: "deduction" | "final" }) {
  const sum = rows.reduce((s, r) => s + num(pick(r)), 0);
  return (
    <span
      className="tabular-nums text-[13.5px] font-black"
      style={{
        color:
          tone === "deduction" && sum > 0
            ? "var(--color-altus-red)"
            : // "final" totals are ink too — same reasoning as the cell above.
              "var(--color-ink-strong)",
      }}
    >
      {tone === "deduction" && sum > 0 ? "− " : ""}₹{Math.round(sum).toLocaleString("en-IN")}
    </span>
  );
}

/** Money total over a NUMERIC picker — the payment columns are computed, not
 *  raw string fields, so they cannot go through `MoneyTotal`'s `string | null`. */
function NetTotal({
  rows,
  pick,
  tone,
}: {
  rows: SalaryRow[];
  pick: (r: SalaryRow) => number;
  tone?: "final" | "due";
}) {
  const sum = rows.reduce((s, r) => s + pick(r), 0);
  return (
    <span
      className="tabular-nums text-[13.5px] font-black"
      style={{ color: tone === "due" && sum > 0 ? "#b91c1c" : "var(--color-ink-strong)" }}
    >
      ₹{Math.round(sum).toLocaleString("en-IN")}
    </span>
  );
}

/** Sort order for the status column: work still to do first. */
const STATUS_RANK: Record<PaymentStatus, number> = { unpaid: 0, partial: 1, paid: 2 };

/**
 * THE PAYROLL COLUMNS — the settlement story, left to right, and nothing else.
 *
 * Employee · Entity · Advance · Payable · Adjustments · Final Amount ·
 * Amount to Pay · Balance · Status · Remarks · Payslip.
 *
 * The attendance block (Present/Absent/Half/W-off/Worked/Final days) and the
 * build-up columns (Monthly CTC, After leave, PT, After PT, Prev pending) are
 * GONE from this table. They are inputs to the payable, not decisions anyone
 * makes here, and eleven of them pushed the columns that matter — what is owed,
 * what went out, what is left — off the right edge of the screen. Every one of
 * those figures is still on the payslip PDF and in the attendance analytics; the
 * table now answers the one question the Accounts room opens it to ask.
 *
 * THE ARITHMETIC IS CLOSED AND VISIBLE: Payable ± Adjustments = Final Amount,
 * and Final Amount − Amount to Pay = Balance. Every figure in that chain is
 * either stored or derived by lib/salary/payment from the single stored amount,
 * so no two columns can disagree.
 */
const COLUMNS: Col[] = [
  {
    key: "company",
    // Renamed to "Entity" (Sir): these are the group's billing entities, not
    // outside companies. Same underlying `companyName` field, same filter.
    label: "Entity",
    align: "left",
    minWidth: 118,
    sortValue: (r) => r.companyName ?? "",
    render: (r) =>
      r.companyName ? (
        <span
          className="inline-flex max-w-[180px] items-center gap-1.5 rounded-pill px-2.5 py-1 text-[12px] font-bold"
          style={{
            background: "var(--color-surface-soft)",
            color: "var(--color-ink-soft)",
            boxShadow: "inset 0 0 0 1px var(--color-hairline)",
          }}
          title={r.companyName}
        >
          <Building2 size={11.5} strokeWidth={2.4} className="shrink-0 opacity-70" />
          <span className="truncate">{r.companyName}</span>
        </span>
      ) : (
        <span className="text-ink-subtle">—</span>
      ),
  },
  {
    key: "advance",
    label: "Advance",
    align: "right",
    groupStart: true,
    minWidth: 104,
    sortValue: (r) => num(r.advance),
    render: (r) => <MoneyCell v={r.advance} tone="deduction" />,
    total: (rows) => <MoneyTotal rows={rows} pick={(r) => r.advance} tone="deduction" />,
  },
  {
    key: "payable",
    // The sheet's own `final_payment` — everything the month's arithmetic has
    // already settled (leave, PT, advance, previous pending). It is the BASE the
    // adjustments move, which is why it is named for what it is rather than for
    // the last deduction applied to it.
    label: "Payable",
    align: "right",
    groupStart: true,
    minWidth: 116,
    sortValue: (r) => num(r.finalPayment),
    render: (r) => <MoneyCell v={r.finalPayment} tone="strong" />,
    total: (rows) => <MoneyTotal rows={rows} pick={(r) => r.finalPayment} />,
  },
  {
    key: "adjustments",
    // ONE column for both super-admin grants — the condoned wave-off days and
    // the signed payout adjustment. They were two columns at opposite ends of
    // the table even though they do the same job (move the payable before it is
    // paid) and are summed together by `netAfterWaiveOff` anyway. Showing their
    // combined signed effect is what makes "Payable ± Adjustments = Final
    // Amount" legible as one line of arithmetic.
    //
    // Both editors are still here, unchanged and behind the same super-admin
    // gate — the body renders them; this is the read-only fallback for everyone
    // else. Nothing about either write path moved.
    label: "Adjustments (+/−)",
    align: "left",
    minWidth: 236,
    sortValue: (r) => adjustmentTotal(r),
    render: () => null,
    total: (rows) => {
      const sum = rows.reduce((s, r) => s + adjustmentTotal(r), 0);
      if (sum === 0) return null;
      return (
        <span className="tabular-nums text-[13px] font-black" style={{ color: sum >= 0 ? "#166534" : "#b91c1c" }}>
          {sum >= 0 ? "+" : "−"} ₹{Math.abs(Math.round(sum)).toLocaleString("en-IN")}
        </span>
      );
    },
  },
  {
    key: "final",
    // Payable ± Adjustments. Identical to `netAfterWaiveOff`, which is what the
    // payment path measures against — showing anything else here is exactly how
    // a settled row ends up looking like it still owes money.
    label: "Final Amount",
    align: "right",
    groupStart: true,
    minWidth: 126,
    sortValue: (r) => netToPay(r),
    render: (r) => (
      <span className="tabular-nums text-[14px] font-black text-ink-strong">
        {inrN(netToPay(r))}
      </span>
    ),
    total: (rows) => <NetTotal rows={rows} pick={netToPay} tone="final" />,
  },
  {
    key: "amountPaid",
    // The payment entry field plus the Pay button that settles the row in full.
    // The figure stored is CUMULATIVE (see AmountPaidCell) — "what has gone out
    // so far" — which is what makes Balance = Final Amount − this.
    label: "Amount to Pay",
    align: "right",
    minWidth: 186,
    sortValue: (r) => amountPaidOf(r),
    // Rendered by the component body — it needs `canRecordPayment` to decide
    // between the inline editor + Pay button and a read-only figure.
    render: () => null,
    total: (rows) => <NetTotal rows={rows} pick={amountPaidOf} />,
  },
  {
    key: "balance",
    label: "Balance",
    align: "right",
    minWidth: 116,
    sortValue: (r) => unpaidBalance(r),
    render: (r) => {
      const bal = unpaidBalance(r);
      return (
        <span
          className="tabular-nums text-[13.5px] font-black"
          // Zero outstanding is the good outcome and stays quiet; anything left
          // carries the deduction red the rest of the table already uses for
          // "money still to move".
          style={{ color: bal > 0 ? "#b91c1c" : "var(--color-ink-subtle)" }}
        >
          {inrN(bal)}
        </span>
      );
    },
    total: (rows) => <NetTotal rows={rows} pick={unpaidBalance} tone="due" />,
  },
  {
    key: "payStatus",
    label: "Status",
    align: "left",
    minWidth: 128,
    // Unpaid → Partially paid → Paid, so sorting groups the work still to do at
    // one end rather than scattering it.
    sortValue: (r) => STATUS_RANK[paymentStatusOf(r)],
    render: () => null,
  },
  // Editable super-admin NOTE (admin_note) — pinned to the extreme end. Shows the
  // note (not the imported joining-date remarks). Rendered by the component so it
  // can read the canEditNote flag; placeholder cell here is replaced in the body.
  {
    key: "remarks",
    label: "Remarks",
    align: "left",
    groupStart: true,
    minWidth: 168,
    render: () => null,
  },
  // Extreme-right — a downloadable PDF payslip (salary + attendance + incentives).
  // Rendered by the component (needs the `month`); always shown.
  {
    key: "payslip",
    label: "Payslip",
    align: "left",
    groupStart: true,
    minWidth: 96,
    render: () => null,
  },
];

/**
 * "Amount paid" — the cumulative rupees disbursed, editable in place by anyone
 * who may record payments.
 *
 * IT IS THE TOTAL, NOT AN INSTALMENT. Typing 30000 then 50000 means "₹50,000 has
 * now gone out", not "₹80,000". That makes re-submitting the same figure a
 * no-op and correcting a typo just a matter of entering the right number —
 * whereas an add-an-instalment field turns every double-submit into a real
 * overpayment.
 *
 * Saves on blur / Enter, reverts on Escape or error. The server is the authority
 * on what was stored: it re-derives the payable, caps an over-amount at it, and
 * hands back the settled figure, which is what lands in the field afterwards —
 * so an admin who types ₹99,000 against a ₹50,000 payable sees it become
 * ₹50,000 and is told why, rather than the row silently disagreeing with what
 * is on screen.
 */
function AmountPaidCell({ row, editable }: { row: SalaryRow; editable: boolean }) {
  const router = useRouter();
  const stored = amountPaidOf(row);
  const [val, setVal] = useState(stored > 0 ? String(stored) : "");
  const [saved, setSaved] = useState(stored);
  const [busy, setBusy] = useState(false);

  if (!editable) {
    return (
      <span className="tabular-nums text-[13.5px] font-bold text-ink-soft">{inrN(stored)}</span>
    );
  }

  async function commit() {
    if (busy) return;
    const trimmed = val.trim();
    const next = trimmed === "" ? 0 : Number(trimmed);
    if (!Number.isFinite(next) || next < 0) {
      setVal(saved > 0 ? String(saved) : "");
      fireToast({ message: "Enter a valid amount (0 or more).", type: "error" });
      return;
    }
    if (next === saved) return; // Nothing typed that changes anything.

    setBusy(true);
    const res = await setSalaryAmountPaid(row.id, next);
    setBusy(false);
    if (!res.ok) {
      setVal(saved > 0 ? String(saved) : "");
      fireToast({ message: res.error, type: "error" });
      return;
    }
    // Settle on the SERVER's figure, not the typed one — they differ whenever
    // the amount was capped at the payable.
    setSaved(res.amountPaid);
    setVal(res.amountPaid > 0 ? String(res.amountPaid) : "");
    fireToast(paymentToast(res, row.employeeName));
    router.refresh();
  }

  return (
    <span className="inline-flex items-center justify-end gap-1.5">
      {busy && <Loader2 size={12} className="animate-spin text-ink-subtle" aria-hidden />}
      <input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            setVal(saved > 0 ? String(saved) : "");
            e.currentTarget.blur();
          }
        }}
        disabled={busy}
        inputMode="decimal"
        placeholder="0"
        aria-label={`Amount paid to ${row.employeeName}`}
        title="Total rupees paid so far against this row. Enter the running total, not an instalment."
        className="w-[92px] rounded-md border border-hairline-strong bg-surface-card px-2 py-1 text-right text-[13px] font-bold tabular-nums text-ink-strong outline-none transition-colors focus:border-[color:var(--color-altus-red)] disabled:opacity-60"
      />
    </span>
  );
}

/**
 * Payment status — Unpaid · Partially paid · Paid.
 *
 * DERIVED, never stored: the status is whatever `paymentStatusOf` says about the
 * amount and the payable, so it cannot fall out of step with the two numbers
 * printed beside it in the same row.
 *
 * UNPAID and PARTIALLY PAID carry an action — a red "Pay" that settles the row
 * in full (the common case: nobody should have to look up and retype the payable
 * to close it out). PAID IS NOT A BUTTON: it renders as a plain green span with
 * no click handler, which makes an accidental re-payment structurally impossible
 * rather than merely discouraged. The server agrees independently — `writePayment`
 * re-reads the row and treats an unchanged state as a no-op, so even a replayed
 * request sends no second slip.
 *
 * Reversing is still possible and still deliberate: a small "unmark" control
 * beside the Paid pill clears the payment back to ₹0 behind a confirm. Clearing
 * has never sent mail and still doesn't.
 */
function PaymentStatusCell({ row }: { row: SalaryRow }) {
  return <StatusPill status={paymentStatusOf(row)} />;
}

/**
 * TOTAL PAYABLE + THE PAY ACTION — the money and the button that settles it, in
 * one cell.
 *
 * The action used to live in the Payment-status column, three columns to the
 * right of the figure it acts on. Reading across four money columns to find the
 * button for the amount you just read is exactly the friction this removes: the
 * number you are paying and the control that pays it are now the same cell.
 *
 * The status column keeps the pill — it is still the thing you scan or sort by
 * to see what is outstanding — but it no longer carries a control.
 */
function AmountToPayCell({ row, editable }: { row: SalaryRow; editable: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const status = paymentStatusOf(row);
  const balance = unpaidBalance(row);

  async function payInFull() {
    if (busy || status === "paid") return;
    setBusy(true);
    const res = await setSalaryPaid(row.id, true);
    setBusy(false);
    if (!res.ok) {
      fireToast({ message: res.error, type: "error" });
      return;
    }
    fireToast(paymentToast(res, row.employeeName));
    router.refresh();
  }

  async function clearPayment() {
    if (busy) return;
    const ok = window.confirm(
      `Clear the recorded payment for ${row.employeeName}?\n\nAmount paid goes back to ₹0 and the row returns to Unpaid. No email is sent. Paying again afterwards WILL email the salary slip a second time.`,
    );
    if (!ok) return;
    setBusy(true);
    const res = await setSalaryPaid(row.id, false);
    setBusy(false);
    if (!res.ok) {
      fireToast({ message: res.error, type: "error" });
      return;
    }
    fireToast({ message: `${row.employeeName} — recorded payment cleared.`, type: "info" });
    router.refresh();
  }

  // The figure itself — same value, same formatting the column rendered before
  // this cell took it over.
  // THE ENTRY FIELD ITSELF — the same cumulative-amount editor as before, now
  // sitting with the button that settles the row. Typing a part-amount and
  // pressing Pay are the two ways to move the same figure, so they belong in one
  // cell rather than four columns apart.
  const entry = <AmountPaidCell row={row} editable={editable} />;

  // Read-only viewer: what has gone out, and nothing to press.
  if (!editable) return entry;

  if (status === "paid") {
    return (
      <span className="inline-flex items-center justify-end gap-1.5">
        {entry}
        <button
          type="button"
          onClick={clearPayment}
          disabled={busy}
          aria-label={`Clear recorded payment for ${row.employeeName}`}
          title="Clear the recorded payment (does not send email)"
          // Quiet by design: reversing a recorded payment should take a
          // deliberate look, not sit at the same weight as the action itself.
          className="inline-flex size-5 items-center justify-center rounded-md text-ink-subtle opacity-0 transition hover:bg-surface-soft hover:text-ink-strong focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-40"
        >
          {busy ? <Loader2 size={11} className="animate-spin" /> : <Undo2 size={11} strokeWidth={2.6} />}
        </button>
      </span>
    );
  }

  return (
    <span className="inline-flex items-center justify-end gap-2">
      {entry}
      <button
        type="button"
        onClick={payInFull}
        disabled={busy}
        title={
          status === "partial"
            ? `Pay the remaining ${inrN(balance)} and email the salary slip`
            : "Pay in full and email the salary slip to the employee's work + personal addresses"
        }
        className="inline-flex items-center gap-1 rounded-pill px-2.5 py-1 text-[11.5px] font-bold text-white transition hover:opacity-90 disabled:opacity-60"
        style={{ background: `linear-gradient(135deg, ${BRAND_RED}, ${BRAND_RED_DEEP})` }}
      >
        {busy ? (
          <>
            <Loader2 size={11} className="animate-spin" aria-hidden /> Paying…
          </>
        ) : (
          <>
            <IndianRupee size={11} strokeWidth={3} aria-hidden />
            {status === "partial" ? "Pay rest" : "Pay"}
          </>
        )}
      </button>
    </span>
  );
}

/** The three states, one treatment each. Amber for partial: it is neither a
 *  problem nor finished, and reusing the settled green would hide the balance. */
function StatusPill({ status }: { status: PaymentStatus }) {
  const style =
    status === "paid"
      ? { background: `linear-gradient(135deg, ${PAID_GREEN}, ${PAID_GREEN_DEEP})`, color: "#fff" }
      : status === "partial"
        ? { background: "color-mix(in srgb, #b45309 14%, transparent)", color: "#92400e" }
        : { background: "var(--color-surface-soft)", color: "var(--color-ink-muted)", boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)" };
  return (
    <span
      className="inline-flex items-center gap-1 whitespace-nowrap rounded-pill px-2.5 py-1 text-[11.5px] font-bold"
      style={style}
    >
      {status === "paid" && <Check size={11} strokeWidth={3.2} aria-hidden />}
      {PAYMENT_STATUS_LABEL[status]}
    </span>
  );
}

/**
 * What to tell the admin after a payment write.
 *
 * A PARTIAL payment reports the balance and says nothing about email, because
 * nothing was sent — only settling the row triggers the slip.
 *
 * On settlement the mail is sent AFTER the response, so this reports which
 * addresses are ON FILE, never that delivery succeeded, and the wording says so.
 * A missing mailbox is called out explicitly rather than the payment quietly
 * reading as a full success: a slip that reached only one of two addresses is
 * exactly the case someone needs to know about.
 */
function paymentToast(
  res: PaymentWriteResult,
  name: string,
): { message: string; type: "success" | "error" | "info" } {
  const capped = res.clamped
    ? ` Entered amount exceeded the ${inrN(res.payable)} payable, so it was capped.`
    : "";

  if (res.noChange) {
    return { message: `${name} — no change; nothing re-sent.${capped}`, type: "info" };
  }

  // Still outstanding → a plain record of the running total. No slip goes out
  // until the balance clears, and saying "paid" here would be wrong.
  if (res.status !== "paid") {
    return {
      message: `${name} — ${inrN(res.amountPaid)} of ${inrN(res.payable)} recorded. ${inrN(res.balance)} still outstanding.${capped}`,
      type: "info",
    };
  }

  // Settled. `mail` is absent when the row was ALREADY settled before this write
  // (so nothing was sent) — that is the noChange path above in practice, but a
  // concurrent settle can land here too.
  const mail = res.mail;
  if (!mail || !mail.linked) {
    return {
      message: `${name} paid in full. No linked employee record on this row, so no salary slip could be emailed.${capped}`,
      type: "info",
    };
  }
  if (mail.to.length === 0) {
    return {
      message: `${name} paid in full — but no email address is on file, so the salary slip was NOT sent.${capped}`,
      type: "error",
    };
  }
  if (!mail.personal) {
    return {
      message: `${name} paid in full. Slip sent to the work address only — no personal email on file.${capped}`,
      type: "info",
    };
  }
  if (!mail.business) {
    return {
      message: `${name} paid in full. Slip sent to the personal address only — no work email on file.${capped}`,
      type: "info",
    };
  }
  return {
    message: `${name} paid in full. Salary slip sent to their work and personal email.${capped}`,
    type: "success",
  };
}

/* Editable "Remarks" note — super-admins type an inline note (admin_note);
 * everyone else sees it read-only. Optimistic; saves on blur / Enter, reverts on
 * Escape or error. Shows the note, never the imported joining-date remarks. */
function RemarkCell({ row, editable }: { row: SalaryRow; editable: boolean }) {
  const router = useRouter();
  const [val, setVal] = useState(row.adminNote ?? "");
  const [saved, setSaved] = useState(row.adminNote ?? "");
  const [busy, setBusy] = useState(false);

  if (!editable) {
    return saved ? (
      <span className="block max-w-[300px] truncate text-[12.5px] text-ink-soft" title={saved}>
        {saved}
      </span>
    ) : (
      <span className="text-ink-subtle">—</span>
    );
  }

  async function commit() {
    const next = val.trim();
    if (next === saved.trim()) {
      setVal(next);
      return;
    }
    setBusy(true);
    const res = await setSalaryNote(row.id, next);
    setBusy(false);
    if (!res.ok) {
      setVal(saved);
      fireToast({ message: res.error, type: "error" });
      return;
    }
    setSaved(next);
    setVal(next);
    router.refresh();
  }

  return (
    <input
      type="text"
      value={val}
      disabled={busy}
      onChange={(e) => setVal(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        else if (e.key === "Escape") {
          setVal(saved);
          e.currentTarget.blur();
        }
      }}
      placeholder="Add a note…"
      aria-label={`Note for ${row.employeeName}`}
      className="w-full min-w-[190px] rounded-md border border-transparent bg-transparent px-2 py-1 text-[12.5px] text-ink-soft transition-colors placeholder:text-ink-subtle hover:border-hairline focus:border-[color-mix(in_srgb,#E10600_55%,transparent)] focus:bg-surface-card focus:outline-none disabled:opacity-60"
    />
  );
}

/**
 * ADJUSTMENTS (+/−) — the two pre-payout grants in one cell.
 *
 * Wave-Off (condoned days) and the signed payout adjustment used to be two
 * columns at opposite ends of the table, even though `netAfterWaiveOff` sums
 * them into a single movement of the payable. Merging them is what lets the row
 * read as one line of arithmetic: Payable ± Adjustments = Final Amount.
 *
 * NEITHER EDITOR CHANGED. Both are the same components behind the same
 * super-admin gate, stacked rather than rewritten, so every write path, note
 * field and permission is exactly as it was. A viewer without the grant sees the
 * combined signed figure and no controls — but still sees it, because otherwise
 * Payable and Final Amount would differ with nothing on screen explaining why.
 */
function AdjustmentsCell({ row, editable }: { row: SalaryRow; editable: boolean }) {
  const total = adjustmentTotal(row);

  const badge =
    total === 0 ? (
      <span className="text-[13px] text-ink-subtle">—</span>
    ) : (
      <span
        className="tabular-nums text-[13.5px] font-black"
        style={{ color: total >= 0 ? "#166534" : "#b91c1c" }}
        title={
          waiveAddBack(row) > 0
            ? `Wave-off ${dec(row.waiveOffDays)} day(s) + adjustment ${inrN(num(row.payoutAdjustment))}`
            : undefined
        }
      >
        {total >= 0 ? "+" : "−"} {inrN(Math.abs(total))}
      </span>
    );

  if (!editable) return badge;

  // INLINE, not stacked. Stacking the badge over two editors made every row
  // ~106px tall — three lines of chrome per person on a table whose whole point
  // is scanning many people. Side by side they fit the same row height as every
  // other cell.
  return (
    <div className="flex items-center gap-2 whitespace-nowrap">
      <WaiveOffCell row={row} editable />
      <AdjustmentCell row={row} editable />
    </div>
  );
}

/* Super-admin "Wave-Off" grant — type how many attendance days to CONDONE for a
 * person; the salary is recalculated (final payment + days × per-day rate), i.e.
 * "your money isn't deducted". A GRANT, not a raw-amount edit: the stored base
 * numbers never change — only the displayed net. Optimistic; saves on blur /
 * Enter, reverts on Escape or error. Read-only for everyone but super-admins. */
function WaiveOffCell({ row, editable }: { row: SalaryRow; editable: boolean }) {
  const router = useRouter();
  const initial = row.waiveOffDays == null || Number(row.waiveOffDays) === 0 ? "" : dec(row.waiveOffDays);
  const [val, setVal] = useState(initial);
  const [savedDays, setSavedDays] = useState(num(row.waiveOffDays));
  const [busy, setBusy] = useState(false);

  const perDay = perDayRate(row);
  // Editable → preview from the live input; read-only → the stored grant.
  const days = editable ? Math.max(0, Number(val) || 0) : savedDays;
  const addBack = days > 0 ? days * perDay : 0;
  const newNet = num(row.finalPayment) + addBack;

  const delta =
    addBack > 0 ? (
      <div className="mt-1 leading-tight">
        <span className="tabular-nums text-[11.5px] font-bold" style={{ color: "#166534" }}>
          + ₹{Math.round(addBack).toLocaleString("en-IN")} waived
        </span>
        <span
          className="ml-1.5 tabular-nums text-[11.5px] font-black"
          style={{ color: BRAND_RED_DEEP }}
          title="Net after wave-off (final payment + condoned days)"
        >
          → ₹{Math.round(newNet).toLocaleString("en-IN")}
        </span>
      </div>
    ) : null;

  if (!editable) {
    return savedDays > 0 ? (
      <div>
        <span className="tabular-nums text-[12.5px] font-bold text-ink-soft">
          {dec(row.waiveOffDays)} {num(row.waiveOffDays) === 1 ? "day" : "days"}
        </span>
        {delta}
      </div>
    ) : (
      <span className="text-ink-subtle">—</span>
    );
  }

  async function commit() {
    const nextDays = Math.round(Math.max(0, Number(val) || 0) * 100) / 100;
    if (nextDays === savedDays) {
      setVal(nextDays === 0 ? "" : String(nextDays));
      return;
    }
    setBusy(true);
    const res = await setWaiveOff({ rowId: row.id, days: nextDays });
    setBusy(false);
    if (!res.ok) {
      setVal(savedDays === 0 ? "" : String(savedDays));
      fireToast({ message: res.error, type: "error" });
      return;
    }
    setSavedDays(nextDays);
    setVal(nextDays === 0 ? "" : String(nextDays));
    router.refresh();
  }

  return (
    <div>
      <div className="inline-flex items-center gap-1.5">
        <input
          type="number"
          min={0}
          max={366}
          step="0.5"
          inputMode="decimal"
          value={val}
          disabled={busy}
          onChange={(e) => setVal(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            else if (e.key === "Escape") {
              setVal(savedDays === 0 ? "" : String(savedDays));
              e.currentTarget.blur();
            }
          }}
          placeholder="0"
          aria-label={`Wave off days for ${row.employeeName} — your money isn't deducted`}
          title="Condone attendance days — your money isn't deducted"
          className="w-[54px] rounded-md border border-hairline bg-surface-card px-2 py-1 text-right text-[12.5px] font-bold tabular-nums text-ink-strong transition-colors placeholder:font-normal placeholder:text-ink-subtle hover:border-hairline-strong focus:border-[color-mix(in_srgb,#166534_55%,transparent)] focus:outline-none disabled:opacity-60"
        />
        <span className="text-[11px] font-semibold text-ink-subtle">days</span>
        {busy ? <Loader2 size={12} className="animate-spin text-ink-subtle" /> : null}
      </div>
      {delta}
    </div>
  );
}

/* Super-admin pre-payout ADJUSTMENT (Sir #37) — a signed rupee amount added (+)
 * or deducted (−) before the final take-home. Base numbers never change; only the
 * displayed net. Optimistic; saves on blur / Enter, reverts on Escape or error. */
function AdjustmentCell({ row, editable }: { row: SalaryRow; editable: boolean }) {
  const router = useRouter();
  const initial = row.payoutAdjustment == null || Number(row.payoutAdjustment) === 0 ? "" : dec(row.payoutAdjustment);
  const [val, setVal] = useState(initial);
  const [saved, setSaved] = useState(num(row.payoutAdjustment));
  const [busy, setBusy] = useState(false);

  const amount = editable ? Number(val) || 0 : saved;
  const delta =
    amount !== 0 ? (
      <div className="mt-1 leading-tight">
        <span className="tabular-nums text-[11.5px] font-black" style={{ color: amount >= 0 ? "#166534" : "#b91c1c" }}>
          {amount >= 0 ? "+" : "−"} ₹{Math.abs(Math.round(amount)).toLocaleString("en-IN")} {amount >= 0 ? "extra" : "deducted"}
        </span>
      </div>
    ) : null;

  if (!editable) {
    return saved !== 0 ? <div>{delta}</div> : <span className="text-ink-subtle">—</span>;
  }

  async function commit() {
    const next = Math.round((Number(val) || 0) * 100) / 100;
    if (next === saved) {
      setVal(next === 0 ? "" : String(next));
      return;
    }
    setBusy(true);
    const res = await setPayoutAdjustment({ rowId: row.id, amount: next });
    setBusy(false);
    if (!res.ok) {
      setVal(saved === 0 ? "" : String(saved));
      fireToast({ message: res.error, type: "error" });
      return;
    }
    setSaved(next);
    setVal(next === 0 ? "" : String(next));
    router.refresh();
  }

  return (
    <div>
      <div className="inline-flex items-center gap-1.5">
        <span className="text-[11px] font-bold text-ink-subtle">₹</span>
        <input
          type="number"
          step="100"
          inputMode="numeric"
          value={val}
          disabled={busy}
          onChange={(e) => setVal(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            else if (e.key === "Escape") {
              setVal(saved === 0 ? "" : String(saved));
              e.currentTarget.blur();
            }
          }}
          placeholder="0"
          aria-label={`Pre-payout adjustment for ${row.employeeName} (+ extra / − deduct)`}
          title="Add (+) or deduct (−) a rupee amount before the final payout"
          className="w-[74px] rounded-md border border-hairline bg-surface-card px-2 py-1 text-right text-[12.5px] font-bold tabular-nums text-ink-strong transition-colors placeholder:font-normal placeholder:text-ink-subtle hover:border-hairline-strong focus:border-[color-mix(in_srgb,#166534_55%,transparent)] focus:outline-none disabled:opacity-60"
        />
        {busy ? <Loader2 size={12} className="animate-spin text-ink-subtle" /> : null}
      </div>
      {delta}
    </div>
  );
}

/* Extreme-right per-row payslip — a downloadable PDF (salary + attendance +
 * incentives) via the combined-earnings route, for the currently-viewed month. */
function PayslipLink({ row, month }: { row: SalaryRow; month?: string }) {
  if (!row.employeeId || !month) {
    return <span className="text-ink-subtle">—</span>;
  }
  const href = `/salary/earnings/${row.employeeId}?month=${month}&name=${encodeURIComponent(row.employeeName)}`;
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={`Download ${row.employeeName}'s payslip (salary + attendance + incentives)`}
      // A quiet outlined control, not a filled red pill. One of these sits on
      // EVERY row, so a saturated button turned the last column into a wall of
      // red that out-shouted the figures the table exists to show. The brand
      // colour returns on hover, where it marks intent rather than presence.
      className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-surface-card px-2.5 py-1.5 text-[12.5px] font-bold text-ink-soft transition-colors hover:border-[color-mix(in_srgb,var(--color-altus-red)_45%,transparent)] hover:text-altus-red active:scale-[0.98]"
    >
      <FileDown size={14} strokeWidth={2.5} /> PDF
    </a>
  );
}

/* Sticky-header surfaces (solid enough to cover scrolled rows). The header is a
 * SINGLE row now — the group tier and its 30px height went with the attendance
 * and build-up column blocks it existed to label. */
const HEAD_BG = "rgba(248, 250, 252, 0.94)";
/* Fixed width of the frozen EMPLOYEE column → the left offset the frozen
 * ENTITY column pins to. Both stay put on horizontal scroll. */
const EMP_W = 236;

type SortState = { key: string; dir: "asc" | "desc" } | null;

/* ── The table ─────────────────────────────────────────────────────────── */

export function SalaryBreakupTable({
  rows,
  canRecordPayment = false,
  canEditNote = false,
  canWaiveOff = false,
  month,
  hideCompanyFilter = false,
}: {
  rows: SalaryRow[];
  /** May the viewer record payments — enter an amount, settle a row, clear one?
   *  Finance viewers (admins, super-admins, Accounts department). Everyone who
   *  reaches this page can READ the four payment columns; this gates the writes. */
  canRecordPayment?: boolean;
  /** Super-admins can edit the inline Remarks note; others see it read-only. */
  canEditNote?: boolean;
  /** Super-admins can type condoned "Wave-Off" days; others see the grant read-only. */
  canWaiveOff?: boolean;
  /** The payroll month ("YYYY-MM") — powers the per-row payslip PDF link. */
  month?: string;
  /** When the parent already filters by company (salary workspace), hide the
   *  table's own company dropdown so there's a single source of truth. */
  hideCompanyFilter?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [company, setCompany] = useState("__all");
  const [sort, setSort] = useState<SortState>(null);

  const companies = useMemo(
    () =>
      [...new Set(rows.map((r) => r.companyName).filter((c): c is string => Boolean(c)))].sort(
        (a, b) => a.localeCompare(b),
      ),
    [rows],
  );

  const filtered = useMemo(() => {
    let out = rows;
    if (company !== "__all") out = out.filter((r) => r.companyName === company);
    const q = query.trim().toLowerCase();
    if (q) {
      out = out.filter((r) =>
        `${r.employeeName} ${r.designation ?? ""} ${r.companyName ?? ""}`.toLowerCase().includes(q),
      );
    }
    if (sort) {
      const col = COLUMNS.find((c) => c.key === sort.key);
      const dir = sort.dir === "asc" ? 1 : -1;
      const sortValue =
        sort.key === "employee" ? (r: SalaryRow) => r.employeeName : col?.sortValue;
      if (sortValue) {
        out = [...out].sort((a, b) => {
          const av = sortValue(a);
          const bv = sortValue(b);
          if (typeof av === "number" && typeof bv === "number") return (av - bv) * dir;
          return (
            String(av).localeCompare(String(bv), undefined, { numeric: true, sensitivity: "base" }) *
            dir
          );
        });
      }
    }
    return out;
  }, [rows, company, query, sort]);

  function toggleSort(key: string) {
    setSort((prev) => {
      if (!prev || prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return null;
    });
  }

  function SortGlyph({ colKey }: { colKey: string }) {
    if (sort?.key !== colKey) return <ChevronsUpDown size={12} strokeWidth={2} className="opacity-40" />;
    return sort.dir === "asc" ? (
      <ArrowUp size={12} strokeWidth={2.8} style={{ color: BRAND_RED_DEEP }} />
    ) : (
      <ArrowDown size={12} strokeWidth={2.8} style={{ color: BRAND_RED_DEEP }} />
    );
  }

  const headBtn = (key: string, label: string, align: Align) => (
    <button
      type="button"
      onClick={() => toggleSort(key)}
      className={`admin-th-btn ${align === "right" ? "flex-row-reverse" : ""} ${sort?.key === key ? "text-ink-strong" : ""}`}
    >
      {label}
      <SortGlyph colKey={key} />
    </button>
  );

  // Show the Remarks/Note column when a super-admin can edit it, or when any row
  // already carries a note (so it stays visible read-only for everyone).
  const showRemarks = canEditNote || rows.some((r) => r.adminNote);
  // ADJUSTMENTS IS ALWAYS SHOWN. It used to appear only when a super-admin could
  // grant one or some row already carried one, which meant that on a normal
  // month — every grant zero — the column vanished and the table read
  // "Payable … Final Amount" with no term between them. The two figures are
  // equal in that case, so nothing looked wrong; the arithmetic was simply
  // invisible, and there was no way to see that no adjustment had been made
  // versus the column not existing. A permanent column showing "—" says the
  // former. Its editors are still super-admin-only (see AdjustmentsCell).
  //
  // The payment columns are never dropped either. They are read-only for a
  // viewer who cannot record payments, not hidden: anyone who reaches this page
  // has finance access and is entitled to see what is owed and what has gone
  // out. (Normal employees never get here — `requireFinanceAccess` redirects.)
  const visibleCols = COLUMNS.filter((c) => c.key !== "remarks" || showRemarks);
  // NO GROUP HEADER ROW. It existed to label the attendance and build-up blocks
  // that this table no longer carries; with ten single-purpose columns every
  // group would have been a one-cell span with a blank label, i.e. 30px of
  // sticky header buying nothing. Dropping it is most of the vertical space the
  // brief asked back.

  return (
    <section
      className="wg-rise admin-panel"
      style={{ animationDelay: "140ms" }}
      aria-label="Salary breakup table"
    >
      {/* ── Toolbar: search · company filter · count ── */}
      <div className="admin-toolbar">
        <div className="relative min-w-[220px] max-w-sm flex-1">
          <Search
            size={16}
            strokeWidth={2.2}
            aria-hidden
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-subtle"
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Local search — name, designation or entity" title="Local search — filters only the list on this page" aria-label="Local search — name, designation or entity — this page only"
            className="admin-search"
          />
        </div>

        {!hideCompanyFilter && companies.length > 1 && (
          <label className="inline-flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-subtle">
              Company
            </span>
            <div className="relative">
              <select
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                aria-label="Filter by company"
                className="admin-filter-select"
              >
                <option value="__all">All Companies</option>
                {companies.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              <ChevronsUpDown
                size={14}
                aria-hidden
                className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-ink-subtle"
              />
            </div>
          </label>
        )}

        <div className="ml-auto text-[13px] font-semibold tabular-nums text-ink-subtle">
          {filtered.length} of {rows.length} employees
        </div>
      </div>

      {/* ── Grid: vertical + horizontal scroll, sticky header/first-col/totals ── */}
      <div className="max-h-[72vh] overflow-auto overscroll-contain">
        {/* min-w drops from 1280 to 1080: eleven fewer columns need far less
            room before the table must scroll sideways, so on a normal desktop it
            now fits the viewport outright instead of clipping. */}
        <table className="w-full min-w-[1080px] border-collapse text-[13.5px]">
          <thead>
            {/* ONE header row — the group tier is gone (see visibleCols). */}
            <tr>
              <th
                scope="col"
                className="sticky left-0 top-0 z-30 px-4 py-2.5 text-left text-[11px] font-bold uppercase tracking-[0.1em] text-ink-subtle backdrop-blur"
                style={{
                  background: HEAD_BG,
                  boxShadow: "inset -1px -1px 0 var(--color-hairline-strong)",
                  width: EMP_W,
                  minWidth: EMP_W,
                  maxWidth: EMP_W,
                }}
                aria-sort={sort?.key === "employee" ? (sort.dir === "asc" ? "ascending" : "descending") : "none"}
              >
                {headBtn("employee", "Employee", "left")}
              </th>
              {visibleCols.map((c) => (
                <th
                  key={c.key}
                  scope="col"
                  className={`sticky top-0 whitespace-nowrap px-3 py-2.5 text-[11px] font-bold uppercase tracking-[0.07em] text-ink-subtle backdrop-blur ${c.key === "company" ? "z-30" : "z-20"} ${c.align === "right" ? "text-right" : "text-left"}`}
                  style={{
                    background:
                      c.key === "final"
                        ? `linear-gradient(180deg, color-mix(in srgb, ${BRAND_RED} 9%, ${HEAD_BG}), color-mix(in srgb, ${BRAND_RED} 6%, ${HEAD_BG}))`
                        : HEAD_BG,
                    boxShadow: c.key === "company"
                      ? "inset -1px -1px 0 var(--color-hairline-strong)"
                      : `inset ${c.groupStart ? "1px" : "0"} -1px 0 var(--color-hairline-strong)`,
                    minWidth: c.minWidth,
                    ...(c.key === "company" ? { left: EMP_W } : {}),
                  }}
                  aria-sort={
                    sort?.key === c.key
                      ? sort.dir === "asc"
                        ? "ascending"
                        : "descending"
                      : c.sortValue
                        ? "none"
                        : undefined
                  }
                >
                  {c.sortValue ? headBtn(c.key, c.label, c.align) : c.label}
                </th>
              ))}
            </tr>
          </thead>

          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={visibleCols.length + 1} className="px-5 py-14 text-center">
                  <p
                    className="text-ink-strong"
                    style={{
                      fontFamily: "var(--font-serif), system-ui, sans-serif",
                      fontStyle: "italic",
                      fontSize: 20,
                    }}
                  >
                    No matches
                  </p>
                  <p className="mt-1.5 text-[13.5px] text-ink-subtle">
                    {query.trim()
                      ? `Nothing matches “${query.trim()}”.`
                      : "No rows match the current filter."}
                  </p>
                </td>
              </tr>
            ) : (
              filtered.map((r, i) => (
                <tr
                  key={r.id}
                  className="wg-rise group border-b border-hairline last:border-b-0 hover:bg-[color-mix(in_srgb,#E10600_4%,transparent)]"
                  style={{ animationDelay: `${Math.min(i, 12) * 22}ms` }}
                >
                  {/* Sticky employee cell */}
                  <td
                    className="sticky left-0 z-10 px-4 py-2.5 group-hover:bg-[color-mix(in_srgb,#E10600_4%,var(--color-surface-card))]"
                    style={{
                      background: "var(--color-surface-card)",
                      boxShadow: "inset -1px 0 0 var(--color-hairline-strong)",
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <span className="w-5 shrink-0 text-right text-[11px] font-bold tabular-nums text-ink-subtle">
                        {r.srNo ?? i + 1}
                      </span>
                      {/* `Avatar`, not `EmployeeAvatar`: the latter draws
                          initials only and has no image path at all, which is
                          why no profile picture ever appeared here. This one
                          renders `avatarUrl` when set and falls back to the same
                          deterministic initials when it is null. */}
                      <Avatar name={r.employeeName} avatarUrl={r.avatarUrl} size={26} />
                      <div className="min-w-0 leading-tight">
                        <div className="truncate text-[14px] font-bold text-ink-strong">
                          {r.employeeName}
                        </div>
                        {r.designation && (
                          <div className="truncate text-[11.5px] font-medium text-ink-subtle">
                            {r.designation}
                          </div>
                        )}
                      </div>
                    </div>
                  </td>

                  {visibleCols.map((c) => (
                    <td
                      key={c.key}
                      className={`whitespace-nowrap px-3 py-2.5 ${c.key === "company" ? "sticky z-10 group-hover:bg-[color-mix(in_srgb,#E10600_4%,var(--color-surface-card))]" : ""} ${c.align === "right" ? "text-right" : "text-left"}`}
                      style={{
                        boxShadow:
                          c.key === "company"
                            ? "inset -1px 0 0 var(--color-hairline-strong)"
                            : c.groupStart
                              ? "inset 1px 0 0 var(--color-hairline)"
                              : undefined,
                        background:
                          c.key === "company"
                            ? "var(--color-surface-card)"
                            : c.key === "final"
                              ? `color-mix(in srgb, ${BRAND_RED} 5%, transparent)`
                              : undefined,
                        ...(c.key === "company" ? { left: EMP_W } : {}),
                      }}
                    >
                      {c.key === "amountPaid" ? (
                        <AmountToPayCell row={r} editable={canRecordPayment} />
                      ) : c.key === "adjustments" ? (
                        <AdjustmentsCell row={r} editable={canWaiveOff} />
                      ) : c.key === "payStatus" ? (
                        <PaymentStatusCell row={r} />
                      ) : c.key === "remarks" ? (
                        <RemarkCell row={r} editable={canEditNote} />
                      ) : c.key === "payslip" ? (
                        <PayslipLink row={r} month={month} />
                      ) : (
                        c.render(r)
                      )}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>

          {/* ── Sticky totals footer (over the filtered set) ── */}
          {filtered.length > 0 && (
            <tfoot>
              <tr>
                <td
                  className="sticky bottom-0 left-0 z-30 px-4 py-3 backdrop-blur"
                  style={{
                    background: HEAD_BG,
                    boxShadow: "inset -1px 1px 0 var(--color-hairline-strong)",
                  }}
                >
                  <span className="text-[11px] font-black uppercase tracking-[0.1em] text-ink-strong">
                    Totals
                  </span>
                  <span className="ml-2 text-[11px] font-semibold tabular-nums text-ink-subtle">
                    {filtered.length} {filtered.length === 1 ? "employee" : "employees"}
                  </span>
                </td>
                {visibleCols.map((c) => (
                  <td
                    key={c.key}
                    className={`sticky bottom-0 whitespace-nowrap px-3 py-3 backdrop-blur ${c.key === "company" ? "z-30" : "z-20"} ${c.align === "right" ? "text-right" : "text-left"}`}
                    style={{
                      background:
                        c.key === "final"
                          ? `color-mix(in srgb, ${BRAND_RED} 9%, ${HEAD_BG})`
                          : HEAD_BG,
                      boxShadow: c.key === "company"
                        ? "inset -1px 1px 0 var(--color-hairline-strong)"
                        : `inset ${c.groupStart ? "1px" : "0"} 1px 0 var(--color-hairline-strong)`,
                      ...(c.key === "company" ? { left: EMP_W } : {}),
                    }}
                  >
                    {c.total ? c.total(filtered) : null}
                  </td>
                ))}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
    </section>
  );
}
