import type { ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft, Paperclip } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { PageShell } from "@/components/layout/page-shell";
import { listBillingEntities } from "@/lib/billing/entities";
import { CONTRACT_PAYMENT_TYPE_LABELS, CONTRACT_STATUS_LABELS } from "@/db/enums";
import { getContract } from "@/lib/queries/billing-contracts";
import { BILLING_PURPLE, CARD_STYLE, rupees } from "@/lib/billing/ui";
import { BillsGrid } from "@/components/billing/contract-bills-grid";
import { ContractSchedule } from "@/components/billing/contract-schedule";

/**
 * /billing/contracts/[id] — one contract: its terms, the billing schedule with
 * Raise Bill / Stop Billing, the PDCs and the attached contract.
 */
export const dynamic = "force-dynamic";

export default async function ContractPage({ params }: { params: Promise<{ id: string }> }) {
  await requireWorkspace("billing");
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const detail = await getContract(id);
  if (!detail) notFound();
  const { contract: c, summary, schedule, upcoming, pdcs, attachmentUrl } = detail;
  const entity =
    (await listBillingEntities()).find((e) => e.id === c.entityId)?.displayName ?? c.entityId;
  const frequencyLabel = c.billingFrequency === "quarterly" ? "Quarterly" : c.billingFrequency ? "Monthly" : null;
  const canDelete = schedule.every((r) => r.status !== "billed" && r.document === null);

  return (
    <PageShell width="wide">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <Link
          href={"/billing/contracts" as Route}
          className="inline-flex h-9 items-center gap-1.5 rounded-chip px-3 text-[13px] font-bold text-ink-muted"
          style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
        >
          <ArrowLeft size={14} /> All Contracts
        </Link>
        <h1
          className="text-ink-strong"
          style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(22px,2.6vw,30px)", letterSpacing: "-0.02em" }}
        >
          {c.customerName}
        </h1>
        <span className="rounded-pill px-2.5 py-1 text-[11.5px] font-bold" style={{ background: "rgba(225,6,0,0.12)", color: BILLING_PURPLE }}>
          {CONTRACT_PAYMENT_TYPE_LABELS[c.paymentType]}
          {frequencyLabel ? ` · ${frequencyLabel}` : ""}
        </span>
        <span className="rounded-pill px-2.5 py-1 text-[11.5px] font-bold" style={{ background: "rgba(100,116,139,0.12)", color: "#334155" }}>
          {CONTRACT_STATUS_LABELS[c.status]}
        </span>
      </div>

      {c.status === "cancelled" && c.cancelReason ? (
        <p className="mb-4 rounded-chip px-3 py-2 text-[13px] font-semibold" style={{ background: "rgba(220,38,38,0.08)", color: "#B91C1C" }}>
          Cancelled: {c.cancelReason}
        </p>
      ) : null}

      <section className="mb-4 grid grid-cols-6 gap-3 max-lg:grid-cols-3 max-md:grid-cols-2">
        <Tile label="Contract Value" value={rupees(summary.totalValue)} />
        <Tile label="Billed" value={rupees(summary.billedAmount)} />
        <Tile label="Remaining" value={rupees(summary.remainingAmount)} />
        <Tile label="Billing Entity" value={entity} small />
        <Tile label="Period" value={`${c.startDate} → ${c.endDate}`} small />
        <Tile label="Billing Date" value={c.billingDate} small />
      </section>

      <BillsGrid totals={summary.buckets} title="This contract" />

      <Card title="Billing Schedule">
        {c.paymentType === "retainer" ? (
          <p className="mb-3 text-[12.5px] text-ink-muted">
            {frequencyLabel} Billing Amount <strong>{rupees(summary.retainerAmount ?? 0)}</strong>.{" "}
            {c.stopWhenComplete ? "Stops when the Contract Value is completed." : "Does not stop on its own at the Contract Value."}
          </p>
        ) : null}
        <ContractSchedule
          contractId={c.id}
          paymentType={c.paymentType}
          status={c.status}
          schedule={schedule}
          upcoming={upcoming}
          frequencyLabel={frequencyLabel}
          canDelete={canDelete}
        />
      </Card>

      <Card title="PDC Received">
        <div className="mb-3 grid max-w-[520px] grid-cols-2 gap-3">
          <Tile label="No. of PDCs" value={String(summary.pdc.count)} />
          <Tile label="Amount of PDCs" value={rupees(summary.pdc.amount)} />
        </div>
        {pdcs.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-separate border-spacing-0 text-[13px]">
              <thead>
                <tr className="text-left text-[11px] font-bold uppercase tracking-[0.1em] text-ink-muted">
                  <th className="pb-2 pr-3">Sr. No.</th>
                  <th className="pb-2 pr-3">Date</th>
                  <th className="pb-2 pr-3">Cheque No</th>
                  <th className="pb-2 pr-3">Bank Name</th>
                  <th className="pb-2 pr-3 text-right">Amt</th>
                  <th className="pb-2">Drawer Name</th>
                </tr>
              </thead>
              <tbody>
                {pdcs.map((p) => (
                  <tr key={p.id}>
                    <td className="border-t border-hairline py-2 pr-3 font-bold">{p.srNo}</td>
                    <td className="border-t border-hairline py-2 pr-3 tabular-nums">{p.chequeDate ?? "—"}</td>
                    <td className="border-t border-hairline py-2 pr-3 font-mono">{p.chequeNo ?? "—"}</td>
                    <td className="border-t border-hairline py-2 pr-3">{p.bankName ?? "—"}</td>
                    <td className="border-t border-hairline py-2 pr-3 text-right tabular-nums">{rupees(Number(p.amount))}</td>
                    <td className="border-t border-hairline py-2">{p.drawerName ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-[13px] text-ink-muted">No PDCs recorded. Add them from Edit contract.</p>
        )}
      </Card>

      <Card title="Contract Document">
        {c.attachmentName ? (
          <span className="inline-flex items-center gap-2 text-[13px] font-semibold">
            <Paperclip size={14} />
            {attachmentUrl ? (
              <a href={attachmentUrl} target="_blank" rel="noreferrer" className="underline">
                {c.attachmentName}
              </a>
            ) : (
              c.attachmentName
            )}
            {c.attachmentSize ? <span className="text-ink-muted">({(c.attachmentSize / 1024 / 1024).toFixed(2)} MB)</span> : null}
          </span>
        ) : (
          <p className="text-[13px] text-ink-muted">No contract attached. Attach one from Edit contract.</p>
        )}
        {c.notes ? <p className="mt-3 whitespace-pre-wrap text-[13px] text-ink-strong">{c.notes}</p> : null}
      </Card>
    </PageShell>
  );
}

function Card({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-4 rounded-[22px] p-5 max-md:p-4" style={CARD_STYLE}>
      <h2 className="mb-3 text-[12px] font-black uppercase tracking-[0.14em]" style={{ color: BILLING_PURPLE }}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Tile({ label, value, small }: { label: string; value: string; small?: boolean }) {
  return (
    <div className="rounded-[18px] px-4 py-3" style={CARD_STYLE}>
      <div className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-ink-muted">{label}</div>
      <div
        className={`mt-1 font-black tabular-nums ${small ? "text-[14px]" : "text-[18px]"}`}
        style={{ fontFamily: "var(--font-display), system-ui, sans-serif" }}
      >
        {value}
      </div>
    </div>
  );
}
