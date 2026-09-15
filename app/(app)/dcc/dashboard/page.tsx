import { DashboardHeader } from "@/components/layout/header";
import { DashboardLoadError } from "@/components/dashboard/dashboard-load-error";
import { DccDashboardView } from "@/components/dcc/dashboard/dcc-dashboard-view";
import { requireUser } from "@/lib/auth/current";
import { loadDccScope } from "@/lib/dcc/access";
import { computeDccDashboard, historyStartFor } from "@/lib/dcc/dashboard";
import {
  activityWindow,
  toActivityPeriod,
  type ActivityPeriod,
} from "@/lib/dashboard/manager-activity-contract";
import { localDateString } from "@/lib/format";
import { loadDccDashboardInput, loadDccRoster } from "@/lib/queries/dcc-dashboard";

export const dynamic = "force-dynamic";

type SearchParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const YMD = /^\d{4}-\d{2}-\d{2}$/;

/** "This Month" unless the URL says otherwise — a DCC is read against the month. */
const DEFAULT_PERIOD: ActivityPeriod = "month";

/** The longest custom range the page will aggregate. */
const MAX_WINDOW_DAYS = 366;

/**
 * EMPLOYEES → DCC Dashboard.
 *
 * Built the way the WMS Dashboard is: one sticky band (filters, then section
 * pills), the summary tiles, then a single column of sections that each fold,
 * search, page and share. Every section reads one aggregate computed here by
 * lib/dcc/dashboard.ts, with the fill board's own rules.
 *
 * ── WHO SEES WHAT ────────────────────────────────────────────────────────
 * Everyone may open it; the DCC scope decides whose KPIs are on it. An
 * employee sees their own, a manager their whole reporting line, a super-admin
 * the company. It used to turn employees away with a "for managers" card,
 * which left the one person whose compliance it measures unable to read it.
 *
 * ── TODAY IS IST ─────────────────────────────────────────────────────────
 * Vercel runs UTC. The fill board still takes "today" from the server clock,
 * which is yesterday until 05:30 IST; this page reads the Indian calendar day,
 * as the reminder cron and the mobile app already do.
 */
export default async function DccDashboardPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const me = await requireUser();
  const sp = await searchParams;
  const scope = await loadDccScope(me);
  const today = localDateString("Asia/Kolkata");

  const rawPeriod = first(sp.period);
  const period: ActivityPeriod = rawPeriod ? toActivityPeriod(rawPeriod) : DEFAULT_PERIOD;
  const start = first(sp.start);
  const end = first(sp.end);
  const custom =
    period === "custom" && start && end && YMD.test(start) && YMD.test(end) && start <= end
      ? { from: start, to: end }
      : null;

  const win = activityWindow(period === "custom" && !custom ? DEFAULT_PERIOD : period, today, custom);
  const to = win.to > today ? today : win.to;
  let from = win.from > to ? to : win.from;
  const earliest = new Date(`${to}T00:00:00Z`);
  earliest.setUTCDate(earliest.getUTCDate() - (MAX_WINDOW_DAYS - 1));
  const earliestYmd = earliest.toISOString().slice(0, 10);
  if (from < earliestYmd) from = earliestYmd;

  const visibleIds = [...scope.visibleIds];
  const picked = (first(sp.emp) ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter((id) => id && scope.visibleIds.has(id));
  const ownerIds = picked.length > 0 ? picked : visibleIds;

  // Load inside the try, render outside it: a render error must reach the
  // error boundary, not be swallowed here and misreported as a failed load.
  let loaded: {
    result: ReturnType<typeof computeDccDashboard>;
    roster: Awaited<ReturnType<typeof loadDccRoster>>;
  } | null = null;
  try {
    const [input, roster] = await Promise.all([
      loadDccDashboardInput(ownerIds, historyStartFor(from, to), to),
      loadDccRoster(visibleIds),
    ]);
    loaded = { result: computeDccDashboard({ ...input, from, to, today }), roster };
  } catch (err) {
    console.error("[dcc-dashboard] load failed", err);
  }

  return (
    <div className="flex min-h-dvh flex-1 flex-col" style={{ background: "#ffffff" }}>
      <DashboardHeader generatedAt={new Date()} />
      {loaded ? (
        <DccDashboardView
          result={loaded.result}
          roster={loaded.roster}
          period={period === "custom" && !custom ? DEFAULT_PERIOD : period}
          custom={custom}
          selectedIds={picked}
          meId={me.id}
          isManager={scope.isManager}
          isSuper={scope.isSuper}
        />
      ) : (
        <DashboardLoadError />
      )}
    </div>
  );
}
