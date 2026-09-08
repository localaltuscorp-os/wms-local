import type { LeaveBalance } from "@/lib/queries/leave";

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
        },
        { label: "Paid Leave Used", value: balance.used, emphasis: false },
        { label: "Unpaid Leave Used", value: balance.unpaidUsed, emphasis: false },
      ]
    : [{ label: "Unpaid Leave Used", value: balance.unpaidUsed, emphasis: false }];

  const note = !balance.paidEligible
    ? "Your employment type is eligible for unpaid leave only."
    : balance.beforeProbation
      ? "Paid leave accrues from your probation-end date. Unpaid leave can still be requested."
      : balance.allowance === 0
        ? "No probation-end date is set yet, so paid leave isn't available. Ask an admin to set it - unpaid leave still works."
        : null;

  return (
    <section aria-label="Leave summary">
      <div
        className={`grid gap-3 ${
          cards.length === 1
            ? "max-w-[260px] grid-cols-1"
            : "grid-cols-3 max-sm:grid-cols-1"
        }`}
      >
        {cards.map((c) => (
          <div
            key={c.label}
            className="rounded-[14px] bg-surface-card px-4 py-3.5"
            style={{ border: "1px solid var(--color-hairline)" }}
          >
            <div className="text-[12px] font-semibold text-ink-subtle">
              {c.label}
            </div>
            <div className="mt-1 flex items-baseline gap-1.5">
              <span
                className="tabular-nums leading-none"
                style={{
                  fontFamily: "var(--font-display), system-ui, sans-serif",
                  fontWeight: 800,
                  fontSize: 26,
                  letterSpacing: "-0.02em",
                  color: c.emphasis
                    ? "var(--color-altus-red-deep, #A80400)"
                    : "var(--color-ink-strong)",
                }}
              >
                {c.value}
              </span>
              <span className="text-[12.5px] text-ink-subtle">
                {c.value === 1 ? "day" : "days"}
                {c.emphasis && balance.allowance > 0
                  ? ` of ${balance.allowance}`
                  : ""}
              </span>
            </div>
          </div>
        ))}
      </div>

      <p className="mt-2.5 text-[12.5px] text-ink-subtle">
        {balance.paidEligible ? `Period ${balance.cycleLabel}. ` : ""}
        {note ??
          "Paid leave is granted per half-year and does not carry into the next period."}
      </p>
    </section>
  );
}
