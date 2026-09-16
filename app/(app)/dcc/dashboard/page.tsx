import Link from "next/link";
import type { Route } from "next";
import { requireUser } from "@/lib/auth/current";
import { PageShell } from "@/components/layout/page-shell";
import { loadDccScope } from "@/lib/dcc/access";
import { computeDccDashboard, historyStartFor, addDaysYmd } from "@/lib/dcc/dashboard";
import { loadDccDashboardInput, loadDccRoster } from "@/lib/queries/dcc-dashboard";
import { loadSp1Day, loadSp1Logs } from "@/lib/queries/dcc-sp1";
import { emptyCounts, metricsOf, SP1_DISPOSITIONS, type Sp1Counts } from "@/lib/dcc/sp1";
import { localDateString } from "@/lib/format";
import { Sp1DayCard } from "@/components/dcc/dashboard/sp1-day-card";
import {
  DccCallMix,
  DccHeatmap,
  DccKpiStrip,
  DccMostMissed,
  DccPerformers,
  DccSections,
  DccTrend,
} from "@/components/dcc/dashboard/dcc-sections";

export const dynamic = "force-dynamic";

const WINDOWS = [7, 14, 30] as const;

/**
 * EMPLOYEES → DCC → DASHBOARD (DCC-SPEC §9).
 *
 * Image 2 is the shape of ONE COLUMN — the SP1 day card at the top. The WMS
 * Dashboard is the shape of THE PAGE — a KPI strip, a heatmap, leaderboards, a
 * trend and the breakdowns under it. Both apply, which is why the two live on
 * one screen instead of two.
 *
 * ── WHY IT IS ENTIRELY A SERVER COMPONENT ──────────────────────────────────
 * Every filter is a link and every figure is computed before render, so none of
 * this needs to reach the browser. The old dashboard shipped its filter state to
 * the client and then had to re-fetch on every change; a link re-renders the
 * page on the server and is both faster and shareable.
 */
export default async function DccDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; person?: string }>;
}) {
  const me = await requireUser();
  const [scope, sp] = await Promise.all([loadDccScope(me), searchParams]);

  const days = WINDOWS.includes(Number(sp.days) as (typeof WINDOWS)[number])
    ? Number(sp.days)
    : 7;
  const today = localDateString("Asia/Kolkata");
  const from = addDaysYmd(today, -(days - 1));

  const roster = await loadDccRoster([...scope.visibleIds]);
  const chosen = sp.person && scope.visibleIds.has(sp.person) ? sp.person : null;
  const ids = chosen ? [chosen] : roster.map((r) => r.id);

  // The compliance side and the call side are independent reads; neither should
  // wait on the other, and neither may take the page down on its own.
  const [input, windowLogs, dayLog] = await Promise.all([
    loadDccDashboardInput(ids, historyStartFor(from, today), today).catch(() => ({
      people: [],
      items: [],
      entries: [],
      reviews: [],
    })),
    loadSp1Logs({ employeeIds: ids, from, to: today }).catch(() => ({ rows: [], missing: true })),
    loadSp1Day(chosen ?? me.id, today).catch(() => ({ counts: emptyCounts(), missing: true })),
  ]);

  const result = computeDccDashboard({ ...input, from, to: today, today });

  // The window's call outcomes, summed across everyone in scope.
  const windowCounts: Sp1Counts = emptyCounts();
  for (const r of windowLogs.rows) windowCounts[r.disposition] += r.count;
  const windowCalls = metricsOf(windowCounts);
  const windowTotal = SP1_DISPOSITIONS.reduce((n, d) => n + windowCounts[d], 0);

  const who = chosen ? (roster.find((r) => r.id === chosen)?.name ?? "one person") : "everyone";
  const qs = (over: { days?: number; person?: string | null }) => {
    const p = new URLSearchParams();
    const d = over.days ?? days;
    if (d !== 7) p.set("days", String(d));
    const person = over.person === undefined ? chosen : over.person;
    if (person) p.set("person", person);
    const s = p.toString();
    return (s ? `/dcc/dashboard?${s}` : "/dcc/dashboard") as Route;
  };

  return (
    <PageShell width="full">
      <header className="mb-4 flex flex-wrap items-end gap-3">
        <div className="mr-auto min-w-0">
          <h1 className="text-[22px] font-black tracking-tight text-ink-strong">DCC Dashboard</h1>
          <p className="text-[13px] text-ink-muted">
            Compliance and call performance — {who}, last {days} days to {today}.
          </p>
        </div>
        <nav aria-label="Window" className="flex items-center gap-1.5">
          {WINDOWS.map((w) => (
            <Link
              key={w}
              href={qs({ days: w })}
              aria-current={days === w ? "true" : undefined}
              className={`inline-flex h-8 items-center rounded-lg px-3 text-[12.5px] font-semibold transition-colors ${
                days === w ? "text-white" : "text-slate-600 hover:bg-slate-100"
              }`}
              style={days === w ? { background: "var(--color-altus-red)" } : undefined}
            >
              {w} days
            </Link>
          ))}
        </nav>
      </header>

      {roster.length > 1 && (
        <nav aria-label="Whose numbers" className="mb-3 flex flex-wrap gap-1.5">
          <Chip href={qs({ person: null })} active={!chosen}>
            Everyone ({roster.length})
          </Chip>
          {roster.map((r) => (
            <Chip key={r.id} href={qs({ person: r.id })} active={chosen === r.id}>
              {r.name}
            </Chip>
          ))}
        </nav>
      )}

      <div className="flex flex-col gap-3">
        <DccKpiStrip result={result} calls={windowCalls} />

        <div className="grid grid-cols-[360px_1fr] gap-3 max-xl:grid-cols-1">
          <Sp1DayCard date={today} counts={dayLog.counts} />
          <div className="flex min-w-0 flex-col gap-3">
            <DccTrend result={result} />
            <DccHeatmap result={result} />
          </div>
        </div>

        <DccPerformers result={result} />

        <div className="grid grid-cols-2 gap-3 max-lg:grid-cols-1">
          <DccMostMissed result={result} />
          <DccSections result={result} />
        </div>

        <DccCallMix counts={windowCounts} total={windowTotal} />
      </div>

      <p className="mt-3 text-[11.5px] text-ink-subtle">
        A rate with no denominator shows an em-dash, never 0% — a person with nothing due has not
        failed. Grey in the heatmap means nothing was due that day.
      </p>
    </PageShell>
  );
}

function Chip({
  href,
  active,
  children,
}: {
  href: Route;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={active ? "true" : undefined}
      className={`rounded-full px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
        active ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
      }`}
    >
      {children}
    </Link>
  );
}
