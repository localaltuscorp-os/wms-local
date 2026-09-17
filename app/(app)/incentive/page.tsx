import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";
import { DashboardHeader } from "@/components/layout/header";
import { PageCommandBar } from "@/components/layout/page-command-bar";
import { IncentiveTabs } from "@/components/incentive/incentive-tabs";
import { BillingDashboard } from "@/components/incentive/billing-dashboard";
import { IncentiveFormDialog } from "@/components/incentive/incentive-form-dialog";
import { IncentiveTableSkeleton } from "@/components/incentive/ui/states";
import { requireUser } from "@/lib/auth/current";
import { canReviewIncentives } from "@/lib/auth/incentive-permissions";
import { listIncentiveRequests } from "@/lib/queries/incentive";
import {
  getIncentiveDashboard,
  getIncentiveTargetVsActual,
  listIncentiveEntriesAdmin,
} from "@/lib/queries/incentives";
import { getBillingDashboard } from "@/lib/queries/billing";
import { listIncentiveCatalog } from "@/lib/queries/incentive-catalog";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { listActiveProductNames } from "@/lib/queries/products";
import { getIncentiveStatusReport, listIncentiveEntriesStatus } from "@/lib/queries/incentive-status";
import { loadIncentiveAnalytics, restrictTargetVsActual } from "@/lib/queries/incentive-analytics";
import { applyAnalyticsView, incentiveAnalyticsScopeFor } from "@/lib/incentive/analytics/scope";
import { visibleNameKeysFor } from "@/lib/incentive/analytics/visible-names";
import { selectableMonths } from "@/lib/incentive/analytics/periods";
import { incentiveStatusUiEnabled } from "@/lib/incentive/status-flag";
import { IncentiveStatusTab } from "@/components/incentive/incentive-status-tab";
import { withRetry } from "@/lib/db/with-timeout";
import { IncentiveCatalogDialog } from "@/components/incentive/incentive-catalog-dialog";
import { PageShell } from "@/components/layout/page-shell";

export const dynamic = "force-dynamic";

/** The areas whose DATA is a calendar year, and so need the year picker. */
const YEAR_SCOPED = new Set(["targets", "entries", "status", "billing"]);

