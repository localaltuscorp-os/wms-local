import { listEmployees } from "@/lib/queries/employees";
import {
  getActivityStats,
  listAllActivity,
  parseActivityFilters,
} from "@/lib/queries/activity";
import { ActivityStatsCards } from "@/components/admin/activity-stats";
import {
  ActivityActiveFilterChips,
  ActivityFilterBar,
} from "@/components/admin/activity-filter-bar";
import { ActivityList } from "@/components/admin/activity-list";
import { getStatusDisplayMap } from "@/lib/queries/status-display";
import { AdminSection } from "@/components/admin/ui/section-shell";
import { Activity as ActivityIcon } from "lucide-react";
import type { TaskStatus } from "@/db/enums";

export const dynamic = "force-dynamic";

interface PageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function AdminActivityPage({ searchParams }: PageProps) {
  const sp = await searchParams;
  const filters = parseActivityFilters(sp);

  const [allEmployees, stats, page, statusDisplay] = await Promise.all([
    // Include deactivated employees so the actor filter can scope to
    // historical events for users who have since been deactivated.
    listEmployees({ includeInactive: true }),
    getActivityStats(),
    listAllActivity({
      before: filters.before ?? undefined,
      actorIds: filters.actorIds.length > 0 ? filters.actorIds : undefined,
      kinds: filters.kinds.length > 0 ? filters.kinds : undefined,
      source: filters.source.length > 0 ? filters.source : undefined,
      from: filters.from ?? undefined,
      to: filters.to ?? undefined,
    }),
    getStatusDisplayMap(),
  ]);
  const statusLabels = Object.fromEntries(
    Object.entries(statusDisplay).map(([k, v]) => [k, v.label]),
  ) as Record<TaskStatus, string>;

  const employeeOptions = allEmployees.map((e) => ({
    value: e.id,
    label: e.name,
  }));
  const employeeLabels = new Map(employeeOptions.map((o) => [o.value, o.label]));

  // Build "Load older" URL by setting ?before=<oldest createdAt>.  Preserve
  // all other filters so paging doesn't lose context.
  const loadOlderHref = (() => {
    if (!page.hasMore || !page.nextCursor) return null;
    const params = new URLSearchParams();
    if (filters.actorIds.length > 0) params.set("actor", filters.actorIds.join(","));
    if (filters.kinds.length > 0) params.set("kind", filters.kinds.join(","));
    if (filters.source.length > 0) params.set("src", filters.source.join(","));
    if (filters.from) params.set("from", filters.from.toISOString().slice(0, 10));
    if (filters.to) params.set("to", filters.to.toISOString().slice(0, 10));
    params.set("before", page.nextCursor);
    return `/admin/activity?${params.toString()}`;
  })();

  return (
    <AdminSection
      eyebrow="Admin · Activity"
      title="Everything happening across the team"
      subtitle="A live, filterable audit timeline of every action — comments, status changes, transfers, and approvals."
      icon={ActivityIcon}
      stats={[
        { label: "Today", value: stats.today },
        { label: "This week", value: stats.thisWeek },
        { label: "Comments today", value: stats.commentsToday },
        { label: "Status changes", value: stats.statusChangesToday, tone: "amber" },
      ]}
    >
      <ActivityStatsCards stats={stats} />

      <ActivityFilterBar
        employees={employeeOptions}
        initial={{
          actorIds: filters.actorIds,
          kinds: filters.kinds,
          source: filters.source,
          from: filters.from ? filters.from.toISOString().slice(0, 10) : "",
          to: filters.to ? filters.to.toISOString().slice(0, 10) : "",
        }}
      />

      <ActivityActiveFilterChips
        actorIds={filters.actorIds}
        kinds={filters.kinds}
        source={filters.source}
        from={filters.from}
        to={filters.to}
        employeeLabels={employeeLabels}
      />

      <ActivityList
        events={page.events}
        hasMore={page.hasMore}
        loadOlderHref={loadOlderHref}
        statusLabels={statusLabels}
      />
    </AdminSection>
  );
}
