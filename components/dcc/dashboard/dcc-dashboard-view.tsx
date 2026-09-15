"use client";

import * as React from "react";
import { Gauge } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { DashboardSectionNav, type SectionNavItem } from "@/components/dashboard/section-nav";
import { SectionIcon } from "@/components/dashboard/section-icon";
import { WidgetBoundary } from "@/components/dashboard/widget-boundary";
import { addDaysYmd, type DccDashboardResult, type PersonStats } from "@/lib/dcc/dashboard";
import { DETAIL_MAX_DAYS } from "@/lib/dcc/dashboard-detail";
import type { ActivityPeriod } from "@/lib/dashboard/manager-activity-contract";
import type { ReportMeta } from "@/lib/reports/section-report";
import { DccDashboardFilters, type RosterPerson } from "./dcc-dashboard-filters";
import { DccKpiStrip } from "./dcc-kpi-strip";
import { TodaySection } from "./today-section";
import { ComplianceByPersonSection } from "./compliance-by-person";
import { ComplianceHeatmapSection } from "./compliance-heatmap";
import { DailyTrendSection } from "./daily-trend";
import { StatusByPersonSection } from "./status-by-person";
import { SectionBreakdownSection } from "./section-breakdown";
import { MostMissedKpisSection } from "./most-missed-kpis";
import { ReviewCoverageSection } from "./review-coverage";
import { PeopleToPullUpSection, TopPerformersSection } from "./performers";
import { DccDetailDrawer, type DrawerTarget } from "./dcc-detail-drawer";
import { windowText } from "./format";

/** The section pills, in page order. Today only exists when the window reaches today. */
const SECTIONS: SectionNavItem[] = [
  { id: "dcc-today", label: "Yet to Fill Today" },
  { id: "dcc-by-person", label: "Compliance by Person" },
  { id: "dcc-heatmap", label: "Heatmap" },
  { id: "dcc-trend", label: "Trend" },
  { id: "dcc-status", label: "Status by Person" },
  { id: "dcc-sections", label: "By Section" },
  { id: "dcc-missed", label: "Most-Missed KPIs" },
  { id: "dcc-reviews", label: "Manager Reviews" },
  { id: "dcc-top", label: "Top Performers" },
  { id: "dcc-pull-up", label: "People To Pull Up" },
];

/** One section's slot: the scroll anchor, the error boundary, the page gutter. */
function Slot({ id, label, children }: { id: string; label: string; children: React.ReactNode }) {
  return (
    <div id={id} className="scroll-mt-32">
      <WidgetBoundary label={label}>
        <PageShell as="div" width="full" py={false}>
          {children}
        </PageShell>
      </WidgetBoundary>
    </div>
  );
}

