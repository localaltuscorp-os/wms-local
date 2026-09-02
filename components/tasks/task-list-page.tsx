import Link from "next/link";
import type { Route } from "next";
import {
  LayoutGrid,
  CheckCircle2,
  Loader,
  Flame,
  AlarmClock,
  XCircle,
  EyeOff,
  type LucideIcon,
} from "lucide-react";
import { TaskTable } from "./task-table";
import type { TaskListRow, TaskListFilters } from "@/lib/types";
import { taskFiltersToSearchString } from "@/lib/task-filters";
import {
  PENDING_STATUSES as CANONICAL_PENDING_STATUSES,
  type TaskStatus,
  type StatusColorToken,
} from "@/db/enums";

const DONE_STATUSES = new Set<TaskStatus>(["done", "approved"]);
// Sourced from the canonical export so Tier-3 statuses count correctly.
const PENDING_STATUSES = new Set<TaskStatus>(CANONICAL_PENDING_STATUSES);

export type KpiKey =
  | "notApproved"
  | "done"
  | "pending"
  | "critical"
  | "urgent"
  | "notRead";

interface KpiSpec {
  key: KpiKey;
  label: string;
  sublabel: string;
  tone: "green" | "amber" | "red" | "orange" | "rose" | "slate";
}

// Six summary cards. The four middle ones (done/pending/critical/urgent) link
// to the Tasks list with the matching status/priority filter applied; the two
// new ones (notApproved/notRead) are display-only — they don't map to the
// existing status/priority filter dimensions.
const KPI_SPECS: KpiSpec[] = [
  { key: "notApproved", label: "NOT APPROVED", sublabel: "Declined or awaiting sign-off", tone: "rose"   },
  { key: "done",        label: "DONE",         sublabel: "Done + Approved",               tone: "green"  },
  { key: "pending",     label: "PENDING",      sublabel: "Open work",                     tone: "amber"  },
  { key: "critical",    label: "CRITICAL",     sublabel: "Important & urgent",            tone: "red"    },
  { key: "urgent",      label: "URGENT",       sublabel: "Urgent priority",               tone: "orange" },
  { key: "notRead",     label: "NOT READ",     sublabel: "Unopened pending tasks",        tone: "slate"  },
];

/** Pure, testable count logic for the six summary cards. Operates on the
 *  already-filtered rows so every count respects the page filters. */
export function computeStatCounts(rows: TaskListRow[]): Record<KpiKey, number> {
  return {
    notApproved: rows.filter(
      (r) =>
        r.approvalStatus === "not_approved" ||
        r.status === "not_approved" ||
        (r.status === "done" && r.approvalStatus == null),
    ).length,
    done: rows.filter((r) => DONE_STATUSES.has(r.status)).length,
    pending: rows.filter((r) => PENDING_STATUSES.has(r.status)).length,
    critical: rows.filter((r) => r.priority === "imp_urgent").length,
    urgent: rows.filter((r) => r.priority === "not_imp_urgent").length,
    notRead: rows.filter(
      (r) => PENDING_STATUSES.has(r.status) && r.firstReadAt == null,
    ).length,
  };
}

