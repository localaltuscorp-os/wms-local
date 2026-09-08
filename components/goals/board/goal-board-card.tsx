"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Pencil,
  Eye,
  Loader2,
  GripVertical,
  MoreHorizontal,
  ArrowRightLeft,
  CopyPlus,
  Ban,
  CheckCircle2,
  Trash2,
  Split,
  IndianRupee,
  Hash,
  X,
  Plus,
  Gift,
  CalendarClock,
  AlertTriangle,
  CheckCheck,
} from "lucide-react";
import { fireToast } from "@/lib/toast";
import {
  editGoal,
  setGoalPctDone,
  setGoalCategory,
  setGoalTeam,
  setGoalAdopted,
  generateGoalChildren,
  moveGoalToPeriod,
  moveGoalToLevel,
  moveGoalAcross,
  copyGoalToPeriod,
  undoConvertGoal,
  listGoalMasterPickables,
  type MoveAcrossResult,
} from "@/app/(app)/goals/cascade/actions";
import {
  type GoalDTO,
  type MonthlyMasterRef,
  type RosterMember,
  effectiveGoalPct,
  isSpillover,
  categoryStyle,
  originStyle,
  fmtNum,
  num,
  periodKeyLabel,
  targetDateStatus,
  fmtTargetDate,
  goalTakesTargetDate,
  assignmentInfo,
  GOAL_CATEGORIES,
} from "@/components/goals/cascade/util";
import { AssignmentChip, AssignmentLine } from "@/components/goals/board/assignment-chip";
import { POLICY_REASONS, type GoalPolicy } from "@/lib/goals/policy";
import { deriveHealth } from "@/lib/goals/derive";
import { TeamAvatarStack, type TeamMember } from "@/components/goals/canvas/people";
import type { GoalMutationApi, GoalActionResult } from "@/components/goals/canvas/optimistic";
import {
  quartersOfFy,
  monthKeysOfFy,
  monthKeysOfQuarter,
  quarterKey,
  monthKey,
  quarterOfKey,
  quarterKeyOfMonthKey,
  fyStartYearOfKey,
  fyStartYearOfMonthKey,
  type GoalPeriod,
} from "@/lib/goals/types";
import { fyWeeks } from "@/lib/goals/fy-calendar";
import { formatWeekShort, currentWeekStart } from "@/lib/weekly-goals/week";
import { WeeklyGoalDrawer } from "@/components/weekly-goals/goal-drawer";
import { ProgressControl } from "@/components/weekly-goals/progress-control";
import { ComboInput, AutoTextarea, pctTone } from "@/components/weekly-goals/field-controls";
import { Select } from "@/components/ui/select";
import { DateInput } from "@/components/ui/date-input";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";

const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)] focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-surface-card)]";

/** Props shared by every card on the board (memo-stable object in the shell). */
export interface SharedCardProps {
  policy: GoalPolicy;
  canWrite: boolean;
  roster: RosterMember[];
  areaOptions: string[];
  /** Measure (→ uom) + Type (→ category) dropdown options: base + admin-added. */
  measureOptions: string[];
  typeOptions: string[];
  /** Admin-added (deletable) subsets per kind. */
  customLookups: { areas: string[]; measures: string[]; types: string[] };
  /** Admins get the inline add/delete affordances on the managed dropdowns. */
  isAdmin: boolean;
  fyStartYear: number;
  mutation: GoalMutationApi;
  onRequestArchive: (g: GoalDTO) => void;
  /** Reorder/bucket drag off while a filter narrows the list (partial-order guard). */
  dragDisabled: boolean;
  /**
   * Stable DENSE goal code (Y1 / AQ1 / AprM1) — the goal's rank within its
   * bucket (sorted by position), NOT the raw stored position. One source for
   * every view (list · kanban · cards) so numbers stay sequential, gap-free
   * after deletes, unique, and identical across views.
   */
  codeOf: (g: GoalDTO) => string;
  /** The same stable dense rank as a plain number (the "#N" Sr. No.). */
  rankOf: (g: GoalDTO) => number;
}

interface Props extends SharedCardProps {
  goal: GoalDTO;
  srNo: number;
  autoFocus?: boolean;
  /** The goal's DIRECT children (any level). Retained on the board API (kept
   *  by the shell wiring) though the drawer no longer edits child targets.
   *  Stable [] identity when none. */
  childGoals: GoalDTO[];
  /** "row" (default) = the full-width list row; "kanban" = the compact card
   *  the Kanban columns render. Same state, same drawers, same ⋯ menu. */
  variant?: "row" | "kanban";
}

