import { CARD_STYLE, rupees } from "@/lib/billing/ui";
import type { BucketTotals } from "@/lib/billing/contracts";
import type { ContractSummary } from "@/lib/queries/billing-contracts";
import Link from "next/link";

/** Compact contract KPIs, matching the Documents summary cards. */
export function BillsGrid({ totals, rows }: { totals: BucketTotals; rows: ContractSummary[] }) {
  const contractValue = rows.reduce((sum, row) => sum + row.totalValue, 0);
  const billedValue = rows.reduce((sum, row) => sum + row.billedAmount, 0);
  const billedCount = totals.paid.count + totals.unpaid.count + totals.notDue.count;
  const cards = [
    { label: "Contract Value", amount: contractValue, caption: `${rows.length} contract${rows.length === 1 ? "" : "s"}`, metric: "all" },
    { label: "Billed", amount: billedValue, caption: `${billedCount} bill${billedCount === 1 ? "" : "s"}`, metric: "billed" },
    { label: "Bills Paid", amount: totals.paid.amount, caption: `${totals.paid.count} bill${totals.paid.count === 1 ? "" : "s"}`, metric: "paid" },
    { label: "Bills Unpaid", amount: totals.unpaid.amount, caption: `${totals.unpaid.count} bill${totals.unpaid.count === 1 ? "" : "s"}`, metric: "unpaid" },
    { label: "Bills Not Due", amount: totals.notDue.amount, caption: `${totals.notDue.count} bill${totals.notDue.count === 1 ? "" : "s"}`, metric: "not_due" },
  ];

  return (
    <section className="mb-5 grid grid-cols-5 gap-3 max-lg:grid-cols-3 max-md:grid-cols-2">
      {cards.map(({ label, amount, caption, metric }) => (
        <Link key={label} href={`/billing/contracts${metric === "all" ? "" : `?metric=${metric}`}`} className="block rounded-[20px] px-4 py-3.5 transition hover:-translate-y-px" style={CARD_STYLE}>
          <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-ink-muted">
            {label}
          </p>
          <p className="mt-1 text-[20px] font-black tabular-nums text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif" }}>
            {rupees(amount)}
          </p>
          <p className="mt-0.5 text-[11.5px] text-ink-muted">
            {caption}
          </p>
        </Link>
      ))}
    </section>
  );
}
