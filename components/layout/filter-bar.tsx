"use client";
import { FINE_BUCKET_BY_SLUG } from "@/lib/transforms/aging-buckets-fine";
import { TeamFilter } from "./filters/team-filter";
import { teamLabel } from "@/lib/teams/roster";
import * as React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";
import * as Popover from "@radix-ui/react-popover";
import { DayPicker, type DateRange } from "react-day-picker";
import { format, parseISO } from "date-fns";
import {
  Calendar,
  User,
  Users,
  ListFilter,
  Search,
  X,
  Loader2,
} from "lucide-react";
import { setSectionSearch } from "@/lib/client/section-search";
import type { Route } from "next";
import { motion } from "motion/react";
import { MultiSelect } from "@/components/ui/multi-select";
import { PRIORITY_LABELS, type TaskPriority } from "@/db/enums";
import { DepartmentFilter } from "./filters/department-filter";
import { PriorityFilter } from "./filters/priority-filter";
import { StatusFilter } from "./filters/status-filter";
import { SubjectFilter } from "./filters/subject-filter";
import { ClientFilter } from "./filters/client-filter";
import { FilterPill, summarizeSelection } from "./filters/filter-pill";

type AssigneeMode = "default" | "all" | "specific";

interface Props {
  employees: { value: string; label: string }[];
  initial: {
    start: string;
    end: string;
    emp: string[];
    view: "doer" | "initiator";
    dept: string[];
    prio: string[];
    subj: string[];
    status?: string[];
    client?: string[];
    /** `?overdue=true` — narrows to open work already past its due date. */
    overdue?: boolean;
    /** `?age_range=<slug>` — one of the nine fine aging buckets. */
    ageRange?: string | null;
    /** `?team=mine,Sales` — org-chart scope + department groups. */
    team?: string[];
  };
  subjects?: string[];
  statusOptions?: { value: string; label: string }[];
  clients?: string[];
  me?: { id: string; isAdmin: boolean };
  assigneeMode?: AssigneeMode;
  /** Number of tasks matching the current filters (shown in the summary row). */
  taskCount?: number;
}

const ONE_DAY = 24 * 60 * 60 * 1000;

/** Accent dot/badge colors per filter family (Altus palette). */
const TINT = {
  status: "#16a34a",
  priority: "#f59e0b",
  assignee: "var(--color-altus-red)",
  client: "#3b82f6",
  department: "#8b5cf6",
  subject: "#0ea5e9",
  view: "#64748b",
  overdue: "#dc2626",
  ageRange: "#b45309",
  team: "#0d9488",
} as const;

