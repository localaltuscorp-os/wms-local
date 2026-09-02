import type { ReactNode } from "react";
import { Timer } from "lucide-react";
import { DashboardHeader } from "@/components/layout/header";
import { PageShell } from "@/components/layout/page-shell";
import { TimeReportTabs } from "./report-tabs";
import { EmptyState } from "./report-ui";
import { PageCommandBar } from "@/components/layout/page-command-bar";

/**
 * Shared chrome for the /tasks/time report pages — header, PageShell, glass
 * hero, the report tab-switcher, then the page's own body. Keeps the four
 * report routes DRY (the Overview hub renders its own body directly).
 */
export function TimeReportFrame({
  title,
  subtitle,
  actions,
  children,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <PageShell width="wide">
        {/* MINIMAL HEADER (Sir) — the shared PageCommandBar, i.e. the Yearly
            Goals band. ReportHero put a red icon tile, a "WMS · TASK TIME
            INTELLIGENCE" eyebrow, a 44px headline and a full-width subtitle
            above the tab row — so the KPI cards, which are the point of the
            page, started below the fold. This frame wraps EVERY Time
            Intelligence tab (Overview, Employees, Tasks, Goals, Manager), so
            the change lands on all five at once. */}
        <PageCommandBar title={title} hint={subtitle} actions={actions} />
        <TimeReportTabs />
        {children}
      </PageShell>
    </>
  );
}

/** Full-page "feature disabled" screen (TIME_INTEL_OFF). */
export function TimeIntelDisabledScreen() {
  return (
    <>
      <DashboardHeader generatedAt={new Date()} />
      <PageShell width="wide">
        <PageCommandBar title="Time Intelligence" />
        <EmptyState
          Icon={Timer}
          title="Time Intelligence is turned off"
          hint="This feature is disabled (TIME_INTEL_OFF). Ask an administrator to enable it."
        />
      </PageShell>
    </>
  );
}
