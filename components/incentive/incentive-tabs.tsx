"use client";

import { useEffect, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import type {
  IncentiveDashboard as DashboardData,
  IncentiveEntryAdminRow,
} from "@/lib/queries/incentives";
import type { IncentiveRequestRow } from "@/lib/queries/incentive";
import type { EmployeeOption } from "@/lib/queries/employees";
import type { IncentiveAnalytics } from "@/lib/incentive/analytics/model";
import type { IncentiveLeaderRow } from "@/lib/queries/incentive-analytics";
import { IncentiveDashboard } from "./incentive-dashboard";
import { IncentiveAnalyticsDashboard } from "./analytics/incentive-analytics-dashboard";
import { IncentiveList } from "./incentive-list";
import { IncentiveTargetDashboard } from "./targets/incentive-target-dashboard";
import { IncentiveEntries } from "./incentive-entries";
import { MyIncentives } from "./my-incentives";
import type { MyIncentiveRow } from "@/lib/queries/my-incentives";
import type {
  TargetBoard,
  TargetProductOption,
  TeamOption,
} from "@/lib/queries/incentive-target-plans";

type TabKey = "dashboard" | "my" | "requests" | "targets" | "entries" | "status" | "billing";

export function IncentiveTabs({
  dashboard,
  leaders,
  analytics,
  analyticsMonths,
  analyticsQuarters,
  analyticsYears,
  viewEmployeeId,
  targetProducts,
  targetTeams,
  targetInitial,
  canSeeTargetTeam,
  billingSlot,
  year,
  requests,
  myIncentives,
  entries,
  employees,
  products,
  productCodes = {},
  shiftTypes = [],
  monthlyCtc,
  defaultShift,
  me,
  isAdmin,
  canReview,
  showStatus,
  statusTab,
  focusRequestId = null,
}: {
  /** The company-wide year roll-up — null unless the viewer may see everyone. */
  dashboard: DashboardData | null;
  /** The Trends leaderboard, already ranked on % of CTC by the analytics model. */
  leaders?: IncentiveLeaderRow[];
  /** The Incentive Dashboard for the current month, already scoped to the viewer. */
  analytics: IncentiveAnalytics;
  /** Months the dashboard's "Specific Month" picker offers. */
  analyticsMonths: string[];
  /** Quarters the dashboard's "Specific Quarter" picker offers. */
  analyticsQuarters: string[];
  /** Years the dashboard's "Specific Year" picker offers. */
  analyticsYears: string[];
  /**
   * The employee the page is VIEWING, "" when that is the viewer themselves.
   *
   * Resolved and validated on the server, and passed down rather than read from
   * the URL here, so the client-side period fetches carry an id the server has
   * already accepted. See the note on `viewedId` in app/(app)/incentive/page.tsx.
   */
  viewEmployeeId: string;
  /** Granular target planning products (incentive catalog + live rate). */
  targetProducts: TargetProductOption[];
  /** Teams for the target picker — managers with at least one report. */
  targetTeams: TeamOption[];
  /** The board the Targets tab renders on first paint. */
  targetInitial: TargetBoard;
  /** Whether the viewer has a team to switch to on the Targets tab. */
  canSeeTargetTeam: boolean;
  /** The Billing tab reads a LIVE Google Sheet — it's streamed in via a
   *  Suspense-wrapped server component so it never blocks the page's paint. */
  billingSlot: ReactNode;
  year: number;
  requests: IncentiveRequestRow[];
  /** The viewer's OWN incentives — what they can earn and what it pays. */
  myIncentives: MyIncentiveRow[];
  entries: IncentiveEntryAdminRow[];
  /** Active employees — the admin Entries tab and the request dialog's split picker. */
  employees: EmployeeOption[];
  /** Active product names (Admin → Products) — the Product Sold picker. */
  products: string[];
  /** NAME → short code (Admin → Products) for the Product Code column. */
  productCodes?: Record<string, string>;
  /** Active shift names (Admin → Shift Types) — the Sales Pitch Shift field. */
  shiftTypes?: string[];
  /** The viewer's own CTC ÷ 12, formatted — the form's read-only figure. */
  monthlyCtc?: string;
  /** The viewer's own shift, offered as the form's Shift default. */
  defaultShift?: string | null;
  /** The signed-in requester. */
  me: { id: string; name: string };
  isAdmin: boolean;
  /** The signed-in user is the incentive reviewer (Manan). Render hint only. */
  canReview: boolean;
  showStatus?: boolean;
  statusTab?: ReactNode;
  /** A request opened from a notification: start on Requests with it open. */
  focusRequestId?: string | null;
}) {
  /**
   * WHICH AREAS THIS VIEWER HAS. Entries is admin-only and Status is
   * admin-plus-flag, exactly as before — the list is what a `?tab=` is checked
   * against, so a link to an area someone cannot see lands on the Dashboard
   * instead of on a blank panel.
   *
   * The ORDER is the rail's order (main-nav.tsx `incentive`), and a test pins
   * the two together.
   */
  const available: TabKey[] = [
    "dashboard",
    "my",
    "requests",
    "targets",
    ...(isAdmin ? (["entries"] as const) : []),
    ...(showStatus ? (["status"] as const) : []),
    "billing",
  ];

  /**
   * THE OPEN AREA COMES FROM THE URL, and only from the URL.
   *
   * There used to be a segmented tab strip here — Dashboard | Targets | Billing
   * | Requests | Entries | Status — and it was removed (2026-09-16) because the
   * module's own sidebar rail now lists those same six areas. Two identical
   * navigations stacked on one page is one too many, and the rail is the one
   * that matches how every other module in this app is navigated.
   *
   * So switching areas is a link in the rail, which means `?tab=` alone decides
   * what renders and there is no local tab state left to keep in step with it.
   */
  const searchParams = useSearchParams();
  const requested = searchParams.get("tab");
  const active: TabKey = available.includes(requested as TabKey)
    ? (requested as TabKey)
    : focusRequestId
      ? "requests"
      : "dashboard";

  /**
   * ARRIVING ON AN AREA THE URL DID NOT NAME — write it back, once.
   *
   * Two ways in. A notification link is `/incentive?request=<id>`, which opens
   * Requests without saying so; and a link to an area this viewer cannot see
   * (`?tab=entries` forwarded to a non-admin) falls back to Dashboard above. In
   * both cases the URL now disagrees with the screen, and the sidebar rail
   * reads the URL — so it would light the wrong area.
   *
   * Writing the resolved area back fixes that, and the notification hrefs stay
   * exactly as they are: `incentiveRequestHref` still produces the link it
   * always has, so every notice, email and bookmark already out there keeps
   * working untouched. `replaceState` costs no server work and leaves no extra
   * history entry.
   *
   * Deliberately NOT run for a plain `/incentive`: landing on the module should
   * not stamp `?tab=dashboard` onto a clean URL. The rail lights its default
   * entry when no tab is named, which is the same answer without the litter.
   */
  useEffect(() => {
    if (requested === active) return;
    if (requested === null && active === "dashboard") return;
    const sp = new URLSearchParams(window.location.search);
    sp.set("tab", active);
    window.history.replaceState(null, "", `${window.location.pathname}?${sp}`);
    // Once, on arrival. The rail navigates for every later change, which
    // remounts this with the new URL already in place.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div>
      {active === "dashboard" ? (
        <IncentiveAnalyticsDashboard
          initial={analytics}
          months={analyticsMonths}
          quarters={analyticsQuarters}
          years={analyticsYears}
          viewEmployeeId={viewEmployeeId}
          /* The company year roll-up (monthly charts, leaderboard and
             incentive-name totals) is kept, and only for viewers who may see
             everyone. It moved from a <details> ABOVE nothing to the bottom of
             the dashboard, under the table that answers the daily question. */
          trends={
            dashboard ? (
              <IncentiveDashboard data={dashboard} leaders={leaders ?? []} year={year} />
            ) : null
          }
        />
      ) : active === "my" ? (
        <MyIncentives rows={myIncentives} />
      ) : active === "targets" ? (
        <IncentiveTargetDashboard
          initial={targetInitial}
          products={targetProducts}
          teams={targetTeams}
          users={employees}
          isAdmin={isAdmin}
          canSeeTeam={canSeeTargetTeam}
        />
      ) : active === "billing" ? (
        billingSlot
      ) : active === "entries" && isAdmin ? (
        <IncentiveEntries rows={entries} employees={employees} products={products} year={year} />
      ) : active === "status" && showStatus ? (
        statusTab
      ) : (
        <IncentiveList
          rows={requests}
          isAdmin={isAdmin}
          canReview={canReview}
          me={me}
          employees={employees}
          products={products}
          productCodes={productCodes}
          shiftTypes={shiftTypes}
          monthlyCtc={monthlyCtc}
          defaultShift={defaultShift}
          focusRequestId={focusRequestId}
        />
      )}
    </div>
  );
}
