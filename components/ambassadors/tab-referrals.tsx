import Link from "next/link";
import type { Route } from "next";
import { GitBranch, ArrowUpRight } from "lucide-react";
import type { ReferralRow } from "@/lib/queries/ambassadors";
import { STAGE_LABELS, STAGE_TONES, type Stage, type StageTone } from "@/lib/ambassadors/stages";
import { inr } from "@/lib/ambassadors/format";

/**
 * Read-only list of this ambassador's referrals. Creating/advancing happens on
 * the Pipeline page — this is the per-partner view. Brand tokens only.
 */

const TONE_STYLE: Record<StageTone, { bg: string; ink: string }> = {
  neutral: { bg: "rgba(80,80,100,0.10)", ink: "#4a4a57" },
  progress: { bg: "rgba(59,130,246,0.12)", ink: "#1d4ed8" },
  warm: { bg: "rgba(214,138,20,0.14)", ink: "#9a5a00" },
  win: { bg: "rgba(20,140,80,0.14)", ink: "#0f7a47" },
  money: { bg: "rgba(20,140,80,0.16)", ink: "#0b6b3d" },
  lost: { bg: "rgba(225,6,0,0.10)", ink: "var(--color-altus-red-deep)" },
};

function StagePill({ stage }: { stage: Stage }) {
  const s = TONE_STYLE[STAGE_TONES[stage]];
  return (
    <span
      className="inline-flex items-center rounded-full px-2.5 py-1 text-[11.5px] font-bold"
      style={{ background: s.bg, color: s.ink }}
    >
      {STAGE_LABELS[stage]}
    </span>
  );
}

const COMMISSION_STATUS: Record<string, { label: string; bg: string; ink: string }> = {
  pending: { label: "Pending", bg: "rgba(214,138,20,0.14)", ink: "#9a5a00" },
  generated: { label: "Generated", bg: "rgba(59,130,246,0.12)", ink: "#1d4ed8" },
  paid: { label: "Paid", bg: "rgba(20,140,80,0.14)", ink: "#0f7a47" },
};

export function TabReferrals({ referrals }: { referrals: ReferralRow[] }) {
  if (referrals.length === 0) {
    return (
      <div className="rounded-2xl border border-hairline bg-white p-10 text-center" style={{ boxShadow: "0 10px 30px -24px rgba(0,0,0,0.4)" }}>
        <div className="mx-auto mb-3 inline-grid h-12 w-12 place-items-center rounded-2xl" style={{ background: "rgba(225,6,0,0.08)" }}>
          <GitBranch size={20} strokeWidth={2.4} className="text-ink-strong" />
        </div>
        <p className="text-[15px] font-bold text-ink-strong">No Referrals Yet</p>
        <p className="mx-auto mt-1 max-w-sm text-[13px] font-medium text-ink-muted">
          When this partner sends a prospect, it shows here as a deal moving through the pipeline.
        </p>
        <Link
          href={"/ambassadors/pipeline" as Route}
          className="mt-4 inline-flex items-center gap-2 rounded-xl py-2.5 px-4 text-[14px] font-bold text-white transition-transform active:scale-[0.99]"
          style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))", boxShadow: "0 12px 30px -14px rgba(225,6,0,0.6)" }}
        >
          Go to Pipeline
          <ArrowUpRight size={16} strokeWidth={2.6} />
        </Link>
      </div>
    );
  }

  return (
    <section className="rounded-2xl border border-hairline bg-white overflow-hidden" style={{ boxShadow: "0 10px 30px -24px rgba(0,0,0,0.4)" }}>
      <div className="flex items-center justify-between gap-3 border-b border-hairline px-5 py-3.5">
        <h2 className="text-[15px] font-bold text-ink-strong">
          {referrals.length} referral{referrals.length === 1 ? "" : "s"}
        </h2>
        <Link
          href={"/ambassadors/pipeline" as Route}
          className="inline-flex items-center gap-1.5 text-[13px] font-bold text-ink-muted hover:text-[color:var(--color-altus-red)] transition-colors"
        >
          Pipeline
          <ArrowUpRight size={15} strokeWidth={2.6} />
        </Link>
      </div>

      {/* desktop table */}
      <div className="max-md:hidden">
        <table className="w-full border-collapse">
          <thead>
            <tr className="text-left text-[11px] font-bold uppercase tracking-[0.08em] text-ink-soft">
              <th className="px-5 py-2.5 font-bold">Prospect</th>
              <th className="px-3 py-2.5 font-bold">Stage</th>
              <th className="px-3 py-2.5 text-right font-bold">Deal</th>
              <th className="px-5 py-2.5 text-right font-bold">Commission</th>
            </tr>
          </thead>
          <tbody>
            {referrals.map((r) => {
              const cs = COMMISSION_STATUS[r.commissionStatus] ?? COMMISSION_STATUS.pending!;
              return (
                <tr key={r.id} className="border-t border-hairline transition-colors hover:bg-surface-soft">
                  <td className="px-5 py-3">
                    <div className="text-[14px] font-semibold text-ink-strong">{r.prospectName}</div>
                    {r.prospectCompany && <div className="text-[12px] font-medium text-ink-muted">{r.prospectCompany}</div>}
                  </td>
                  <td className="px-3 py-3"><StagePill stage={r.stage} /></td>
                  <td className="px-3 py-3 text-right text-[14px] font-bold tabular-nums text-ink-strong">
                    {r.dealAmount != null ? inr(r.dealAmount) : <span className="text-ink-soft">—</span>}
                  </td>
                  <td className="px-5 py-3 text-right">
                    {r.commissionAmount != null ? (
                      <div className="inline-flex flex-col items-end gap-0.5">
                        <span className="text-[14px] font-bold tabular-nums text-ink-strong">{inr(r.commissionAmount)}</span>
                        <span className="rounded-full px-1.5 py-px text-[10px] font-bold" style={{ background: cs.bg, color: cs.ink }}>{cs.label}</span>
                      </div>
                    ) : (
                      <span className="text-[13px] font-medium text-ink-soft">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* mobile cards */}
      <div className="divide-y divide-[color:var(--color-hairline)] md:hidden">
        {referrals.map((r) => {
          const cs = COMMISSION_STATUS[r.commissionStatus] ?? COMMISSION_STATUS.pending!;
          return (
            <div key={r.id} className="px-4 py-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate text-[14px] font-semibold text-ink-strong">{r.prospectName}</div>
                  {r.prospectCompany && <div className="truncate text-[12px] font-medium text-ink-muted">{r.prospectCompany}</div>}
                </div>
                <StagePill stage={r.stage} />
              </div>
              <div className="mt-2 flex items-center justify-between text-[13px]">
                <span className="font-medium text-ink-muted">
                  Deal <span className="font-bold tabular-nums text-ink-strong">{r.dealAmount != null ? inr(r.dealAmount) : "—"}</span>
                </span>
                {r.commissionAmount != null && (
                  <span className="inline-flex items-center gap-1.5 font-medium text-ink-muted">
                    <span className="font-bold tabular-nums text-ink-strong">{inr(r.commissionAmount)}</span>
                    <span className="rounded-full px-1.5 py-px text-[10px] font-bold" style={{ background: cs.bg, color: cs.ink }}>{cs.label}</span>
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
