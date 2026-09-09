import { Suspense, type ReactNode } from "react";
import Link from "next/link";
import type { Route } from "next";
import { TrendingUp, CheckCircle2, Hourglass, Gauge } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { PageCommandBar } from "@/components/layout/page-command-bar";
import { IncentiveTabs } from "@/components/incentive/incentive-tabs";
import { BillingDashboard } from "@/components/incentive/billing-dashboard";
import { requireUser } from "@/lib/auth/current";
import { listIncentiveRequests } from "@/lib/queries/incentive";
import {
  getIncentiveDashboard,
  getIncentiveTargetVsActual,
  listIncentiveEntriesAdmin,
} from "@/lib/queries/incentives";
import { getBillingDashboard } from "@/lib/queries/billing";
import { listIncentiveCatalog } from "@/lib/queries/incentive-catalog";
import { listEmployeeOptions } from "@/lib/queries/employees";
import { getIncentiveStatusReport, listIncentiveEntriesStatus } from "@/lib/queries/incentive-status";
import { incentiveStatusUiEnabled } from "@/lib/incentive/status-flag";
import { IncentiveStatusTab } from "@/components/incentive/incentive-status-tab";
import { withRetry } from "@/lib/db/with-timeout";
import { formatInr } from "@/lib/format";
import { IncentiveCatalogDialog } from "@/components/incentive/incentive-catalog-dialog";
import { PageShell } from "@/components/layout/page-shell";
import { CardGrid } from "@/components/layout/card-grid";

export const dynamic = "force-dynamic";