export function TaskListPage({
  title,
  rows,
  filters,
  employees,
  me,
  statusLabels,
  statusTones,
  subjects,
  clients,
  basePath = "/tasks",
}: {
  title: string;
  rows: TaskListRow[];
  filters: TaskListFilters;
  employees: { id: string; name: string }[];
  me: { id: string; isAdmin: boolean };
  statusLabels?: Record<TaskStatus, string>;
  statusTones?: Record<TaskStatus, StatusColorToken>;
  /** Bulk-set option rosters, threaded down to the bulk-action bar. */
  subjects?: string[];
  clients?: string[];
  /** List route the summary cards link into (so Archived keeps its own scope). */
  basePath?: string;
}) {
  const counts = computeStatCounts(rows);

  // Build each card's destination by overriding the relevant filter dimension
  // on top of the current filters — so date/employee/department scope carries
  // over, and the other status/priority filter is cleared for a clean view.
  function cardHref(key: "done" | "pending" | "critical" | "urgent"): Route {
    const base = { ...filters };
    let next: TaskListFilters;
    if (key === "done") {
      next = { ...base, statuses: ["done", "approved"], priorities: [] };
    } else if (key === "pending") {
      next = { ...base, statuses: [...CANONICAL_PENDING_STATUSES], priorities: [] };
    } else if (key === "critical") {
      next = { ...base, priorities: ["imp_urgent"], statuses: [] };
    } else {
      next = { ...base, priorities: ["not_imp_urgent"], statuses: [] };
    }
    const qs = taskFiltersToSearchString(next);
    return (qs ? `${basePath}?${qs}` : basePath) as Route;
  }

  // Highlight a card when the list is already filtered to exactly its view.
  function cardActive(key: "done" | "pending" | "critical" | "urgent"): boolean {
    const s = new Set(filters.statuses);
    const p = new Set(filters.priorities);
    if (key === "done") return p.size === 0 && s.size === 2 && s.has("done") && s.has("approved");
    if (key === "pending")
      return p.size === 0 && s.size === PENDING_STATUSES.size && [...s].every((x) => PENDING_STATUSES.has(x));
    if (key === "critical") return s.size === 0 && p.size === 1 && p.has("imp_urgent");
    return s.size === 0 && p.size === 1 && p.has("not_imp_urgent");
  }

  return (
    <main className="mx-auto max-w-[1600px] px-12 max-md:px-4 pt-8 pb-16">
      <header className="mb-4 flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1
            className="text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 900,
              fontSize: "clamp(34px, 3.4vw, 46px)",
              letterSpacing: "-0.025em",
              lineHeight: 1,
            }}
          >
            {title}
          </h1>
        </div>
        {me.isAdmin && (
          <Link
            href={"/tasks/kanban" as Route}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-[14.5px] font-bold text-white transition-all hover:brightness-110 active:scale-[0.98]"
            style={{
              background:
                "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
              boxShadow: "0 6px 18px -6px rgba(225, 6, 0, 0.55)",
            }}
          >
            <LayoutGrid size={16} strokeWidth={2.4} />
            Kanban View
          </Link>
        )}
      </header>

      {/* KPI summary — 4 stat cards in the same visual language as the
          main dashboard tiles. Each card has a top channel-color bar,
          font-black label, big count, sublabel. */}
      <div className="mb-4 grid grid-cols-6 gap-3 max-xl:grid-cols-3 max-md:grid-cols-2 max-sm:grid-cols-1">
        {KPI_SPECS.map((spec) => {
          // notApproved + notRead don't map to the status/priority filter
          // dimensions, so they're display-only (not click-to-filter).
          if (spec.key === "notApproved" || spec.key === "notRead") {
            return (
              <div key={spec.key} className="block rounded-section">
                <StatCard spec={spec} value={counts[spec.key]} active={false} />
              </div>
            );
          }
          const filterKey = spec.key;
          return (
            <Link
              key={spec.key}
              href={cardHref(filterKey)}
              aria-label={`View ${spec.label.toLowerCase()} tasks`}
              className="block rounded-section focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-altus-red/40"
            >
              <StatCard spec={spec} value={counts[spec.key]} active={cardActive(filterKey)} />
            </Link>
          );
        })}
      </div>

      {rows.length === 0 ? (
        <div
          className="bg-surface-card rounded-section border border-hairline p-10 text-center"
          style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
        >
          <p
            className="font-bold"
            style={{ fontSize: 20, color: "var(--color-ink-strong)" }}
          >
            No tasks match the current filter.
          </p>
          <p
            className="mt-2 font-semibold"
            style={{ fontSize: 15, color: "var(--color-ink-muted)" }}
          >
            Try widening your date range or clearing assignee filters.
          </p>
        </div>
      ) : (
        <TaskTable
          rows={rows}
          employees={employees}
          me={me}
          statusLabels={statusLabels}
          statusTones={statusTones}
          subjects={subjects}
          clients={clients}
        />
      )}
    </main>
  );
}

const KPI_ICONS: Record<KpiKey, LucideIcon> = {
  notApproved: XCircle,
  done: CheckCircle2,
  pending: Loader,
  critical: Flame,
  urgent: AlarmClock,
  notRead: EyeOff,
};

function StatCard({
  spec,
  value,
  active,
}: {
  spec: KpiSpec;
  value: number;
  active: boolean;
}) {
  const Icon = KPI_ICONS[spec.key];
  return (
    <div
      className="group relative bg-surface-card rounded-section overflow-hidden transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md cursor-pointer"
      style={{
        border: active
          ? `1.5px solid var(--color-${spec.tone}-deep)`
          : "1px solid var(--color-hairline)",
        boxShadow: active
          ? `0 0 0 3px color-mix(in srgb, var(--color-${spec.tone}) 16%, transparent)`
          : "0 1px 3px rgba(15, 23, 42, 0.04)",
        padding: "10px 14px 10px",
      }}
    >
      <span
        aria-hidden
        className="absolute inset-x-0 top-0"
        style={{
          height: 4,
          background: `linear-gradient(90deg, var(--color-${spec.tone}), var(--color-${spec.tone}-deep))`,
        }}
      />
      {/* Tinted icon chip — adds colour + visual anchor without hurting
          the white card's readability. */}
      <span
        aria-hidden
        className="absolute right-2.5 top-2.5 inline-flex size-7 items-center justify-center rounded-lg transition-transform duration-200 group-hover:scale-110"
        style={{
          background: `color-mix(in srgb, var(--color-${spec.tone}) 14%, transparent)`,
          color: `var(--color-${spec.tone}-deep)`,
        }}
      >
        <Icon size={15} strokeWidth={2.3} />
      </span>
      <span
        className="uppercase font-black tracking-[0.08em] leading-none"
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontSize: 11.5,
          color: `var(--color-${spec.tone}-deep)`,
        }}
      >
        {spec.label}
      </span>
      <span
        className="block mt-1 leading-[0.85] tracking-[-0.035em] tabular-nums text-ink-strong"
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontWeight: 900,
          fontSize: "clamp(25px, 1.9vw, 33px)",
        }}
      >
        {value}
      </span>
      <span
        className="block mt-1 font-bold leading-tight"
        style={{ fontSize: 11.5, color: "var(--color-ink-soft)" }}
      >
        {spec.sublabel}
      </span>
    </div>
  );
}