export function DccDashboardView({
  result,
  roster,
  period,
  custom,
  selectedIds,
  meId,
  isManager,
  isSuper,
}: {
  result: DccDashboardResult;
  roster: RosterPerson[];
  period: ActivityPeriod;
  custom: { from: string; to: string } | null;
  selectedIds: string[];
  meId: string;
  isManager: boolean;
  isSuper: boolean;
}) {
  const [drawer, setDrawer] = React.useState<DrawerTarget | null>(null);
  const closeDrawer = React.useCallback(() => setDrawer(null), []);

  const windowLabel = windowText(period, custom, result.window);
  const peopleLabel =
    selectedIds.length === 0
      ? isSuper
        ? "Everyone"
        : isManager
          ? "My team"
          : "Me"
      : selectedIds.length === 1 && selectedIds[0] === meId
        ? "Me"
        : `${selectedIds.length} selected`;
  const meta: ReportMeta[] = [
    { label: "Window", value: windowLabel },
    { label: "People", value: peopleLabel },
  ];

  /** The drawer reads at most DETAIL_MAX_DAYS, so a long window opens on its last stretch. */
  const openRange = React.useCallback((p: PersonStats, from: string, to: string) => {
    const earliest = addDaysYmd(to, -(DETAIL_MAX_DAYS - 1));
    setDrawer({ person: p.person, from: from < earliest ? earliest : from, to });
  }, []);
  const openPerson = React.useCallback(
    (p: PersonStats) => openRange(p, result.window.from, result.window.to),
    [openRange, result.window.from, result.window.to],
  );
  const openOwner = React.useCallback(
    (ownerId: string) => {
      const p = result.people.find((x) => x.person.id === ownerId);
      if (p) openPerson(p);
    },
    [result.people, openPerson],
  );

  const isDefault = period === "month" && selectedIds.length === 0;
  const people = result.people;

  return (
    <>
      <div
        data-dashboard-stickybar
        className="sticky sticky-below-topbar z-40 max-md:top-14"
        style={{ background: "#ffffff", borderBottom: "1px solid var(--color-hairline)" }}
      >
        <DccDashboardFilters
          roster={roster}
          selectedIds={selectedIds}
          period={period}
          custom={custom}
          meId={meId}
          isDefault={isDefault}
        />
        <DashboardSectionNav sections={SECTIONS} />
      </div>

      <main>
        <PageShell as="div" width="full" py={false} className="mt-6">
          <header className="flex min-w-0 items-center gap-3 px-6 md:px-8">
            <SectionIcon icon={Gauge} tone="red" />
            <div className="min-w-0">
              <h1 className="page-heading">DCC Dashboard</h1>
              <p className="text-[13.5px] font-medium text-slate-500">
                {windowLabel} · {people.length} {people.length === 1 ? "person" : "people"} with KPIs
              </p>
            </div>
          </header>
        </PageShell>

        {people.length === 0 ? (
          <PageShell as="div" width="full" py={false} className="mt-8">
            <div className="rounded-2xl border border-dashed border-slate-300 px-6 py-14 text-center">
              <p className="text-[15px] font-bold text-slate-800">No DCC KPIs in this view</p>
              <p className="mt-1 text-[13px] text-slate-500">
                {result.withoutKpis.length > 0
                  ? `${result.withoutKpis.length} ${result.withoutKpis.length === 1 ? "person has" : "people have"} no KPIs set yet. Add KPIs from their DCC page.`
                  : "Change the people filter, or add KPIs from the DCC page."}
              </p>
            </div>
          </PageShell>
        ) : (
          <>
            <PageShell as="div" width="full" py={false} className="mb-8 mt-6">
              <WidgetBoundary label="the compliance summary">
                <DccKpiStrip result={result} />
              </WidgetBoundary>
            </PageShell>

            <div className="mt-6 flex flex-col gap-6 pb-16 md:gap-8">
              {result.includesToday && (
                <Slot id="dcc-today" label="today's list">
                  <TodaySection
                    people={people}
                    today={result.today}
                    withoutKpis={result.withoutKpis}
                    showWithoutKpis={isManager}
                    meta={meta}
                  />
                </Slot>
              )}
              <Slot id="dcc-by-person" label="compliance by person">
                <ComplianceByPersonSection people={people} meta={meta} onOpen={openPerson} />
              </Slot>
              <Slot id="dcc-heatmap" label="the compliance heatmap">
                <ComplianceHeatmapSection
                  people={people}
                  buckets={result.buckets}
                  today={result.today}
                  meta={meta}
                  onOpenRange={openRange}
                />
              </Slot>
              <Slot id="dcc-trend" label="the compliance trend">
                <DailyTrendSection people={people} buckets={result.buckets} today={result.today} meta={meta} />
              </Slot>
              <Slot id="dcc-status" label="status by person">
                <StatusByPersonSection people={people} includesToday={result.includesToday} meta={meta} onOpen={openPerson} />
              </Slot>
              <Slot id="dcc-sections" label="compliance by section">
                <SectionBreakdownSection sections={result.sections} meta={meta} />
              </Slot>
              <Slot id="dcc-missed" label="the most-missed KPIs">
                <MostMissedKpisSection items={result.items} meta={meta} onOpenOwner={openOwner} />
              </Slot>
              <Slot id="dcc-reviews" label="manager reviews">
                <ReviewCoverageSection people={people} totals={result.reviews} meta={meta} />
              </Slot>
              <Slot id="dcc-top" label="top performers">
                <TopPerformersSection people={people} meta={meta} onOpen={openPerson} />
              </Slot>
              <Slot id="dcc-pull-up" label="people to pull up">
                <PeopleToPullUpSection people={people} meta={meta} onOpen={openPerson} />
              </Slot>
            </div>
          </>
        )}
      </main>

      <DccDetailDrawer target={drawer} today={result.today} onClose={closeDrawer} />
    </>
  );
}
