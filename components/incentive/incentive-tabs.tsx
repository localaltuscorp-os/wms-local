"use client";

import { useState, type ReactNode } from "react";
import { ChevronDown, LayoutDashboard, ListChecks, IndianRupee, Target, Table2, Layers } from "lucide-react";
import type {
  IncentiveDashboard as DashboardData,
  IncentiveTargetVsActual,
  IncentiveEntryAdminRow,
} from "@/lib/queries/incentives";
import type { IncentiveRequestRow } from "@/lib/queries/incentive";
import type { EmployeeOption } from "@/lib/queries/employees";
import type { IncentiveAnalytics } from "@/lib/incentive/analytics/model";
import { IncentiveDashboard } from "./incentive-dashboard";
import { IncentiveAnalyticsDashboard } from "./analytics/incentive-analytics-dashboard";
import { IncentiveFormDialog } from "./incentive-form-dialog";
import { IncentiveList } from "./incentive-list";
import { IncentiveTargets } from "./incentive-targets";
import { IncentiveEntries } from "./incentive-entries";

type TabKey = "dashboard" | "targets" | "billing" | "requests" | "entries" | "status";

const GREEN = "#E10600";
const GREEN_DEEP = "#A80400";

export function IncentiveTabs({
  dashboard,
  analytics,
  analyticsMonths,
  targetVsActual,
  billingSlot,
  year,
  requests,
  entries,
  employees,
  products,
  me,
  isAdmin,
  canReview,
  pendingCount,
  showStatus,
  statusTab,
  focusRequestId = null,
}: {
  /** The company-wide year roll-up — null unless the viewer may see everyone. */
  dashboard: DashboardData | null;
  /** The Incentive Dashboard for the current month, already scoped to the viewer. */
  analytics: IncentiveAnalytics;
  /** Months the dashboard's "Specific Month" picker offers. */
  analyticsMonths: string[];
  targetVsActual: IncentiveTargetVsActual;
  /** The Billing tab reads a LIVE Google Sheet — it's streamed in via a
   *  Suspense-wrapped server component so it never blocks the page's paint. */
  billingSlot: ReactNode;
  year: number;
  requests: IncentiveRequestRow[];
  entries: IncentiveEntryAdminRow[];
  /** Active employees — the admin Entries tab and the request dialog's split picker. */
  employees: EmployeeOption[];
  /** Active product names (Admin → Products) for the Conversion form. */
  products: string[];
  /** The signed-in requester. */
  me: { id: string; name: string };
  isAdmin: boolean;
  /** The signed-in user is the incentive reviewer (Manan). Render hint only. */
  canReview: boolean;
  /** Requests badge: the review queue for the reviewer, pending otherwise. */
  pendingCount: number;
  showStatus?: boolean;
  statusTab?: ReactNode;
  /** A request opened from a notification: start on Requests with it open. */
  focusRequestId?: string | null;
}) {
  const TABS: { key: TabKey; label: string; icon: typeof LayoutDashboard }[] = [
    { key: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { key: "targets", label: "Targets", icon: Target },
    { key: "billing", label: "Billing", icon: IndianRupee },
    { key: "requests", label: "Requests", icon: ListChecks },
    ...(isAdmin ? [{ key: "entries" as const, label: "Entries", icon: Table2 }] : []),
    ...(showStatus ? [{ key: "status" as const, label: "Status", icon: Layers }] : []),
  ];

  const [active, setActive] = useState<TabKey>(focusRequestId ? "requests" : "dashboard");

  return (
    <div>
      {/* Segmented tab strip — glass rail, green active pill */}
      <div
        role="tablist"
        aria-label="Incentive views"
        className="wg-rise mb-7 inline-flex max-w-full flex-wrap items-center gap-1 rounded-2xl p-1.5"
        style={{
          background: "rgba(255,255,255,0.72)",
          backdropFilter: "blur(10px) saturate(140%)",
          boxShadow:
            "inset 0 0 0 1px var(--color-hairline), inset 0 1px 0 rgba(255,255,255,0.8), 0 10px 26px -22px rgba(15,23,42,0.35)",
          animationDelay: "80ms",
        }}
      >
        {TABS.map((t) => {
          const isActive = t.key === active;
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              type="button"
              role="tab"
              aria-selected={isActive}
              onClick={() => setActive(t.key)}
              className="wg-btn relative inline-flex cursor-pointer items-center gap-2 rounded-xl px-4.5 py-2.5 transition-colors max-md:px-3.5"
              style={{
                fontSize: 14.5,
                fontWeight: isActive ? 800 : 600,
                color: isActive ? "#fff" : "var(--color-ink-soft)",
                background: isActive
                  ? `linear-gradient(135deg, ${GREEN}, ${GREEN_DEEP})`
                  : "transparent",
                border: "none",
                boxShadow: isActive
                  ? `0 8px 20px -10px color-mix(in srgb, ${GREEN_DEEP} 70%, transparent), inset 0 1px 0 rgba(255,255,255,0.25)`
                  : "none",
              }}
            >
              <Icon size={16} strokeWidth={2.3} />
              {t.label}
              {t.key === "requests" && pendingCount > 0 && (
                <span
                  className="inline-flex items-center justify-center rounded-full font-bold tabular-nums"
                  style={{
                    minWidth: 20,
                    height: 20,
                    padding: "0 6px",
                    fontSize: 11,
                    color: "#fff",
                    background: isActive ? "rgba(255,255,255,0.25)" : "var(--color-altus-red)",
                    boxShadow: isActive ? "inset 0 0 0 1px rgba(255,255,255,0.35)" : "none",
                  }}
                >
                  {pendingCount}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {active === "dashboard" ? (
        <div className="space-y-5">
          <IncentiveAnalyticsDashboard initial={analytics} months={analyticsMonths} />
          {/* The previous company year roll-up (charts, leaderboard,
              incentive-name totals) is kept — collapsed, and only for viewers
              who may see everyone, because it is company-wide data. */}
          {dashboard && (
            <details className="group rounded-2xl bg-surface-card" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
              <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-[14px] font-bold text-ink-strong">
                <ChevronDown size={16} className="transition-transform group-open:rotate-180" aria-hidden />
                Year overview · {year}
                <span className="text-[12.5px] font-medium text-ink-subtle">
                  monthly charts, leaderboard and incentive-name totals
                </span>
              </summary>
              <div className="px-4 pb-4">
                <IncentiveDashboard data={dashboard} year={year} />
              </div>
            </details>
          )}
        </div>
      ) : active === "targets" ? (
        <IncentiveTargets data={targetVsActual} year={year} isAdmin={isAdmin} />
      ) : active === "billing" ? (
        billingSlot
      ) : active === "entries" && isAdmin ? (
        <IncentiveEntries rows={entries} employees={employees} year={year} />
      ) : active === "status" && showStatus ? (
        statusTab
      ) : (
        <div className="space-y-6">
          <div className="flex justify-end">
            <IncentiveFormDialog products={products} employees={employees} me={me} />
          </div>
          <IncentiveList
            rows={requests}
            isAdmin={isAdmin}
            canReview={canReview}
            me={me}
            employees={employees}
            products={products}
            focusRequestId={focusRequestId}
          />
        </div>
      )}
    </div>
  );
}
