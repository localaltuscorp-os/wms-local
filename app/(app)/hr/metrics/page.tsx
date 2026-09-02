import Link from "next/link";
import type { Route } from "next";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { requireHrStaff } from "@/lib/hr/access";
import { DashboardHeader } from "@/components/layout/header";
import { PageShell } from "@/components/layout/page-shell";
import { hrSupportEnabled } from "@/lib/hr/flag";
import { resolveViewer } from "@/lib/queries/hr-support";
import { getHrMetrics } from "@/lib/hr/metrics";
import { HR_TICKET_STATUS_LABELS } from "@/db/enums";
import { STATUS_TONE } from "@/lib/hr/ticket-ui";

export const dynamic = "force-dynamic";

const RED = "#E10600";

function fmtHours(h: number | null): string {
  if (h === null) return "—";
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 48) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

export default async function HrMetricsPage() {
  const me = await requireHrStaff();
  if (!hrSupportEnabled()) notFound();
  const v = await resolveViewer(me);
  if (!v.handler && !v.superAdmin) notFound();

  const m = await getHrMetrics(90);
  const maxCat = Math.max(1, ...m.byCategory.map((c) => c.count));

  const stats: Array<{ label: string; value: string; sub?: string; danger?: boolean }> = [
    { label: "Open tickets", value: String(m.open), sub: `${m.total} raised in ${m.windowDays}d` },
    { label: "Breaching SLA", value: String(m.breaching), danger: m.breaching > 0 },
    { label: "Avg first response", value: fmtHours(m.avgFirstResponseHours) },
    { label: "Avg resolution", value: fmtHours(m.avgResolutionHours) },
    { label: "Resolved / closed", value: String(m.resolvedOrClosed) },
    { label: "CSAT", value: m.csatAvg !== null ? `${m.csatAvg}/5` : "—", sub: m.csatCount ? `${m.csatCount} rated` : "no ratings yet" },
  ];

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <PageShell width="narrow" style={{ maxWidth: "960px" }}>
        <Link
          href={"/hr" as Route}
          className="mb-4 inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-muted transition hover:text-ink-strong"
        >
          <ArrowLeft size={15} /> Back to HR
        </Link>
        <header className="mb-6">
          <h1
            className="text-ink-strong"
            style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(24px,3vw,34px)", letterSpacing: "-0.02em" }}
          >
            HR Support Metrics
          </h1>
          <p className="mt-1.5 text-[13.5px] font-medium text-ink-muted">
            Last {m.windowDays} days. Confidential grievances are counted only in
            aggregate ({m.confidentialOpen} open) and never drilled into.
          </p>
        </header>

        <section className="grid gap-3 max-md:gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))" }}>
          {stats.map((s) => (
            <div key={s.label} className="rounded-2xl border border-hairline bg-surface-card p-4">
              <div className="text-[12px] font-bold uppercase tracking-[0.08em] text-ink-soft">{s.label}</div>
              <div
                className="mt-1 text-ink-strong"
                style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 30, letterSpacing: "-0.02em", color: s.danger ? RED : undefined }}
              >
                {s.value}
              </div>
              {s.sub && <div className="mt-0.5 text-[12px] font-medium text-ink-muted">{s.sub}</div>}
            </div>
          ))}
        </section>

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          {/* By status */}
          <section className="rounded-2xl border border-hairline bg-surface-card p-5">
            <h2 className="mb-3 text-[15px] font-bold text-ink-strong">By Status</h2>
            {m.byStatus.length === 0 ? (
              <p className="text-[13px] text-ink-soft">No tickets in this window.</p>
            ) : (
              <ul className="space-y-2">
                {m.byStatus
                  .sort((a, b) => b.count - a.count)
                  .map((s) => {
                    const tone = STATUS_TONE[s.status];
                    return (
                      <li key={s.status} className="flex items-center justify-between gap-3">
                        <span className="inline-flex items-center gap-2 text-[13.5px] font-semibold text-ink-strong">
                          <span className="h-2 w-2 rounded-full" style={{ background: tone.dot }} />
                          {HR_TICKET_STATUS_LABELS[s.status]}
                        </span>
                        <span className="text-[13.5px] font-bold text-ink-muted">{s.count}</span>
                      </li>
                    );
                  })}
              </ul>
            )}
          </section>

          {/* By category */}
          <section className="rounded-2xl border border-hairline bg-surface-card p-5">
            <h2 className="mb-3 text-[15px] font-bold text-ink-strong">By Category</h2>
            <ul className="space-y-2.5">
              {m.byCategory.map((c) => (
                <li key={c.category}>
                  <div className="flex items-center justify-between text-[13px] font-semibold text-ink-strong">
                    <span>{c.label}</span>
                    <span className="text-ink-muted">{c.count}</span>
                  </div>
                  <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-surface-soft">
                    <div className="h-full rounded-full" style={{ width: `${(c.count / maxCat) * 100}%`, background: `linear-gradient(90deg, ${RED}, #A80400)` }} />
                  </div>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </PageShell>
    </>
  );
}
