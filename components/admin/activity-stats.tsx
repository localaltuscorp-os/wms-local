import {
  CalendarDays,
  TrendingUp,
  MessageSquare,
  GitCommitVertical,
} from "lucide-react";
import type { ReactNode } from "react";
import type { ActivityStats } from "@/lib/queries/activity";
import type { AdminKpiTone } from "@/components/admin/admin-kpi-tile";
import { AdminKpiTile } from "@/components/admin/admin-kpi-tile";

interface Props {
  stats: ActivityStats;
}

// Icons are pre-rendered ReactNodes — Next 16 RSC rejects passing component
// classes across the server→client boundary into AdminKpiTile (client).
const TILES: ReadonlyArray<{
  key: keyof ActivityStats;
  label: string;
  hint: string;
  tone: AdminKpiTone;
  icon: ReactNode;
}> = [
  {
    key: "today",
    label: "Today",
    hint: "All events since midnight",
    tone: "blue",
    icon: <CalendarDays size={16} strokeWidth={2.2} />,
  },
  {
    key: "thisWeek",
    label: "This week",
    hint: "Trailing 7 days",
    tone: "purple",
    icon: <TrendingUp size={16} strokeWidth={2.2} />,
  },
  {
    key: "commentsToday",
    label: "Comments today",
    hint: "Discussion volume",
    tone: "green",
    icon: <MessageSquare size={16} strokeWidth={2.2} />,
  },
  {
    key: "statusChangesToday",
    label: "Status changes today",
    hint: "Workflow throughput",
    tone: "amber",
    icon: <GitCommitVertical size={16} strokeWidth={2.2} />,
  },
];

/**
 * KPI-tier strip above the filter bar.  Visually matches the admin overview
 * tiles so the activity page reads as part of the same editorial system.
 */
export function ActivityStatsCards({ stats }: Props) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
      {TILES.map((tile, i) => (
        <AdminKpiTile
          key={tile.key}
          label={tile.label}
          value={stats[tile.key]}
          hint={tile.hint}
          tone={tile.tone}
          icon={tile.icon}
          index={i}
        />
      ))}
    </div>
  );
}
