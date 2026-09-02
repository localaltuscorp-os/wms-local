"use client";

import { TrendingUp, Trophy, ArrowUpRight, Wallet, Package, ChevronRight } from "lucide-react";
import type { AmbassadorDetail } from "@/lib/queries/ambassadors";
import { inr, inrCompact, pct } from "@/lib/ambassadors/format";
import { isWonStage } from "@/lib/ambassadors/stages";

/**
 * Overview tab — headline stat tiles, products-to-pitch chips, and a recent
 * activity preview that deep-links to the Timeline tab. Client so the preview
 * can switch tabs via the parent-provided callback.
 */
export function TabOverview({
  detail,
  onOpenTimeline,
}: {
  detail: AmbassadorDetail;
  onOpenTimeline?: () => void;
}) {
  const { referrals, products, activities, payouts } = detail;

  const total = referrals.length;
  const converted = referrals.filter((r) => isWonStage(r.stage)).length;
  const conversion = total > 0 ? converted / total : 0;
  const revenue = referrals.filter((r) => isWonStage(r.stage)).reduce((a, r) => a + (r.dealAmount ?? 0), 0);
  const commissionOwed = referrals
    .filter((r) => r.commissionStatus !== "paid" && (r.commissionAmount ?? 0) > 0)
    .reduce((a, r) => a + (r.commissionAmount ?? 0), 0);
  const commissionPaid = payouts.reduce((a, p) => a + p.amount, 0);

  const tiles = [
    { label: "Total Referrals", value: String(total), sub: `${converted} converted`, icon: TrendingUp, tint: "rgba(225,6,0,0.10)" },
    { label: "Conversion", value: pct(conversion), icon: Trophy, tint: "rgba(20,140,80,0.12)" },
    { label: "Revenue Driven", value: inrCompact(revenue), icon: ArrowUpRight, tint: "rgba(20,140,80,0.10)" },
    { label: "Commission", value: inrCompact(commissionOwed), sub: `${inrCompact(commissionPaid)} paid`, icon: Wallet, tint: "rgba(214,138,20,0.14)" },
  ];

  const recent = activities.slice(0, 5);

  return (
    <div className="space-y-5">
      {/* stat tiles */}
      <div className="grid grid-cols-4 gap-3.5 max-lg:grid-cols-2">
        {tiles.map((t) => (
          <div key={t.label} className="rounded-2xl border border-hairline bg-white p-4" style={{ boxShadow: "0 1px 0 rgba(0,0,0,0.02), 0 10px 30px -22px rgba(0,0,0,0.35)" }}>
            <div className="mb-2 inline-grid h-9 w-9 place-items-center rounded-xl" style={{ background: t.tint }}>
              <t.icon size={17} strokeWidth={2.5} className="text-ink-strong" />
            </div>
            <div className="text-ink-strong tabular-nums" style={{ fontFamily: "var(--font-display), system-ui", fontWeight: 800, fontSize: "clamp(22px,2.2vw,30px)", letterSpacing: "-0.02em" }}>
              {t.value}
            </div>
            <div className="mt-0.5 text-[12.5px] font-semibold text-ink-muted">{t.label}</div>
            {t.sub && <div className="text-[11.5px] font-medium text-ink-soft">{t.sub}</div>}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-[1fr_1.2fr] gap-5 max-lg:grid-cols-1">
        {/* products to pitch */}
        <section className="rounded-2xl border border-hairline bg-white p-5" style={{ boxShadow: "0 10px 30px -24px rgba(0,0,0,0.4)" }}>
          <h2 className="mb-3 flex items-center gap-2 text-[15px] font-bold text-ink-strong">
            <Package size={16} strokeWidth={2.6} style={{ color: "var(--color-altus-red)" }} />
            Products to Pitch
          </h2>
          {products.length === 0 ? (
            <p className="text-[13px] font-medium text-ink-muted">No products assigned yet.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {products.map((p) => (
                <span
                  key={p.id}
                  className="inline-flex items-center rounded-full border px-3 py-1.5 text-[13px] font-bold text-ink-strong"
                  style={{ borderColor: "color-mix(in srgb, var(--color-altus-red) 22%, transparent)", background: "color-mix(in srgb, var(--color-altus-red) 6%, transparent)" }}
                >
                  {p.name}
                </span>
              ))}
            </div>
          )}
        </section>

        {/* recent activity preview */}
        <section className="rounded-2xl border border-hairline bg-white p-5" style={{ boxShadow: "0 10px 30px -24px rgba(0,0,0,0.4)" }}>
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-[15px] font-bold text-ink-strong">Recent Activity</h2>
            {onOpenTimeline && (
              <button
                type="button"
                onClick={onOpenTimeline}
                className="inline-flex items-center gap-1 text-[13px] font-bold text-ink-muted hover:text-[color:var(--color-altus-red)] transition-colors"
              >
                Timeline
                <ChevronRight size={15} strokeWidth={2.6} />
              </button>
            )}
          </div>
          {recent.length === 0 ? (
            <p className="text-[13px] font-medium text-ink-muted">No activity logged yet.</p>
          ) : (
            <ul className="space-y-2.5">
              {recent.map((a) => (
                <li key={a.id} className="flex items-baseline gap-2.5">
                  <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: "var(--color-altus-red)" }} />
                  <div className="min-w-0 flex-1">
                    <span className="block truncate text-[13.5px] font-semibold text-ink-strong">{a.title || a.type}</span>
                    {a.body && <span className="block truncate text-[12px] font-medium text-ink-muted">{a.body}</span>}
                  </div>
                  {a.createdByName && <span className="shrink-0 text-[11.5px] font-medium text-ink-soft">{a.createdByName}</span>}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
