import Link from "next/link";
import type { Route } from "next";
import { LayoutGrid, CheckCircle2, X } from "lucide-react";
import { TaskTable } from "./task-table";
import { SectionErrorBoundary } from "@/components/ui/section-error-boundary";
import { TaskDetailDrawer } from "./task-detail-drawer";
import { TaskToolsMenu } from "./task-tools-menu";
import { TasksFullscreen, FullscreenToggleButton } from "./tasks-fullscreen";
import { WeeklyGoalTaskGroup } from "@/components/weekly-goals/weekly-goal-task-group";
import type { VirtualTaskRow } from "@/lib/weekly-goals/as-task-row";
import type { TaskListRow, TaskListFilters } from "@/lib/types";
import { taskFiltersToSearchString } from "@/lib/task-filters";
import {
  PENDING_STATUSES as CANONICAL_PENDING_STATUSES,
  type TaskStatus,
  type TaskPriority,
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
  | "approved"
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
  { key: "notApproved", label: "NOT APPROVED", sublabel: "Declined / not approved", tone: "rose"   },
  { key: "approved",    label: "APPROVED",     sublabel: "Signed off",                    tone: "slate"  },
  { key: "done",        label: "DONE",         sublabel: "Done + Approved",               tone: "green"  },
  { key: "pending",     label: "PENDING",      sublabel: "Open work",                     tone: "amber"  },
  { key: "critical",    label: "CRITICAL",     sublabel: "Important & urgent",            tone: "red"    },
  { key: "urgent",      label: "URGENT",       sublabel: "Urgent priority",               tone: "orange" },
  { key: "notRead",     label: "NOT READ",     sublabel: "Unopened pending tasks",        tone: "slate"  },
];

/**
 * Per-status chip palette. Explicit Tailwind values rather than the previous
 * `color-mix(var(--color-<tone>) 8%, surface)` derivation: at 8% over white the
 * tint was effectively invisible, so all six pills read as plain white boxes and
 * the only thing distinguishing them was a 8px dot at full saturation.
 *
 * Keyed by KpiKey, not by the `tone` token — `critical` and `notApproved` both
 * mapped onto red-ish tokens, so a token-keyed map could not give them the
 * distinct rose/red pair specified.
 */
const CHIP_STYLE: Record<KpiKey, { pill: string; border: string; dot: string }> = {
  notApproved: {
    pill: "bg-red-50 hover:bg-red-100 text-red-950",
    border: "border-red-200",
    dot: "bg-red-600",
  },
  // Lavender, and the one pill whose fill is NOT a -50 tint: purple-100 at 70%
  // sits about where the other five land visually, because purple-50 on this
  // near-white page is barely a colour at all.
  approved: {
    pill: "bg-purple-100/70 hover:bg-purple-100 text-purple-900",
    border: "border-purple-200",
    dot: "bg-purple-500",
  },
  done: {
    pill: "bg-emerald-50 hover:bg-emerald-100 text-emerald-950",
    border: "border-emerald-200",
    dot: "bg-emerald-600",
  },
  pending: {
    pill: "bg-amber-50 hover:bg-amber-100 text-amber-950",
    border: "border-amber-200",
    dot: "bg-amber-500",
  },
  /* RED, NOT ROSE. rose-50/-100 are #fff1f2 / #ffe4e6 — pale pink, and on a
     pill that means "critical" the hue was doing the opposite of its job.
     The TINT LEVEL is deliberately unchanged: every other pill in this row is
     a `-50` fill with `-950` ink, so moving this one to a `-100` fill would
     make the set look misaligned rather than corrected. Hue fixed, rhythm
     kept. */
  critical: {
    pill: "bg-red-50 hover:bg-red-100 text-red-950",
    border: "border-red-200",
    dot: "bg-red-600",
  },
  urgent: {
    pill: "bg-orange-50 hover:bg-orange-100 text-orange-950",
    border: "border-orange-200",
    dot: "bg-orange-600",
  },
  notRead: {
    pill: "bg-slate-100 hover:bg-slate-200 text-slate-900",
    border: "border-slate-300",
    dot: "bg-slate-500",
  },
};

