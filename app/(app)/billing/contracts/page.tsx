import type { CSSProperties } from "react";
import Link from "next/link";
import type { Route } from "next";
import { FileSignature, Paperclip, ReceiptIndianRupee } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { PageShell } from "@/components/layout/page-shell";
import { listBillingEntities } from "@/lib/billing/entities";
import { CONTRACT_PAYMENT_TYPE_LABELS, CONTRACT_STATUS_LABELS, type ContractStatus } from "@/db/enums";
import { listContracts } from "@/lib/queries/billing-contracts";
import { BILLING_PURPLE, BILLING_PURPLE_DEEP, CARD_STYLE, rupees } from "@/lib/billing/ui";
import { BillsGrid } from "@/components/billing/contract-bills-grid";
import { ContractsTable } from "@/components/billing/contracts-table";

/**
 * /billing/contracts — ALL CONTRACTS VIEW.
 *
 * The headline is the reference sheet's grid: No. of Bills and Amount of Bills
 * across Bills Paid / Bills Unpaid / Bills Not Due, every figure computed from
 * the contracts' schedules and the live invoices they raised (see `billBucket`
 * in lib/billing/contracts.ts for exactly what lands in each column).
 */
export const dynamic = "force-dynamic";

const STATUS_STYLE: Record<ContractStatus, CSSProperties> = {
  active: { background: "rgba(225,6,0,0.12)", color: BILLING_PURPLE_DEEP },
  completed: { background: "rgba(22,163,74,0.12)", color: "#15803D" },
  stopped: { background: "rgba(234,88,12,0.12)", color: "#C2410C" },
  cancelled: { background: "rgba(100,116,139,0.14)", color: "#475569" },
};

export default async function ContractsPage() {
  await requireWorkspace("billing");
  const { rows, totals } = await listContracts();
  const entityName = new Map<string, string>(
    (await listBillingEntities()).map((e) => [e.id, e.displayName]),
  );

  return (
    <PageShell width="wide">
      <header
        className="wg-rise relative mb-5 overflow-hidden rounded-[26px] px-7 py-6 max-md:px-4 max-md:py-5"
        style={{
          background: [
            `radial-gradient(120% 190% at 100% 0%, color-mix(in srgb, ${BILLING_PURPLE} 9%, transparent), transparent 55%)`,
            "rgba(255, 255, 255, 0.72)",
          ].join(", "),
          backdropFilter: "blur(14px) saturate(140%)",
          boxShadow:
            "inset 0 0 0 1px var(--color-hairline), inset 0 1px 0 rgba(255,255,255,0.85), 0 18px 44px -28px rgba(15,23,42,0.22)",
        }}
      >
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div className="min-w-0">
            <span
              className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-white"
              style={{ background: `linear-gradient(135deg, ${BILLING_PURPLE}, ${BILLING_PURPLE_DEEP})` }}
            >
              <ReceiptIndianRupee size={13} strokeWidth={2.6} /> Billing
            </span>
            <h1
              className="mt-3 text-ink-strong"
              style={{
                fontFamily: "var(--font-display), system-ui, sans-serif",
                fontWeight: 900,
                fontSize: "clamp(28px,3.4vw,42px)",
                letterSpacing: "-0.03em",
                lineHeight: 1.02,
              }}
            >
              All Contracts View
            </h1>
          </div>
          <Link
            href={"/billing/contracts/new" as Route}
            className="inline-flex h-10 items-center gap-2 rounded-chip px-4 text-[13px] font-bold text-white"
            style={{ background: `linear-gradient(135deg, ${BILLING_PURPLE}, ${BILLING_PURPLE_DEEP})` }}
          >
            <FileSignature size={15} /> Create Contract
          </Link>
        </div>
      </header>

      <BillsGrid totals={totals} />

      <section className="rounded-[22px] p-5 max-md:p-4" style={CARD_STYLE}>
        {rows.length === 0 ? (
          <div className="py-10 text-center">
            <p className="text-[14px] font-bold text-ink-strong">No contracts yet</p>
            <p className="mt-1 text-[13px] text-ink-muted">Create one to start billing against a contract value.</p>
          </div>
        ) : (
          <ContractsTable rows={rows} entityNames={Object.fromEntries(entityName)} />
        )}
      </section>
    </PageShell>
  );
}

function BucketCell({ b }: { b: { count: number; amount: number } }) {
  return (
    <td className="border-t border-hairline py-2.5 pr-3 text-right tabular-nums">
      {b.count > 0 ? (
        <>
          <span className="font-semibold">{rupees(b.amount)}</span>
          <div className="text-[11px] text-ink-muted">
            {b.count} bill{b.count === 1 ? "" : "s"}
          </div>
        </>
      ) : (
        <span className="text-ink-muted">—</span>
      )}
    </td>
  );
}
