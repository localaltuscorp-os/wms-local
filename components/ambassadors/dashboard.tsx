import Link from "next/link";
import type { Route } from "next";
import { Users, Trophy, TrendingUp, Wallet, ArrowUpRight } from "lucide-react";
import type { DashboardMetrics } from "@/lib/queries/ambassadors";
import { STAGE_LABELS, type Stage } from "@/lib/ambassadors/stages";
import { inrCompact, pct } from "@/lib/ambassadors/format";
import { TierPill } from "./tier-pill";
import { Avatar } from "@/components/ui/avatar";
import { CardGrid } from "@/components/layout/card-grid";

/**
 * Executive Dashboard — KPI tiles, pipeline funnel, and the partner
 * leaderboard. Server component (no client JS); all numbers come from
 * `dashboardMetrics`. Brand tokens only; depth via layered soft shadow.
 */
export function AmbassadorDashboard({ metrics }: { metrics: DashboardMetrics }) {
  const m = metrics;
  const kpis = [
    { label: "Active Partners", value: String(m.activeAmbassadors), icon: Users, tint: "rgba(225,6,0,0.10)" },
    { label: "Referrals", value: String(m.totalReferrals), sub: `${m.convertedReferrals} converted`, icon: TrendingUp, tint: "rgba(225,6,0,0.08)" },
    { label: "Conversion", value: pct(m.conversionRate), icon: Trophy, tint: "rgba(20,140,80,0.10)" },
    { label: "Revenue Driven", value: inrCompact(m.revenue), icon: ArrowUpRight, tint: "rgba(20,140,80,0.10)" },
    { label: "Commission Owed", value: inrCompact(m.commissionPending), sub: `${inrCompact(m.commissionPaid)} paid`, icon: Wallet, tint: "rgba(214,138,20,0.12)" },
  ];

  const maxFunnel = Math.max(1, ...m.funnel.filter((f) => f.stage !== "lost").map((f) => f.count));

  return (
    <div className="space-y-6">
      {/* KPI tiles */}
      <CardGrid min={200} gap="0.875rem">
        {kpis.map((k) => (
          <div
            key={k.label}
            className="rounded-2xl border border-hairline bg-white p-4"
            style={{ boxShadow: "0 1px 0 rgba(0,0,0,0.02), 0 10px 30px -22px rgba(0,0,0,0.35)" }}
          >
            <div className="mb-2 inline-grid h-9 w-9 place-items-center rounded-xl" style={{ background: k.tint }}>
              <k.icon size={17} strokeWidth={2.5} className="text-ink-strong" />
            </div>
            <div
              className="text-ink-strong tabular-nums"
              style={{ fontFamily: "var(--font-display), system-ui", fontWeight: 800, fontSize: "clamp(22px,2.2vw,30px)", letterSpacing: "-0.02em" }}
            >
              {k.value}
            </div>
            <div className="mt-0.5 text-[12.5px] font-semibold text-ink-muted">{k.label}</div>
            {k.sub && <div className="text-[11.5px] font-medium text-ink-soft">{k.sub}</div>}
          </div>
        ))}
      </CardGrid>

      <div className="grid grid-cols-[1.1fr_1fr] gap-5 max-lg:grid-cols-1">
        {/* Pipeline funnel */}
        <section className="rounded-2xl border border-hairline bg-white p-5" style={{ boxShadow: "0 10px 30px -24px rgba(0,0,0,0.4)" }}>
          <h2 className="mb-3 text-[15px] font-bold text-ink-strong">Referral Pipeline</h2>
          <div className="space-y-1.5">
            {m.funnel
              .filter((f) => f.stage !== "lost")
              .map((f) => (
                <FunnelRow key={f.stage} stage={f.stage} count={f.count} max={maxFunnel} />
              ))}
          </div>
          {(() => {
            const lost = m.funnel.find((f) => f.stage === "lost")?.count ?? 0;
            return lost > 0 ? (
              <div className="mt-3 border-t border-hairline pt-2.5 text-[12.5px] font-semibold text-ink-muted">
                {lost} lost
              </div>
            ) : null;
          })()}
        </section>

        {/* Leaderboard */}
        <section className="rounded-2xl border border-hairline bg-white p-5" style={{ boxShadow: "0 10px 30px -24px rgba(0,0,0,0.4)" }}>
          <h2 className="mb-3 text-[15px] font-bold text-ink-strong">Top Partners</h2>
          {m.leaderboard.length === 0 ? (
            <p className="text-[13.5px] text-ink-muted">No ambassadors yet.</p>
          ) : (
            <ol className="space-y-1">
              {m.leaderboard.map((a, i) => (
                <li key={a.id}>
                  <Link
                    href={`/ambassadors/${a.id}` as Route}
                    className="flex items-center gap-3 rounded-xl px-2 py-2 transition-colors hover:bg-surface-soft"
                  >
                    <span className="w-5 text-center text-[13px] font-bold tabular-nums text-ink-soft">{i + 1}</span>
                    <Avatar name={a.name} size={30} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[14px] font-semibold text-ink-strong">{a.name}</span>
                      <span className="block text-[11.5px] font-medium text-ink-muted">{a.converted} won</span>
                    </span>
                    <TierPill tier={a.tier} size="sm" />
                    <span className="w-16 text-right text-[13.5px] font-bold tabular-nums text-ink-strong">{inrCompact(a.revenue)}</span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </section>
      </div>
    </div>
  );
}

function FunnelRow({ stage, count, max }: { stage: Stage; count: number; max: number }) {
  const w = Math.max(2, (count / max) * 100);
  return (
    <div className="flex items-center gap-3">
      <span className="w-36 shrink-0 text-[12.5px] font-semibold text-ink-muted">{STAGE_LABELS[stage]}</span>
      <div className="h-6 flex-1 overflow-hidden rounded-lg bg-surface-soft">
        <div
          className="flex h-full items-center justify-end pr-2"
          style={{
            width: `${w}%`,
            background: "linear-gradient(90deg, color-mix(in srgb, var(--color-altus-red) 55%, transparent), var(--color-altus-red))",
          }}
        >
          {count > 0 && <span className="text-[11.5px] font-bold text-white tabular-nums">{count}</span>}
        </div>
      </div>
    </div>
  );
}