/** Pure, testable count logic for the six summary cards. Operates on the
 *  already-filtered rows so every count respects the page filters. */
export function computeStatCounts(rows: TaskListRow[]): Record<KpiKey, number> {
  return {
    // ONLY tasks whose status is "Not Approved" — not "done awaiting sign-off"
    // or anything else (per Sir: this card must mean exactly Not-Approved).
    notApproved: rows.filter(
      (r) => r.status === "not_approved" || r.approvalStatus === "not_approved",
    ).length,
    // EITHER COLUMN, matching how notApproved above counts and how
    // statusFilterCondition in lib/queries/tasks.ts filters — a task approved
    // via approval_status must not be counted here and then missing from the
    // list this pill opens.
    //
    // NOTE this deliberately OVERLAPS `done`: DONE_STATUSES is {done, approved},
    // so an approved task is counted by both pills. That is what the Done pill
    // has always meant (its sublabel says "Done + Approved"), and Approved is a
    // subset view of it rather than a sibling. The six pills were never a
    // partition of the roster - Critical and Urgent cut across all of them.
    approved: rows.filter(
      (r) => r.status === "approved" || r.approvalStatus === "approved",
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
  metricsRows,
  filters,
  employees,
  me,
  statusLabels,
  statusTones,
  subjects,
  clients,
  weeklyGoals = [],
  basePath = "/tasks",
  selectedTaskId = null,
  detail = null,
}: {
  title: string;
  rows: TaskListRow[];
  /** The rows the SUMMARY PILLS are counted over — the user's whole scope with
   *  the status/priority dimensions removed. Defaults to `rows` for callers
   *  that don't separate the two (e.g. Archived), which restores the old
   *  behaviour rather than silently zeroing their pills. */
  metricsRows?: TaskListRow[];
  filters: TaskListFilters;
  employees: { id: string; name: string }[];
  me: { id: string; isAdmin: boolean; canChangeDoer?: boolean };
  statusLabels?: Record<TaskStatus, string>;
  statusTones?: Record<TaskStatus, StatusColorToken>;
  /** Bulk-set option rosters, threaded down to the bulk-action bar. */
  subjects?: string[];
  clients?: string[];
  /** This week's goals for the view's scope, surfaced as a pinned group above
   *  the task table (design §10). Display-only; NOT counted in the stat cards. */
  weeklyGoals?: VirtualTaskRow[];
  /** List route the summary cards link into (so Archived keeps its own scope). */
  basePath?: string;
  /** `?task=` — which record the detail drawer is showing, if any. */
  selectedTaskId?: string | null;
  /** Server-rendered detail subtree for `selectedTaskId`, streamed in behind
   *  its own <Suspense>. Passed through rather than fetched here so the inbox
   *  shell can stay a client component. */
  detail?: React.ReactNode;
}) {
  // Weekly goals are surfaced as a pinned group above the table but are
  // deliberately EXCLUDED from the task stat-card counts (design §10) — the
  // KPIs stay tasks-only.
  //
  // Counted over `metricsRows` (the whole scope), NOT the filtered `rows`.
  // Counting the filtered set made every unselected pill read 0 the moment one
  // was clicked, which turned a summary bar into a description of itself.
  const counts = computeStatCounts(metricsRows ?? rows);

  // Each stat card maps to a set of statuses and/or priorities, or to the
  // `unread` cross-cut.
  //
  // NOT READ IS NO LONGER DISPLAY-ONLY. It had no entry here because there is
  // no `not_read` value in the status enum — it is "pending AND never opened",
  // which needed a filter dimension of its own (`?unread=1`, see
  // lib/task-filters.ts). Without one the pill counted 175 tasks and then did
  // nothing when clicked, which reads as a broken control rather than a
  // deliberate one.
  const CARD_FILTER: Partial<
    Record<KpiKey, { statuses?: TaskStatus[]; priorities?: TaskPriority[]; unread?: boolean }>
  > = {
    notApproved: { statuses: ["not_approved"] },
    approved: { statuses: ["approved"] },
    done: { statuses: ["done", "approved"] },
    pending: { statuses: [...CANONICAL_PENDING_STATUSES] },
    critical: { priorities: ["imp_urgent"] },
    urgent: { priorities: ["not_imp_urgent"] },
    notRead: { unread: true },
  };

  // SELECTION IS EXCLUSIVE. This used to ACCUMULATE — each click added its set
  // to whatever was already selected, so clicking Done while Pending was on
  // gave you Done + Pending and the table still showed Initiated rows. That was
  // deliberate once (it allows Critical to narrow Pending), but it makes the
  // pills read as broken: you click "Done" and see work that is not done.
  //
  // One pill at a time now. Clicking a pill REPLACES the status, priority and
  // unread dimensions with just that pill's; clicking the active one clears
  // them. Everything else in the URL — date range, employee, department, team,
  // subject, client — carries over untouched, so a pill narrows the scope the
  // reader has already chosen rather than resetting the page.
  function cardActive(key: KpiKey): boolean {
    const cf = CARD_FILTER[key];
    if (!cf) return false;
    const sts = cf.statuses ?? [];
    const prs = cf.priorities ?? [];
    // Exact-match, not superset: with exclusive selection the pill is "on" only
    // when the filter is EXACTLY its set, so two pills can never both look on.
    const sameStatuses =
      filters.statuses.length === sts.length && sts.every((x) => filters.statuses.includes(x));
    const samePriorities =
      filters.priorities.length === prs.length &&
      prs.every((x) => filters.priorities.includes(x));
    return sameStatuses && samePriorities && filters.unread === Boolean(cf.unread);
  }

  function cardHref(key: KpiKey): Route {
    const cf = CARD_FILTER[key];
    if (!cf) return basePath as Route;
    const clear = cardActive(key);
    const next: TaskListFilters = {
      ...filters,
      statuses: clear ? [] : (cf.statuses ?? []),
      priorities: clear ? [] : (cf.priorities ?? []),
      unread: clear ? false : Boolean(cf.unread),
    };
    const qs = taskFiltersToSearchString(next);
    return (qs ? `${basePath}?${qs}` : basePath) as Route;
  }

  /** The active pill's label, for the table footer's "… (Not Read)" suffix.
   *  Exclusive selection is what makes a single label correct here: at most one
   *  pill can be active, so there is never a set to summarise. */
  const activeSpec = KPI_SPECS.find((sp) => cardActive(sp.key)) ?? null;
  const activeCardLabel = activeSpec
    ? activeSpec.label.charAt(0) + activeSpec.label.slice(1).toLowerCase()
    : null;

  // ── Drill-through banner ────────────────────────────────────────────────
  // Shown only for the exact shape the Done Dashboard sends: a DONE-family
  // status set plus exactly ONE person. Not for any status+person combination —
  // a banner that appears whenever two filters happen to coincide is noise, and
  // this one exists to confirm you landed where a click promised.
  const doneOnly =
    filters.statuses.length > 0 &&
    filters.statuses.every((st) => DONE_STATUSES.has(st));
  const singleDoer = filters.doerIds.length === 1 ? filters.doerIds[0] : null;
  const drillEmployee =
    doneOnly && singleDoer
      ? (employees.find((e) => e.id === singleDoer)?.name ?? null)
      : null;

  /** Same list, with the two drill-through filters lifted off. */
  function clearDrillHref(): Route {
    const next: TaskListFilters = {
      ...filters,
      statuses: [],
      doerIds: [],
      assigneeMode: "all",
    };
    const qs = taskFiltersToSearchString(next);
    return (qs ? `${basePath}?${qs}` : basePath) as Route;
  }

  return (
    // `w-full min-w-0` matter now that the table scrolls sideways. This <main>
    // is a flex item with `mx-auto`, and auto cross-axis margins DISABLE flex
    // stretch — so without an explicit width it sizes to its CONTENT. The wide
    // table then pushed <main> to its 1560px max, overflowing the content column
    // and shoving the sticky Manage column off the right of the screen (the page
    // can't scroll to it: body is `overflow-x: hidden`). Pinning the width to the
    // column keeps the overflow INSIDE the table's own scroll container, which is
    // what the frozen column pins against.
    <TasksFullscreen className="wms-compact relative mx-auto w-full min-w-0 max-w-[1560px] px-7 max-md:px-4 pt-4 max-md:pt-3 pb-16">
      {/* Header — the "Tasks" title with the KPI stat chips inline beside it, and
          Kanban View on the right. (Eyebrow + "N tasks in the current view"
          subtitle removed per design.) */}
      {drillEmployee && (
        <div
          className="wg-rise mb-3 flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-2.5"
          style={{
            borderColor: "color-mix(in srgb, #059669 30%, transparent)",
            background: "color-mix(in srgb, #059669 8%, transparent)",
          }}
        >
          <span className="inline-flex items-center gap-2 text-[13.5px] font-bold text-ink-strong">
            <CheckCircle2 size={16} strokeWidth={2.4} style={{ color: "#047857" }} />
            Showing Done Tasks for {drillEmployee}
            <span className="font-semibold tabular-nums text-ink-muted">
              ({rows.length.toLocaleString("en-IN")}{" "}
              {rows.length === 1 ? "task" : "tasks"})
            </span>
          </span>
          {/* A link, not a button: it is a navigation to a different filter
              state, so it should be middle-clickable and show its destination
              on hover like every other filter change on this page. */}
          <Link
            href={clearDrillHref()}
            className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-[12.5px] font-bold text-ink-muted transition-colors hover:bg-white hover:text-altus-red"
          >
            <X size={13} strokeWidth={2.6} />
            Clear Filter
          </Link>
        </div>
      )}

      <header className="wg-rise relative mb-3 flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-x-4 gap-y-2 flex-wrap min-w-0">
          <h1
            className="text-ink-strong shrink-0"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 900,
              fontSize: "clamp(20px, 1.8vw, 25px)",
              letterSpacing: "-0.028em",
              lineHeight: 1,
            }}
          >
            {title}
          </h1>
          {/* KPI stat chips — inline. Clickable ones toggle the matching
              status/priority filter; `notRead` is display-only. */}
          <div className="flex flex-wrap items-center gap-1.5">
            {KPI_SPECS.map((spec, i) => {
              const on = cardActive(spec.key);
              return (
                <Link
                  key={spec.key}
                  href={cardHref(spec.key)}
                  aria-pressed={on}
                  aria-label={`${on ? "Remove" : "Add"} ${spec.label.toLowerCase()} filter`}
                  className="wg-rise block rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-altus-red/40"
                  style={{ animationDelay: `${i * 30}ms` }}
                >
                  <StatChip spec={spec} value={counts[spec.key]} active={on} />
                </Link>
              );
            })}
          </div>
        </div>
        {/* The ⋯ menu moved up from the FilterBar so the view actions sit
            together, which also keeps the filter ribbon to filters + search on
            its single line. Full screen stays OUTSIDE the admin gate —
            maximising the table is useful to everyone, not just admins. */}
        {/* Order is [ ••• ] [ Kanban View ] [ Full screen ]: the two admin
            controls first, then the one control everybody gets, so Full screen
            is always the rightmost button whether or not the admin pair is
            rendered. Putting it first meant a non-admin's single button sat
            where an admin's overflow menu sits. */}
        <div className="flex items-center gap-2 shrink-0">
          {me.isAdmin && (
            <>
              <TaskToolsMenu />
              <Link
                href={"/tasks/kanban" as Route}
                className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-[12.5px] font-bold transition-colors hover:bg-surface-soft shrink-0"
                style={{
                  color: "var(--color-altus-red-deep)",
                  boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)",
                }}
              >
                <LayoutGrid size={14} strokeWidth={2.4} />
                Kanban View
              </Link>
            </>
          )}
          <FullscreenToggleButton />
        </div>
      </header>

      {/* Pinned "This week's goals" group above the table (design §10). Admins
          viewing the unscoped "all" list see each goal's doer name. Excluded
          from the stat-card counts above. */}
      <WeeklyGoalTaskGroup
        goals={weeklyGoals}
        showDoer={me.isAdmin && filters.assigneeMode === "all"}
        className="mb-3"
      />

      {rows.length === 0 ? (
        <div
          className="wg-rise relative overflow-hidden bg-surface-card rounded-section border border-hairline p-14 max-md:p-10 text-center"
          style={{
            boxShadow:
              "0 1px 2px rgba(15, 23, 42, 0.04), 0 14px 32px -20px rgba(15, 23, 42, 0.14)",
          }}
        >
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-0 top-0 h-24"
            style={{
              background:
                "radial-gradient(420px 110px at 50% 0%, color-mix(in srgb, var(--color-altus-red) 5%, transparent), transparent 72%)",
            }}
          />
          <span
            aria-hidden
            className="relative mx-auto mb-4 inline-flex size-14 items-center justify-center rounded-2xl"
            style={{
              background:
                "color-mix(in srgb, var(--color-altus-red) 9%, transparent)",
              color: "var(--color-altus-red)",
              boxShadow:
                "inset 0 0 0 1px color-mix(in srgb, var(--color-altus-red) 18%, transparent)",
            }}
          >
            <LayoutGrid size={24} strokeWidth={2.2} />
          </span>
          <p
            className="relative font-black"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontSize: 21,
              letterSpacing: "-0.015em",
              color: "var(--color-ink-strong)",
            }}
          >
            No tasks match the current filter.
          </p>
          <p
            className="relative mt-2 font-semibold"
            style={{ fontSize: 15, color: "var(--color-ink-muted)" }}
          >
            Try widening your date range or clearing assignee filters.
          </p>
        </div>
      ) : (
        <>
          {/* Scoped so a throw inside the grid does not take the filters,
              toolbar and drawer down with it — which is what the route-level
              error.tsx did. */}
          <SectionErrorBoundary label="the tasks table">
            <TaskTable
              rows={rows}
              filterLabel={activeCardLabel}
              employees={employees}
              me={me}
              statusLabels={statusLabels}
              statusTones={statusTones}
              subjects={subjects}
              clients={clients}
              openInDrawer
            />
          </SectionErrorBoundary>
          {/* The record opens ONLY on an explicit row click — there is no
              persistent reading pane holding the space. `detail` is the
              server-rendered subtree for `?task=`; when nothing is selected it
              is null and the drawer never mounts. */}
          <TaskDetailDrawer open={Boolean(selectedTaskId)}>
            {detail}
          </TaskDetailDrawer>
        </>
      )}
    </TasksFullscreen>
  );
}

