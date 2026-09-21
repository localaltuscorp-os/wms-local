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
import { CollapsibleSearch } from "@/components/ui/collapsible-search";

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
  me?: {
    id: string;
    isAdmin: boolean;
    /**
     * Super-admins OPEN ON THE WHOLE COMPANY; everyone else opens on
     * themselves — admins included (account holder, 2026-09-12). The server
     * decides this with lib/auth/default-scope.ts and passes the answer down,
     * rather than this client component learning the e-mail allow-list.
     *
     * It is what "the default" means here, and the default is not a filter:
     * the bar suppresses the active-filter chip for whichever selection the
     * viewer's page opened on, because nobody chose it and "Clear All" would
     * be offering to undo nothing.
     */
    isSuperAdmin?: boolean;
  };
  /**
   * The assignee dropdown offers a SCOPE CHOICE: an "All employees" row and the
   * viewer's own name pinned at the top marked "(You)", with an empty selection
   * meaning the viewer's default rather than everyone.
   *
   * On every task surface and the dashboard. It used to be the dashboard alone
   * (as `scopeDefaultsToMe`), which was fine while admins opened /tasks on the
   * whole company — they had nothing to widen TO. Now that an admin opens on
   * their own work, a list with no "All employees" row would be a list they
   * could never widen, only narrow one name at a time.
   *
   * Since the Scope segmented control was deleted, this dropdown is the ONLY
   * way to change whose work you are reading — so turning it off on a
   * surface that has a `me` would strand that viewer on their own rows.
   */
  offersScopeChoice?: boolean;
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
  offersScopeChoice = false,
  assigneeMode: initialAssigneeMode = "all",
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const [isPending, startTransition] = useTransition();

  /* "All employees" is a ROW IN THE LIST, not a separate control: the ask was
     for it to sit in the same checkbox dropdown as the individual names, and a
     reader who has just learned to pick a person there should not have to
     learn a second widget to un-pick them. It is a synthetic option — no
     employee has this id — intercepted in `handleEmpChange` below. */
  const ALL_EMP = "__all__";
  const selfScope = offersScopeChoice && Boolean(me);
  const selfId = me?.id;
  /* WHAT "NO CHOICE YET" MEANS FOR THIS VIEWER — the single fact the label, the
     chips, the empty-selection branch and Clear All all read, so the four
     cannot disagree about whether the page has been filtered.

     `opensOnSelf` was `!me.isAdmin` and is now `!me.isSuperAdmin`: that is the
     whole role change, expressed once. An admin is a person with a workload and
     opens on it, exactly like a team member. (It was named after a Scope toggle
     whose visibility it decided; that control is gone — see the render — so
     the name now says what it actually decides.) */
  const opensOnEveryone = Boolean(me?.isSuperAdmin);
  const opensOnSelf = Boolean(me && !opensOnEveryone);
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
  /* On a scope-choice surface the viewer's own row is TICKED at the default, so
     the dropdown shows what the pill says. Elsewhere there is no row to tick and
     the default stays an empty selection. */
  const [emp, setEmp] = React.useState<string[]>(
    initialAssigneeMode === "default" && !(offersScopeChoice && me) ? [] : initial.emp,
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

  /* ── THE RANGE PICKER ────────────────────────────────────────────────────

     WHY TWO CLICKS NEVER MADE A RANGE. `handleRange` used to write
     `end = r.to ?? r.from` immediately, so the FIRST click of a range —
     which react-day-picker reports as `{ from: X, to: undefined }` — was
     stored as `{ from: X, to: X }`. `range` above is derived from
     start/end, so the picker was handed back a COMPLETE range, and
     day-picker's rule for a click on a complete range is to throw it away and
     start a new one. Every click therefore began a fresh selection: you could
     move a single day around forever and never reach a second endpoint.

     It also refetched. The debounced `apply()` below watches start/end, so
     that first click pushed a one-day window to the server and the whole
     dashboard reloaded underneath the open calendar — the "not smooth" half
     of the problem, and a wasted query every time.

     So the calendar now edits a DRAFT while it is open and commits once. The
     draft keeps `to: undefined` after one click, which is exactly what
     day-picker needs to extend rather than restart. */
  const [dateOpen, setDateOpen] = React.useState(false);
  const [draftRange, setDraftRange] = React.useState<DateRange | undefined>(undefined);

  const commitRange = React.useCallback((r: DateRange | undefined) => {
    if (!r?.from) return;
    setStart(format(r.from, "yyyy-MM-dd"));
    // A single-day pick is a legitimate range of one, not an incomplete one.
    setEnd(format(r.to ?? r.from, "yyyy-MM-dd"));
  }, []);

  function handleRange(r: DateRange | undefined) {
    setDraftRange(r);
    // Both ends chosen — commit and get out of the way. Closing on completion
    // is what makes it "one go": no Apply button to find, and no calendar left
    // covering the numbers it just changed.
    if (r?.from && r.to) {
      commitRange(r);
      setDateOpen(false);
    }
  }

  function apply() {
    const sp = new URLSearchParams(searchParams.toString());
    sp.set("start", start);
    sp.set("end", end);
    sp.set("view", view);
    if (emp.length > 0) {
      sp.set("emp", emp.join(","));
    } else if ((opensOnSelf || selfScope) && assigneeMode === "all") {
      // Explicit, because an ABSENT `emp` is what means "the viewer" now.
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

  /** Put the assignee scope back to whatever this viewer's page opened on. */
  function resetScope() {
    if (opensOnEveryone || !selfId) {
      setAssigneeMode("all");
      setEmp([]);
      return;
    }
    setAssigneeMode("default");
    setEmp(selfScope ? [selfId] : []);
  }

  function reset() {
    const today = new Date();
    setStart(format(new Date(today.getTime() - 30 * ONE_DAY), "yyyy-MM-dd"));
    setEnd(format(today, "yyyy-MM-dd"));
    resetScope();
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
    if (selfScope) {
      /* Order matters. "All employees" WINS when it was just ticked, because
         at that moment your own name is still ticked too (you are the default)
         and a plain "any real id present → specific" rule would read that as
         "just me" and swallow the click. Every other case falls through to the
         real ids. */
      const allJustTicked = next.includes(ALL_EMP) && assigneeMode !== "all";
      if (allJustTicked) {
        setAssigneeMode("all");
        setEmp([]);
        return;
      }
      const ids = next.filter((v) => v !== ALL_EMP);
      if (ids.length > 0) {
        setAssigneeMode("specific");
        setEmp(ids);
        return;
      }
      // Nothing left ticked — including un-ticking "All employees" — returns
      // to the default this VIEWER opens on: their own work, or the whole
      // company for a super-admin. It used to hardcode "you", which would have
      // dropped a super-admin somewhere they never started.
      resetScope();
      return;
    }
    setEmp(next);
    if (opensOnSelf) setAssigneeMode(next.length > 0 ? "specific" : "default");
  }

  /* The list the dropdown actually renders. Ordered deliberately: the widest
     scope first, then YOU, then everybody else in the order the server sent.
     Hunting for your own name in an alphabetical roster is the thing this is
     meant to remove. */
  const employeeOptions = React.useMemo(() => {
    if (!selfScope) return employees;
    const self = employees.find((e) => e.value === selfId);
    return [
      { value: ALL_EMP, label: "All employees" },
      ...(self ? [{ value: self.value, label: `${self.label} (You)` }] : []),
      ...employees.filter((e) => e.value !== selfId),
    ];
  }, [employees, selfId, selfScope]);

  /* What the checkboxes show. In all-company mode nothing real is selected, so
     the synthetic row carries the tick — otherwise the dropdown would look
     exactly as it does when you have not chosen anything at all. */
  const empSelection = selfScope && assigneeMode === "all" ? [ALL_EMP] : emp;

  const empLabel = (id: string) => employees.find((e) => e.value === id)?.label ?? id;
  const statusLabel = (v: string) =>
    statusOptions?.find((o) => o.value === v)?.label ?? v;

  /* IS THE SCOPE STILL WHERE THE PAGE PUT IT?
     One predicate, three readers (the pill's highlight, the chip row, and the
     label below). A super-admin starts on everyone, so "all" is their default
     and must not chip; everyone else starts on themselves. */
  const atDefaultScope = !me
    ? emp.length === 0 && assigneeMode !== "specific"
    : opensOnEveryone
      ? assigneeMode === "all" && emp.length === 0
      : assigneeMode === "default" &&
        (selfScope ? emp.length === 1 && emp[0] === selfId : emp.length === 0);

  const assigneeValue =
    assigneeMode === "all"
      ? "All Employees"
      : // "Only Me" rather than your own name: the pill is answering "whose
        // numbers am I looking at", and your name alone reads like a filter
        // someone else applied.
        atDefaultScope && !opensOnEveryone
        ? "Only Me"
        : emp.length > 0
          ? summarizeSelection(emp.map(empLabel), "All Employees")
          : "All Employees";
  // Highlighted only once the viewer has actually moved off their default.
  const assigneeActive = !atDefaultScope;

  // ── Active-filter chips (the summary row) ──────────────────────────────
  type ActivePill = { key: string; label: string; color: string; remove: () => void };
  const activePills: ActivePill[] = [];
  for (const s of status)
    activePills.push({ key: `s-${s}`, label: statusLabel(s), color: TINT.status, remove: () => setStatus(status.filter((x) => x !== s)) });
  for (const p of prio)
    activePills.push({ key: `p-${p}`, label: PRIORITY_LABELS[p as TaskPriority] ?? p, color: TINT.priority, remove: () => setPrio(prio.filter((x) => x !== p)) });
  /* THE DEFAULT SCOPE IS NOT A FILTER.

     A page opens on SOMETHING — your own work, or the whole company if you are
     the super-admin. Nobody chose that, which is why the pill says "Only Me"
     rather than your name. Pushing a chip for it made the summary row read
     "1 active · Vinal Patil · Clear All" on a page nobody had touched: a filter
     count of one before any filter existed, your own name presented as though
     somebody had filtered you, and a "Clear All" offering to undo nothing.

     So the whole row stays hidden at the default — for every role, now that
     the default differs by role. The moment the selection is anything else —
     a colleague, several people, you AND someone else, or a super-admin
     narrowing to one person — every name chips as before, including yours,
     because then it IS a choice.

     `atDefaultScope` is the same predicate the pill's label reads. They used to
     be two separately-written conditions and drifted for anyone whose default
     was not "you". */
  if (!atDefaultScope) {
    for (const id of emp)
      activePills.push({ key: `e-${id}`, label: empLabel(id), color: TINT.assignee, remove: () => handleEmpChange(emp.filter((x) => x !== id)) });
    // ONE chip for "widened off my default", not the two this used to push
    // (a "All Tasks" chip and an "All Employees" chip, which could both fire).
    if (assigneeMode === "all" && emp.length === 0)
      activePills.push({
        key: "scope-all",
        label: "All Employees",
        color: TINT.assignee,
        remove: resetScope,
      });
  }
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
          <Popover.Root
            open={dateOpen}
            onOpenChange={(o) => {
              setDateOpen(o);
              if (o) {
                // Seed the draft from what is actually applied, so reopening
                // shows the range you are looking at rather than a blank slate.
                setDraftRange(range);
                return;
              }
              // Closed mid-selection, with only a start day picked. Commit it
              // as a single day rather than discarding the click — dismissing
              // someone's input because they did not finish the gesture is the
              // more surprising of the two outcomes.
              if (draftRange?.from && !draftRange.to) commitRange(draftRange);
            }}
          >
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
                  // The DRAFT while open, the applied range once closed. This
                  // is the whole fix: an in-progress `{ from, to: undefined }`
                  // survives the round trip, so the next click extends it.
                  selected={dateOpen ? draftRange : range}
                  onSelect={handleRange}
                  /* OPENS ON THE RANGE, not on today. With "Aug 2 – Sep 1"
                     applied on the 1st of September this opened showing
                     September and October — neither of which contains the start
                     of the selection, so the calendar appeared to have lost it.
                     Radix unmounts the content on close, so this re-applies on
                     every open rather than sticking at the first month shown. */
                  defaultMonth={range?.from}
                  numberOfMonths={2}
                  showOutsideDays
                  weekStartsOn={1}
                />
                {/* What the two clicks have selected so far. A range picker
                    gives no feedback between the first click and the second —
                    the pill behind it still reads the OLD range, because
                    nothing is committed yet — so this is the only thing on
                    screen confirming the first click registered. */}
                <p className="mt-2 border-t border-hairline pt-2 text-center text-[12px] font-semibold text-ink-subtle">
                  {draftRange?.from && draftRange.to
                    ? `${format(draftRange.from, "d MMM yyyy")} – ${format(draftRange.to, "d MMM yyyy")}`
                    : draftRange?.from
                      ? `${format(draftRange.from, "d MMM yyyy")} — pick an end date`
                      : "Pick a start date"}
                </p>
                <Popover.Arrow className="fill-white" />
              </Popover.Content>
            </Popover.Portal>
          </Popover.Root>

          {/* Assignee */}
          <MultiSelect
            options={employeeOptions}
            selected={empSelection}
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

          {/* A "Scope: My Tasks | All Tasks" segmented control used to sit
              here. REMOVED on request (2026-09-12): whose work you are reading
              is ONE question, and two controls were asking it — this toggle
              and the Assignee dropdown, which already carries an "All
              employees" row and your own name pinned at the top as "(You)".

              Two controls for one question could also disagree, and did.
              "My Tasks" wrote `assigneeMode: "default"` with an EMPTY
              selection, while the default on these surfaces ticks your own id
              — so clicking "My Tasks" left the pill beside it reading "All
              Employees" and the dropdown showing nothing ticked. Deleting the
              second control is the fix; another branch reconciling the two
              would not have been. */}
          {/* SOLID, not the frosted white pill the other segmented controls
              use. This toggle decides WHICH LIST you are reading — your own
              work, or work you handed out — and the two answers share a row
              count, a column set and a layout, so a 4% shift in background
              was the only thing telling them apart. It is now the bar's ONLY
              segmented control — Scope was deleted just above — which is the
              other half of why it can afford to shout. */}
          <SegGroup label="View">
            <SegButton
              layoutId="view-seg-active"
              tone="solid"
              solidColor="var(--color-altus-red)"
              title="Listing tasks assigned TO the selected people"
              active={view === "doer"}
              onClick={() => setView("doer")}
            >
              Doer
            </SegButton>
            <SegButton
              layoutId="view-seg-active"
              tone="solid"
              /* THE BRAND RED, same as Doer. It used to be slate-900 so the two
                 sides differed by colour as well as position — but that made
                 "which one is lit" a thing you had to learn, and only one of
                 the two states looked like the app it lives in. Now the lit
                 pill is always the logo red; WHICH pill is lit is what tells
                 you the view, backed up by the "Viewing as:" caption beside it
                 and by two different icons. */
              solidColor="var(--color-altus-red)"
              title="Listing tasks these people HANDED OUT to others"
              active={view === "initiator"}
              onClick={() => setView("initiator")}
            >
              Initiator
            </SegButton>
          </SegGroup>

          {/* A "Viewing as: Doer" caption used to sit here, spelling the state
              out in words beside the toggle. Removed on request: the lit red
              pill already says it, and the caption repeated it in a second
              red pill right next to the first. What each view MEANS now lives
              on the buttons' own hover titles instead of taking bar width. */}

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
    /* Rests as its magnifier until clicked. This bar is already a ribbon of
       eight filter pills before the search; the box was 150px of permanent
       width for something empty most of the time. size-[30px] matches the
       ribbon's control height exactly. */
    <CollapsibleSearch scope={placeholder.replace(/^search\s+/i, "").replace(/[.…\s]+$/, "")} className="size-[30px]">
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
    </CollapsibleSearch>
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
  layoutId = "seg-active",
  tone = "subtle",
  solidColor,
  title,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
  layoutId?: string;
  /** Hover text — where the View pills explain what each list actually is. */
  title?: string;
  /** `subtle` is the frosted white pill every segmented control has always
   *  used. `solid` fills the active pill with `solidColor` and sets the label
   *  white. Opt-in per group: it was added for the View toggle alone, back
   *  when Scope shared this component and had to keep the quieter look. View
   *  is the only group left, but the choice stays opt-in so the next group
   *  added does not inherit the loud treatment by accident. */
  tone?: "subtle" | "solid";
  /** Any CSS colour. Only read when `tone` is "solid" and this pill is active. */
  solidColor?: string;
}) {
  const solid = tone === "solid" && active;
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      aria-pressed={active}
      className="relative text-[11.5px] px-1.5 py-0.5 rounded-pill transition-colors whitespace-nowrap"
      style={{
        /* The fill is painted HERE as well as on the animated layer below.
           The layer is what slides between the two pills; the button's own
           background is what guarantees the lit state is visible even before
           that layer mounts or animates in. Same colour, so they are
           indistinguishable — this is belt-and-braces on the one piece of
           state in this bar that changes which list you are reading. */
        background: solid ? solidColor : undefined,
        color: solid
          ? "#ffffff"
          : active
            ? "var(--color-ink-strong)"
            : "var(--color-ink-subtle)",
        fontWeight: solid ? 700 : active ? 600 : 500,
      }}
    >
      {active && (
        <motion.span
          layoutId={layoutId}
          aria-hidden
          className="absolute inset-0 rounded-pill"
          style={{
            background: solid ? solidColor : "var(--color-surface-card)",
            boxShadow: solid
              ? "0 1px 3px rgba(15, 23, 42, 0.28)"
              : "0 1px 3px rgba(15, 23, 42, 0.08), 0 0 0 1px rgba(15, 23, 42, 0.04)",
          }}
          transition={{ type: "spring", stiffness: 380, damping: 32 }}
        />
      )}
      <span className="relative">{children}</span>
    </button>
  );
}
