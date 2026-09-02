"use client";
import * as React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { useTransition } from "react";
import * as Popover from "@radix-ui/react-popover";
import { DayPicker, type DateRange } from "react-day-picker";
import { format, parseISO } from "date-fns";
import {
  Calendar,
  Users,
  RotateCcw,
  SlidersHorizontal,
  Loader2,
  User,
  FileText,
  FileSpreadsheet,
  Upload,
  MoreHorizontal,
  CopyMinus,
} from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { motion } from "motion/react";
import { MultiSelect } from "@/components/ui/multi-select";
import { DepartmentFilter } from "./filters/department-filter";
import { PriorityFilter } from "./filters/priority-filter";
import { StatusFilter } from "./filters/status-filter";
import { SubjectFilter } from "./filters/subject-filter";
import { ClientFilter } from "./filters/client-filter";

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
  };
  subjects?: string[]; // pool of distinct task subjects for autocomplete
  /** Status options (value + admin-overridable label). When provided, the
   *  Status filter chip is shown. Omitted on views without status filtering. */
  statusOptions?: { value: string; label: string }[];
  /** Distinct task clients. When provided, the Clients filter chip is shown. */
  clients?: string[];
  /** Pass the signed-in user to enable the "My tasks / All tasks" scope chip.
   *  Only shown for non-admins on task list views. */
  me?: { id: string; isAdmin: boolean };
  /** How the assignee filter was resolved on the server. Controls the initial
   *  state of the scope chip. */
  assigneeMode?: AssigneeMode;
}