function GoalBoardCardImpl({
  goal,
  srNo,
  policy,
  canWrite,
  roster,
  areaOptions,
  measureOptions,
  typeOptions,
  customLookups,
  isAdmin,
  fyStartYear,
  mutation,
  onRequestArchive,
  dragDisabled,
  codeOf,
  childGoals,
  autoFocus = false,
  variant = "row",
}: Props) {
  const [editing, setEditing] = React.useState(autoFocus);
  const [moving, setMoving] = React.useState(false);
  const [copying, setCopying] = React.useState(false);
  const cardRef = React.useRef<HTMLDivElement>(null);

  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({ id: goal.id, disabled: dragDisabled || !canWrite || !policy.canReorder });

  React.useEffect(() => {
    if (autoFocus) cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [autoFocus]);

  const eff = effectiveGoalPct(goal);
  const spill = isSpillover(goal);
  const cat = categoryStyle(goal.category, spill);
  const origin = originStyle(goal);
  const assign = assignmentInfo(goal);
  const tone = eff >= 100 ? "green" : pctTone(eff);
  const crossed = !goal.adopted;
  // Progress bar width eases 0 → eff on mount and on change (reduced-motion:
  // the CSS transition simply lands instantly per the global gate).
  const [barW, setBarW] = React.useState(0);
  React.useEffect(() => {
    const id = requestAnimationFrame(() => setBarW(eff));
    return () => cancelAnimationFrame(id);
  }, [eff]);
  const childCount = childGoals?.length ?? 0;
  const childLabel = goal.period === "year" ? "quarters" : goal.period === "quarter" ? "months" : "weeks";
  // At-risk = behind the fixed pace cut (or a spillover), and not done/dropped.
  const atRisk = React.useMemo(
    () => !crossed && eff < 100 && deriveHealth(eff, goal.periodKey, new Date(), { spillover: spill }).atRisk,
    [crossed, eff, goal.periodKey, spill],
  );
  /** Full pace-aware health (band label + colour + expected-by-now) — powers the
   *  kanban card's progress bar + status chip so the card reads at a glance. */
  const health = React.useMemo(
    () => deriveHealth(eff, goal.periodKey, new Date(), { spillover: spill }),
    [eff, goal.periodKey, spill],
  );
  /** View-only surface (policy) — the drawer still OPENS (read-only affordance)
   *  but every control disables and no save can fire. */
  const ro = !canWrite;

  /** Optimistic field save — patch instantly, reconcile with the returned row. */
  const save = React.useCallback(
    (fields: Partial<GoalDTO>, action: () => Promise<GoalActionResult>) => {
      if (!canWrite) return; // belt — read-only viewers never write
      void mutation.mutate({ type: "update", id: goal.id, fields }, action);
    },
    [mutation, goal.id, canWrite],
  );

  function toggleAdopted() {
    const next = !goal.adopted;
    save({ adopted: next }, () => setGoalAdopted({ id: goal.id, adopted: next }));
  }

  function autoDivide() {
    void mutation
      .mutate({ type: "update", id: goal.id, fields: {} }, () => generateGoalChildren({ id: goal.id }))
      .then((ok) => {
        if (ok) fireToast({ message: "Cascade children generated - check the level below.", type: "success" });
      });
  }

  const moreItems: MoreItem[] = [
    canWrite && policy.canEditProgress && eff < 100 && !crossed && {
      key: "done",
      icon: <CheckCheck size={15} />,
      label: "Mark as done",
      onClick: () => save({ pctDone: 100 }, () => setGoalPctDone({ id: goal.id, pctDone: 100 })),
    },
    canWrite && {
      key: "adopt",
      icon: crossed ? <CheckCircle2 size={15} /> : <Ban size={15} />,
      label: crossed ? "Bring back" : "Set aside",
      onClick: toggleAdopted,
    },
    canWrite && {
      key: "move",
      icon: <ArrowRightLeft size={15} />,
      label: "Move to another period",
      onClick: () => setMoving(true),
    },
    canWrite && {
      key: "copy",
      icon: <CopyPlus size={15} />,
      label: "Also add to a period…",
      onClick: () => setCopying(true),
    },
    canWrite &&
      policy.canAutoDivide && {
        key: "divide",
        icon: <Split size={15} />,
        label: `Split into ${childLabel}`,
        onClick: autoDivide,
      },
    canWrite && {
      key: "archive",
      icon: <Trash2 size={15} />,
      label: "Delete",
      danger: true,
      onClick: () => onRequestArchive(goal),
    },
  ].filter(Boolean) as MoreItem[];

  // Live slider/% state — drag updates locally, commits on release/blur.
  const [progDrag, setProgDrag] = React.useState<number | null>(null);
  const shownPct = progDrag ?? goal.pctDone;
  const commitPct = React.useCallback(
    (raw: number) => {
      const v = Math.max(0, Math.min(100, Math.round(Number.isFinite(raw) ? raw : 0)));
      setProgDrag(null);
      if (v !== goal.pctDone) save({ pctDone: v }, () => setGoalPctDone({ id: goal.id, pctDone: v }));
    },
    [goal.pctDone, goal.id, save],
  );

  return (
    <div
      ref={(el) => {
        setNodeRef(el);
        if (variant === "kanban") setActivatorNodeRef(el);
        cardRef.current = el;
      }}
      {...(variant === "kanban" && canWrite && policy.canReorder && !dragDisabled
        ? { ...attributes, ...listeners }
        : {})}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.35 : crossed ? 0.6 : 1,
        ...(variant === "kanban"
          ? {
              background: "var(--color-surface-card)",
              border: "1.5px solid var(--color-hairline-strong)",
              boxShadow:
                "0 6px 16px -10px rgba(15,23,42,0.28), 0 1px 2px rgba(15,23,42,0.06), inset 0 1px 0 rgba(255,255,255,0.6)",
            }
          : null),
      }}
      className={
        variant === "kanban"
          ? `group relative rounded-2xl transition-[transform,box-shadow,border-color] duration-200 hover:-translate-y-0.5 hover:border-[color-mix(in_srgb,var(--color-altus-red)_40%,var(--color-hairline-strong))] hover:shadow-[0_14px_30px_-14px_color-mix(in_srgb,var(--color-altus-red)_45%,transparent)] ${canWrite && policy.canReorder && !dragDisabled ? "cursor-grab touch-none active:cursor-grabbing" : ""}`
          : "group relative"
      }
    >
      {variant === "row" ? (
      <div className="wg-sheen relative flex items-start gap-3 rounded-xl px-4 py-3.5 transition-[background,box-shadow,transform] duration-200 group-hover:-translate-y-px group-hover:bg-[color-mix(in_srgb,var(--color-altus-red)_4%,transparent)] group-hover:shadow-[0_12px_30px_-22px_color-mix(in_srgb,var(--color-altus-red)_55%,transparent)]">
        {/* hover accent rail */}
        <span
          aria-hidden
          className="pointer-events-none absolute left-0 top-2.5 bottom-2.5 w-[3px] rounded-full opacity-0 transition-opacity duration-200 group-hover:opacity-100"
          style={{ background: "linear-gradient(180deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
        />
        {/* Drag handle — the keyboard-sortable activator. */}
        {canWrite && policy.canReorder && !dragDisabled && (
          <button
            type="button"
            ref={setActivatorNodeRef}
            {...attributes}
            {...listeners}
            aria-label={`Move "${goal.title}" - drag, or press space then arrows to reorder or reach a period pill`}
            className={`mt-2.5 shrink-0 cursor-grab touch-none rounded text-ink-subtle opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 active:cursor-grabbing max-md:opacity-100 ${FOCUS_RING}`}
          >
            <GripVertical size={17} />
          </button>
        )}

        {/* Progress ring — opens the drawer for everyone (writers edit,
            view-only opens it read-only). */}
        <button
          type="button"
          onClick={() => setEditing(true)}
          aria-label={
            canWrite && policy.canEditProgress
              ? `Update progress on "${goal.title}"`
              : `View "${goal.title}" (read-only)`
          }
          className={`shrink-0 rounded-full transition-transform hover:scale-105 ${FOCUS_RING}`}
        >
          <ProgressRing pct={eff} tone={tone} />
        </button>

        {/* Title + quiet metadata line */}
        <div className="min-w-0 flex-1 pt-0.5">
          <h3
            className="text-[15px] font-semibold leading-snug"
            style={{
              color: "var(--color-ink-strong)",
              letterSpacing: "-0.006em",
              textDecoration: crossed ? "line-through" : undefined,
            }}
          >
            {goal.title}
          </h3>

          <div
            className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[12.5px]"
            style={{ color: "var(--color-ink-subtle)" }}
          >
            <span className="inline-flex items-center gap-1 font-bold tabular-nums" style={{ color: origin.color }}>
              <Hash size={11} aria-hidden />
              {codeOf(goal)}
            </span>
            <span
              className="inline-flex items-center rounded-pill px-2 py-[1px] text-[11px] font-bold"
              style={{ background: cat.bg, color: cat.color }}
            >
              {cat.label}
            </span>
            <AssignmentChip info={assign} />
            {atRisk && (
              <span
                className="wg-pip-pop inline-flex items-center gap-1 rounded-pill px-2 py-[1px] text-[11px] font-bold"
                style={{ background: "color-mix(in srgb, var(--color-altus-red) 14%, transparent)", color: "var(--color-altus-red-deep)" }}
              >
                <AlertTriangle size={11} aria-hidden />
                At Risk
              </span>
            )}
            {goal.area && (
              <>
                <Sep />
                <span className="font-semibold" style={{ color: "var(--color-ink-soft)" }}>
                  {goal.area}
                </span>
              </>
            )}
            {goal.targetQty != null && (
              <>
                <Sep />
                <span className="tabular-nums">
                  Qty <b style={{ color: "var(--color-ink-soft)" }}>{fmtNum(goal.actualQty ?? 0)}</b>
                  <span style={{ opacity: 0.7 }}> / {fmtNum(goal.targetQty)}</span>
                  {goal.uom ? ` ${goal.uom}` : ""}
                </span>
              </>
            )}
            {goal.targetAmount != null && (
              <>
                <Sep />
                <span className="inline-flex items-center gap-0.5 tabular-nums">
                  <IndianRupee size={11} aria-hidden />
                  <b style={{ color: "var(--color-ink-soft)" }}>{fmtNum(goal.actualAmount ?? 0)}</b>
                  <span style={{ opacity: 0.7 }}>/ {fmtNum(goal.targetAmount)}</span>
                </span>
              </>
            )}
            {goal.teamInvolved && goal.teamInvolved.length > 0 && (
              <>
                <Sep />
                <span className="inline-flex items-center gap-1.5">
                  <TeamAvatarStack team={goal.teamInvolved as TeamMember[]} size={5} />
                  {goal.teamDependencyPct != null && (
                    <span className="tabular-nums">{goal.teamDependencyPct}% dep</span>
                  )}
                </span>
              </>
            )}
            {goal.monthlyMasterRef && (
              <>
                <Sep />
                <span className="inline-flex items-center gap-1 font-semibold" style={{ color: "var(--color-ink-soft)" }}>
                  <CalendarClock size={11} aria-hidden />
                  {goal.monthlyMasterRef.label}
                </span>
              </>
            )}
            {goalTakesTargetDate(goal.period) && goal.targetDate && (
              <>
                <Sep />
                <TargetDateChip iso={goal.targetDate} />
              </>
            )}
            {childCount > 0 && (
              <>
                <Sep />
                <span className="tabular-nums font-semibold" style={{ color: "var(--color-ink-soft)" }}>
                  → {childCount} {childLabel}
                </span>
              </>
            )}
            <Sep />
            <span style={{ color: origin.color }}>{origin.label}</span>
            {crossed && (
              <>
                <Sep />
                <span className="inline-flex items-center gap-1">
                  <Ban size={11} aria-hidden />
                  crossed out
                </span>
              </>
            )}
          </div>

          {/* Progress — a WORKING slider + an editable % (writers), else a
              read-only bar. */}
          {canWrite && policy.canEditProgress && !crossed ? (
            <div className="mt-2.5">
              <div className="flex items-center gap-2.5">
                <input
                  type="range"
                  min={0}
                  max={100}
                  step={1}
                  value={shownPct}
                  aria-label={`Progress ${shownPct}%`}
                  onChange={(e) => setProgDrag(Number(e.target.value))}
                  onPointerUp={(e) => commitPct(Number((e.currentTarget as HTMLInputElement).value))}
                  onKeyUp={(e) => commitPct(Number((e.currentTarget as HTMLInputElement).value))}
                  className={`h-2 flex-1 cursor-pointer ${FOCUS_RING}`}
                  style={{ accentColor: shownPct >= 100 ? "var(--color-green)" : "var(--color-altus-red)" }}
                />
                <div
                  className="inline-flex items-center gap-0.5 rounded-lg border px-2 py-1"
                  style={{ borderColor: "var(--color-hairline-strong)", background: "var(--color-surface-card)" }}
                >
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={shownPct}
                    aria-label="Percent done"
                    onChange={(e) => setProgDrag(e.target.value === "" ? 0 : Number(e.target.value))}
                    onBlur={(e) => commitPct(Number(e.target.value))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                    }}
                    className="w-[2.6rem] bg-transparent text-right text-[14px] font-bold tabular-nums text-ink-strong outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:m-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
                  />
                  <span className="text-[12.5px] font-bold text-ink-subtle">%</span>
                </div>
              </div>
              {/* One-tap actions — bigger, tappable. */}
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => save({ pctDone: 100 }, () => setGoalPctDone({ id: goal.id, pctDone: 100 }))}
                  className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-bold transition-transform hover:-translate-y-px ${FOCUS_RING}`}
                  style={
                    goal.pctDone === 100
                      ? { background: "linear-gradient(135deg, var(--color-green), var(--color-green-deep))", color: "#fff", boxShadow: "0 5px 12px -6px var(--color-green)" }
                      : { background: "color-mix(in srgb, var(--color-green) 12%, transparent)", color: "var(--color-green-deep)" }
                  }
                >
                  <CheckCheck size={14} aria-hidden /> Done
                </button>
                <button
                  type="button"
                  onClick={toggleAdopted}
                  className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-bold transition-transform hover:-translate-y-px ${FOCUS_RING}`}
                  style={{ background: "var(--color-surface-soft)", color: "var(--color-ink-soft)" }}
                >
                  <Ban size={14} aria-hidden /> Set aside
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] font-bold transition-colors hover:text-altus-red ${FOCUS_RING}`}
                  style={{ borderColor: "var(--color-hairline-strong)", color: "var(--color-ink-soft)" }}
                >
                  <Pencil size={13} aria-hidden /> Edit
                </button>
                {moreItems.length > 0 && <MoreMenu items={moreItems} />}
              </div>
            </div>
          ) : (
            <>
              <div
                className="mt-2 h-[6px] w-full max-w-[360px] overflow-hidden rounded-full"
                style={{ background: "color-mix(in srgb, var(--color-ink-strong) 7%, transparent)" }}
              >
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${barW}%`,
                    background:
                      eff >= 100
                        ? "linear-gradient(90deg, var(--color-green), var(--color-green-deep))"
                        : "linear-gradient(90deg, var(--color-altus-red), var(--color-altus-red-deep))",
                    transition: "width 0.7s cubic-bezier(0.22,1,0.36,1)",
                  }}
                />
              </div>
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                {canWrite && crossed && (
                  <button
                    type="button"
                    onClick={toggleAdopted}
                    className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-bold transition-transform hover:-translate-y-px ${FOCUS_RING}`}
                    style={{ background: "var(--color-surface-soft)", color: "var(--color-ink-soft)" }}
                  >
                    <CheckCircle2 size={14} aria-hidden /> Bring back
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className={`inline-flex cursor-pointer items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[12.5px] font-bold transition-colors hover:text-altus-red ${FOCUS_RING}`}
                  style={{ borderColor: "var(--color-hairline-strong)", color: "var(--color-ink-soft)" }}
                >
                  {canWrite ? <Pencil size={13} aria-hidden /> : <Eye size={13} aria-hidden />}
                  {canWrite ? "Edit" : "View"}
                </button>
                {canWrite && moreItems.length > 0 && <MoreMenu items={moreItems} />}
              </div>
            </>
          )}

          {goal.notes && (
            <p className="mt-1.5 text-[13px] leading-relaxed whitespace-pre-wrap" style={{ color: "var(--color-ink-soft)" }}>
              {goal.notes}
            </p>
          )}
          {goal.acceptPct != null && goal.acceptPct !== goal.pctDone && (
            <p className="mt-1 text-[11.5px] font-semibold" style={{ color: "var(--color-ink-subtle)" }}>
              Reported {goal.pctDone}% · accepted {goal.acceptPct}%
            </p>
          )}
        </div>

        {/* Right — just a save spinner now; Edit + ⋯ moved into the action strip. */}
        {mutation.pending && (
          <div className="shrink-0 pt-1">
            <Loader2 size={14} className="animate-spin" style={{ color: "var(--color-ink-subtle)" }} />
          </div>
        )}
      </div>
      ) : (
        /* ── KANBAN compact card body — same state, same drawers ── */
        <div className="p-3">
          <div className="flex items-start gap-2.5">
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label={
                canWrite && policy.canEditProgress
                  ? `Update progress on "${goal.title}"`
                  : `View "${goal.title}" (read-only)`
              }
              className={`shrink-0 rounded-full transition-transform hover:scale-105 ${FOCUS_RING}`}
            >
              <ProgressRing pct={eff} tone={tone} size={40} />
            </button>
            <button
              type="button"
              onClick={() => setEditing(true)}
              aria-label={`${canWrite ? "Edit" : "View"} "${goal.title}"`}
              className={`min-w-0 flex-1 cursor-pointer rounded-md text-left ${FOCUS_RING}`}
            >
              {/* Serial no. + dense code */}
              <div className="flex items-center gap-1.5">
                <span
                  className="inline-flex items-center rounded-md px-1 py-[1px] text-[9.5px] font-black tabular-nums"
                  style={{ background: "var(--color-surface-soft)", color: "var(--color-ink-soft)" }}
                >
                  #{srNo}
                </span>
                <span className="text-[11px] font-bold tabular-nums" style={{ color: origin.color }}>
                  {codeOf(goal)}
                </span>
              </div>
              <h3
                className="mt-0.5 overflow-hidden text-[13.5px] font-semibold leading-snug [display:-webkit-box] [-webkit-box-orient:vertical] [-webkit-line-clamp:3]"
                style={{
                  color: "var(--color-ink-strong)",
                  letterSpacing: "-0.004em",
                  textDecoration: crossed ? "line-through" : undefined,
                }}
              >
                {goal.title}
              </h3>
            </button>
          </div>

          {/* Progress bar + % done + pace-aware status — fills the card at a glance */}
          {!crossed && (
            <div className="mt-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11.5px] font-black tabular-nums" style={{ color: health.color }}>
                  {Math.round(eff)}%
                  <span className="ml-1 text-[10px] font-semibold" style={{ color: "var(--color-ink-subtle)" }}>done</span>
                </span>
                <span
                  className="inline-flex items-center rounded-pill px-1.5 py-[1px] text-[10px] font-bold"
                  style={{ background: health.bg, color: health.color }}
                >
                  {health.label}
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--color-hairline)" }}>
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${Math.min(100, barW)}%`,
                    background: `linear-gradient(90deg, ${health.color}, color-mix(in srgb, ${health.color} 72%, black))`,
                    transition: "width 0.5s cubic-bezier(0.22,1,0.36,1)",
                  }}
                />
              </div>
            </div>
          )}

          <div
            className="mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11.5px]"
            style={{ color: "var(--color-ink-subtle)" }}
          >
            <span
              className="inline-flex items-center rounded-pill px-1.5 py-[1px] text-[10.5px] font-bold"
              style={{ background: cat.bg, color: cat.color }}
            >
              {cat.label}
            </span>
            <AssignmentChip info={assign} />
            {goal.area && (
              <span className="max-w-[9rem] truncate font-semibold" style={{ color: "var(--color-ink-soft)" }}>
                {goal.area}
              </span>
            )}
            {goalTakesTargetDate(goal.period) && goal.targetDate && (
              <TargetDateChip iso={goal.targetDate} compact />
            )}
            {crossed && (
              <span className="inline-flex items-center gap-1">
                <Ban size={10} aria-hidden />
                crossed out
              </span>
            )}
          </div>

          <div className="mt-2 flex items-center justify-between gap-2">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate text-[11.5px] font-medium tabular-nums" style={{ color: "var(--color-ink-subtle)" }}>
                {goal.targetQty != null
                  ? `Qty ${fmtNum(goal.actualQty ?? 0)} / ${fmtNum(goal.targetQty)}${goal.uom ? ` ${goal.uom}` : ""}`
                  : goal.targetAmount != null
                    ? `₹ ${fmtNum(goal.actualAmount ?? 0)} / ${fmtNum(goal.targetAmount)}`
                    : ""}
              </span>
              {goal.delegatedTo && goal.delegatedTo.length > 0 && (
                <div
                  className="flex shrink-0 items-center -space-x-1.5"
                  title={`Delegated → ${goal.delegatedTo.map((d) => `${d.name ?? "-"} ${d.pct}%`).join(" · ")}`}
                >
                  {goal.delegatedTo.slice(0, 3).map((d) => (
                    <span
                      key={d.employeeId}
                      className="grid size-5 place-items-center rounded-full text-[8.5px] font-black text-white"
                      style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))", boxShadow: "0 0 0 1.5px var(--color-surface-card)" }}
                    >
                      {(d.name ?? "?").split(/\s+/).map((w) => w[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?"}
                    </span>
                  ))}
                  {goal.delegatedTo.length > 3 && (
                    <span
                      className="grid size-5 place-items-center rounded-full text-[8px] font-bold text-white"
                      style={{ background: "var(--color-ink-subtle)", boxShadow: "0 0 0 1.5px var(--color-surface-card)" }}
                    >
                      +{goal.delegatedTo.length - 3}
                    </span>
                  )}
                </div>
              )}
            </div>
            <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100 max-md:opacity-100">
              {mutation.pending && (
                <Loader2 size={12} className="animate-spin" style={{ color: "var(--color-ink-subtle)" }} />
              )}
              <RowAction
                onClick={() => setEditing(true)}
                label={canWrite ? "Edit" : "View"}
                icon={canWrite ? <Pencil size={13} /> : <Eye size={13} />}
                compact
              />
              {moreItems.length > 0 && <MoreMenu items={moreItems} />}
            </div>
          </div>
        </div>
      )}

      {/* ── EDIT DRAWER — progress · what · targets · team ──
          Rendered for EVERYONE: writers edit, view-only viewers get the same
          drawer with every control disabled (read-only affordance, policy). */}
      <WeeklyGoalDrawer
        open={editing}
        onClose={() => setEditing(false)}
        eyebrow={`Goal ${srNo} · ${periodKeyLabel(goal.periodKey)}`}
        title={goal.title}
        footer={
          <div className="flex items-center justify-between gap-3">
            <span className="text-[12.5px] font-medium" style={{ color: "var(--color-ink-subtle)" }}>
              {ro ? "View only - this board is read-only for you" : "Changes save automatically"}
            </span>
            <button
              type="button"
              onClick={() => setEditing(false)}
              className={`wg-btn inline-flex items-center gap-1.5 rounded-pill px-5 py-2.5 text-[14px] font-bold text-white ${FOCUS_RING}`}
              style={{ background: "var(--color-altus-red)" }}
            >
              {ro ? "Close" : "Done"}
            </button>
          </div>
        }
      >
          <div className="grid gap-6">
            {/* Assignment — Self-created / Assigned by … (quiet, information-rich). */}
            <div
              className="flex flex-wrap items-center gap-2 rounded-xl px-3 py-2.5"
              style={{ background: "var(--color-surface-soft)", border: "1px solid var(--color-hairline)" }}
            >
              <span className="text-[11px] font-black uppercase tracking-[0.12em]" style={{ color: "var(--color-ink-subtle)" }}>
                Assignment
              </span>
              <AssignmentChip info={assign} />
              <AssignmentLine info={assign} />
            </div>

            <FieldGroup title="Progress">
              <Field label="How done is it?">
                <ProgressControl
                  value={goal.pctDone}
                  disabled={ro || !policy.canEditProgress}
                  onCommit={(p) => save({ pctDone: p }, () => setGoalPctDone({ id: goal.id, pctDone: p }))}
                />
              </Field>
              <Field label="Notes">
                <AutoTextarea
                  value={goal.notes ?? ""}
                  disabled={ro || !policy.canEditNotes}
                  placeholder="Plan / approach / working notes…"
                  onCommit={(v) => save({ notes: v || null }, () => editGoal({ id: goal.id, notes: v || null }))}
                />
              </Field>
              {goal.acceptPct != null && (
                <p className="rounded-lg px-3 py-2 text-[13px] font-semibold" style={{ background: "var(--color-surface-soft)", color: "var(--color-ink-soft)" }}>
                  Manager accepted <b className="tabular-nums">{goal.acceptPct}%</b>
                  {goal.reviewNotes ? ` - “${goal.reviewNotes}”` : ""}
                </p>
              )}
            </FieldGroup>

            <FieldGroup title="What & where">
              <Field label="Goal">
                <AutoTextarea
                  value={goal.title}
                  disabled={ro}
                  placeholder="What does done look like?"
                  onCommit={(v) => {
                    if (!v.trim()) return; // title is required — ignore an empty commit
                    save({ title: v.trim() }, () => editGoal({ id: goal.id, title: v.trim() }));
                  }}
                />
              </Field>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Area">
                  <ComboInput
                    value={goal.area ?? ""}
                    options={areaOptions}
                    disabled={ro}
                    placeholder="Area / function…"
                    onCommit={(v) => save({ area: v || null }, () => editGoal({ id: goal.id, area: v || null }))}
                  />
                </Field>
                <Field label="Category">
                  <Select
                    value={goal.category}
                    disabled={ro}
                    onValueChange={(v) => {
                      const c = v as (typeof GOAL_CATEGORIES)[number];
                      save({ category: c }, () => setGoalCategory({ id: goal.id, category: c }));
                    }}
                    ariaLabel="Goal category"
                    searchable={false}
                    options={GOAL_CATEGORIES.map((c) => ({ value: c, label: categoryStyle(c, false).label }))}
                  />
                </Field>
              </div>
              {/* Target date — MONTH goals only (year/quarter roll up from children). */}
              {goal.period === "month" && (
                <Field label="Target Date">
                  <div className="flex flex-wrap items-center gap-2">
                    <DateInput
                      value={goal.targetDate ?? ""}
                      disabled={ro}
                      ariaLabel="Target date"
                      onChange={(iso) => {
                        const v = iso || null;
                        if (v !== (goal.targetDate ?? null))
                          save({ targetDate: v }, () => editGoal({ id: goal.id, targetDate: v }));
                      }}
                      className={`w-48 rounded-md border border-hairline bg-white px-2.5 py-2 text-[14px] font-medium text-ink-strong focus:border-altus-red/50 disabled:opacity-60 disabled:bg-surface-soft ${FOCUS_RING}`}
                    />
                    {goal.targetDate && <TargetDateChip iso={goal.targetDate} />}
                  </div>
                </Field>
              )}
            </FieldGroup>

            <FieldGroup title="Monthly Master">
              <MonthlyMasterField
                value={goal.monthlyMasterRef}
                disabled={ro}
                onCommit={(ref) =>
                  save({ monthlyMasterRef: ref }, () => editGoal({ id: goal.id, monthlyMasterRef: ref }))
                }
              />
              <p className="text-[12px] font-medium" style={{ color: "var(--color-ink-subtle)" }}>
                Link this goal to one event or task from the Monthly Events Master.
              </p>
            </FieldGroup>

            <FieldGroup title="Team involved">
              <TeamPicker
                team={goal.teamInvolved ?? []}
                roster={roster}
                disabled={ro}
                onCommit={(team) => save({ teamInvolved: team.length ? team : null }, () => setGoalTeam({ id: goal.id, team }))}
              />
              <Field label="Dependency on the Team (%)">
                <input
                  type="number"
                  min={0}
                  max={100}
                  defaultValue={goal.teamDependencyPct ?? ""}
                  disabled={ro}
                  onBlur={(e) => {
                    const raw = e.target.value;
                    const v = raw === "" ? null : Math.max(0, Math.min(100, Math.round(Number(raw) || 0)));
                    if (v !== goal.teamDependencyPct)
                      save({ teamDependencyPct: v }, () => editGoal({ id: goal.id, teamDependencyPct: v }));
                  }}
                  className={`w-28 rounded-md border border-hairline bg-white px-2.5 py-2 text-[14px] font-bold tabular-nums text-ink-strong focus:border-altus-red/50 disabled:opacity-60 disabled:bg-surface-soft ${FOCUS_RING}`}
                />
              </Field>
            </FieldGroup>
          </div>
      </WeeklyGoalDrawer>

      {/* ── MOVE TO… DRAWER — cross-level re-home (structure) + sibling buckets ── */}
      {canWrite && (
        <MoveGoalDrawer
          open={moving}
          onClose={() => setMoving(false)}
          goal={goal}
          policy={policy}
          fyStartYear={fyStartYear}
          mutation={mutation}
        />
      )}

      {/* ── ALSO ADD TO… DRAWER — same picker, but COPIES (original stays) ── */}
      {canWrite && (
        <MoveGoalDrawer
          mode="copy"
          open={copying}
          onClose={() => setCopying(false)}
          goal={goal}
          policy={policy}
          fyStartYear={fyStartYear}
          mutation={mutation}
        />
      )}
    </div>
  );
}