export function FilterBar({
  employees,
  initial,
  subjects,
  statusOptions,
  clients,
  me,
  assigneeMode: initialAssigneeMode = "all",
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  const showScopeChip = Boolean(me && !me.isAdmin);
  // Overdue has no picker of its own — it arrives from a drill-through link
  // (e.g. the Task Report's sent-back-by-person rows) and is cleared from its
  // chip. A dropdown for a single boolean would be a worse control than the
  // chip already is.
  const [overdue, setOverdue] = React.useState<boolean>(Boolean(initial.overdue));
  // Same shape as `overdue`: arrives from a drill-through, leaves by its chip.
  const [ageRange, setAgeRange] = React.useState<string | null>(initial.ageRange ?? null);
  const [team, setTeam] = React.useState<string[]>(initial.team ?? []);

  const [start, setStart] = React.useState(initial.start);
  const [end, setEnd] = React.useState(initial.end);
  const [emp, setEmp] = React.useState<string[]>(
    showScopeChip && initialAssigneeMode === "default" ? [] : initial.emp,
  );
  const [assigneeMode, setAssigneeMode] = React.useState<AssigneeMode>(initialAssigneeMode);
  const [view, setView] = React.useState<"doer" | "initiator">(initial.view);
  const [dept, setDept] = React.useState<string[]>(initial.dept);
  const [prio, setPrio] = React.useState<string[]>(initial.prio);
  const [subj, setSubj] = React.useState<string[]>(initial.subj);
  const [status, setStatus] = React.useState<string[]>(initial.status ?? []);
  const [client, setClient] = React.useState<string[]>(initial.client ?? []);

  const range: DateRange | undefined = React.useMemo(() => {
    try {
      return { from: parseISO(start), to: parseISO(end) };
    } catch {
      return undefined;
    }
  }, [start, end]);

  function handleRange(r: DateRange | undefined) {
    if (!r?.from) return;
    setStart(format(r.from, "yyyy-MM-dd"));
    setEnd(format(r.to ?? r.from, "yyyy-MM-dd"));
  }

  function apply() {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("start", start);
    sp.set("end", end);
    sp.set("view", view);
    if (emp.length > 0) {
      sp.set("emp", emp.join(","));
    } else if (showScopeChip && assigneeMode === "all") {
      sp.set("emp", "all");
    } else {
      sp.delete("emp");
    }
    if (dept.length > 0) sp.set("dept", dept.join(",")); else sp.delete("dept");
    if (prio.length > 0) sp.set("prio", prio.join(",")); else sp.delete("prio");
    if (subj.length > 0) sp.set("subj", subj.join(",")); else sp.delete("subj");
    if (status.length > 0) sp.set("status", status.join(",")); else sp.delete("status");
    if (client.length > 0) sp.set("client", client.join(",")); else sp.delete("client");
    if (overdue) sp.set("overdue", "true"); else sp.delete("overdue");
    if (ageRange) sp.set("age_range", ageRange); else sp.delete("age_range");
    if (team.length > 0) sp.set("team", team.join(",")); else sp.delete("team");
    startTransition(() => router.replace(`${pathname}?${sp.toString()}` as Route));
  }

  const didMount = React.useRef(false);
  React.useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    const t = setTimeout(apply, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, end, view, emp, assigneeMode, dept, prio, subj, status, client, overdue, ageRange, team]);

  function reset() {
    const today = new Date();
    setStart(format(new Date(today.getTime() - 30 * ONE_DAY), "yyyy-MM-dd"));
    setEnd(format(today, "yyyy-MM-dd"));
    setEmp([]);
    setAssigneeMode(showScopeChip ? "default" : "all");
    setView("doer");
    setDept([]);
    setPrio([]);
    setSubj([]);
    setStatus([]);
    setClient([]);
    setOverdue(false);
    setAgeRange(null);
    setTeam([]);
  }

  const fmt = (s: string) => {
    try {
      return format(parseISO(s), "MMM d");
    } catch {
      return s;
    }
  };
  const formattedRange = `${fmt(start)} – ${fmt(end)}`;

  function handleEmpChange(next: string[]) {
    setEmp(next);
    if (showScopeChip) setAssigneeMode(next.length > 0 ? "specific" : "default");
  }

  const empLabel = (id: string) => employees.find((e) => e.value === id)?.label ?? id;
  const statusLabel = (v: string) =>
    statusOptions?.find((o) => o.value === v)?.label ?? v;

  const assigneeValue =
    emp.length > 0
      ? summarizeSelection(emp.map(empLabel), "All Employees")
      : showScopeChip && assigneeMode === "default"
        ? "My Tasks"
        : "All Employees";
  const assigneeActive = emp.length > 0 || (showScopeChip && assigneeMode === "all");

  // ── Active-filter chips (the summary row) ──────────────────────────────
  type ActivePill = { key: string; label: string; color: string; remove: () => void };
  const activePills: ActivePill[] = [];
  for (const s of status)
    activePills.push({ key: `s-${s}`, label: statusLabel(s), color: TINT.status, remove: () => setStatus(status.filter((x) => x !== s)) });
  for (const p of prio)
    activePills.push({ key: `p-${p}`, label: PRIORITY_LABELS[p as TaskPriority] ?? p, color: TINT.priority, remove: () => setPrio(prio.filter((x) => x !== p)) });
  for (const id of emp)
    activePills.push({ key: `e-${id}`, label: empLabel(id), color: TINT.assignee, remove: () => handleEmpChange(emp.filter((x) => x !== id)) });
  if (showScopeChip && assigneeMode === "all" && emp.length === 0)
    activePills.push({ key: "scope-all", label: "All Tasks", color: TINT.assignee, remove: () => setAssigneeMode("default") });
  for (const c of client)
    activePills.push({ key: `c-${c}`, label: c, color: TINT.client, remove: () => setClient(client.filter((x) => x !== c)) });
  for (const d of dept)
    activePills.push({ key: `d-${d}`, label: d, color: TINT.department, remove: () => setDept(dept.filter((x) => x !== d)) });
  for (const s of subj)
    activePills.push({ key: `subj-${s}`, label: s, color: TINT.subject, remove: () => setSubj(subj.filter((x) => x !== s)) });
  if (view !== "doer")
    activePills.push({ key: "view", label: "Initiator View", color: TINT.view, remove: () => setView("doer") });
  if (overdue)
    activePills.push({ key: "overdue", label: "Overdue", color: TINT.overdue, remove: () => setOverdue(false) });
  for (const t of team)
    activePills.push({
      key: `t-${t}`,
      label: teamLabel(t),
      color: TINT.team,
      remove: () => setTeam(team.filter((x) => x !== t)),
    });
  if (ageRange)
    activePills.push({
      key: "age",
      // The human bucket label, not the slug — "22 or more days overdue"
      // rather than "22_plus". Falls back to the slug if an unknown one is
      // ever pasted in, so the chip is still clearable.
      label: FINE_BUCKET_BY_SLUG[ageRange] ?? ageRange,
      color: TINT.ageRange,
      remove: () => setAgeRange(null),
    });

  return (
    <div
      className="sticky sticky-below-topbar max-md:top-14 z-40 border-b border-hairline"
      style={{
        // Frosted glass band with a whisper of the module's brand red washed
        // in from the left — reads as part of the module chrome, not a page.
        background:
          "radial-gradient(560px 90px at 6% 0%, color-mix(in srgb, var(--color-altus-red) 4%, transparent), transparent 70%), linear-gradient(180deg, rgba(255,255,255,0.86), rgba(250,251,252,0.80))",
        backdropFilter: "blur(20px) saturate(150%)",
        WebkitBackdropFilter: "blur(20px) saturate(150%)",
        boxShadow: "0 10px 26px -22px rgba(15, 23, 42, 0.20)",
      }}
    >
      <div className="mx-auto max-w-[1600px] px-6 py-2.5 max-md:px-4 flex flex-col gap-2">
        {/* Row 1 — filter pill-cards. WRAPS to a second line when they don't fit
            (instead of cutting off the last filter). Wrapping is popover-safe:
            the filter popovers portal to <body>, so — unlike a scroll/overflow
            ancestor — a wrapped trigger row never mis-anchors them. */}
        {/* Row 1 — ONE line, never wrapping: date range · filters · view toggle,
            then the view switcher + search pinned right. `flex-nowrap` keeps the
            View (Doer/Initiator) toggle on the same line as the filters; the
            pills are compressed (see `filter-pill` in globals.css) so the whole
            set fits. `overflow-x-auto` is only a safety valve for very narrow
            viewports — the filter popovers portal to <body> and Radix tracks the
            trigger on scroll, so a scrolled trigger still anchors correctly. */}
        <div className="flex items-center gap-x-1 flex-nowrap overflow-x-auto no-scrollbar min-w-0">
          {/* Date range */}
          <Popover.Root>
            <Popover.Trigger asChild>
              <FilterPill
                icon={<Calendar size={16} strokeWidth={2} />}
                name="Date Range"
                value={formattedRange}
                tint="var(--color-altus-red)"
                active
              />
            </Popover.Trigger>
            <Popover.Portal>
              <Popover.Content
                align="start"
                sideOffset={10}
                collisionPadding={12}
                className="z-[100] bg-surface-card border border-hairline-strong rounded-chip p-3 max-h-[var(--radix-popover-content-available-height)] overflow-y-auto"
                style={{ boxShadow: "0 16px 40px rgba(15, 23, 42, 0.14)" }}
              >
                <DayPicker
                  mode="range"
                  selected={range}
                  onSelect={handleRange}
                  numberOfMonths={2}
                  showOutsideDays
                  weekStartsOn={1}
                />
                <Popover.Arrow className="fill-white" />
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>

          {/* Assignee */}
          <MultiSelect
            options={employees}
            selected={emp}
            onChange={handleEmpChange}
            renderTrigger={() => (
              <FilterPill
                icon={<User size={16} strokeWidth={2} />}
                name="Assignee"
                value={assigneeValue}
                tint={TINT.assignee}
                active={assigneeActive}
              />
            )}
          />

          {statusOptions && statusOptions.length > 0 && (
            <StatusFilter options={statusOptions} selected={status} onChange={setStatus} />
          )}
          <PriorityFilter selected={prio} onChange={setPrio} />
          {clients && clients.length > 0 && (
            <ClientFilter options={clients.map((c) => ({ value: c, label: c }))} selected={client} onChange={setClient} />
          )}
          {/* Team sits directly after Department: they are adjacent questions
              (who owns this work) and reading them side by side is what makes
              the difference between them legible. */}
          <DepartmentFilter selected={dept} onChange={setDept} />
          <TeamFilter selected={team} onChange={setTeam} />

          {/* Subject — always shown */}
          {subjects && subjects.length > 0 && (
            <SubjectFilter options={subjects} selected={subj} onChange={setSubj} />
          )}

          {/* Scope (non-admins) + View — always shown */}
          {showScopeChip && (
            <SegGroup label="Scope">
              <SegButton active={assigneeMode === "default" && emp.length === 0} onClick={() => { setAssigneeMode("default"); setEmp([]); }}>My Tasks</SegButton>
              <SegButton active={assigneeMode === "all" && emp.length === 0} onClick={() => { setAssigneeMode("all"); setEmp([]); }}>All Tasks</SegButton>
            </SegGroup>
          )}
          <SegGroup label="View">
            <SegButton layoutId="view-seg-active" active={view === "doer"} onClick={() => setView("doer")}>Doer</SegButton>
            <SegButton layoutId="view-seg-active" active={view === "initiator"} onClick={() => setView("initiator")}>Initiator</SegButton>
          </SegGroup>

          {/* The ⋯ import/export menu used to sit here. It moved to the Tasks
              page header so it pairs with the "Kanban View" button, and so this
              ribbon stays filters + search on one line. See task-tools-menu.tsx. */}

          {/* Right-pinned cluster: updating indicator · section search.
              The Board/List segmented toggle used to sit here too; it was a
              third way to do the same thing (the left rail has Tasks + Kanban
              items, and the Tasks header has a "Kanban View" button), so it was
              removed to keep the ribbon to the primary controls. */}
          <div className="flex items-center gap-1.5 ml-auto shrink-0 pl-1.5">
            <span
              aria-live="polite"
              aria-hidden={!isPending}
              className="inline-flex items-center gap-1 text-[12px] text-ink-subtle transition-opacity"
              style={{ opacity: isPending ? 1 : 0, width: isPending ? undefined : 0, overflow: "hidden" }}
            >
              <Loader2 size={12} strokeWidth={2.2} className="animate-spin" />
              Updating…
            </span>

            <SectionSearchBox
              placeholder={`Search ${SECTION_LABELS[pathname] ?? "this view"}…`}
            />
          </div>
        </div>

        {/* Active filters — rendered ONLY when something is selected, so the
            bar stays a single line otherwise. (Result count lives in Row 1.)
            Chips scroll horizontally if many; no popovers here, so the scroll
            container is safe. */}
        {activePills.length > 0 && (
          <div className="flex items-center gap-2.5 flex-nowrap min-w-0 overflow-x-auto no-scrollbar">
            <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold shrink-0" style={{ color: "var(--color-ink-subtle)" }}>
              <ListFilter size={15} strokeWidth={2.2} />
              {activePills.length} active
            </span>
            {activePills.map((p) => (
              <span
                key={p.key}
                className="inline-flex items-center gap-1.5 rounded-full pl-2.5 pr-1.5 py-1 text-[13px] font-semibold shrink-0"
                style={{
                  background: `color-mix(in srgb, ${p.color} 11%, transparent)`,
                  border: `1px solid color-mix(in srgb, ${p.color} 24%, transparent)`,
                  color: "var(--color-ink-strong)",
                }}
              >
                <span className="size-2 rounded-full" style={{ background: p.color }} />
                {p.label}
                <button
                  type="button"
                  onClick={p.remove}
                  aria-label={`Remove ${p.label}`}
                  className="inline-flex items-center justify-center rounded-full size-4 text-ink-subtle hover:text-ink-strong hover:bg-black/5 transition-colors"
                >
                  <X size={12} strokeWidth={2.4} />
                </button>
              </span>
            ))}
            <button
              type="button"
              onClick={reset}
              className="text-[13px] font-semibold transition-colors hover:underline shrink-0"
              style={{ color: "var(--color-altus-red)" }}
            >
              Clear All
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Human name of the view the bar is sitting on, for the search placeholder.
 * Falls back to a neutral phrase so a new route that mounts the bar still
 * reads sensibly instead of showing "Search undefined…".
 */
const SECTION_LABELS: Record<string, string> = {
  "/dashboard": "Dashboard",
  "/tasks": "Tasks",
  "/my-day": "Daily Goals",
  // Daily Goals → Dashboard. Named in full so the bar never reads as the WMS
  // Dashboard at /dashboard, which is a different page entirely.
  "/my-day/dashboard": "Daily Goals Dashboard",
  "/tasks/kanban": "Kanban",
  "/archived": "Archived",
};

/**
 * Section-scoped search. Writes to the section-search store, which the view
 * rendered below the bar reads via `useSectionSearch()` and applies to the rows
 * it has ALREADY loaded — so this filters live, per keystroke, with no server
 * round trip (unlike the other controls here, which re-query via the URL).
 *
 * Chrome intentionally mirrors `filter-pill`: same surface, hairline border,
 * 12px radius and shadow, so it reads as one of the bar's controls.
 */
function SectionSearchBox({ placeholder }: { placeholder: string }) {
  const pathname = usePathname();
  const [text, setText] = React.useState("");

  // Clear when moving between sections — a query typed on Tasks must not carry
  // over and silently hide rows on Kanban. Also runs on mount, so the store
  // always starts empty for the new view.
  React.useEffect(() => {
    setText("");
    setSectionSearch("");
  }, [pathname]);

  // And clear on unmount, so a view WITHOUT the bar can never inherit a stale
  // query from the last one that had it.
  React.useEffect(() => () => setSectionSearch(""), []);

  function update(next: string) {
    setText(next);
    setSectionSearch(next);
  }

  return (
    <div className="relative shrink-0">
      <Search
        size={14}
        strokeWidth={2.2}
        aria-hidden
        className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-ink-subtle"
      />
      <input
        type="search"
        value={text}
        onChange={(e) => update(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Escape") update("");
        }}
        placeholder={placeholder}
        aria-label={placeholder}
        // Narrow by default so the ribbon fits on one line, widening on focus
        // (and on wide screens) once you're actually typing into it.
        className="h-[30px] w-[150px] 2xl:w-[200px] focus:w-[220px] rounded-xl border border-hairline bg-surface-card pl-7 pr-6 text-[12px] font-semibold text-ink-strong placeholder:font-normal placeholder:text-ink-subtle outline-none transition-all hover:border-hairline-strong focus:border-altus-red focus:ring-2 focus:ring-altus-red/20"
        style={{ boxShadow: "0 1px 2px rgba(15, 23, 42, 0.05)" }}
      />
      {text && (
        <button
          type="button"
          onClick={() => update("")}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 text-ink-subtle transition-colors hover:text-ink-strong"
        >
          <X size={14} strokeWidth={2.4} />
        </button>
      )}
    </div>
  );
}

function SegGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    // shrink-0 + nowrap: this is the control that used to get bumped onto a
    // second line, so it must never be squeezed or allowed to break.
    <div className="inline-flex items-center gap-1 shrink-0 whitespace-nowrap">
      <span className="text-[9.5px] font-semibold uppercase tracking-wide" style={{ color: "var(--color-ink-subtle)" }}>
        {label}
      </span>
      <div
        className="inline-flex items-center bg-surface-card border border-hairline rounded-chip relative"
        style={{ padding: 2, boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)" }}
      >
        {children}
      </div>
    </div>
  );
}

function SegButton({
  active,
  onClick,
  children,
  layoutId = "scope-seg-active",
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  layoutId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative text-[11.5px] px-1.5 py-0.5 rounded-pill transition-colors whitespace-nowrap"
      style={{
        color: active ? "var(--color-ink-strong)" : "var(--color-ink-subtle)",
        fontWeight: active ? 600 : 500,
      }}
    >
      {active && (
        <motion.span
          layoutId={layoutId}
          aria-hidden
          className="absolute inset-0 rounded-pill"
          style={{
            background: "var(--color-surface-card)",
            boxShadow: "0 1px 3px rgba(15, 23, 42, 0.08), 0 0 0 1px rgba(15, 23, 42, 0.04)",
          }}
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
        />
      )}
      <span className="relative">{children}</span>
    </button>
  );
}