/** A light, flat stat chip: [tone dot] BIG-number Label. No shadows, no washes,
 *  no icon tiles — restraint is what reads "light". Active = subtly tinted. */
function StatChip({
  spec,
  value,
  active,
}: {
  spec: KpiSpec;
  value: number;
  active: boolean;
}) {
  const c = CHIP_STYLE[spec.key];
  return (
    <div
      title={spec.sublabel}
      // The pill owns the text colour; the count and label below INHERIT it
      // rather than carrying their own ink-strong/ink-soft, or the -950 tone
      // would never show.
      //
      // ACTIVE IS A THIN WHITE BORDER, not the slate-900 ring it was. A 2px
      // black outline around a pastel pill reads as a separate object stamped
      // on top of the chip rather than the chip itself being chosen, and six of
      // them in a row made the whole bar look heavier than the page around it.
      // White cuts the pill's own tint away from its fill, and `ring-1
      // ring-black/10` under it keeps that hairline legible where the fill is
      // palest — on Pending's amber-50 and Not Read's slate-100 a bare white
      // border would otherwise vanish into the page behind it. The scale drops
      // from 105 to 102: enough to lift, not enough to shove its neighbours.
      className={`group inline-flex items-center gap-2 rounded-xl border px-2.5 py-1 transition-all duration-150 ${c.pill} ${
        active
          ? "scale-[1.02] border-white font-bold shadow-xs ring-1 ring-black/10"
          : `${c.border} font-medium`
      }`}
    >
      <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${c.dot}`} />
      <span
        className="tabular-nums leading-none"
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontWeight: 900,
          fontSize: 16,
          letterSpacing: "-0.02em",
        }}
      >
        {value}
      </span>
      <span className="font-semibold leading-none" style={{ fontSize: 11.5 }}>
        {spec.label.charAt(0) + spec.label.slice(1).toLowerCase()}
      </span>
    </div>
  );
}
