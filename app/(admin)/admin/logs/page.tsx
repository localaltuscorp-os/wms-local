import type { Metadata } from "next";
import { AdminSection } from "@/components/admin/ui/section-shell";
import { LogsScreen } from "@/components/admin/logs/logs-screen";
import { parseLogFilters } from "@/lib/logs/filters";
import { getLogStats, listActivityLogs, loadLogFilterOptions } from "@/lib/queries/logs";
import { History } from "lucide-react";

export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "Logs — Admin" };

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/**
 * ADMIN PANEL → LOGS — the immutable activity record of the whole WMS.
 *
 * Every filter is read from the URL and passed straight to the server query;
 * nothing is loaded into the browser except the current page. The page is
 * admin-only by way of the (admin) layout's `me.isAdmin` gate.
 */
export default async function AdminLogsPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const filters = parseLogFilters(sp);

  const [page, options, stats] = await Promise.all([
    listActivityLogs(filters),
    loadLogFilterOptions(),
    getLogStats(),
  ]);

  return (
    <AdminSection
      title="Logs"
      subtitle="The immutable, filterable record of every login, visit, change, export and denial across the WMS."
      icon={History}
      stats={[
        { label: "Today", value: stats.today },
        { label: "This week", value: stats.thisWeek },
        { label: "Logins", value: stats.logins },
        { label: "Access denied", value: stats.accessDenied, tone: "amber" },
      ]}
    >
      <LogsScreen
        initialFilters={filters}
        page={page}
        options={{
          functions: options.functions,
          employees: options.employees,
          entities: options.entities,
          moduleTree: options.moduleTree,
          eventTypes: options.eventTypes,
          statuses: options.statuses,
        }}
      />
    </AdminSection>
  );
}