export const GoalBoardCard = React.memo(GoalBoardCardImpl);

/* ------------------------------------------------------------------ */
/* Small pieces                                                        */
/* ------------------------------------------------------------------ */

function Sep() {
  return <span aria-hidden style={{ opacity: 0.5 }}>·</span>;
}

/** Deadline chip — calendar icon + formatted date, coloured by how close/overdue.
 *  Rendered only for month/week goals that carry a target date. */
export function TargetDateChip({ iso, compact }: { iso: string; compact?: boolean }) {
  const st = targetDateStatus(iso);
  if (st.daysLeft == null) return null;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full font-bold tabular-nums ${compact ? "px-1.5 py-[1px] text-[10.5px]" : "px-2 py-[1px] text-[11px]"}`}
      style={{ background: `color-mix(in srgb, ${st.color} 12%, transparent)`, color: st.color }}
      title={`Target date ${fmtTargetDate(iso)} · ${st.label}`}
    >
      <CalendarClock size={compact ? 10 : 11} aria-hidden />
      {fmtTargetDate(iso)}
      <span style={{ opacity: 0.85 }}>· {st.label}</span>
    </span>
  );
}

/** The circular effective-% ring at the start of each row (weekly-board look).
 *  `size` shrinks it for the compact Kanban cards. */
export function ProgressRing({ pct, tone, size = 44 }: { pct: number; tone: string; size?: number }) {
  const stroke = size >= 44 ? 4 : 3.5;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-surface-track)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={`var(--color-${tone})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          strokeDashoffset={circ * (1 - p / 100)}
          style={{ transition: "stroke-dashoffset 0.55s cubic-bezier(0.22,1,0.36,1)" }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span
          className="font-black tabular-nums"
          style={{ fontFamily: "var(--font-display)", fontSize: size >= 44 ? 12 : 10.5, color: `var(--color-${tone}-deep)` }}
        >
          {p}
        </span>
      </div>
    </div>
  );
}

