import type { LeaveBalance } from "@/lib/queries/leave";
import { CalendarDays, Landmark, Umbrella } from "lucide-react";

/**
 * The three compact numbers at the top of the Leave page (spec §2):
 * Paid Leave Available · Paid Leave Used · Unpaid Leave Used.
 *
 * An employee with no paid entitlement — college shift, afternoon shift,
 * part-time, contract — sees ONLY the unpaid card. Showing them "0 available /
 * 0 used" would be worse than showing nothing: it reads as an entitlement they
 * have exhausted rather than one they never had. The `note` line says which of
 * the two it is in a sentence, once, instead of two dead cards.
 */
export function LeaveSummaryCards({ balance }: { balance: LeaveBalance }) {
  const cards = balance.paidEligible
    ? [
        {
          label: "Paid Leave Available",
          value: balance.remaining,
          emphasis: true,
          Icon: CalendarDays,
          detail: balance.allowance > 0 ? `of ${balance.allowance} days this period` : "this period",
        },
        {
          label: "Paid Leave Used",
          value: balance.used,
          emphasis: false,
          Icon: Landmark,
          detail: "approved this period",
        },
        {
          label: "Unpaid Leave Used",
          value: balance.unpaidUsed,
          emphasis: false,
          Icon: Umbrella,
          detail: "approved this period",
        },
      ]
    : [
        {
          label: "Unpaid Leave Used",
          value: balance.unpaidUsed,
          emphasis: false,
          Icon: Umbrella,
          detail: "approved this period",
        },
        {
          label: "Leave Type Available",
          value: "Unpaid",
          emphasis: false,
          Icon: CalendarDays,
          detail: "available to you",
        },
        {
          label: "Current Leave Period",
          value: balance.cycleLabel,
          emphasis: false,
          Icon: Landmark,
          detail: "leave is tracked per period",
        },
      ];

  const note = !balance.paidEligible
    ? "Your employment type is eligible for unpaid leave only."
    : balance.beforeProbation
      ? "Paid leave accrues from your probation-end date. Unpaid leave can still be requested."
      : balance.allowance === 0
        ? "No probation-end date is set yet, so paid leave isn't available. Ask an admin to set it — unpaid leave still works."
        : null;

  return (
    <section aria-label="Leave summary">
      <div className="grid gap-3 md:grid-cols-3">
        {cards.map((c) => (
          <article
            key={c.label}
            className="relative min-h-[124px] overflow-hidden rounded-[16px] bg-surface-card p-4"
            style={{
              border: "1px solid var(--color-hairline)",
              boxShadow: "0 10px 24px -24px rgba(15,23,42,0.45)",
            }}
          >
            <span
              aria-hidden
              className="absolute right-4 top-4 grid size-8 place-items-center rounded-lg"
              style={{
                background: c.emphasis ? "#FEE2E2" : "var(--color-surface-soft)",
                color: c.emphasis ? "var(--color-altus-red-deep, #A80400)" : "var(--color-ink-soft)",
              }}
            >
              <c.Icon size={16} />
            </span>
            <div className="pr-10 text-[12px] font-semibold text-ink-subtle">
              {c.label}
            </div>
            <div className="mt-3 flex items-baseline gap-1.5">
              <span
                className={`${typeof c.value === "number" ? "tabular-nums" : ""} leading-none`}
                style={{
                  fontFamily: "var(--font-display), system-ui, sans-serif",
                  fontWeight: 800,
                  fontSize: typeof c.value === "number" ? 30 : 22,
                  letterSpacing: "-0.02em",
                  color: c.emphasis
                    ? "var(--color-altus-red-deep, #A80400)"
                    : "var(--color-ink-strong)",
                }}
              >
                {c.value}
              </span>
            </div>
            <p className="mt-2 text-[12.5px] text-ink-subtle">{c.detail}</p>
          </article>
        ))}
      </div>

      <p className="mt-3 rounded-xl bg-surface-soft px-3.5 py-2.5 text-[12.5px] text-ink-subtle">
        {balance.paidEligible ? `Period ${balance.cycleLabel}. ` : ""}
        {note ??
          "Paid leave is granted per half-year and does not carry into the next period."}
      </p>
    </section>
  );
}
