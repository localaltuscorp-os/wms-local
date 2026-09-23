import { BILLING_PURPLE, CARD_STYLE, rupees } from "@/lib/billing/ui";
import type { BucketTotals } from "@/lib/billing/contracts";

/** The reference sheet's summary: No. / Amount of Bills × Paid / Unpaid / Not Due. */
export function BillsGrid({ totals, title = "All Contracts View" }: { totals: BucketTotals; title?: string }) {
  const cols = [
    { label: "Bills Paid", b: totals.paid, color: "#15803D" },
    { label: "Bills Unpaid", b: totals.unpaid, color: "#C2410C" },
    { label: "Bills Not Due", b: totals.notDue, color: "#475569" },
  ];
  return (
    <section className="mb-5 overflow-x-auto rounded-[22px] p-5 max-md:p-4" style={CARD_STYLE}>
      <table className="w-full min-w-[560px] border-separate border-spacing-0 text-[13.5px]">
        <thead>
          <tr>
            <th className="pb-2 pr-3 text-left text-[11px] font-black uppercase tracking-[0.14em]" style={{ color: BILLING_PURPLE }}>
              {title}
            </th>
            {cols.map((c) => (
              <th key={c.label} className="pb-2 pr-3 text-right text-[11px] font-bold uppercase tracking-[0.12em]" style={{ color: c.color }}>
                {c.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="border-t border-hairline py-2.5 pr-3 font-bold text-ink-strong">No. of Bills</td>
            {cols.map((c) => (
              <td key={c.label} className="border-t border-hairline py-2.5 pr-3 text-right text-[18px] font-black tabular-nums">
                {c.b.count}
              </td>
            ))}
          </tr>
          <tr>
            <td className="border-t border-hairline py-2.5 pr-3 font-bold text-ink-strong">Amount of Bills</td>
            {cols.map((c) => (
              <td key={c.label} className="border-t border-hairline py-2.5 pr-3 text-right text-[18px] font-black tabular-nums">
                {rupees(c.b.amount)}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
      <p className="mt-2 text-[11.5px] text-ink-muted">
        Amounts are before GST. Paid is read from the invoice in Documents; Not Due means the due date is still ahead.
      </p>
    </section>
  );
}