const GREEN = "#16a34a";
const GREEN_DEEP = "#15803d";
const RED = "#E10600";
const RED_DEEP = "#A80400";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

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

  const [dashboard, targetVsActual, rows, catalog, entries, employees] =
    await Promise.all([
      r("incentive:dashboard", () => getIncentiveDashboard(year)),
      r("incentive:target-vs-actual", () => getIncentiveTargetVsActual(year)),
      r("incentive:requests", () => listIncentiveRequests({ employeeId: me.id, isAdmin: me.isAdmin })),
      r("incentive:catalog", () => listIncentiveCatalog()),
      me.isAdmin ? r("incentive:entries", () => listIncentiveEntriesAdmin(year)) : Promise.resolve([]),
      me.isAdmin ? r("incentive:employees", () => listEmployeeOptions()) : Promise.resolve([]),
    ]);

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

  const pendingCount = rows.filter((r) => r.status === "pending").length;

  // ── Page-level KPIs, folded over the already-loaded data (zero extra queries) ──
  const earned = dashboard.consolidated.approved;
  const paid = dashboard.consolidated.paid;
  const unpaid = dashboard.consolidated.unpaid;
  const attainPct = targetVsActual.totals.attainmentPct;
  const paidRate = earned > 0 ? (paid / earned) * 100 : null;
  const attainAccent =
    attainPct == null
      ? "#334155"
      : attainPct >= 100
        ? GREEN
        : attainPct >= 60
          ? "#d97706"
          : "var(--color-altus-red)";

  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <PageShell width="wide">
        {/* Glass hero → flat command bar. The year pills were a stacked block
            beside the title; they are the page's period control, so they move to
            the ACTION ROW as one compact segmented strip. */}
        <PageCommandBar
          title={`Incentive · ${year}`}
          hint={
            me.isAdmin
              ? "Earned, paid and target attainment across the year."
              : "Your incentive earnings, attainment and requests."
          }
          actions={<IncentiveCatalogDialog rows={catalog} isAdmin={me.isAdmin} />}
          toolbar={
            <nav aria-label="Incentive year" className="flex flex-wrap items-center gap-1">
              {years.map((y) => {
                const active = y === year;
                return (
                  <Link
                    key={y}
                    href={`/incentive?year=${y}` as Route}
                    aria-current={active ? "page" : undefined}
                    className="rounded-md px-2.5 py-1 text-[12.5px] font-bold tabular-nums whitespace-nowrap transition-colors"
                    style={
                      active
                        ? { background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})`, color: "#fff" }
                        : { color: "var(--color-ink-muted)" }
                    }
                  >
                    {y}
                  </Link>
                );
              })}
            </nav>
          }
        />

        {/* ── KPI strip (folded over the loaded dashboard + attainment — zero extra queries) ── */}
        <section aria-label="Incentive totals" className="mb-6">
         <CardGrid min={240} gap="0.875rem">
          <KpiCard
            icon={<TrendingUp size={17} strokeWidth={2.4} />}
            accent={RED}
            label="Total earned"
            value={formatInr(earned)}
            caption={`permanent + project · ${year}`}
            delay={0}
          />
          <KpiCard
            icon={<CheckCircle2 size={17} strokeWidth={2.4} />}
            accent={GREEN_DEEP}
            label="Paid"
            value={formatInr(paid)}
            caption={paidRate != null ? `${paidRate.toFixed(0)}% of earned settled` : "nothing earned yet"}
            progress={paidRate != null ? Math.min(paidRate / 100, 1) : null}
            delay={50}
          />
          <KpiCard
            icon={<Hourglass size={17} strokeWidth={2.4} />}
            accent={unpaid > 0 ? "var(--color-altus-red)" : "#334155"}
            label="Unpaid"
            value={formatInr(unpaid)}
            caption={unpaid > 0 ? "awaiting payout" : "all settled"}
            delay={100}
          />
          <KpiCard
            icon={<Gauge size={17} strokeWidth={2.4} />}
            accent={attainAccent}
            label="Avg attainment"
            value={attainPct == null ? "—" : `${attainPct.toFixed(0)}%`}
            caption={
              attainPct == null
                ? "no targets set"
                : `${formatInr(targetVsActual.totals.actual)} of ${formatInr(targetVsActual.totals.target)} target`
            }
            progress={attainPct != null ? Math.min(attainPct / 100, 1) : null}
            delay={150}
          />
         </CardGrid>
        </section>

        <IncentiveTabs
          dashboard={dashboard}
          targetVsActual={targetVsActual}
          billingSlot={
            <Suspense fallback={<BillingLoading />}>
              <BillingTab year={year} />
            </Suspense>
          }
          year={year}
          requests={rows}
          entries={entries}
          employees={employees}
          isAdmin={me.isAdmin}
          pendingCount={pendingCount}
          showStatus={showStatus}
          statusTab={statusTab}
        />
      </PageShell>
    </>
  );
}

/**
 * Streamed Billing tab — reads the LIVE Google Sheet (`getBillingDashboard`) OFF
 * the page's critical path, so first paint never waits on Google. Suspense shows
 * the skeleton until the sheet resolves; the read is already self-resilient
 * (returns an EMPTY summary on any Sheets/auth hiccup).
 */
async function BillingTab({ year }: { year: number }) {
  const billing = await getBillingDashboard(year);
  return <BillingDashboard data={billing} />;
}

function BillingLoading() {
  return (
    <div className="rounded-2xl border border-hairline bg-surface-card p-10 text-center text-[14px] font-semibold text-ink-muted">
      Loading billing from the live sheet…
    </div>
  );
}

/* ── KPI card — same construction as the Attendance / Salary stat cards ── */

function KpiCard({
  icon,
  accent,
  label,
  value,
  caption,
  progress,
  delay,
}: {
  icon: React.ReactNode;
  accent: string;
  label: string;
  value: string;
  caption: string;
  /** 0–1 fill for the thin bar; omit/null to hide it. */
  progress?: number | null;
  delay: number;
}) {
  return (
    <div
      className="wg-rise wg-btn rounded-2xl bg-surface-card px-4.5 py-4 max-md:px-4"
      style={{
        boxShadow:
          "inset 0 0 0 1px var(--color-hairline), inset 0 1px 0 rgba(255,255,255,0.7), 0 10px 28px -20px rgba(15,23,42,0.35)",
        animationDelay: `${delay}ms`,
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="inline-grid size-8 shrink-0 place-items-center rounded-[10px]"
          style={{
            background: `color-mix(in srgb, ${accent} 10%, transparent)`,
            color: accent,
          }}
        >
          {icon}
        </span>
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-subtle">
          {label}
        </span>
      </div>
      <div
        className="mt-2 tabular-nums text-ink-strong"
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontWeight: 900,
          fontSize: "clamp(21px, 1.7vw, 27px)",
          letterSpacing: "-0.02em",
          lineHeight: 1,
        }}
      >
        {value}
      </div>
      <div className="mt-1 text-[12px] font-medium text-ink-subtle">{caption}</div>
      {progress != null && (
        <div
          className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full"
          style={{ background: "var(--color-hairline)" }}
          aria-hidden
        >
          <span
            className="block h-full rounded-full"
            style={{
              width: `${Math.max(2, progress * 100)}%`,
              background: `linear-gradient(90deg, color-mix(in srgb, ${accent} 75%, #fff), ${accent})`,
            }}
          />
        </div>
      )}
    </div>
  );
}