const ONE_DAY = 24 * 60 * 60 * 1000;

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
  const [isPending, startTransition] = useTransition();

  // The "scope chip" is only meaningful for non-admins, who have a default
  // (assigned-to-me) view. Admins use the full employee MultiSelect.
  const showScopeChip = Boolean(me && !me.isAdmin);

  const [start, setStart] = React.useState(initial.start);
  const [end, setEnd] = React.useState(initial.end);
  // For non-admins in "default" mode, the chip carries the "me" scope —
  // keep the MultiSelect empty so they can optionally add additional
  // teammates without first clearing themselves.
  const [emp, setEmp] = React.useState<string[]>(
    showScopeChip && initialAssigneeMode === "default" ? [] : initial.emp,
  );
  const [assigneeMode, setAssigneeMode] =
    React.useState<AssigneeMode>(initialAssigneeMode);
  const [view, setView] = React.useState<"doer" | "initiator">(initial.view);
  const [dept, setDept] = React.useState<string[]>(initial.dept);
  const [prio, setPrio] = React.useState<string[]>(initial.prio);
  const [subj, setSubj] = React.useState<string[]>(initial.subj);
  const [status, setStatus] = React.useState<string[]>(initial.status ?? []);
  const [client, setClient] = React.useState<string[]>(initial.client ?? []);
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const pathname = usePathname();

  const range: DateRange | undefined = React.useMemo(() => {
    try {
      return { from: parseISO(start), to: parseISO(end) };
    } catch {
      return undefined;
    }
  }, [start, end]);

  function handleRange(r: DateRange | undefined) {
    if (!r?.from) return;
    // Keep a valid (non-empty) range at every step so the auto-apply effect
    // never fires a half-selected range: while the user is mid-pick (only
    // `from` chosen), treat it as a single day until they click the end date.
    setStart(format(r.from, "yyyy-MM-dd"));
    setEnd(format(r.to ?? r.from, "yyyy-MM-dd"));
  }

  function apply() {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("start", start);
    sp.set("end", end);
    sp.set("view", view);
    // emp resolution:
    //  - specific IDs picked → write `emp=<ids>` (regardless of scope chip)
    //  - non-admin "all" scope → write sentinel `emp=all` so the server
    //    skips the default-to-me behavior
    //  - everything else (non-admin "default" → "My tasks", or admin with
    //    nothing picked) → drop the param so the server applies its default
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
    startTransition(() => router.replace(`${pathname}?${sp.toString()}` as any));
  }

  // Auto-apply: whenever any filter changes, push the new query string. A short
  // debounce coalesces rapid changes (toggling several multi-select options, a
  // two-click date range) into a single navigation so it feels instant without
  // firing one request per click. The first render is skipped — the page is
  // already rendered for the initial params, so re-applying them is wasted work.
  const didMount = React.useRef(false);
  React.useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    const t = setTimeout(apply, 200);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [start, end, view, emp, assigneeMode, dept, prio, subj, status, client]);

  function reset() {
    const today = new Date();
    setStart(format(new Date(today.getTime() - 30 * ONE_DAY), "yyyy-MM-dd"));
    setEnd(format(today, "yyyy-MM-dd"));
    setEmp([]);
    // Non-admins reset back to "My tasks"; admins/dashboard get "all".
    setAssigneeMode(showScopeChip ? "default" : "all");
    setView("doer");
    setDept([]);
    setPrio([]);
    setSubj([]);
    setStatus([]);
    setClient([]);
  }

  const fmt = (s: string) => {
    try {
      return format(parseISO(s), "MMM d");
    } catch {
      return s;
    }
  };
  const formattedRange = `${fmt(start)} → ${fmt(end)}`;

  /** Picking specific employees in the MultiSelect implies "specific" mode;
   *  clearing them returns the chip to "default" (My tasks) for non-admins. */
  function handleEmpChange(next: string[]) {
    setEmp(next);
    if (showScopeChip) {
      setAssigneeMode(next.length > 0 ? "specific" : "default");
    }
  }

  const activeCount =
    (emp.length > 0 ? 1 : 0) +
    // The "All tasks" choice is a deviation from the non-admin default and
    // counts as an active filter; "My tasks" (default) does not.
    (showScopeChip && assigneeMode === "all" && emp.length === 0 ? 1 : 0) +
    (view !== "doer" ? 1 : 0) +
    (dept.length > 0 ? 1 : 0) +
    (prio.length > 0 ? 1 : 0) +
    (subj.length > 0 ? 1 : 0) +
    (status.length > 0 ? 1 : 0) +
    (client.length > 0 ? 1 : 0); // start/end have defaults so don't count

  return (
    <div
      // Tight against the bottom of the sticky light header (96px desktop,
      // 72px mobile). No gap → no clipped content peeking through.
      className="sticky top-[96px] max-md:top-[72px] z-40 border-b border-hairline"
      style={{
        backgroundColor: "rgba(250, 251, 252, 0.82)",
        backdropFilter: "blur(20px) saturate(150%)",
        WebkitBackdropFilter: "blur(20px) saturate(150%)",
      }}
    >
      <div className="mx-auto max-w-[1600px] px-12 py-2.5 max-md:px-4">
        {/* Mobile-only header (Filters label + show/hide). On desktop the label
            is dropped entirely so all the chips fit on a single line. */}
        <div className="hidden max-sm:flex max-sm:w-full max-sm:items-center max-sm:gap-2">
          <span
            className="inline-flex items-center gap-1.5 text-table-head mr-1"
            style={{ color: "var(--color-ink-subtle)" }}
          >
            <SlidersHorizontal size={14} strokeWidth={2.4} />
            Filters
            {activeCount > 0 && (
              <span
                className="ml-1 inline-flex items-center justify-center rounded-full text-white"
                style={{
                  fontSize: 11.5,
                  fontWeight: 700,
                  letterSpacing: 0,
                  minWidth: 18,
                  height: 18,
                  padding: "0 6px",
                  background: "var(--color-altus-red)",
                }}
              >
                {activeCount}
              </span>
            )}
          </span>
          <button
            type="button"
            onClick={() => setSheetOpen((v) => !v)}
            className="hidden max-sm:inline-flex items-center gap-1.5 filter-chip ml-auto"
            aria-expanded={sheetOpen}
          >
            {sheetOpen ? "Hide" : "Show"} filters
          </button>
        </div>

        <div className={`flex items-center gap-2 max-sm:w-full max-sm:flex-col max-sm:items-stretch max-sm:gap-3 max-sm:mt-3 ${sheetOpen ? "" : "max-sm:hidden"}`}>
          {/* Filter chips — one horizontally-scrollable line on desktop; stack
              vertically on mobile. The dropdowns portal out, so the scroll
              container never clips them. */}
          <div className="flex-1 min-w-0 overflow-x-auto nav-scroll max-sm:flex-none max-sm:overflow-visible">
            <div className="flex items-center gap-2 w-max max-sm:w-full max-sm:flex-col max-sm:items-stretch max-sm:gap-3">
          {/* Date range */}
          <Popover.Root>
            <Popover.Trigger asChild>
              <button type="button" className="filter-chip max-sm:w-full max-sm:justify-between">
                <Calendar size={16} className="text-ink-subtle" strokeWidth={2} />
                <span className="text-[14px] font-medium text-ink-strong tabular-nums">
                  {formattedRange}
                </span>
              </button>
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

          {/* Scope chip: My tasks / All tasks (non-admins only) */}
          {showScopeChip && (
            <div
              className="inline-flex items-center bg-surface-card border border-hairline rounded-chip relative"
              style={{
                padding: 4,
                boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
              }}
              aria-label="Task scope"
            >
              <SegButton
                layoutId="scope-seg-active"
                active={assigneeMode === "default" && emp.length === 0}
                onClick={() => {
                  setAssigneeMode("default");
                  setEmp([]);
                }}
              >
                <span className="inline-flex items-center gap-1.5">
                  <User size={13} strokeWidth={2.2} />
                  My tasks
                </span>
              </SegButton>
              <SegButton
                layoutId="scope-seg-active"
                active={assigneeMode === "all" && emp.length === 0}
                onClick={() => {
                  setAssigneeMode("all");
                  setEmp([]);
                }}
              >
                All tasks
              </SegButton>
            </div>
          )}

          {/* Employees */}
          <div className="filter-chip max-sm:w-full">
            <Users size={16} className="text-ink-subtle" strokeWidth={2} />
            <MultiSelect
              options={employees}
              selected={emp}
              onChange={handleEmpChange}
              placeholder={
                showScopeChip && assigneeMode === "default"
                  ? "+ Add Teammate"
                  : "All Employees"
              }
              className="min-w-[6.5rem] !text-[14px]"
            />
          </div>

          {clients && clients.length > 0 && (
            <ClientFilter
              options={clients.map((c) => ({ value: c, label: c }))}
              selected={client}
              onChange={setClient}
            />
          )}
          <DepartmentFilter selected={dept} onChange={setDept} />
          <PriorityFilter selected={prio} onChange={setPrio} />
          {statusOptions && statusOptions.length > 0 && (
            <StatusFilter options={statusOptions} selected={status} onChange={setStatus} />
          )}
          {subjects && subjects.length > 0 && (
            <SubjectFilter options={subjects} selected={subj} onChange={setSubj} />
          )}

          {/* View segmented toggle */}
          <div
            className="inline-flex items-center bg-surface-card border border-hairline rounded-chip relative"
            style={{
              padding: 4,
              boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)",
            }}
          >
            <SegButton active={view === "doer"} onClick={() => setView("doer")}>
              Doer
            </SegButton>
            <SegButton
              active={view === "initiator"}
              onClick={() => setView("initiator")}
            >
              Initiator
            </SegButton>
          </div>

            </div>
          </div>
          {/* Pinned actions — stay put on the right while the filters scroll. */}
          <div className="flex items-center gap-2 shrink-0 max-sm:w-full max-sm:flex-wrap max-sm:mt-1">
            {/* Import / export — admin-only, on the task list views. Tucked
                into a ⋯ menu (these are occasional actions) so the filter row
                stays a single line and the table gets the screen space. The
                CSV export route still exists at /tasks/export but isn't
                surfaced — XLS + PDF cover every reporting need. */}
            {(pathname === "/tasks" || pathname === "/archived") &&
              me?.isAdmin &&
              (() => {
                const buildExportHref = (path: string) => {
                  const exportSp = new URLSearchParams(searchParams.toString());
                  if (pathname === "/archived") exportSp.set("archived", "1");
                  return `${path}?${exportSp.toString()}`;
                };
                return (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        aria-label="Import and export"
                        title="Import / export"
                        className="inline-flex items-center justify-center h-9 w-9 rounded-chip border border-hairline bg-surface-card text-ink-soft hover:text-ink-strong hover:border-altus-red transition-colors"
                        style={{ boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)" }}
                      >
                        <MoreHorizontal size={16} strokeWidth={2.4} />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link href={"/tasks/import" as Route}>
                          <Upload size={14} strokeWidth={2} style={{ color: "var(--color-altus-red)" }} />
                          Import tasks
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href={"/tasks/duplicates" as Route}>
                          <CopyMinus size={14} strokeWidth={2} style={{ color: "var(--color-amber-deep, #b45309)" }} />
                          Find duplicates
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <a href={buildExportHref("/tasks/export.xlsx")} download>
                          <FileSpreadsheet size={14} strokeWidth={2} style={{ color: "var(--color-success, #16a34a)" }} />
                          Export XLS
                        </a>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <a href={buildExportHref("/tasks/export.pdf")} download>
                          <FileText size={14} strokeWidth={2} style={{ color: "var(--color-altus-red, #dc2626)" }} />
                          Export PDF
                        </a>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                );
              })()}
            <button
              type="button"
              onClick={(e) => {
                const icon = e.currentTarget.querySelector("svg");
                if (icon) {
                  icon.style.transition = "transform 450ms cubic-bezier(.4, 1.4, .5, 1)";
                  icon.style.transform = "rotate(-360deg)";
                  setTimeout(() => {
                    if (icon) {
                      icon.style.transition = "none";
                      icon.style.transform = "rotate(0deg)";
                    }
                  }, 480);
                }
                reset();
              }}
              className="inline-flex items-center gap-1.5 text-chip text-ink-subtle hover:text-ink-strong transition-colors px-3 py-2 rounded-chip"
              aria-label="Reset filters"
            >
              <RotateCcw size={14} strokeWidth={2.2} />
              Reset
            </button>
            {/* Filters auto-apply as you change them — no Apply button. This
                tiny indicator just confirms a refresh is in flight. */}
            <span
              aria-live="polite"
              className="inline-flex items-center gap-1.5 text-chip text-ink-subtle transition-opacity"
              style={{ opacity: isPending ? 1 : 0 }}
            >
              <Loader2 size={14} strokeWidth={2.2} className="animate-spin" />
              Updating…
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function SegButton({
  active,
  onClick,
  children,
  layoutId = "view-seg-active",
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  /** Unique layoutId so multiple SegButton groups animate independently. */
  layoutId?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="relative text-[14px] px-2.5 py-1.5 rounded-pill transition-colors"
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
            boxShadow:
              "0 1px 3px rgba(15, 23, 42, 0.08), 0 0 0 1px rgba(15, 23, 42, 0.04)",
          }}
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
        />
      )}
      <span className="relative">{children}</span>
    </button>
  );
}