/** Quiet secondary row action (Edit / View). Deliberately NOT `.brand-btn`
 *  (which force-fills solid red via !important): these are hover-revealed row
 *  utilities, and the red fill made the hover state read washed-out/dead.
 *  Hover = crisp: card-white fill, red-tinted border, strong ink. */
function RowAction({
  onClick,
  label,
  icon,
  compact,
}: {
  onClick: () => void;
  label: string;
  icon: React.ReactNode;
  /** Icon-only (Kanban cards) — the label stays as title + aria-label. */
  compact?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className={`wg-btn inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12.5px] font-bold transition-colors bg-surface-soft border-hairline-strong text-ink-soft hover:bg-surface-card hover:text-ink-strong hover:border-[color-mix(in_srgb,var(--color-altus-red)_45%,var(--color-hairline-strong))] ${FOCUS_RING}`}
    >
      {icon}
      {!compact && <span className="max-md:hidden">{label}</span>}
    </button>
  );
}

interface MoreItem {
  key: string;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  danger?: boolean;
}

/**
 * The card's ⋯ menu — Radix DropdownMenu, PORTALLED to the body. The old
 * hand-rolled absolutely-positioned menu lived INSIDE the card list's
 * `overflow-hidden rounded-2xl` container, so it was clipped at the list edge
 * (last items invisible) and fought sibling rows' Edit/⋯ buttons for stacking.
 * Portalling + Radix collision handling gives us: never clipped, flips upward
 * near the viewport bottom, internal scroll when long, full keyboard nav
 * (arrows/Home/End/typeahead), Escape-to-close with focus returned to the
 * trigger — for free.
 */
