import Link from "next/link";
import type { Route } from "next";
import { Wallet, ArrowUpRight, ReceiptText } from "lucide-react";
import type { ReferralRow, PayoutRow } from "@/lib/queries/ambassadors";
import { inr } from "@/lib/ambassadors/format";
import { formatDate } from "@/lib/format";

/**
 * Commission view for one ambassador: (a) referrals carrying a commission with
 * basis + status, (b) the payout disbursement ledger, with totals.
 */

const COMMISSION_STATUS: Record<string, { label: string; bg: string; ink: string }> = {
  pending: { label: "Pending", bg: "rgba(214,138,20,0.14)", ink: "#9a5a00" },
  generated: { label: "Generated", bg: "rgba(59,130,246,0.12)", ink: "#1d4ed8" },
  paid: { label: "Paid", bg: "rgba(20,140,80,0.14)", ink: "#0f7a47" },
};

function fmtDate(d: string | null): string {
  if (!d) return "—";
  const dt = new Date(d);
  if (!Number.isFinite(dt.getTime())) return d;
  return formatDate(dt);
}

export function TabCommissions({ referrals, payouts }: { referrals: ReferralRow[]; payouts: PayoutRow[] }) {
  const withCommission = referrals.filter((r) => r.commissionAmount != null && r.commissionAmount > 0);
  const owed = withCommission
    .filter((r) => r.commissionStatus !== "paid")
    .reduce((a, r) => a + (r.commissionAmount ?? 0), 0);
  const paidLedger = payouts.reduce((a, p) => a + p.amount, 0);

  return (
    <div className="space-y-5">
      {/* totals */}
      <div className="grid grid-cols-2 gap-3.5 max-sm:grid-cols-1">
        <div className="rounded-2xl border border-hairline bg-white p-4" style={{ boxShadow: "0 10px 30px -24px rgba(0,0,0,0.4)" }}>
          <div className="mb-2 inline-grid h-9 w-9 place-items-center rounded-xl" style={{ background: "rgba(214,138,20,0.14)" }}>
            <Wallet size={17} strokeWidth={2.5} className="text-ink-strong" />
          </div>
          <div className="text-ink-strong tabular-nums" style={{ fontFamily: "var(--font-display), system-ui", fontWeight: 800, fontSize: "clamp(22px,2.2vw,30px)", letterSpacing: "-0.02em" }}>
            {inr(owed)}
          </div>
          <div className="mt-0.5 text-[12.5px] font-semibold text-ink-muted">Commission Owed</div>
        </div>
        <div className="rounded-2xl border border-hairline bg-white p-4" style={{ boxShadow: "0 10px 30px -24px rgba(0,0,0,0.4)" }}>
          <div className="mb-2 inline-grid h-9 w-9 place-items-center rounded-xl" style={{ background: "rgba(20,140,80,0.14)" }}>
            <ReceiptText size={17} strokeWidth={2.5} className="text-ink-strong" />
          </div>
          <div className="text-ink-strong tabular-nums" style={{ fontFamily: "var(--font-display), system-ui", fontWeight: 800, fontSize: "clamp(22px,2.2vw,30px)", letterSpacing: "-0.02em" }}>
            {inr(paidLedger)}
          </div>
          <div className="mt-0.5 text-[12.5px] font-semibold text-ink-muted">Total Paid Out</div>
        </div>
      </div>

      {/* commissions on referrals */}
      <section className="rounded-2xl border border-hairline bg-white overflow-hidden" style={{ boxShadow: "0 10px 30px -24px rgba(0,0,0,0.4)" }}>
        <div className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-3.5">
          <h2 className="text-[15px] font-bold text-ink-strong">Commissions</h2>
          <Link href={"/ambassadors/commissions" as Route} className="inline-flex items-center gap-1.5 text-[13px] font-bold text-ink-muted hover:text-[color:var(--color-altus-red)] transition-colors">
            Commission Center
            <ArrowUpRight size={15} strokeWidth={2.6} />
          </Link>
        </div>
        {withCommission.length === 0 ? (
          <p className="px-5 py-8 text-center text-[13.5px] font-medium text-ink-muted">No commissions generated yet.</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-left text-[11px] font-bold uppercase tracking-[0.08em] text-ink-soft">
                <th className="px-5 py-2.5 font-bold">Prospect</th>
                <th className="px-3 py-2.5 font-bold">Basis</th>
                <th className="px-3 py-2.5 font-bold">Status</th>
                <th className="px-5 py-2.5 text-right font-bold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {withCommission.map((r) => {
                const cs = COMMISSION_STATUS[r.commissionStatus] ?? COMMISSION_STATUS.pending!;
                return (
                  <tr key={r.id} className="border-t border-hairline transition-colors hover:bg-surface-soft">
                    <td className="px-5 py-3 text-[14px] font-semibold text-ink-strong">{r.prospectName}</td>
                    <td className="px-3 py-3 text-[13px] font-medium text-ink-muted">{r.commissionBasis ?? "—"}</td>
                    <td className="px-3 py-3">
                      <span className="rounded-full px-2 py-0.5 text-[11px] font-bold" style={{ background: cs.bg, color: cs.ink }}>{cs.label}</span>
                    </td>
                    <td className="px-5 py-3 text-right text-[14px] font-bold tabular-nums text-ink-strong">{inr(r.commissionAmount ?? 0)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* payout ledger */}
      <section className="rounded-2xl border border-hairline bg-white overflow-hidden" style={{ boxShadow: "0 10px 30px -24px rgba(0,0,0,0.4)" }}>
        <div className="border-b border-hairline px-5 py-3.5">
          <h2 className="text-[15px] font-bold text-ink-strong">Payout History</h2>
        </div>
        {payouts.length === 0 ? (
          <p className="px-5 py-8 text-center text-[13.5px] font-medium text-ink-muted">No payouts recorded yet.</p>
        ) : (
          <table className="w-full border-collapse">
            <thead>
              <tr className="text-left text-[11px] font-bold uppercase tracking-[0.08em] text-ink-soft">
                <th className="px-5 py-2.5 font-bold">Paid on</th>
                <th className="px-3 py-2.5 font-bold">Method</th>
                <th className="px-3 py-2.5 font-bold">Reference</th>
                <th className="px-5 py-2.5 text-right font-bold">Amount</th>
              </tr>
            </thead>
            <tbody>
              {payouts.map((p) => (
                <tr key={p.id} className="border-t border-hairline transition-colors hover:bg-surface-soft">
                  <td className="px-5 py-3 text-[13.5px] font-semibold text-ink-strong tabular-nums">{fmtDate(p.paidOn)}</td>
                  <td className="px-3 py-3 text-[13px] font-medium text-ink-muted">{p.method ?? "—"}</td>
                  <td className="px-3 py-3 text-[13px] font-medium text-ink-muted">{p.reference ?? "—"}</td>
                  <td className="px-5 py-3 text-right text-[14px] font-bold tabular-nums text-ink-strong">{inr(p.amount)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-hairline-strong">
                <td className="px-5 py-3 text-[12.5px] font-bold uppercase tracking-wide text-ink-soft" colSpan={3}>Total disbursed</td>
                <td className="px-5 py-3 text-right text-[15px] font-extrabold tabular-nums text-ink-strong">{inr(paidLedger)}</td>
              </tr>
            </tfoot>
          </table>
        )}
      </section>
    </div>
  );
}