export default async function IncentivePage({ searchParams }: PageProps) {
  const me = await requireUser();
  const sp = await searchParams;

  // Year selector — default to the current calendar year; offer a small
  // trailing window so prior years stay reachable.
  const currentYear = new Date().getFullYear();
  const raw = Array.isArray(sp.year) ? sp.year[0] : sp.year;
  const parsed = raw ? Number(raw) : currentYear;
  const year = Number.isFinite(parsed) ? parsed : currentYear;
  const years = [currentYear, currentYear - 1, currentYear - 2, currentYear - 3].filter(
    (y, i, a) => a.indexOf(y) === i,
  );
  if (!years.includes(year)) years.unshift(year);

  // Each DB read is retried on a FRESH connection (withRetry) — the first query
  // of a request is the one most likely to grab a stale pooled connection (the
  // recurring "That didn't go through" signature), and this page has no cache to
  // fall back on. Previously these ran bare in a Promise.all, so a single
  // transient blip on ANY of them crashed the whole /incentive page to the error
  // boundary. Reads are idempotent, so retry-on-fresh-connection is safe and is
  // the same cure the exec dashboard uses. The Billing tab reads a LIVE Google
  // Sheet — it is NO LONGER in this blocking load (it was the slowest read and
  // gated first paint). It's streamed into the Billing tab via <Suspense> below,
  // so the page paints immediately off DB reads alone.
  const r = <T,>(label: string, make: () => Promise<T>): Promise<T> =>
    withRetry(make, { attempts: 2, timeoutMs: [6000, 9000], label });

  // Manan Vasa — sees every request and the decision controls. Decides what is
  // RENDERED; the decision action re-checks it on the server.
  const canReview = canReviewIncentives(me.email);

  // WHO THIS VIEWER MAY SEE (lib/incentive/analytics/scope.ts). Company-wide
  // viewers get the company roll-ups; everyone else gets only themselves and
  // their downline, and the company-wide queries are not even run for them —
  // what is never loaded can never be serialised into their page.
  const scope = await r("incentive:scope", () => incentiveAnalyticsScopeFor(me));

  const [dashboard, targetVsActualAll, rows, catalog, entries, employees, products] =
    await Promise.all([
      scope.all ? r("incentive:dashboard", () => getIncentiveDashboard(year)) : Promise.resolve(null),
      r("incentive:target-vs-actual", () => getIncentiveTargetVsActual(year)),
      r("incentive:requests", () => listIncentiveRequests({ employeeId: me.id, isAdmin: me.isAdmin, canReview })),
      r("incentive:catalog", () => listIncentiveCatalog()),
      me.isAdmin ? r("incentive:entries", () => listIncentiveEntriesAdmin(year)) : Promise.resolve([]),
      // Everyone, not only admins: the New Incentive Request dialog's Split
      // Incentive picker needs the active roster. The same cached {id,name}
      // list every other picker in the app reads.
      r("incentive:employees", () => listEmployeeOptions()),
      // Admin → Products — the Conversion form's Product dropdown. Cached under
      // the `products` tag, which every product write busts.
      r("incentive:products", () => listActiveProductNames()),
    ]);
  // After the batch above, not inside it: the dashboard runs its own queries
  // (in rounds of at most five), and adding them to the page's burst would
  // exceed the 10-connection pool.
  const analytics = await r("incentive:analytics", () =>
    loadIncentiveAnalytics(me, { kind: "current_month" }, { scope }),
  );
  if (!analytics) throw new Error("Incentive analytics could not be resolved for the current month.");

  // The Targets tab's data, narrowed server-side for a scoped viewer.
  const targetVsActual = scope.all
    ? targetVsActualAll
    : restrictTargetVsActual(targetVsActualAll, analytics.employees.map((e) => e.name));

  // WS-6 — incentive 3-status (Booked/Accrued/Paid) tab: admin-only + flag-gated
  // (INCENTIVE_STATUS_UI, default on). Only fetched when shown, so non-admins pay
  // no query cost.
  const showStatus = me.isAdmin && incentiveStatusUiEnabled();
  let statusTab: ReactNode = null;
  if (showStatus) {
    const istNow = new Date(Date.now() + 5.5 * 3_600_000);
    const refMonth = `${istNow.getUTCFullYear()}-${String(istNow.getUTCMonth() + 1).padStart(2, "0")}`;
    const [statusReport, statusEntries] = await Promise.all([
      r("incentive:status-report", () => getIncentiveStatusReport(refMonth)),
      r("incentive:status-entries", () => listIncentiveEntriesStatus(year)),
    ]);
    statusTab = (
      <IncentiveStatusTab
        report={statusReport}
        entries={statusEntries}
        employees={employees}
        year={year}
        isAdmin={me.isAdmin}
      />
    );
  }

  // Deep links from incentive notifications. `?request=<id>` opens the Requests
  // tab with that request expanded — only when it is already in this viewer's
  // own list, so a link to someone else's request opens nothing. `?view=table`
  // opens the Incentive Table.
  const firstParam = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
  const requestedId = firstParam(sp.request)?.toLowerCase();
  const focusRequestId = requestedId && rows.some((row) => row.id === requestedId) ? requestedId : null;
  const openTable = firstParam(sp.view) === "table";

  /**
   * WHICH AREA IS OPEN — resolved here only to decide the COMMAND BAR's
   * contents. The area itself is still decided in `IncentiveTabs` from the same
   * `?tab=`, and this never overrides it.
   */
  const tab = firstParam(sp.tab) ?? (focusRequestId ? "requests" : "dashboard");

  /**
   * THE YEAR PICKER IS NOT A GLOBAL CONTROL ANY MORE.
   *
   * It only ever moved the areas whose DATA is a calendar year — Targets,
   * Entries, Status and Billing. On the Dashboard it moved nothing at all: that
   * area is driven by its own period control (Current Month / Specific Month /
   * Last 3 / Last 6 / YTD), which is why two time controls sat on one screen
   * with the strip above them obeying one and the cards below obeying the
   * other. `?year=` still works exactly as it did — it is simply only OFFERED
   * where it does something.
   */
  const showYear = YEAR_SCOPED.has(tab);

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <PageShell width="wide">
        <PageCommandBar
          title="Incentive"
          hint={
            me.isAdmin
              ? "Earned, paid and target attainment across the company."
              : "Your incentive earnings, attainment and requests."
          }
          actions={
            <>
              <IncentiveCatalogDialog rows={catalog} isAdmin={me.isAdmin} defaultOpen={openTable} />
              {/* The module's primary action, on every area — it used to sit in
                  a bare right-aligned div above the Requests list, where a long
                  queue pushed it off the fold. */}
              <IncentiveFormDialog products={products} employees={employees} me={me} />
            </>
          }
          toolbar={
            showYear ? (
              <nav aria-label="Incentive year" className="flex flex-wrap items-center gap-1">
                <span className="mr-1 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-subtle">
                  Year
                </span>
                {years.map((y) => {
                  const active = y === year;
                  return (
                    <Link
                      key={y}
                      href={`/incentive?tab=${tab}&year=${y}` as Route}
                      aria-current={active ? "page" : undefined}
                      className="rounded-pill px-2.5 py-1 text-[12.5px] font-bold tabular-nums whitespace-nowrap transition-colors"
                      style={
                        active
                          ? {
                              background:
                                "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
                              color: "#fff",
                            }
                          : { color: "var(--color-ink-muted)" }
                      }
                    >
                      {y}
                    </Link>
                  );
                })}
              </nav>
            ) : undefined
          }
        />

        <IncentiveTabs
          key={focusRequestId ?? "incentive"}
          focusRequestId={focusRequestId}
          dashboard={dashboard}
          analytics={analytics}
          analyticsMonths={selectableMonths()}
          targetVsActual={targetVsActual}
          billingSlot={
            <Suspense fallback={<IncentiveTableSkeleton rows={6} cols={5} />}>
              <BillingTab year={year} me={me} />
            </Suspense>
          }
          year={year}
          requests={rows}
          entries={entries}
          employees={employees}
          products={products}
          me={{ id: me.id, name: me.name }}
          isAdmin={me.isAdmin}
          canReview={canReview}
          showStatus={showStatus}
          statusTab={statusTab}
        />
      </PageShell>
    </>
  );
}

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * Streamed Billing tab — reads the LIVE Google Sheet (`getBillingDashboard`) OFF
 * the page's critical path, so first paint never waits on Google. Suspense shows
 * the skeleton until the sheet resolves; the read is already self-resilient
 * (returns an EMPTY summary on any Sheets/auth hiccup).
 */
async function BillingTab({
  year,
  me,
}: {
  year: number;
  me: { id: string; email: string; isAdmin: boolean };
}) {
  // Scoped HERE, on the server, before the sheet is aggregated — the same
  // resolver the Dashboard and Targets use, so the Billing area cannot drift
  // into a second hierarchy rule. `applyAnalyticsView` is what computes
  // `canSeeTeam`; `visibleNameKeysFor` returns null for a company-wide viewer
  // (no filter) and a real set — possibly empty — for everyone else.
  const base = await incentiveAnalyticsScopeFor(me);
  const scope = applyAnalyticsView(base, "team");
  const names = await visibleNameKeysFor(scope);
  const billing = await getBillingDashboard(year, { visibleNames: names });
  return (
    <BillingDashboard
      data={billing}
      year={year}
      initialView="team"
      canSeeTeam={Boolean(scope.canSeeTeam)}
      scopeLabel={scope.label}
    />
  );
}