function MoreMenu({ items }: { items: MoreItem[] }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          aria-label="More actions"
          className={`wg-btn inline-flex size-8 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-[var(--color-surface-soft)] data-[state=open]:bg-[var(--color-surface-soft)] data-[state=open]:text-ink-strong ${FOCUS_RING}`}
        >
          <MoreHorizontal size={18} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        sideOffset={6}
        className="z-[150] min-w-[230px] max-h-[min(20rem,var(--radix-dropdown-menu-content-available-height))]"
      >
        {items.map((it) => (
          <DropdownMenuItem
            key={it.key}
            danger={it.danger}
            onSelect={() => it.onClick()}
            className="gap-2.5 px-3 py-2 text-[13.5px] font-bold"
          >
            {it.icon} {it.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function FieldGroup({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3">
      <h3 className="text-[11px] font-black uppercase tracking-[0.12em]" style={{ color: "var(--color-ink-subtle)" }}>
        {title}
      </h3>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[12.5px] font-bold text-ink-soft">{label}</span>
      {children}
    </label>
  );
}

/** numeric(14,2) editor — GoalDTO money fields round-trip as strings. */
function MoneyInput({
  value,
  disabled,
  onCommit,
}: {
  value: string | null;
  disabled?: boolean;
  onCommit: (v: string | null) => void;
}) {
  const shown = num(value);
  return (
    <input
      type="number"
      step="any"
      defaultValue={shown ?? ""}
      disabled={disabled}
      onBlur={(e) => {
        const raw = e.target.value.trim();
        const next = raw === "" ? null : Number.isFinite(Number(raw)) ? Number(raw).toFixed(2) : null;
        const prev = shown == null ? null : shown.toFixed(2);
        if (next !== prev) onCommit(next);
      }}
      className={`w-full rounded-md border border-hairline bg-white px-2.5 py-2 text-[14px] font-bold tabular-nums text-ink-strong focus:border-altus-red/50 disabled:opacity-60 disabled:bg-surface-soft ${FOCUS_RING}`}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Monthly Master picker — link the goal to ONE obligation / batch from  */
/* the Monthly Events Master (listGoalMasterPickables). The pick is       */
/* persisted as a {kind,id,label} snapshot (goal.monthlyMasterRef) so the */
/* chip renders without re-joining the events tables.                     */
/* ------------------------------------------------------------------ */

type MasterPickable = { kind: "obligation" | "batch"; id: string; label: string };

/** Module-level cache so re-opening drawers doesn't refetch the (small) list.
 *  Cleared on failure so a later open can retry. */
let masterPickablesCache: Promise<MasterPickable[]> | null = null;
function loadMasterPickables(): Promise<MasterPickable[]> {
  if (!masterPickablesCache) {
    masterPickablesCache = listGoalMasterPickables()
      .then((res) => (res.ok ? res.items : []))
      .catch(() => {
        masterPickablesCache = null;
        return [];
      });
  }
  return masterPickablesCache;
}

const MASTER_KIND_LABEL: Record<string, string> = { obligation: "Obligation", batch: "Batch" };

export function MonthlyMasterField({
  value,
  disabled,
  onCommit,
}: {
  value: MonthlyMasterRef | null;
  disabled?: boolean;
  onCommit: (ref: MonthlyMasterRef | null) => void;
}) {
  const [items, setItems] = React.useState<MasterPickable[] | null>(null);
  const [loading, setLoading] = React.useState(false);

  // The drawer mounts its body only while open, so this fetch fires once per
  // open of a WRITABLE drawer (read-only viewers just see the chip, if any).
  React.useEffect(() => {
    if (disabled || items != null || loading) return;
    setLoading(true);
    void loadMasterPickables()
      .then(setItems)
      .finally(() => setLoading(false));
  }, [disabled, items, loading]);

  if (value) {
    return (
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-[13px] font-semibold"
          style={{ borderColor: "var(--color-hairline-strong)", background: "var(--color-surface-soft)", color: "var(--color-ink-strong)" }}
        >
          <CalendarClock size={13} aria-hidden style={{ color: "var(--color-altus-red)" }} />
          <span className="text-[11px] font-bold uppercase tracking-wide" style={{ color: "var(--color-ink-subtle)" }}>
            {MASTER_KIND_LABEL[value.kind] ?? value.kind}
          </span>
          {value.label}
          {!disabled && (
            <button
              type="button"
              onClick={() => onCommit(null)}
              aria-label={`Unlink ${value.label}`}
              className={`rounded-full text-ink-subtle hover:text-altus-red cursor-pointer ${FOCUS_RING}`}
            >
              <X size={13} />
            </button>
          )}
        </span>
      </div>
    );
  }

  return (
    <Select
      value=""
      onValueChange={(v) => {
        const it = (items ?? []).find((x) => `${x.kind}:${x.id}` === v);
        if (it) onCommit({ kind: it.kind, id: it.id, label: it.label });
      }}
      searchable
      searchPlaceholder="Search events / tasks…"
      ariaLabel="Pick a Monthly Master event or task"
      placeholder={loading ? "Loading…" : "Pick an event / task…"}
      disabled={disabled}
      options={(items ?? []).map((it) => ({
        value: `${it.kind}:${it.id}`,
        label: `${MASTER_KIND_LABEL[it.kind] ?? it.kind} · ${it.label}`,
      }))}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Incentive — Yes/No, then amount + type. Persisted on the goal via     */
/* editGoal (incentiveEnabled / incentiveAmount / incentiveKind).        */
/* ------------------------------------------------------------------ */

type IncentiveKind = "one_time" | "repetitive" | "milestone";
type IncentivePatch = {
  incentiveEnabled?: boolean;
  incentiveAmount?: string | null;
  incentiveKind?: IncentiveKind | null;
};

const INCENTIVE_KIND_OPTIONS: Array<{ value: IncentiveKind; label: string }> = [
  { value: "one_time", label: "One-time" },
  { value: "repetitive", label: "Repetitive / Recurring" },
  { value: "milestone", label: "Milestone" },
];

export function IncentiveField({
  enabled,
  amount,
  kind,
  disabled,
  onCommit,
}: {
  enabled: boolean;
  amount: string | null;
  kind: string | null;
  disabled?: boolean;
  onCommit: (fields: IncentivePatch) => void;
}) {
  return (
    <div className="grid gap-3">
      <div>
        <span className="mb-1.5 flex items-center gap-1.5 text-[12.5px] font-bold text-ink-soft">
          <Gift size={13} aria-hidden style={{ color: "var(--color-altus-red)" }} />
          Incentive
        </span>
        <div className="inline-flex overflow-hidden rounded-full border" style={{ borderColor: "var(--color-hairline-strong)" }} role="group" aria-label="Incentive on this goal">
          {[
            { on: true, label: "Yes" },
            { on: false, label: "No" },
          ].map((opt) => {
            const active = enabled === opt.on;
            return (
              <button
                key={opt.label}
                type="button"
                disabled={disabled}
                aria-pressed={active}
                onClick={() =>
                  onCommit(
                    opt.on
                      ? { incentiveEnabled: true }
                      : { incentiveEnabled: false, incentiveAmount: null, incentiveKind: null },
                  )
                }
                className={`px-4 py-1.5 text-[13.5px] font-bold transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${FOCUS_RING}`}
                style={
                  active
                    ? { background: "var(--color-altus-red)", color: "#fff" }
                    : { background: "var(--color-surface-card)", color: "var(--color-ink-soft)" }
                }
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {enabled && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="How Much (₹)">
            <MoneyInput
              value={amount}
              disabled={disabled}
              onCommit={(v) => onCommit({ incentiveAmount: v })}
            />
          </Field>
          <Field label="Type">
            <Select
              value={kind ?? ""}
              onValueChange={(v) => onCommit({ incentiveKind: v as IncentiveKind })}
              searchable={false}
              ariaLabel="Incentive type"
              placeholder="Choose type…"
              disabled={disabled}
              options={INCENTIVE_KIND_OPTIONS}
            />
          </Field>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Team picker — roster chips + free-text names → setGoalTeam           */
/* ------------------------------------------------------------------ */

function TeamPicker({
  team,
  roster,
  disabled = false,
  onCommit,
}: {
  team: Array<{ employeeId?: string; name?: string }>;
  roster: RosterMember[];
  /** Read-only mode — chips render, add/remove controls don't. */
  disabled?: boolean;
  onCommit: (team: Array<{ employeeId?: string; name?: string }>) => void;
}) {
  const [free, setFree] = React.useState("");
  const nameOf = (m: { employeeId?: string; name?: string }) =>
    m.name ?? roster.find((r) => r.id === m.employeeId)?.name ?? "Member";

  function add(member: { employeeId?: string; name?: string }) {
    const exists = team.some(
      (t) => (member.employeeId && t.employeeId === member.employeeId) || (member.name && t.name === member.name),
    );
    if (exists) return;
    onCommit([...team, member]);
  }
  function removeAt(i: number) {
    onCommit(team.filter((_, idx) => idx !== i));
  }

  return (
    <div className="grid gap-2.5">
      {team.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {team.map((m, i) => (
            <span
              key={`${m.employeeId ?? m.name ?? i}`}
              className="inline-flex items-center gap-1.5 rounded-pill border px-2.5 py-1 text-[13px] font-semibold"
              style={{ borderColor: "var(--color-hairline-strong)", background: "var(--color-surface-soft)", color: "var(--color-ink-strong)" }}
            >
              {nameOf(m)}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeAt(i)}
                  aria-label={`Remove ${nameOf(m)}`}
                  className={`rounded-full text-ink-subtle hover:text-altus-red cursor-pointer ${FOCUS_RING}`}
                >
                  <X size={13} />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
      {disabled && team.length === 0 && (
        <p className="text-[13px] font-medium" style={{ color: "var(--color-ink-subtle)" }}>
          No team members tagged.
        </p>
      )}
      {!disabled && (
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-[220px]">
          <Select
            value=""
            onValueChange={(id) => {
              const m = roster.find((r) => r.id === id);
              if (m) add({ employeeId: m.id, name: m.name });
            }}
            searchable
            searchPlaceholder="Search people…"
            ariaLabel="Add a team member"
            placeholder="Add from team…"
            options={roster.map((r) => ({ value: r.id, label: r.name }))}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <input
            value={free}
            onChange={(e) => setFree(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && free.trim()) {
                e.preventDefault();
                add({ name: free.trim() });
                setFree("");
              }
            }}
            placeholder="Or type a name…"
            aria-label="Add a team member by name"
            className={`w-40 rounded-md border border-hairline bg-white px-2.5 py-2 text-[14px] font-medium text-ink-strong focus:border-altus-red/50 ${FOCUS_RING}`}
          />
          <button
            type="button"
            onClick={() => {
              if (!free.trim()) return;
              add({ name: free.trim() });
              setFree("");
            }}
            aria-label="Add typed name to team"
            className={`inline-flex size-8 items-center justify-center rounded-lg border text-ink-soft hover:text-ink-strong cursor-pointer ${FOCUS_RING}`}
            style={{ borderColor: "var(--color-hairline-strong)" }}
          >
            <Plus size={15} strokeWidth={2.6} />
          </button>
        </div>
      </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Move to… — the keyboard/cross-level companion to the bucket drag     */
/* (year/quarter/month re-home in-table; WEEK/DAY cross tables via      */
/* moveGoalAcross — ritual stamps never fabricated, card removes).      */
/* ------------------------------------------------------------------ */

type MoveLevel = GoalPeriod | "week" | "day";

const MOVE_LEVELS: ReadonlyArray<{ level: MoveLevel; label: string }> = [
  { level: "year", label: "Year" },
  { level: "quarter", label: "Quarter" },
  { level: "month", label: "Month" },
  { level: "week", label: "Week" },
  { level: "day", label: "Day" },
];

function todayKey(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/**
 * Smart DEFAULT bucket when hopping levels (the canvas level-drop rule, owned
 * by the board now and built on the shared lib helpers): a month goal → its
 * OWNING quarter; otherwise the CURRENT bucket clamped into the goal's FY
 * (a quarter source prefers its own months); week → the current Monday;
 * day → today. Always adjustable in the picker below.
 */
function smartBucketFor(g: GoalDTO, level: MoveLevel, fy: number): string {
  const now = new Date();
  if (level === "year") return String(fy);
  if (level === "quarter") {
    if (g.period === "month") return quarterKeyOfMonthKey(g.periodKey);
    const nowQ = quarterKey(now);
    return fyStartYearOfKey(nowQ) === fy ? nowQ : `${fy}-Q1`;
  }
  if (level === "month") {
    const nowM = monthKey(now);
    if (g.period === "quarter") {
      const own = monthKeysOfQuarter(fy, quarterOfKey(g.periodKey));
      return own.includes(nowM) ? nowM : (own[0] ?? nowM);
    }
    return fyStartYearOfMonthKey(nowM) === fy ? nowM : (monthKeysOfQuarter(fy, 1)[0] ?? nowM);
  }
  if (level === "week") return currentWeekStart();
  return todayKey();
}

function moveBucketsOf(level: MoveLevel, fyStartYear: number): Array<{ value: string; label: string }> {
  if (level === "year") return [{ value: String(fyStartYear), label: periodKeyLabel(String(fyStartYear)) }];
  if (level === "quarter") return quartersOfFy(fyStartYear).map((k) => ({ value: k, label: periodKeyLabel(k) }));
  if (level === "month") return monthKeysOfFy(fyStartYear).map((k) => ({ value: k, label: periodKeyLabel(k) }));
  if (level === "week")
    return fyWeeks(fyStartYear).map((w) => ({ value: w.mondayISO, label: `W${w.weekNo} · ${formatWeekShort(w.mondayISO)}` }));
  return []; // day — free date input
}

function MoveGoalDrawer({
  open,
  onClose,
  goal,
  policy,
  fyStartYear,
  mutation,
  mode = "move",
}: {
  open: boolean;
  onClose: () => void;
  goal: GoalDTO;
  policy: GoalPolicy;
  fyStartYear: number;
  mutation: GoalMutationApi;
  /** "move" relocates the goal; "copy" leaves the original and adds a twin. */
  mode?: "move" | "copy";
}) {
  const router = useRouter();
  const isCopy = mode === "copy";
  const [level, setLevel] = React.useState<MoveLevel>(goal.period);
  const [key, setKey] = React.useState(goal.periodKey);
  const [busy, setBusy] = React.useState(false);
  React.useEffect(() => {
    if (open) {
      setLevel(goal.period);
      setKey(goal.periodKey);
    }
  }, [open, goal.period, goal.periodKey]);

  const canRehome = policy.canRehomeLevel;
  const buckets = moveBucketsOf(level, fyStartYear);
  const keyShapeOk = level === "week" || level === "day" ? /^\d{4}-\d{2}-\d{2}$/.test(key) : key.length > 0;
  const samePlace = level === goal.period && key === goal.periodKey;

  function pickLevel(lvl: MoveLevel) {
    if (!canRehome && lvl !== goal.period) return;
    setLevel(lvl);
    if (lvl === "day") {
      setKey(todayKey());
      return;
    }
    if (lvl === goal.period) {
      setKey(goal.periodKey);
      return;
    }
    // Level hop → the smart default (owning quarter / current bucket in-FY /
    // current week), clamped to the actual option list.
    const next = moveBucketsOf(lvl, fyStartYear);
    const smart = smartBucketFor(goal, lvl, fyStartYear);
    setKey(next.some((b) => b.value === smart) ? smart : (next[0]?.value ?? ""));
  }

  function commitMove() {
    if (busy || !keyShapeOk) return;
    if (!isCopy && samePlace) return; // a move to the same place is a no-op
    if (!canRehome && level !== goal.period) return; // structure — the server enforces the same line

    // ── COPY — leave the original, add an independent twin in the target ──
    if (isCopy) {
      const label =
        level === "week"
          ? `week of ${formatWeekShort(key)}`
          : level === "day"
            ? `the ${key} day plan`
            : periodKeyLabel(key);
      setBusy(true);
      void copyGoalToPeriod({ id: goal.id, targetLevel: level, targetKey: key })
        .then((res) => {
          setBusy(false);
          if (!res.ok) {
            fireToast({ message: res.error, type: "error" });
            return;
          }
          fireToast({ message: `Added a copy to ${label} - the original stays here`, type: "success" });
          router.refresh(); // surface it if the target is the current board
          onClose();
        })
        .catch(() => {
          setBusy(false);
          fireToast({ message: "Couldn't add the copy.", type: "error" });
        });
      return;
    }

    setBusy(true);
    /** Success path — brief toast with a live [Undo] (≈5s, sonner default). */
    const done = (ok: boolean, label: string, undo?: () => void) => {
      setBusy(false);
      if (!ok) return; // mutate already toasted the error
      fireToast({ message: `Moved to ${label}`, type: "success", actionLabel: "Undo", action: undo });
      onClose();
    };

    // WEEK/DAY — cross-table convert: the source row archives, the card removes.
    // Undo = undoConvertGoal (un-archive + retire the created twin + re-attach
    // the detached children) — the exact inverse the server provides.
    if (level === "week" || level === "day") {
      const label = level === "week" ? `week of ${formatWeekShort(key)}` : `the ${key} day plan`;
      let result: MoveAcrossResult | null = null;
      void mutation
        .mutate({ type: "remove", id: goal.id }, async () => {
          const res = await moveGoalAcross({ id: goal.id, targetLevel: level, bucketKey: key });
          result = res;
          return res.ok ? { ok: true, rows: res.rows } : res;
        })
        .then((ok) => {
          const res = result;
          const undo =
            ok && res && res.ok && res.kind !== "goal"
              ? () => {
                  void mutation
                    .mutate({ type: "insert", row: goal }, () =>
                      undoConvertGoal({
                        goalId: goal.id,
                        weeklyId: res.kind === "weekly" ? res.weeklyRow.id : null,
                        dailyItemId: res.kind === "daily" ? res.dailyItem.id : null,
                        reattachChildIds: res.rows.map((r) => r.id),
                      }),
                    )
                    .then((undone) => {
                      if (undone)
                        fireToast({
                          message: `Restored "${goal.title}" to ${periodKeyLabel(goal.periodKey)}`,
                          type: "success",
                        });
                    });
                }
              : undefined;
          done(ok, label, undo);
        });
      return;
    }

    // Same level → sibling-bucket re-quarter (owner-open); different level →
    // structure re-home. Optimistic period/periodKey flip; the returned row
    // reconciles the server's re-parent + fresh Sr. No.
    const action =
      level === goal.period
        ? () => moveGoalToPeriod({ id: goal.id, periodKey: key })
        : () => moveGoalToLevel({ id: goal.id, targetPeriod: level, targetPeriodKey: key });
    const from = {
      period: goal.period,
      periodKey: goal.periodKey,
      parentGoalId: goal.parentGoalId,
      position: goal.position,
      source: goal.source,
    };
    const undo = () => {
      void mutation
        .mutate({ type: "update", id: goal.id, fields: from }, () =>
          moveGoalAcross({ id: goal.id, targetLevel: from.period, bucketKey: from.periodKey }),
        )
        .then((undone) => {
          if (undone)
            fireToast({ message: `Moved "${goal.title}" back to ${periodKeyLabel(from.periodKey)}`, type: "success" });
        });
    };
    void mutation
      .mutate(
        { type: "update", id: goal.id, fields: { period: level, periodKey: key, position: 9_999 } },
        action,
      )
      .then((ok) => done(ok, periodKeyLabel(key), undo));
  }

  return (
    <WeeklyGoalDrawer
      open={open}
      onClose={onClose}
      eyebrow={isCopy ? "Add a copy" : "Move goal"}
      title={goal.title}
      footer={
        <div className="flex items-center justify-between gap-3">
          <span className="text-[12.5px] font-medium" style={{ color: "var(--color-ink-subtle)" }}>
            {isCopy
              ? "The original stays - a copy is added"
              : canRehome
                ? "Pick a level and a bucket"
                : "You can move it between sibling buckets"}
          </span>
          <button
            type="button"
            onClick={commitMove}
            disabled={(!isCopy && samePlace) || busy || !keyShapeOk}
            className={`wg-btn inline-flex items-center gap-1.5 rounded-pill px-5 py-2.5 text-[14px] font-bold text-white disabled:opacity-50 disabled:cursor-not-allowed ${FOCUS_RING}`}
            style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            {isCopy ? "Add copy" : "Move"}
          </button>
        </div>
      }
    >
      <div className="grid gap-5">
        <div>
          <span className="mb-1.5 block text-[12.5px] font-bold text-ink-soft">Level</span>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Target level">
            {MOVE_LEVELS.map((l) => {
              const active = level === l.level;
              const disabled = !canRehome && l.level !== goal.period;
              return (
                <button
                  key={l.level}
                  type="button"
                  disabled={disabled}
                  title={disabled ? POLICY_REASONS.rehomeLevel : undefined}
                  aria-pressed={active}
                  onClick={() => pickLevel(l.level)}
                  className={`rounded-pill border px-3.5 py-1.5 text-[13.5px] font-bold transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer ${FOCUS_RING}`}
                  style={
                    active
                      ? { background: "var(--color-altus-red)", borderColor: "var(--color-altus-red)", color: "#fff" }
                      : { borderColor: "var(--color-hairline-strong)", color: "var(--color-ink-soft)", background: "var(--color-surface-card)" }
                  }
                >
                  {l.label}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <span className="mb-1.5 block text-[12.5px] font-bold text-ink-soft">Bucket</span>
          {level === "day" ? (
            <DateInput
              value={key}
              onChange={setKey}
              ariaLabel="Target day"
              className={`rounded-md border border-hairline bg-white px-2.5 py-2 text-[14px] font-semibold tabular-nums text-ink-strong focus:border-altus-red/50 ${FOCUS_RING}`}
            />
          ) : (
            <Select
              value={key}
              onValueChange={setKey}
              ariaLabel="Target bucket"
              searchable={level === "week" || level === "month"}
              options={buckets}
            />
          )}
        </div>

        {isCopy ? (
          <p className="rounded-lg px-3 py-2 text-[12.5px] font-semibold" style={{ background: "var(--color-surface-soft)", color: "var(--color-ink-subtle)" }}>
            Adds an independent copy to {level === "week" ? "that week (Weekly board)" : level === "day" ? "that day plan (Plan-Your-Day)" : "that period"} - the original
            stays right here. The copy has its own progress; edit it on its own.
          </p>
        ) : (level === "week" || level === "day") && (
          <p className="rounded-lg px-3 py-2 text-[12.5px] font-semibold" style={{ background: "var(--color-surface-soft)", color: "var(--color-ink-subtle)" }}>
            Moving {level === "week" ? "into a week" : "into a day plan"} converts the goal - it leaves this board and
            appears {level === "week" ? "on the Weekly board (uncommitted, ready for the Saturday ritual)" : "in Plan-Your-Day"}.
          </p>
        )}
      </div>
    </WeeklyGoalDrawer>
  );
}