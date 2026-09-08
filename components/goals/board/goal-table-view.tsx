"use client";

/**
 * GoalTableView — the Goals level-board list as a prominent, outlined,
 * inline-editable table with a sticky bulk-actions bar.
 *
 * Every cell edits in place (Area / Measure / Type dropdowns, Target vs Actual
 * number boxes, a tone-coloured % Done slider, Team % box, Team-member picker,
 * Share-with-team pill) and commits straight to the cascade server actions.
 * Row selection powers the red glass bulk bar (delete · share · copy-to-quarter).
 *
 * Brand: Altus tokens only — no raw Tailwind palette. Motion is transform/
 * opacity only and reduced-motion-gated (wg-* utilities are already gated).
 */

import * as React from "react";
import { createPortal } from "react-dom";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import type { Route } from "next";
import * as Dialog from "@radix-ui/react-dialog";
import * as Tooltip from "@radix-ui/react-tooltip";
import {
  ArrowRightLeft,
  CalendarDays,
  Check,
  ChevronDown,
  Copy,
  Flag,
  ListChecks,
  Minus,
  Pencil,
  Plus,
  Search,
  Split,
  Trash2,
  UserPlus,
  Users,
  X,
} from "lucide-react";
import { GoalDetailRow } from "@/components/goals/board/goal-detail-row";
import { NotesCell, AttachmentsCell } from "@/components/goals/board/notes-files-cell";
import { GoalEditDialog } from "@/components/goals/cascade/goal-edit-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  setGoalPctDone,
  editGoal,
  archiveGoal,
  divideYearlyGoal,
  moveGoalToPeriod,
  bulkArchiveGoals,
  bulkCopyGoalsToPeriod,
  detectCopyCollisions,
} from "@/app/(app)/goals/cascade/actions";
import { GoalLookupSelect } from "@/components/goals/board/goal-lookup-select";
import { GoalPreview } from "@/components/goals/shared/goal-preview";
import { GoalDetailPopup } from "@/components/goals/shared/goal-detail-popup";
import { useGoalGridEngine, type GridColumn } from "@/components/goals/board/goal-grid";
import { Select } from "@/components/ui/select";
import { DateInput } from "@/components/ui/date-input";
import { ADMIN_TASK_STATUSES, USER_TASK_STATUSES, GOAL_TYPES, GOAL_TYPE_LABELS, type TaskStatus, type GoalType } from "@/db/enums";
import { pctTone, fmtNum, num, periodKeyLabel, periodKeyShort, goalCode, trimDecimal, targetDateStatus, fmtTargetDate, assignmentInfo } from "@/components/goals/cascade/util";
import { CalendarClock } from "lucide-react";
import { AssignmentChip } from "@/components/goals/board/assignment-chip";
import type { GoalDTO, RosterMember } from "@/components/goals/cascade/util";
import { autoPctDone } from "@/lib/goals/auto-pct";
import {
  quartersOfFy,
  monthKeysOfQuarter,
  monthKeysOfFy,
  quarterOfKey,
  fyStartYearOfKey,
  fyStartYearOfMonthKey,
} from "@/lib/goals/types";
import { weeksOfMonth } from "@/lib/goals/fy-calendar";
import { addDays, formatWeekShort } from "@/lib/weekly-goals/week";
import { fireToast } from "@/lib/toast";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

export type GoalTableActionRes = { ok: true } | { ok: false; error: string };

/** The inline table's mutation surface — swappable so the SAME table can drive
 *  the cascade `goals` engine (default) or the `weekly_goals` engine. */
export interface GoalTableActions {
  editGoal: (input: Record<string, unknown> & { id: string }) => Promise<GoalTableActionRes>;
  setGoalPctDone: (input: { id: string; pctDone: number }) => Promise<GoalTableActionRes>;
  archiveGoal: (input: { id: string }) => Promise<GoalTableActionRes>;
  bulkArchiveGoals: (input: { ids: string[] }) => Promise<GoalTableActionRes>;
}

const CASCADE_ACTIONS: GoalTableActions = {
  editGoal: (input) => editGoal(input as Parameters<typeof editGoal>[0]),
  setGoalPctDone: (input) => setGoalPctDone(input),
  archiveGoal: (input) => archiveGoal(input),
  bulkArchiveGoals: (input) => bulkArchiveGoals(input),
};

export interface GoalTableViewProps {
  goals: GoalDTO[];
  canWrite: boolean;
  isAdmin: boolean;
  roster: RosterMember[];
  areaOptions: string[];
  measureOptions: string[];
  typeOptions: string[];
  /** Goal-Type taxonomy options (base + admin-added). When supplied, the inline
   *  Type cell becomes an add/delete managed dropdown (#194); when omitted it
   *  falls back to the fixed built-in taxonomy. */
  goaltypeOptions?: string[];
  customLookups: { areas: string[]; measures: string[]; types: string[]; goaltypes?: string[] };
  /** "Part of Project?" pickers (mig 0184) — drive the Project column's name
   *  lookup and its typed-name matching. Optional: without them the column still
   *  reads Yes/No, it just can't resolve a name. */
  projects?: { id: string; name: string }[];
  vendors?: { id: string; name: string }[];
  fyStartYear: number;
  /** Stable dense goal code from the board's single rank source. When omitted
   *  (e.g. the weekly board) the table falls back to its own row-index code. */
  codeOf?: (g: GoalDTO) => string;
  /** Resolves the goal owner's display name for the shared detail view. Optional:
   *  the boards that know their roster pass it, the rest simply omit the row. */
  ownerNameOf?: (g: GoalDTO) => string | null;
  level: "year" | "quarter" | "month" | "week" | "day";
  /** "weekly" drives the weekly_goals engine: hides Share/Type + copy/divide,
   *  makes the Goal title inline-editable, uses the weekly detail node kind. */
  variant?: "cascade" | "weekly";
  /** Mutation surface — defaults to the cascade goals actions. */
  actions?: GoalTableActions;
  /** Detail row (Notes/Attachments) node kind — "cascade" (default) or "weekly". */
  detailKind?: "cascade" | "weekly";
  /** Which OPTIONAL columns to show — the toolbar's Columns picker. Keys:
   *  "measure" | "actual" | "teamPct" | "delegate" | "type" | "notes".
   *  Omitted → falls back to the simplified table's original fixed set
   *  (type + notes visible, the rest hidden) so every other caller is
   *  unaffected. Area / Goal are never optional — they're structural,
   *  not pickable. */
  visibleCols?: Set<string>;
  /** Left-to-right order for every column after Area/Goal (Target and
   *  % Done included) — the ColumnsPicker's drag order. Omitted →
   *  REORDERABLE_COLUMNS' declared order (today's fixed layout). */
  colOrder?: string[];
  /** Called with the new column order when a HEADER CELL is dragged to a
   *  new position — dragging the actual table headers, not just the
   *  Columns picker's list, reorders live the same way. Omitted → headers
   *  aren't draggable (read-only order). */
  onColOrderChange?: (next: string[]) => void;
}

type ActionRes = { ok: true } | { ok: false; error: string };

const FOCUS_RING =
  "outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/60 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--color-surface-soft)]";

const redTint = (pct: number) => `color-mix(in srgb, var(--color-altus-red) ${pct}%, transparent)`;

/* ------------------------------------------------------------------ */
/* Small primitives                                                    */
/* ------------------------------------------------------------------ */

/** Hand-rolled brand checkbox (native inputs can't take the red tint cleanly). */
function BrandCheck({
  checked,
  indeterminate,
  onToggle,
  label,
}: {
  checked: boolean;
  indeterminate?: boolean;
  onToggle: () => void;
  label: string;
}) {
  const on = checked || indeterminate;
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? "mixed" : checked}
      aria-label={label}
      onClick={onToggle}
      className={cn(
        "grid size-[18px] shrink-0 place-items-center rounded-[5px] border transition-colors",
        FOCUS_RING,
      )}
      style={{
        borderColor: on ? "var(--color-altus-red)" : "var(--color-ink-soft)",
        borderWidth: on ? 1 : 2,
        background: on ? "var(--color-altus-red)" : "var(--color-surface-card)",
      }}
    >
      {indeterminate ? (
        <Minus size={12} strokeWidth={3.2} className="text-white" />
      ) : checked ? (
        <Check size={12} strokeWidth={3.2} className="text-white" />
      ) : null}
    </button>
  );
}

/** Number text-box that keeps a local draft and commits on blur / Enter. */
function NumBox({
  value,
  onCommit,
  disabled,
  ariaLabel,
  placeholder,
  className,
  min,
  max,
}: {
  value: string;
  onCommit: (raw: string) => void;
  disabled: boolean;
  ariaLabel: string;
  placeholder?: string;
  className?: string;
  min?: number;
  max?: number;
}) {
  const [draft, setDraft] = React.useState(value);
  React.useEffect(() => setDraft(value), [value]);

  function commit() {
    const v = draft.trim();
    if (v === value.trim()) return;
    onCommit(v);
  }

  return (
    <input
      type="number"
      inputMode="decimal"
      value={draft}
      min={min}
      max={max}
      disabled={disabled}
      aria-label={ariaLabel}
      placeholder={placeholder ?? "-"}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
          (e.target as HTMLInputElement).blur();
        } else if (e.key === "Escape") {
          setDraft(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
      className={cn(
        "h-6 rounded-md border-0 bg-transparent px-1.5 text-left text-[12.5px] font-semibold text-ink-strong tabular-nums transition-colors hover:bg-black/[0.04] focus:bg-black/[0.06]",
        "disabled:cursor-not-allowed disabled:opacity-60",
        "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
        FOCUS_RING,
        className,
      )}
      style={{ fontFamily: "var(--font-display)" }}
    />
  );
}

/** Inline single-line TEXT cell (Goal title). Keeps a local draft and commits on
 *  blur / Enter; Esc reverts. Same commit contract as NumBox so every editable
 *  cell behaves identically (Enter = save · Esc = cancel · blur = auto-save). */
function TextCell({
  value,
  onCommit,
  disabled,
  ariaLabel,
  placeholder,
  className,
  multiline,
}: {
  value: string;
  onCommit: (v: string) => void;
  disabled: boolean;
  ariaLabel: string;
  placeholder?: string;
  className?: string;
  /** When true, render a wrapping, auto-growing textarea so the FULL goal text
   *  is always visible (no truncation). Enter still commits; the text wraps on
   *  its own — no manual newlines needed. */
  multiline?: boolean;
}) {
  const [draft, setDraft] = React.useState(value);
  React.useEffect(() => setDraft(value), [value]);

  const taRef = React.useRef<HTMLTextAreaElement | null>(null);
  // Auto-grow: match the textarea height to its content on every change/mount.
  const autoGrow = React.useCallback(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, []);
  React.useEffect(() => {
    if (multiline) autoGrow();
  }, [multiline, draft, autoGrow]);

  function commit() {
    const v = draft.trim();
    if (v === value.trim()) return;
    onCommit(v);
  }

  const shared = {
    value: draft,
    disabled,
    "aria-label": ariaLabel,
    placeholder,
    onBlur: commit,
  } as const;

  if (multiline) {
    return (
      <textarea
        {...shared}
        style={{ borderColor: "var(--color-hairline-strong)" }}
        ref={taRef}
        rows={1}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          // Enter commits (like the single-line cell); Shift+Enter is ignored so
          // the value stays a clean single logical line that simply wraps.
          if (e.key === "Enter") {
            e.preventDefault();
            commit();
            (e.target as HTMLTextAreaElement).blur();
          } else if (e.key === "Escape") {
            setDraft(value);
            (e.target as HTMLTextAreaElement).blur();
          }
        }}
        className={cn(
          "w-full resize-none overflow-hidden rounded-md border bg-white px-2 py-0.5 text-[13px] font-bold leading-snug text-ink-strong focus:border-altus-red disabled:opacity-60 [font-family:var(--font-display)]",
          FOCUS_RING,
          className,
        )}
      />
    );
  }

  return (
    <input
      {...shared}
      type="text"
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          commit();
          (e.target as HTMLInputElement).blur();
        } else if (e.key === "Escape") {
          setDraft(value);
          (e.target as HTMLInputElement).blur();
        }
      }}
      className={cn(
        // Plain text until focused — no boxed input chrome for a value that's
        // read far more often than it's edited. A border + white fill appear
        // only while actually typing, so it still reads as an editable cell.
        "w-full rounded-md border border-transparent bg-transparent px-2 py-0.5 text-[13px] font-bold text-ink-strong focus:border-altus-red focus:bg-white disabled:opacity-60 [font-family:var(--font-display)]",
        FOCUS_RING,
        className,
      )}
    />
  );
}

/* ------------------------------------------------------------------ */
/* Cell: Status — inline dropdown over the app's Task statuses          */
/* ------------------------------------------------------------------ */

/** Human label for a Task status enum value (live set + legacy verdicts). */
const STATUS_LABEL: Partial<Record<TaskStatus, string>> = {
  dont_know: "Not assessed",
  not_started: "Not started",
  initiated: "In progress",
  follow_up: "Follow-up",
  need_help: "Need help",
  on_hold: "On hold",
  need_info: "Need info",
  done: "Done",
  approved: "Approved",
  not_approved: "Not approved",
  cancelled: "Cancelled",
  transferred: "Transferred",
};

function statusLabel(s: string): string {
  return (
    STATUS_LABEL[s as TaskStatus] ??
    s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase())
  );
}

/** A quiet band colour for the status dot (done = green · active = amber · else grey). */
function statusColor(s: string): string {
  if (s === "done" || s === "approved") return "#15803d";
  if (s === "not_started" || s === "dont_know" || s === "not_approved" || s === "cancelled")
    return "var(--color-ink-soft)";
  return "#b45309";
}

/** Inline Status dropdown. Built on the shared `Select` primitive so it inherits
 *  the keyboard-first flow (type-ahead first-match highlight, ↑/↓, Enter/Tab to
 *  commit + advance, Esc to close). Admins see every live status; others see the
 *  user-settable set. The row's CURRENT value is always included. */
function StatusCell({
  value,
  isAdmin,
  disabled,
  onCommit,
}: {
  value: string;
  isAdmin: boolean;
  disabled: boolean;
  onCommit: (status: TaskStatus) => void;
}) {
  const base = (isAdmin ? ADMIN_TASK_STATUSES : USER_TASK_STATUSES) as readonly TaskStatus[];
  const options = React.useMemo(() => {
    const set = new Set<string>(base);
    // Keep a legacy/out-of-set current value visible so it never silently drops.
    const list = value && !set.has(value) ? [value as TaskStatus, ...base] : [...base];
    return list.map((s) => ({ value: s, label: statusLabel(s) }));
  }, [base, value]);

  return (
    <div className={cn("flex items-center gap-1.5", disabled && "pointer-events-none opacity-60")}>
      <span
        aria-hidden
        className="size-2 shrink-0 rounded-full"
        style={{ background: statusColor(value || "not_started") }}
      />
      <Select
        value={value || "not_started"}
        onValueChange={(v) => {
          if (!disabled && v !== value) onCommit(v as TaskStatus);
        }}
        disabled={disabled}
        ariaLabel="Status"
        unstyled
        className="min-w-0 flex-1 cursor-pointer gap-1 text-[13px] font-semibold text-ink-strong hover:text-altus-red"
        options={options}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Cell: Reviewer — inline roster dropdown → reviewedById              */
/* ------------------------------------------------------------------ */

const REVIEWER_NONE = "__none__";

/** Inline Reviewer picker (writes goals.reviewed_by_id). Reuses `Select` for the
 *  keyboard-first flow; a leading "No reviewer" option clears the field. */
function ReviewerCell({
  reviewedById,
  roster,
  disabled,
  onCommit,
}: {
  reviewedById: string | null | undefined;
  roster: RosterMember[];
  disabled: boolean;
  onCommit: (id: string | null) => void;
}) {
  const options = React.useMemo(
    () => [
      { value: REVIEWER_NONE, label: "No reviewer" },
      ...roster.map((r) => ({ value: r.id, label: r.name })),
    ],
    [roster],
  );
  const current = reviewedById ?? REVIEWER_NONE;

  return (
    <div className={cn(disabled && "pointer-events-none opacity-60")}>
      <Select
        value={current}
        onValueChange={(v) => {
          const next = v === REVIEWER_NONE ? null : v;
          if (!disabled && next !== (reviewedById ?? null)) onCommit(next);
        }}
        disabled={disabled}
        searchable
        searchPlaceholder="Search people…"
        placeholder="No reviewer"
        ariaLabel="Reviewer"
        unstyled
        className="w-full cursor-pointer gap-1 text-[13px] font-semibold text-ink-strong hover:text-altus-red"
        options={options}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Cell: % Done — tone slider + number box                             */
/* ------------------------------------------------------------------ */

function PctCell({
  pct,
  disabled,
  auto,
  onCommit,
}: {
  pct: number;
  disabled: boolean;
  /** True when Target/Actual drive this % — the box is read-only + auto-computed. */
  auto?: boolean;
  onCommit: (pct: number) => void;
}) {
  const tone = pctTone(pct);

  // Auto-derived (Actual ÷ Target): show it as a bold, tone-coloured figure —
  // no input box, no pill — so it reads as a computed result, not an edit field.
  if (auto) {
    return (
      <div
        className="flex items-baseline justify-start gap-0.5"
        title="Auto-calculated from Actual ÷ Target"
      >
        <span
          className="tabular-nums font-black leading-none"
          style={{ color: tone.color, fontFamily: "var(--font-display)", fontSize: 13 }}
        >
          {pct}
        </span>
        <span className="text-[13px] font-black" style={{ color: tone.color }}>
          %
        </span>
      </div>
    );
  }

  return (
    <div className="flex items-center justify-start gap-0.5">
      <NumBox
        value={String(pct)}
        min={0}
        max={100}
        disabled={disabled}
        ariaLabel="Percent done"
        onCommit={(raw) => {
          const n = Math.max(0, Math.min(100, Math.round(Number(raw) || 0)));
          if (n !== pct) onCommit(n);
        }}
        className="w-[46px]"
      />
      <span
        className="inline-flex h-5 min-w-5 items-center justify-center rounded-pill px-1 text-[12px] font-bold tabular-nums"
        style={{ color: tone.color, background: tone.bg }}
      >
        %
      </span>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Cell: Team members — name chips + roster popover                    */
/* ------------------------------------------------------------------ */

type TeamRef = { employeeId?: string; name?: string; weight?: number };

function memberKey(m: TeamRef): string {
  return m.employeeId ?? `name:${(m.name ?? "").toLowerCase()}`;
}

function TeamMembersCell({
  team,
  roster,
  disabled,
  onCommit,
}: {
  team: TeamRef[] | null;
  roster: RosterMember[];
  disabled: boolean;
  onCommit: (next: TeamRef[] | null) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const list = team ?? [];
  const picked = React.useMemo(() => new Set(list.map(memberKey)), [list]);

  // Type-a-name-to-filter, mirroring DelegatesCell — the search box autofocuses
  // on open, ↑/↓ + Home/End move the highlight, Enter toggles it, Esc closes. A
  // grid `data-grid-seed` (if opened via type-to-edit) primes the first char.
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? roster.filter((r) => r.name.toLowerCase().includes(q)) : roster;
  }, [roster, query]);

  React.useEffect(() => {
    if (open) {
      const seed = triggerRef.current?.getAttribute("data-grid-seed") ?? "";
      triggerRef.current?.removeAttribute("data-grid-seed");
      setQuery(seed);
      setActive(0);
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [open]);
  React.useEffect(() => {
    setActive((a) => Math.min(Math.max(0, a), Math.max(0, filtered.length - 1)));
  }, [filtered.length]);
  React.useEffect(() => {
    if (open) listRef.current?.querySelector<HTMLElement>(`[data-mem-opt="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function focusOwner() {
    const cell = triggerRef.current?.closest<HTMLElement>('[role="gridcell"]');
    (cell ?? triggerRef.current)?.focus();
  }
  function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(filtered.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Home") { e.preventDefault(); setActive(0); }
    else if (e.key === "End") { e.preventDefault(); setActive(Math.max(0, filtered.length - 1)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      const r = filtered[active];
      if (r) toggle(r);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      requestAnimationFrame(focusOwner);
    }
  }

  function isPicked(r: RosterMember): boolean {
    return picked.has(r.id) || list.some((m) => !m.employeeId && (m.name ?? "").toLowerCase() === r.name.toLowerCase());
  }
  function toggle(member: RosterMember) {
    const key = member.id;
    const next = isPicked(member)
      ? list.filter(
          (m) => m.employeeId !== key && !(m.employeeId == null && (m.name ?? "").toLowerCase() === member.name.toLowerCase()),
        )
      : [...list, { employeeId: member.id, name: member.name, weight: 100 }];
    onCommit(next.length ? next : null);
  }
  function setWeight(member: RosterMember, w: number) {
    onCommit(
      list.map((m) =>
        m.employeeId === member.id || (!m.employeeId && (m.name ?? "").toLowerCase() === member.name.toLowerCase())
          ? { ...m, weight: w }
          : m,
      ),
    );
  }

  const shown = list.slice(0, 2);
  const extra = list.length - shown.length;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {shown.map((m) => (
        <span
          key={memberKey(m)}
          title={`${m.name}${m.weight != null ? ` · weight ${m.weight}` : ""}`}
          className="inline-flex max-w-[112px] items-center gap-1 truncate rounded-pill border px-1.5 py-0.5 text-[11px] font-semibold text-ink-strong"
          style={{ borderColor: "var(--color-hairline)", background: "var(--color-surface-soft)" }}
        >
          <span
            aria-hidden
            className="grid size-3.5 shrink-0 place-items-center rounded-full text-[8px] font-bold text-white"
            style={{ background: "var(--color-altus-red-deep)" }}
          >
            {(m.name ?? "?").trim().charAt(0).toUpperCase()}
          </span>
          <span className="truncate">{m.name ?? "-"}</span>
          {m.weight != null && (
            <span className="tabular-nums font-bold text-altus-red-deep">·{m.weight}</span>
          )}
        </span>
      ))}
      {extra > 0 && (
        <span
          className="inline-flex items-center rounded-pill px-1.5 py-0.5 text-[11px] font-bold tabular-nums text-altus-red-deep"
          style={{ background: redTint(10) }}
          title={list.slice(2).map((m) => `${m.name} (wt ${m.weight ?? "-"})`).join(", ")}
        >
          +{extra}
        </span>
      )}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            ref={triggerRef}
            type="button"
            disabled={disabled}
            aria-label="Edit team members + weights"
            className={cn(
              "inline-flex h-6 items-center gap-1 rounded-pill border px-2 text-[11px] font-bold text-ink-soft transition-colors hover:border-altus-red hover:text-altus-red",
              "disabled:cursor-not-allowed disabled:opacity-60",
              FOCUS_RING,
            )}
            style={{ borderColor: "var(--color-hairline-strong)" }}
          >
            <Plus size={11} strokeWidth={3} /> Member
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={6}
          onCloseAutoFocus={(e) => { e.preventDefault(); focusOwner(); }}
          className="z-[80] w-72 rounded-xl border border-hairline bg-surface-card p-1.5"
          style={{ boxShadow: "0 18px 44px -18px rgba(15,23,42,0.3)" }}
        >
          <p className="flex items-center gap-1.5 px-2.5 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-subtle">
            <Users size={12} /> Members &amp; weights
          </p>
          {/* Type-a-name-to-filter — autofocused; ↑/↓ move the highlight, Enter toggles. */}
          <div className="px-1 pb-1.5">
            <div className="flex items-center gap-2 rounded-lg border border-hairline bg-white/70 px-2.5">
              <Search size={14} className="shrink-0 text-ink-subtle" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setActive(0); }}
                onKeyDown={onSearchKeyDown}
                placeholder="Local search - people" title="Local search - filters only the list on this page" aria-label="Local search - people - this page only"
                className="h-8 w-full bg-transparent text-[13px] font-medium text-ink-strong outline-none placeholder:text-ink-subtle"
              />
            </div>
          </div>
          <div ref={listRef} className="max-h-64 overflow-auto" role="listbox">
            {filtered.map((r, i) => {
              const isSel = isPicked(r);
              const isActive = i === active;
              const mine = list.find(
                (m) => m.employeeId === r.id || (!m.employeeId && (m.name ?? "").toLowerCase() === r.name.toLowerCase()),
              );
              return (
                <div
                  key={r.id}
                  className={cn("flex items-center gap-2 rounded-lg px-2.5 py-1.5 transition-colors", isSel || isActive ? "" : "hover:bg-black/[0.04]")}
                  style={isSel ? { background: redTint(10) } : isActive ? { background: redTint(6) } : undefined}
                >
                  <button
                    type="button"
                    data-mem-opt={i}
                    role="option"
                    aria-selected={isActive}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => toggle(r)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <span className="inline-flex w-4 shrink-0 justify-center">
                      {isSel && <Check size={14} strokeWidth={3} className="text-altus-red" />}
                    </span>
                    <span className={cn("min-w-0 flex-1 truncate text-[13px]", isSel ? "font-bold text-altus-red-deep" : "text-ink-strong")}>
                      {r.name}
                    </span>
                  </button>
                  {isSel && (
                    <label className="flex shrink-0 items-center gap-1">
                      <span className="text-[10px] font-bold uppercase text-ink-subtle">wt</span>
                      <input
                        type="number"
                        min={0}
                        max={1000}
                        value={mine?.weight ?? 100}
                        onChange={(e) => {
                          const raw = e.target.value.trim();
                          const w = raw === "" ? 0 : Math.max(0, Math.min(1000, Math.round(Number(raw) || 0)));
                          setWeight(r, w);
                        }}
                        aria-label={`Weight for ${r.name}`}
                        className={cn(
                          "h-7 w-[56px] rounded-md border bg-white px-1.5 text-right text-[12.5px] font-bold tabular-nums text-ink-strong focus:border-altus-red",
                          "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
                          FOCUS_RING,
                        )}
                        style={{ borderColor: "var(--color-hairline-strong)", fontFamily: "var(--font-display)" }}
                      />
                    </label>
                  )}
                </div>
              );
            })}
            {filtered.length === 0 && (
              <p className="px-3 py-4 text-center text-[12.5px] text-ink-subtle">
                {roster.length === 0 ? "No roster." : "No matches."}
              </p>
            )}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Bulk: + Members — the Members picker applied to every selected goal */
/* ------------------------------------------------------------------ */

function BulkMembers({
  roster,
  count,
  onApply,
}: {
  roster: RosterMember[];
  count: number;
  onApply: (team: TeamRef[]) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [list, setList] = React.useState<TeamRef[]>([]);

  const matches = (m: TeamRef, r: RosterMember) =>
    m.employeeId === r.id || (!m.employeeId && (m.name ?? "").toLowerCase() === r.name.toLowerCase());
  const isPicked = (r: RosterMember) => list.some((m) => matches(m, r));

  function toggle(r: RosterMember) {
    setList((prev) =>
      prev.some((m) => matches(m, r))
        ? prev.filter((m) => !matches(m, r))
        : [...prev, { employeeId: r.id, name: r.name, weight: 100 }],
    );
  }
  function setWeight(r: RosterMember, w: number) {
    setList((prev) => prev.map((m) => (matches(m, r) ? { ...m, weight: w } : m)));
  }
  function apply() {
    onApply(list);
    setOpen(false);
    setList([]);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(MENU_BTN, FOCUS_RING)}
        >
          <Users size={13} /> + Members
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="z-[80] w-72 rounded-xl border border-hairline bg-surface-card p-1.5"
        style={{ boxShadow: "0 18px 44px -18px rgba(15,23,42,0.3)" }}
      >
        <p className="flex items-center gap-1.5 px-2.5 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-subtle">
          <Users size={12} /> Members &amp; weights · {count} selected
        </p>
        <div className="max-h-64 overflow-auto">
          {roster.map((r) => {
            const sel = isPicked(r);
            const mine = list.find((m) => matches(m, r));
            return (
              <div
                key={r.id}
                className={cn("flex items-center gap-2 rounded-lg px-2.5 py-1.5 transition-colors", sel ? "" : "hover:bg-black/[0.04]")}
                style={sel ? { background: redTint(10) } : undefined}
              >
                <button type="button" onClick={() => toggle(r)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                  <span className="inline-flex w-4 shrink-0 justify-center">
                    {sel && <Check size={14} strokeWidth={3} className="text-altus-red" />}
                  </span>
                  <span className={cn("min-w-0 flex-1 truncate text-[13px]", sel ? "font-bold text-altus-red-deep" : "text-ink-strong")}>
                    {r.name}
                  </span>
                </button>
                {sel && (
                  <label className="flex shrink-0 items-center gap-1">
                    <span className="text-[10px] font-bold uppercase text-ink-subtle">wt</span>
                    <input
                      type="number"
                      min={0}
                      max={1000}
                      value={mine?.weight ?? 100}
                      onChange={(e) => {
                        const raw = e.target.value.trim();
                        const w = raw === "" ? 0 : Math.max(0, Math.min(1000, Math.round(Number(raw) || 0)));
                        setWeight(r, w);
                      }}
                      aria-label={`Weight for ${r.name}`}
                      className={cn(
                        "h-7 w-[56px] rounded-md border bg-white px-1.5 text-right text-[12.5px] font-bold tabular-nums text-ink-strong focus:border-altus-red",
                        "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
                        FOCUS_RING,
                      )}
                      style={{ borderColor: "var(--color-hairline-strong)", fontFamily: "var(--font-display)" }}
                    />
                  </label>
                )}
              </div>
            );
          })}
          {roster.length === 0 && <p className="px-3 py-4 text-center text-[12.5px] text-ink-subtle">No roster.</p>}
        </div>
        <div className="mt-1 flex items-center justify-between gap-2 border-t px-2.5 pt-2" style={{ borderColor: "var(--color-hairline)" }}>
          <span className="text-[11.5px] font-semibold text-ink-subtle tabular-nums">{list.length} picked</span>
          <button
            type="button"
            onClick={apply}
            className={cn("inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-bold text-white", FOCUS_RING)}
            style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
          >
            Apply to {count} goal{count === 1 ? "" : "s"}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/* ------------------------------------------------------------------ */
/* Cell: Delegates — accountability hand-off (mig 0171). Name chips     */
/* each with an inline % (default 100), + a roster popover to add/drop.  */
/* Distinct from Members: a delegate is answerable for the goal; picking */
/* one instantly surfaces the goal on their own board (getSharedGoals).  */
/* ------------------------------------------------------------------ */

type DelegRef = { employeeId: string; name?: string; pct: number };

function DelegatesCell({
  delegates,
  roster,
  disabled,
  onCommit,
}: {
  delegates: DelegRef[] | null;
  roster: RosterMember[];
  disabled: boolean;
  onCommit: (next: DelegRef[] | null) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const triggerRef = React.useRef<HTMLButtonElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);
  const list = delegates ?? [];
  const picked = React.useMemo(() => new Set(list.map((d) => d.employeeId)), [list]);

  // Hover preview — same pattern as AttachmentsCell: hovering the cell shows
  // every delegate (or "No delegate assigned"), independent of the click-to-
  // pick Popover below.
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const [previewPos, setPreviewPos] = React.useState<{ left: number; top: number } | null>(null);
  const hideTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelHide = () => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };
  const showPreview = () => {
    cancelHide();
    const r = wrapRef.current?.getBoundingClientRect();
    if (!r) return;
    const vw = typeof window !== "undefined" ? window.innerWidth : 1280;
    setPreviewPos({ left: Math.min(Math.max(12, r.left), vw - 300), top: r.bottom + 6 });
  };
  const scheduleHidePreview = () => {
    cancelHide();
    hideTimer.current = setTimeout(() => setPreviewPos(null), 150);
  };

  // Type-a-name-to-filter: the search box always holds focus while open, the
  // first match is auto-highlighted, ↑/↓ + Home/End move it, Enter toggles the
  // highlighted person, Esc closes. When the grid opens us via type-to-edit it
  // stamps the typed char on the trigger as `data-grid-seed` — consume it so the
  // first keystroke primes the filter instead of being dropped.
  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? roster.filter((r) => r.name.toLowerCase().includes(q)) : roster;
  }, [roster, query]);

  React.useEffect(() => {
    if (open) {
      const seed = triggerRef.current?.getAttribute("data-grid-seed") ?? "";
      triggerRef.current?.removeAttribute("data-grid-seed");
      setQuery(seed);
      setActive(0);
      requestAnimationFrame(() => searchRef.current?.focus());
    }
  }, [open]);
  React.useEffect(() => {
    setActive((a) => Math.min(Math.max(0, a), Math.max(0, filtered.length - 1)));
  }, [filtered.length]);
  React.useEffect(() => {
    if (open) listRef.current?.querySelector<HTMLElement>(`[data-deleg-opt="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active, open]);

  function focusOwner() {
    const cell = triggerRef.current?.closest<HTMLElement>('[role="gridcell"]');
    (cell ?? triggerRef.current)?.focus();
  }
  function onSearchKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(filtered.length - 1, a + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
    else if (e.key === "Home") { e.preventDefault(); setActive(0); }
    else if (e.key === "End") { e.preventDefault(); setActive(Math.max(0, filtered.length - 1)); }
    else if (e.key === "Enter") {
      e.preventDefault();
      const r = filtered[active];
      if (r) toggle(r); // toggle keeps the panel open so several can be picked in a row
    } else if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      requestAnimationFrame(focusOwner);
    }
  }

  function toggle(member: RosterMember) {
    const next = picked.has(member.id)
      ? list.filter((d) => d.employeeId !== member.id)
      : [...list, { employeeId: member.id, name: member.name, pct: 100 }];
    onCommit(next.length ? next : null);
  }
  function setPct(member: RosterMember, p: number) {
    onCommit(list.map((d) => (d.employeeId === member.id ? { ...d, pct: p } : d)));
  }

  return (
    <div
      ref={wrapRef}
      className="flex flex-wrap items-center gap-1"
      onMouseEnter={showPreview}
      onMouseLeave={scheduleHidePreview}
    >
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            ref={triggerRef}
            type="button"
            disabled={disabled}
            aria-label={list.length > 0 ? `${list.length} delegate${list.length === 1 ? "" : "s"} - click to edit` : "Delegate to team"}
            className={cn(
              "inline-flex items-center justify-center rounded-md p-0.5 transition-colors hover:text-altus-red",
              "disabled:cursor-not-allowed disabled:opacity-60",
              FOCUS_RING,
            )}
          >
            <UserPlus size={14} strokeWidth={2.4} className={list.length > 0 ? "text-altus-red-deep" : "text-ink-subtle"} />
          </button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          sideOffset={6}
          // Esc / click-away returns focus to the owning grid cell so arrow-nav resumes.
          onCloseAutoFocus={(e) => { e.preventDefault(); focusOwner(); }}
          className="z-[80] w-72 rounded-xl border border-hairline bg-surface-card p-1.5"
          style={{ boxShadow: "0 18px 44px -18px rgba(15,23,42,0.3)" }}
        >
          <p className="flex items-center gap-1.5 px-2.5 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-subtle">
            <UserPlus size={12} /> Delegate &amp; share %
          </p>
          {/* Type-a-name-to-filter — autofocused; ↑/↓ move the highlight, Enter toggles. */}
          <div className="px-1 pb-1.5">
            <div className="flex items-center gap-2 rounded-lg border border-hairline bg-white/70 px-2.5">
              <Search size={14} className="shrink-0 text-ink-subtle" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => { setQuery(e.target.value); setActive(0); }}
                onKeyDown={onSearchKeyDown}
                placeholder="Local search - people" title="Local search - filters only the list on this page" aria-label="Local search - people - this page only"
                className="h-8 w-full bg-transparent text-[13px] font-medium text-ink-strong outline-none placeholder:text-ink-subtle"
              />
            </div>
          </div>
          <div ref={listRef} className="max-h-64 overflow-auto" role="listbox">
            {filtered.map((r, i) => {
              const isSel = picked.has(r.id);
              const isActive = i === active;
              const mine = list.find((d) => d.employeeId === r.id);
              return (
                <div
                  key={r.id}
                  className={cn("flex items-center gap-2 rounded-lg px-2.5 py-1.5 transition-colors", isSel || isActive ? "" : "hover:bg-black/[0.04]")}
                  style={isSel ? { background: redTint(10) } : isActive ? { background: redTint(6) } : undefined}
                >
                  <button
                    type="button"
                    data-deleg-opt={i}
                    role="option"
                    aria-selected={isActive}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => toggle(r)}
                    className="flex min-w-0 flex-1 items-center gap-2 text-left"
                  >
                    <span className="inline-flex w-4 shrink-0 justify-center">
                      {isSel && <Check size={14} strokeWidth={3} className="text-altus-red" />}
                    </span>
                    <span className={cn("min-w-0 flex-1 truncate text-[13px]", isSel ? "font-bold text-altus-red-deep" : "text-ink-strong")}>
                      {r.name}
                    </span>
                  </button>
                  {isSel && (
                    <label className="flex shrink-0 items-center gap-1">
                      <input
                        type="number"
                        min={0}
                        max={100}
                        value={mine?.pct ?? 100}
                        onChange={(e) => {
                          const raw = e.target.value.trim();
                          const p = raw === "" ? 0 : Math.max(0, Math.min(100, Math.round(Number(raw) || 0)));
                          setPct(r, p);
                        }}
                        aria-label={`Delegation percent for ${r.name}`}
                        className={cn(
                          "h-7 w-[56px] rounded-md border bg-white px-1.5 text-right text-[12.5px] font-bold tabular-nums text-ink-strong focus:border-altus-red",
                          "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
                          FOCUS_RING,
                        )}
                        style={{ borderColor: "var(--color-hairline-strong)", fontFamily: "var(--font-display)" }}
                      />
                      <span className="text-[10px] font-bold text-ink-subtle">%</span>
                    </label>
                  )}
                </div>
              );
            })}
            {filtered.length === 0 && (
              <p className="px-3 py-4 text-center text-[12.5px] text-ink-subtle">
                {roster.length === 0 ? "No roster." : "No matches."}
              </p>
            )}
          </div>
        </PopoverContent>
      </Popover>

      {previewPos &&
        createPortal(
          <div
            role="dialog"
            aria-label="Delegated staff"
            onMouseEnter={cancelHide}
            onMouseLeave={scheduleHidePreview}
            style={{
              position: "fixed",
              left: previewPos.left,
              top: previewPos.top,
              zIndex: 10000,
              width: 240,
              background: "var(--color-surface-card)",
              border: "1px solid var(--color-hairline-strong)",
              borderRadius: 12,
              boxShadow: "0 14px 34px -10px rgba(15,23,42,0.35)",
              padding: 6,
            }}
          >
            {list.length > 0 ? (
              <ul className="flex flex-col gap-1">
                {list.map((d) => (
                  <li
                    key={d.employeeId}
                    className="flex items-center gap-2 rounded-lg px-2 py-1.5"
                  >
                    <span
                      aria-hidden
                      className="grid size-5 shrink-0 place-items-center rounded-full text-[9px] font-bold text-white"
                      style={{ background: "var(--color-altus-red-deep)" }}
                    >
                      {(d.name ?? "?").trim().charAt(0).toUpperCase()}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-ink-strong">
                      {d.name ?? "-"}
                    </span>
                    <span className="shrink-0 text-[11.5px] font-bold tabular-nums text-altus-red-deep">{d.pct}%</span>
                    {!disabled && (
                      <button
                        type="button"
                        onClick={() => {
                          const next = list.filter((x) => x.employeeId !== d.employeeId);
                          onCommit(next.length ? next : null);
                        }}
                        aria-label={`Remove ${d.name ?? "delegate"}`}
                        title="Remove delegate"
                        className={cn(
                          "grid size-6 shrink-0 place-items-center rounded-full text-ink-subtle transition-colors hover:bg-[color-mix(in_srgb,var(--color-altus-red)_15%,transparent)] hover:text-altus-red",
                          FOCUS_RING,
                        )}
                      >
                        <X size={12} strokeWidth={2.6} />
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="flex items-center gap-2 px-2 py-1.5 text-[12.5px] font-medium text-ink-subtle">
                <UserPlus size={13} className="shrink-0" />
                No delegate assigned
              </p>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Bulk: + Delegate — pick staff (auto 100%) for every selected goal.   */
/* Mirrors BulkMembers; the per-row % is then editable in DelegatesCell. */
/* ------------------------------------------------------------------ */

function BulkDelegate({
  roster,
  count,
  onApply,
}: {
  roster: RosterMember[];
  count: number;
  onApply: (delegates: DelegRef[]) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [list, setList] = React.useState<DelegRef[]>([]);

  const isPicked = (r: RosterMember) => list.some((d) => d.employeeId === r.id);
  function toggle(r: RosterMember) {
    setList((prev) =>
      prev.some((d) => d.employeeId === r.id)
        ? prev.filter((d) => d.employeeId !== r.id)
        : [...prev, { employeeId: r.id, name: r.name, pct: 100 }],
    );
  }
  function setPct(r: RosterMember, p: number) {
    setList((prev) => prev.map((d) => (d.employeeId === r.id ? { ...d, pct: p } : d)));
  }
  function apply() {
    onApply(list);
    setOpen(false);
    setList([]);
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className={cn(MENU_BTN, FOCUS_RING)}
        >
          <UserPlus size={13} /> + Delegate
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="z-[80] w-72 rounded-xl border border-hairline bg-surface-card p-1.5"
        style={{ boxShadow: "0 18px 44px -18px rgba(15,23,42,0.3)" }}
      >
        <p className="flex items-center gap-1.5 px-2.5 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-subtle">
          <UserPlus size={12} /> Delegate to · {count} selected
        </p>
        <div className="max-h-64 overflow-auto">
          {roster.map((r) => {
            const sel = isPicked(r);
            const mine = list.find((d) => d.employeeId === r.id);
            return (
              <div
                key={r.id}
                className={cn("flex items-center gap-2 rounded-lg px-2.5 py-1.5 transition-colors", sel ? "" : "hover:bg-black/[0.04]")}
                style={sel ? { background: redTint(10) } : undefined}
              >
                <button type="button" onClick={() => toggle(r)} className="flex min-w-0 flex-1 items-center gap-2 text-left">
                  <span className="inline-flex w-4 shrink-0 justify-center">
                    {sel && <Check size={14} strokeWidth={3} className="text-altus-red" />}
                  </span>
                  <span className={cn("min-w-0 flex-1 truncate text-[13px]", sel ? "font-bold text-altus-red-deep" : "text-ink-strong")}>
                    {r.name}
                  </span>
                </button>
                {sel && (
                  <label className="flex shrink-0 items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      value={mine?.pct ?? 100}
                      onChange={(e) => {
                        const raw = e.target.value.trim();
                        const p = raw === "" ? 0 : Math.max(0, Math.min(100, Math.round(Number(raw) || 0)));
                        setPct(r, p);
                      }}
                      aria-label={`Delegation percent for ${r.name}`}
                      className={cn(
                        "h-7 w-[56px] rounded-md border bg-white px-1.5 text-right text-[12.5px] font-bold tabular-nums text-ink-strong focus:border-altus-red",
                        "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none",
                        FOCUS_RING,
                      )}
                      style={{ borderColor: "var(--color-hairline-strong)", fontFamily: "var(--font-display)" }}
                    />
                    <span className="text-[10px] font-bold text-ink-subtle">%</span>
                  </label>
                )}
              </div>
            );
          })}
          {roster.length === 0 && <p className="px-3 py-4 text-center text-[12.5px] text-ink-subtle">No roster.</p>}
        </div>
        <div className="mt-1 flex items-center justify-between gap-2 border-t px-2.5 pt-2" style={{ borderColor: "var(--color-hairline)" }}>
          <span className="text-[11.5px] font-semibold text-ink-subtle tabular-nums">{list.length} picked</span>
          <button
            type="button"
            onClick={apply}
            className={cn("inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-bold text-white", FOCUS_RING)}
            style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
          >
            Delegate {count} goal{count === 1 ? "" : "s"}
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}


/* ------------------------------------------------------------------ */
/* Cell: Target Date — inline deadline under the goal title (month/week) */
/* Editable date box for month (cascade) goals; read-only coloured chip */
/* for week rows (weekly goals set their date in the composer).         */
/* ------------------------------------------------------------------ */

function TargetDateInline({
  iso,
  editable,
  disabled,
  onCommit,
}: {
  iso: string | null;
  editable: boolean;
  disabled: boolean;
  onCommit: (v: string | null) => void;
}) {
  const st = targetDateStatus(iso);
  const has = st.daysLeft != null;

  if (!editable) {
    if (!iso) return null;
    return (
      <span className="inline-flex items-center gap-1 text-[12px] font-semibold tabular-nums text-ink-strong">
        <CalendarClock size={11} className="text-ink-subtle" aria-hidden />
        {fmtTargetDate(iso)}
      </span>
    );
  }

  return (
    <DateInput
      value={iso ?? ""}
      disabled={disabled}
      ariaLabel="Target date"
      onChange={(v) => {
        const next = v || null;
        if (next !== (iso ?? null)) onCommit(next);
      }}
      className={cn(
        "h-6 rounded-md border bg-white px-1.5 text-[12.5px] font-semibold text-ink-strong focus:border-altus-red disabled:opacity-60",
        FOCUS_RING,
      )}
      style={{ borderColor: has ? st.color : "var(--color-hairline-strong)" }}
    />
  );
}

/** Days-left/overdue status — split into its own last column so it doesn't
 *  wrap under the Target Date input at narrow widths. */
function TargetDateStatusCell({ iso }: { iso: string | null }) {
  const st = targetDateStatus(iso);
  if (st.daysLeft == null) {
    return (
      <span className="text-[12px] font-semibold" style={{ color: "var(--color-ink-subtle)" }}>
        -
      </span>
    );
  }
  return (
    <span
      className="inline-flex items-center gap-1 rounded-pill px-1.5 py-[1px] text-[11px] font-bold tabular-nums"
      style={{ background: `color-mix(in srgb, ${st.color} 12%, transparent)`, color: st.color }}
      title={st.label}
    >
      <CalendarClock size={10} aria-hidden />
      {st.label}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/* Hierarchy-aware "Copy to" — derive the CURRENT level's immediate     */
/* child periods (never siblings / parents). year→quarters, quarter→    */
/* that quarter's 3 months, month→that month's weeks, week→its 7 days.  */
/* ------------------------------------------------------------------ */

type Level = "year" | "quarter" | "month" | "week" | "day";
type ChildLevel = "quarter" | "month" | "week" | "day";
type PeriodTarget = { key: string; label: string; sub?: string };
type ChildMap = { childLevel: ChildLevel; childNoun: string; targets: PeriodTarget[] };

const QUARTER_SUB = ["Apr–Jun", "Jul–Sep", "Oct–Dec", "Jan–Mar"];
const DAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const LEVEL_ADJ: Record<Level, string> = {
  year: "Yearly",
  quarter: "Quarterly",
  month: "Monthly",
  week: "Weekly",
  day: "Daily",
};

/** The immediate CHILD periods a level's goals should copy into. */
function childMapping(level: Level, periodKey: string | undefined): ChildMap | null {
  if (!periodKey) return null;
  if (level === "year") {
    const fy = Number(periodKey);
    if (!Number.isFinite(fy)) return null;
    return {
      childLevel: "quarter",
      childNoun: "quarter",
      targets: quartersOfFy(fy).map((k, i) => ({ key: k, label: `Q${i + 1}`, sub: QUARTER_SUB[i] })),
    };
  }
  if (level === "quarter") {
    if (!/^\d{4}-Q[1-4]$/.test(periodKey)) return null;
    const fy = fyStartYearOfKey(periodKey);
    const q = quarterOfKey(periodKey);
    return {
      childLevel: "month",
      childNoun: "month",
      targets: monthKeysOfQuarter(fy, q).map((k) => ({ key: k, label: periodKeyShort(k), sub: k.slice(0, 4) })),
    };
  }
  if (level === "month") {
    if (!/^\d{4}-\d{2}$/.test(periodKey)) return null;
    const fy = fyStartYearOfMonthKey(periodKey);
    const monthIndex = Number(periodKey.slice(5, 7)) - 1;
    // Label by ORDER within the month ("Week 1..N"), not the FY week number.
    return {
      childLevel: "week",
      childNoun: "week",
      targets: weeksOfMonth(fy, monthIndex).map((w, i) => ({
        key: w.mondayISO,
        label: `Week ${i + 1}`,
        sub: formatWeekShort(w.mondayISO),
      })),
    };
  }
  if (level === "week") {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(periodKey)) return null;
    // periodKey is the week's Monday — Mon…Sun of that week.
    return {
      childLevel: "day",
      childNoun: "day",
      targets: DAY_NAMES.map((name, i) => {
        const iso = addDays(periodKey, i);
        return { key: iso, label: name, sub: `${iso.slice(8, 10)}/${iso.slice(5, 7)}` };
      }),
    };
  }
  return null; // day has no child level
}

/** Sibling buckets at the goal's OWN level (for "Move to…", cascade only). */
function siblingTargets(level: Level, periodKey: string | undefined): PeriodTarget[] {
  if (!periodKey) return [];
  if (level === "quarter" && /^\d{4}-Q[1-4]$/.test(periodKey)) {
    const fy = fyStartYearOfKey(periodKey);
    return quartersOfFy(fy)
      .filter((k) => k !== periodKey)
      .map((k) => ({ key: k, label: `Q${quarterOfKey(k)}`, sub: QUARTER_SUB[quarterOfKey(k) - 1] }));
  }
  if (level === "month" && /^\d{4}-\d{2}$/.test(periodKey)) {
    const fy = fyStartYearOfMonthKey(periodKey);
    return monthKeysOfFy(fy)
      .filter((k) => k !== periodKey)
      .map((k) => ({ key: k, label: periodKeyShort(k), sub: k.slice(0, 4) }));
  }
  return [];
}

const MENU_BTN =
  "inline-flex items-center gap-1.5 rounded-pill border border-hairline-strong bg-surface-card px-3 py-1.5 text-[13px] font-bold text-ink-soft shadow-[0_1px_2px_rgba(15,23,42,0.05)] hover:border-altus-red hover:text-altus-red hover:bg-altus-red/[0.04] transition-colors";

/** Context-aware "Copy to" — a checkable list of the current level's child
 *  periods; copy the selected goals into ONE OR MORE of them in a single go. */
function CopyToMenu({
  childMap,
  count,
  onCopy,
}: {
  childMap: ChildMap;
  count: number;
  onCopy: (keys: string[]) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  const reset = () => setPicked(new Set());
  const toggle = (k: string) =>
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(k)) next.delete(k);
      else next.add(k);
      return next;
    });
  function go() {
    if (picked.size === 0) return;
    onCopy([...picked]);
    reset();
    setOpen(false);
  }
  return (
    <Popover
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) reset();
      }}
    >
      <PopoverTrigger asChild>
        <button type="button" className={cn(MENU_BTN, FOCUS_RING)} style={{ borderColor: "var(--color-hairline-strong)" }}>
          <Copy size={13} /> Copy to {childMap.childNoun}
          <ChevronDown size={12} className="opacity-70" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="z-[80] w-64 rounded-xl border border-hairline bg-surface-card p-1.5"
        style={{ boxShadow: "0 18px 44px -18px rgba(15,23,42,0.3)" }}
      >
        <p className="flex items-center gap-1.5 px-2.5 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-subtle">
          <Copy size={12} /> Copy {count} goal{count === 1 ? "" : "s"} to…
        </p>
        <div className="max-h-64 overflow-auto">
          {childMap.targets.map((t) => {
            const on = picked.has(t.key);
            return (
              <button
                key={t.key}
                type="button"
                onClick={() => toggle(t.key)}
                className={cn("flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors", on ? "" : "hover:bg-black/[0.04]")}
                style={on ? { background: redTint(10) } : undefined}
              >
                <BrandCheck checked={on} onToggle={() => toggle(t.key)} label={`Copy to ${t.label}`} />
                <span className={cn("min-w-0 flex-1 truncate text-[13px]", on ? "font-bold text-altus-red-deep" : "text-ink-strong")}>
                  {t.label}
                </span>
                {t.sub && <span className="shrink-0 text-[11px] font-semibold text-ink-subtle tabular-nums">{t.sub}</span>}
              </button>
            );
          })}
          {childMap.targets.length === 0 && (
            <p className="px-3 py-4 text-center text-[12.5px] text-ink-subtle">No child periods.</p>
          )}
        </div>
        <div className="mt-1 flex items-center justify-between gap-2 border-t px-2.5 pt-2" style={{ borderColor: "var(--color-hairline)" }}>
          <span className="text-[11.5px] font-semibold text-ink-subtle tabular-nums">{picked.size} picked</span>
          <button
            type="button"
            disabled={picked.size === 0}
            onClick={go}
            className={cn("inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-50", FOCUS_RING)}
            style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
          >
            Copy
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** "Move to…" — re-home the selected goals to ONE sibling bucket at the same level. */
function MoveToMenu({
  siblings,
  noun,
  onMove,
}: {
  siblings: PeriodTarget[];
  noun: string;
  onMove: (key: string, label: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={cn(MENU_BTN, FOCUS_RING)} style={{ borderColor: "var(--color-hairline-strong)" }}>
          <ArrowRightLeft size={13} /> Move to {noun}
          <ChevronDown size={12} className="opacity-70" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="z-[80] w-56 rounded-xl border border-hairline bg-surface-card p-1.5"
        style={{ boxShadow: "0 18px 44px -18px rgba(15,23,42,0.3)" }}
      >
        <p className="flex items-center gap-1.5 px-2.5 pb-1 pt-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-subtle">
          <ArrowRightLeft size={12} /> Move to another {noun}
        </p>
        <div className="max-h-64 overflow-auto">
          {siblings.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => {
                onMove(t.key, t.label);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left text-ink-strong transition-colors hover:bg-black/[0.04]"
            >
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{t.label}</span>
              {t.sub && <span className="shrink-0 text-[11px] font-semibold text-ink-subtle tabular-nums">{t.sub}</span>}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Bulk status — status is derived from % Done, so three presets set the % (and
 *  therefore status) on every selected goal. */
const STATUS_PRESETS: { pct: number; label: string; color: string }[] = [
  { pct: 0, label: "Not started", color: "var(--color-ink-soft)" },
  { pct: 50, label: "In progress", color: "var(--color-amber, #d97706)" },
  { pct: 100, label: "Done", color: "var(--color-emerald, #059669)" },
];

function BulkStatusMenu({ onPick }: { onPick: (pct: number, label: string) => void }) {
  const [open, setOpen] = React.useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={cn(MENU_BTN, FOCUS_RING)} style={{ borderColor: "var(--color-hairline-strong)" }}>
          <Flag size={13} /> Status
          <ChevronDown size={12} className="opacity-70" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="z-[80] w-48 rounded-xl border border-hairline bg-surface-card p-1.5"
        style={{ boxShadow: "0 18px 44px -18px rgba(15,23,42,0.3)" }}
      >
        {STATUS_PRESETS.map((s) => (
          <button
            key={s.pct}
            type="button"
            onClick={() => {
              onPick(s.pct, s.label);
              setOpen(false);
            }}
            className="flex w-full items-center gap-2 rounded-lg px-2.5 py-1.5 text-left transition-colors hover:bg-black/[0.04]"
          >
            <span aria-hidden className="size-2.5 rounded-full" style={{ background: s.color }} />
            <span className="flex-1 text-[13px] font-semibold text-ink-strong">{s.label}</span>
            <span className="text-[11px] font-bold text-ink-subtle tabular-nums">{s.pct}%</span>
          </button>
        ))}
        {/* PHASE 2: per-goal Priority / Reviewer / KPI verbs — those fields don't
            exist on a cascade goal yet, so no fake bulk-editor is offered here. */}
      </PopoverContent>
    </Popover>
  );
}

/** Bulk target-date (month goals only — the only level with an editable deadline). */
function BulkTargetDate({ onApply }: { onApply: (iso: string | null) => void }) {
  const [open, setOpen] = React.useState(false);
  const [iso, setIso] = React.useState("");
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" className={cn(MENU_BTN, FOCUS_RING)} style={{ borderColor: "var(--color-hairline-strong)" }}>
          <CalendarDays size={13} /> Target date
          <ChevronDown size={12} className="opacity-70" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="z-[80] w-60 rounded-xl border border-hairline bg-surface-card p-2.5"
        style={{ boxShadow: "0 18px 44px -18px rgba(15,23,42,0.3)" }}
      >
        <p className="pb-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-subtle">Set target date</p>
        <DateInput
          value={iso}
          onChange={setIso}
          ariaLabel="Bulk target date"
          className={cn("h-9 w-full rounded-md border bg-white px-2 text-[13px] font-semibold text-ink-strong focus:border-altus-red", FOCUS_RING)}
          style={{ borderColor: "var(--color-hairline-strong)" }}
        />
        <div className="mt-2 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              onApply(null);
              setOpen(false);
            }}
            className={cn("rounded-lg px-2 py-1.5 text-[12px] font-bold text-ink-subtle transition-colors hover:text-ink-strong", FOCUS_RING)}
          >
            Clear
          </button>
          <button
            type="button"
            disabled={!iso}
            onClick={() => {
              onApply(iso);
              setOpen(false);
            }}
            className={cn("inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-50", FOCUS_RING)}
            style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
          >
            Apply
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Duplicate-collision prompt shown when a chosen destination already holds a
 *  goal with the same title. Skip / Replace / Cancel (Merge = PHASE 2). */
function DupCollisionDialog({
  open,
  collisions,
  labelFor,
  onResolve,
}: {
  open: boolean;
  collisions: Record<string, string[]>;
  labelFor: (key: string) => string;
  onResolve: (mode: "skip" | "replace" | null) => void;
}) {
  const entries = Object.entries(collisions);
  const total = entries.reduce((n, [, list]) => n + list.length, 0);
  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onResolve(null)}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-black/40" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[100] w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-surface-card p-6"
          style={{ border: "1px solid var(--color-hairline-strong)", boxShadow: "0 24px 60px -16px rgba(15,23,42,0.4)" }}
        >
          <div className="mb-4 flex items-start gap-3">
            <span
              aria-hidden
              className="inline-flex size-10 shrink-0 items-center justify-center rounded-xl"
              style={{ background: redTint(12), color: "var(--color-altus-red)" }}
            >
              <Copy size={19} strokeWidth={2.2} />
            </span>
            <div className="min-w-0">
              <Dialog.Title className="font-bold text-ink-strong" style={{ fontSize: 18, letterSpacing: "-0.01em" }}>
                {total} duplicate{total === 1 ? "" : "s"} already there
              </Dialog.Title>
              <Dialog.Description className="mt-1 text-[13.5px] text-ink-subtle" style={{ lineHeight: 1.5 }}>
                Some destinations already hold a goal with the same title. How should the copy proceed?
              </Dialog.Description>
            </div>
          </div>

          <div
            className="mb-4 max-h-40 overflow-auto rounded-lg border p-2 text-[12.5px]"
            style={{ borderColor: "var(--color-hairline)", background: "var(--color-surface-soft)" }}
          >
            {entries.map(([key, list]) => (
              <div key={key} className="py-0.5">
                <span className="font-bold text-ink-strong">{labelFor(key)}:</span>{" "}
                <span className="text-ink-soft">{list.join(", ")}</span>
              </div>
            ))}
          </div>

          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={() => onResolve(null)}
              className={cn("rounded-lg border px-3.5 py-2 text-[13px] font-semibold text-ink-soft transition-colors hover:text-ink-strong", FOCUS_RING)}
              style={{ borderColor: "var(--color-hairline-strong)" }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => onResolve("skip")}
              className={cn("rounded-lg border px-3.5 py-2 text-[13px] font-bold text-ink-strong transition-colors hover:border-altus-red hover:text-altus-red", FOCUS_RING)}
              style={{ borderColor: "var(--color-hairline-strong)" }}
            >
              Skip Duplicates
            </button>
            <button
              type="button"
              onClick={() => onResolve("replace")}
              className={cn("inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-bold text-white", FOCUS_RING)}
              style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
            >
              Replace
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* ------------------------------------------------------------------ */
/* The table                                                           */
/* ------------------------------------------------------------------ */

const TH =
  "px-2 py-1.5 text-left whitespace-nowrap max-md:px-1.5 max-md:py-1.5 font-sans text-[10.5px] font-bold uppercase tracking-[0.03em]";

/** Header cell metadata (not JSX — the component attaches live drag handlers
 *  itself) for one REORDERABLE_COLUMNS key, in the table's fixed per-column
 *  styling. "notes" is the one key that covers two physical columns (Notes +
 *  Attachments), which is why this always returns an array — both drag as
 *  one unit under the caller's own `key` (the REORDERABLE_COLUMNS key, not
 *  either cell's own React key). */
function headerCellsFor(key: string): { reactKey: string; label: string; className: string }[] {
  switch (key) {
    case "srno":
      return [{ reactKey: "srno", label: "#", className: cn(TH, "w-px") }];
    case "area":
      return [{ reactKey: "area", label: "Area", className: cn(TH, "pl-1.5 pr-0 min-w-[36px]") }];
    case "title":
      return [{ reactKey: "title", label: "Goal", className: cn(TH, "pl-0 pr-2 min-w-[320px]") }];
    case "measure":
      return [{ reactKey: "measure", label: "Measure", className: cn(TH, "px-1.5 min-w-[52px]") }];
    case "actual":
      return [{ reactKey: "actual", label: "Actual", className: cn(TH, "px-1.5 w-[66px]") }];
    case "target":
      return [{ reactKey: "target", label: "Target", className: cn(TH, "px-1.5 w-[66px]") }];
    case "pct":
      return [{ reactKey: "pct", label: "% Done", className: cn(TH, "px-1.5 w-[70px]") }];
    case "teamPct":
      return [{ reactKey: "teamPct", label: "Team %", className: cn(TH, "px-1.5 w-[54px]") }];
    case "delegate":
      return [{ reactKey: "delegate", label: "Delegated", className: cn(TH, "px-1.5 min-w-[28px]") }];
    case "targetDate":
      return [{ reactKey: "targetDate", label: "Target Date", className: cn(TH, "px-1.5 min-w-[130px]") }];
    case "owner":
      return [{ reactKey: "owner", label: "Owner", className: cn(TH, "px-1.5 min-w-[50px]") }];
    case "type":
      return [{ reactKey: "type", label: "Type", className: cn(TH, "px-1.5 min-w-[56px]") }];
    case "notes":
      return [
        { reactKey: "notes", label: "Notes", className: cn(TH, "px-1.5 min-w-[64px]") },
        { reactKey: "attachments", label: "Files", className: cn(TH, "px-1.5 min-w-[28px]") },
      ];
    case "targetDateStatus":
      return [{ reactKey: "targetDateStatus", label: "Days Left", className: cn(TH, "px-1.5 min-w-[96px]") }];
    default:
      return [];
  }
}

// #10 — the fixed Goal Type taxonomy labels for the inline Type selector
// (KPI / Branding / Strategic / Operational / Essential). NOT admin-extensible,
// unlike the legacy free-text `category` lookups.
const GOAL_TYPE_OPTIONS: string[] = GOAL_TYPES.map((t) => GOAL_TYPE_LABELS[t]);

/** The simplified table's own fixed Type list — deliberately narrower than the
 *  full GOAL_TYPES taxonomy. "Incentive" has no built-in code, so it
 *  round-trips through the custom-raw-label path in the "type" grid column's
 *  parse() below. */
export const QUARTER_TYPE_OPTIONS: string[] = ["Incentive", "KPI", "Strategic", "Operational"];

/** Every optional column the Columns picker can show/hide, in table order —
 *  the single source of truth both the picker's checklist and the table's
 *  own render gates read from. */
export const OPTIONAL_COLUMNS: { key: string; label: string }[] = [
  { key: "measure", label: "Measure" },
  { key: "actual", label: "Actual" },
  { key: "teamPct", label: "Team %" },
  { key: "delegate", label: "Delegated" },
  { key: "owner", label: "Owner" },
  { key: "type", label: "Type" },
  { key: "notes", label: "Notes" },
];

/** The simplified table's original fixed column set, unchanged for any
 *  caller that doesn't pass `visibleCols` (the Columns picker). */
export const DEFAULT_VISIBLE_COLS = new Set(["actual", "delegate", "owner", "type"]);

/** Every optional column shown — used where the caller wants the Columns
 *  picker to start fully expanded (the level board defaults to this). */
export const ALL_VISIBLE_COLS = new Set(OPTIONAL_COLUMNS.map((c) => c.key));

/** Every data column, in the table's DEFAULT left-to-right order — the
 *  ColumnsPicker's drag-reorder list AND what a header-cell drag splices.
 *  Sr No / Area / Goal / Target / % Done are here too (their position is
 *  draggable) but `pickable: false` means they have no checkbox — they can
 *  move, never hide. Notes covers both the Notes and Attachments cells as
 *  one draggable unit. The checkbox column is the one thing NOT here — pure
 *  UI (row selection), not data, so it always stays leftmost. */
export const REORDERABLE_COLUMNS: { key: string; label: string; pickable: boolean }[] = [
  { key: "srno", label: "#", pickable: false },
  { key: "area", label: "Area", pickable: false },
  { key: "title", label: "Goal", pickable: false },
  { key: "measure", label: "Measure", pickable: true },
  { key: "actual", label: "Actual", pickable: true },
  { key: "target", label: "Target", pickable: false },
  { key: "pct", label: "% Done", pickable: false },
  { key: "teamPct", label: "Team %", pickable: true },
  { key: "delegate", label: "Delegated", pickable: true },
  { key: "owner", label: "Owner", pickable: true },
  { key: "type", label: "Type", pickable: true },
  { key: "notes", label: "Notes", pickable: true },
  { key: "targetDate", label: "Target Date", pickable: false },
  { key: "targetDateStatus", label: "Days Left", pickable: false },
];

/** Reconciles a (possibly stale) saved column order against
 *  REORDERABLE_COLUMNS' CURRENT declared order: drops unknown/duplicate
 *  keys, and — this is the part a naive "just append what's missing" gets
 *  wrong — inserts any column missing from the save (e.g. one added to the
 *  set after the user's last visit) at its DECLARED position relative to the
 *  columns around it, not blindly at the end. A plain append is what shoved
 *  Sr No/Area/Goal to the far right the first time they joined this list:
 *  a save from before they existed had no slot for them, so they landed
 *  after every other column instead of staying up front. */
export function reconcileColOrder(stored: string[] | undefined): string[] {
  const declared = REORDERABLE_COLUMNS.map((c) => c.key);
  if (!stored) return declared;
  const declaredIndex = new Map(declared.map((k, i) => [k, i]));
  const known = new Set(declared);
  const seen = new Set<string>();
  const kept: string[] = [];
  for (const k of stored) {
    if (known.has(k) && !seen.has(k)) {
      kept.push(k);
      seen.add(k);
    }
  }
  for (const k of declared) {
    if (seen.has(k)) continue;
    const idx = declaredIndex.get(k) as number;
    let insertAt = kept.length;
    for (let i = 0; i < kept.length; i++) {
      const di = declaredIndex.get(kept[i] as string) as number;
      if (di > idx) {
        insertAt = i;
        break;
      }
    }
    kept.splice(insertAt, 0, k);
  }
  return kept;
}

/** Grid-nav-participating keys among REORDERABLE_COLUMNS (the ones with an
 *  editable/readable spreadsheet cell) — Sr No, Owner, Target Date and Notes
 *  have no grid cell, so they never enter the keyboard-nav column array. */
const NAV_COLUMN_KEYS = new Set([
  "area",
  "title",
  "measure",
  "actual",
  "target",
  "pct",
  "teamPct",
  "delegate",
  "type",
]);

/** Pointer-based header-cell drag reorder — NOT the native HTML5 `draggable`
 *  attribute (dragstart never reliably fires from inside a Radix Popover's
 *  portal, per the Columns-picker's own cousin of this hook; kept consistent
 *  here for the same feel even though the table isn't portaled). Tracks the
 *  pointer held down on a header cell, splices `order` live as it crosses
 *  another header cell, and ends on the next pointerup anywhere. A no-op
 *  (draggable=false) when `onOrderChange` is omitted. */
function useColumnHeaderDrag(order: string[], onOrderChange?: (next: string[]) => void) {
  const draggable = !!onOrderChange;
  const [dragKey, setDragKey] = React.useState<string | null>(null);
  const orderRef = React.useRef(order);
  React.useEffect(() => {
    orderRef.current = order;
  }, [order]);
  const dragKeyRef = React.useRef<string | null>(null);

  const startDrag = React.useCallback(
    (key: string) => {
      if (!draggable) return;
      dragKeyRef.current = key;
      setDragKey(key);
    },
    [draggable],
  );
  const crossCol = React.useCallback(
    (targetKey: string) => {
      const from0 = dragKeyRef.current;
      if (!onOrderChange || !from0 || from0 === targetKey) return;
      const cur = orderRef.current;
      const from = cur.indexOf(from0);
      const to = cur.indexOf(targetKey);
      if (from < 0 || to < 0) return;
      const next = [...cur];
      next.splice(from, 1);
      next.splice(to, 0, from0);
      orderRef.current = next;
      onOrderChange(next);
    },
    [onOrderChange],
  );
  React.useEffect(() => {
    if (!draggable) return;
    function endDrag() {
      dragKeyRef.current = null;
      setDragKey(null);
    }
    window.addEventListener("pointerup", endDrag);
    return () => window.removeEventListener("pointerup", endDrag);
  }, [draggable]);

  return { draggable, dragKey, startDrag, crossCol };
}

export function GoalTableView(props: GoalTableViewProps) {
  const {
    goals,
    canWrite,
    isAdmin,
    roster,
    areaOptions,
    measureOptions,
    typeOptions,
    goaltypeOptions,
    customLookups,
    codeOf,
    ownerNameOf,
    level,
  } = props;

  const weekly = props.variant === "weekly";
  const A = props.actions ?? CASCADE_ACTIONS;
  const detailKind = props.detailKind ?? "cascade";
  const visibleCols = props.visibleCols ?? DEFAULT_VISIBLE_COLS;

  // The FULL column order (every REORDERABLE_COLUMNS key, hidden ones
  // included), reconciled against a possibly-stale `props.colOrder`. Drag-
  // reorder splices THIS array (so a hidden column keeps its relative
  // place); orderedColumnKeys below is the filtered projection that's
  // actually rendered.
  const mergedColOrder = React.useMemo(() => reconcileColOrder(props.colOrder), [props.colOrder]);

  // Every column after Area/Goal, left-to-right, filtered to what's actually
  // shown here: a `pickable` column drops out when hidden via visibleCols,
  // Target Date only exists on the Month/Week levels, and Target/% Done
  // always stay (their POSITION moves, but they can't be hidden).
  const orderedColumnKeys = React.useMemo(
    () =>
      mergedColOrder.filter((k) => {
        if (k === "targetDate" || k === "targetDateStatus") return level === "month" || level === "week";
        const col = REORDERABLE_COLUMNS.find((c) => c.key === k);
        return col?.pickable ? visibleCols.has(k) : true;
      }),
    [mergedColOrder, visibleCols, level],
  );

  // Header-cell drag reorder — isolated in its own hook (see
  // useColumnHeaderDrag below) so its extra state/effects don't perturb the
  // React Compiler's memoization analysis of the rest of this (very large)
  // component.
  const { draggable: draggableCols, dragKey: dragColKey, startDrag: startColDrag, crossCol } =
    useColumnHeaderDrag(mergedColOrder, props.onColOrderChange);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = React.useTransition();
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  // Local, optimistic copy of the rows so an inline edit is visible in 0 ms —
  // the server action persists in the background and a debounced refresh
  // reconciles server-derived values (dials, roll-ups). Re-sync whenever the
  // server sends a fresh board (after a refresh / navigation / realtime).
  const [rows, setRows] = React.useState<GoalDTO[]>(goals);
  React.useEffect(() => setRows(goals), [goals]);

  // Every goal on this board shares one period key — derive the current period
  // from it, then the hierarchy-correct CHILD periods (Copy to) + SIBLINGS (Move).
  const currentPeriodKey = goals[0]?.periodKey;
  const childMap = React.useMemo(() => childMapping(level, currentPeriodKey), [level, currentPeriodKey]);
  const siblings = React.useMemo(() => siblingTargets(level, currentPeriodKey), [level, currentPeriodKey]);

  // Pending "Copy to" awaiting a duplicate-collision decision (Skip/Replace/Cancel).
  const [dupPrompt, setDupPrompt] = React.useState<{ keys: string[]; collisions: Record<string, string[]> } | null>(null);

  const allSelected = rows.length > 0 && rows.every((g) => selected.has(g.id));
  const someSelected = selected.size > 0 && !allSelected;
  const locked = !canWrite;
  // Every level gets the same slimmer table: Measure / Actual / Team % /
  // Delegated drop out of the grid, Notes gets its own column
  // (attachments listed inline), and selecting a row opens a centered
  // summary popup (instead of the corner hover tooltip) that hands off to
  // the standalone full-detail screen. Originally Quarterly-only; now
  // applied everywhere (Yearly/Monthly/Weekly included) so every level
  // behaves identically.
  const simplified = true;
  // Selecting a row opens the Edit popup directly — no separate read-only
  // summary step and no standalone full-detail screen anymore.
  const [previewGoal, setPreviewGoal] = React.useState<GoalDTO | null>(null);

  // The code badge (JuQ1, Y1, …) is a real link carrying `?focus=<id>` so
  // right-click → "Open link in new tab" / ctrl-click / middle-click all work
  // natively — a normal left click still opens the popup in place (below).
  const focusHref = React.useCallback(
    (id: string) => {
      const qs = new URLSearchParams(searchParams?.toString());
      qs.set("focus", id);
      return `${pathname}?${qs.toString()}`;
    },
    [pathname, searchParams],
  );

  // A tab opened via that link (or a shared `?focus=` URL) auto-opens the
  // matching goal's popup once its row has loaded.
  React.useEffect(() => {
    const id = searchParams?.get("focus");
    if (!id) return;
    const g = rows.find((r) => r.id === id);
    if (g) setPreviewGoal(g);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, rows]);

  const closePreview = React.useCallback(() => {
    setPreviewGoal(null);
    if (searchParams?.get("focus")) {
      const qs = new URLSearchParams(searchParams.toString());
      qs.delete("focus");
      const suffix = qs.toString();
      router.replace((suffix ? `${pathname}?${suffix}` : pathname) as Route, { scroll: false });
    }
  }, [pathname, router, searchParams]);

  // Debounced background reconcile — coalesces a burst of edits into ONE server
  // re-fetch instead of one heavy refresh per keystroke-commit (the old 7–10 s
  // stall). The optimistic local state already shows the change instantly.
  const refreshTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRefresh = React.useCallback(() => {
    if (refreshTimer.current) clearTimeout(refreshTimer.current);
    refreshTimer.current = setTimeout(() => router.refresh(), 700);
  }, [router]);
  React.useEffect(
    () => () => {
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    },
    [],
  );

  /** Fire a server action; on success reconcile in the background, on failure toast. */
  const run = React.useCallback(
    (act: () => Promise<ActionRes>, okMsg: string, after?: () => void) => {
      startTransition(async () => {
        const res = await act();
        if (res.ok) {
          after?.();
          scheduleRefresh();
          fireToast({ message: okMsg, type: "success" });
        } else {
          fireToast({ message: res.error, type: "error" });
        }
      });
    },
    [scheduleRefresh],
  );

  /** Optimistic inline field edit: patch the row locally NOW (instant), persist
   *  in the background, revert just that row on failure. No success toast — the
   *  visible change IS the confirmation. */
  const editField = React.useCallback(
    (id: string, partial: Partial<GoalDTO>, act: () => Promise<ActionRes>) => {
      let snapshot: GoalDTO | undefined;
      setRows((prev) =>
        prev.map((r) => {
          if (r.id !== id) return r;
          snapshot = r;
          return { ...r, ...partial };
        }),
      );
      startTransition(async () => {
        const res = await act();
        if (res.ok) {
          scheduleRefresh();
        } else {
          if (snapshot) setRows((prev) => prev.map((r) => (r.id === id ? snapshot! : r)));
          fireToast({ message: res.error, type: "error" });
        }
      });
    },
    [scheduleRefresh],
  );

  /** Optimistic removal (single or bulk delete): drop rows locally NOW, persist
   *  in the background, restore the whole set on failure. */
  const removeRows = React.useCallback(
    (removeIds: string[], act: () => Promise<ActionRes>, okMsg: string, after?: () => void) => {
      const removing = new Set(removeIds);
      let snapshot: GoalDTO[] = [];
      setRows((prev) => {
        snapshot = prev;
        return prev.filter((r) => !removing.has(r.id));
      });
      after?.();
      startTransition(async () => {
        const res = await act();
        if (res.ok) {
          scheduleRefresh();
          fireToast({ message: okMsg, type: "success" });
        } else {
          setRows(snapshot);
          fireToast({ message: res.error, type: "error" });
        }
      });
    },
    [scheduleRefresh],
  );

  function toggleRow(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allSelected ? new Set() : new Set(rows.map((g) => g.id)));
  }

  const clearSelection = React.useCallback(() => setSelected(new Set()), []);

  // The goal open in the full Edit dialog (title + all fields), or null.
  const [editingGoal, setEditingGoal] = React.useState<GoalDTO | null>(null);

  // Which goals have their Notes / Attachments detail row open.
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set());
  function toggleExpand(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  const patchNotes = React.useCallback(
    (id: string, notes: string | null) =>
      editField(id, { notes }, () => A.editGoal({ id, notes })),
    [editField],
  );

  /* ------------------------------------------------------------------ */
  /* Spreadsheet grid engine — the editable columns, in visual order.    */
  /* Each column is the ONE source of truth for read / editable / parse, */
  /* so inline typing, paste, fill-down and undo all commit identically  */
  /* through the SAME `actions` surface (A.editGoal / A.setGoalPctDone).  */
  /* Members is intentionally NOT a grid column (its JSON team+weights    */
  /* payload has no sane TSV round-trip) — it stays directly editable.    */
  /* ------------------------------------------------------------------ */
  const gridColumns = React.useMemo<GridColumn[]>(() => {
    const clampInt = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, Math.round(n)));
    /** "" → null · valid number → the string · junk → undefined (reject). */
    const numOrNull = (raw: string): string | null | undefined => {
      const s = raw.trim();
      if (s === "") return null;
      return Number.isFinite(Number(s)) ? s : undefined;
    };
    const rosterById = new Map(roster.map((m) => [m.id, m.name]));
    const rosterByName = new Map(roster.map((m) => [m.name.trim().toLowerCase(), m.id]));
    // Project / vendor lookups for the "Part of Project?" column (both directions:
    // id → name to render, name → id to accept a typed or pasted cell).
    const projectList = props.projects ?? [];
    const vendorList = props.vendors ?? [];
    const projectById = new Map(projectList.map((p) => [p.id, p.name]));
    const projectByName = new Map(projectList.map((p) => [p.name.trim().toLowerCase(), p.id]));
    const vendorById = new Map(vendorList.map((v) => [v.id, v.name]));
    const vendorByName = new Map(vendorList.map((v) => [v.name.trim().toLowerCase(), v.id]));
    const statusBase = (isAdmin ? ADMIN_TASK_STATUSES : USER_TASK_STATUSES) as readonly TaskStatus[];

    const cols: GridColumn[] = [
      {
        key: "area",
        label: "Area",
        read: (g) => g.area ?? "",
        editable: () => !locked,
        parse: (raw, g) => {
          const v = raw.trim() === "" ? null : raw.trim();
          return { partial: { area: v }, run: () => A.editGoal({ id: g.id, area: v }) };
        },
      },
      {
        key: "title",
        label: "Goal",
        read: (g) => g.title,
        editable: () => !locked,
        parse: (raw, g) => {
          const t = raw.trim();
          if (!t) return null; // title is required — never blank it
          return { partial: { title: t }, run: () => A.editGoal({ id: g.id, title: t }) };
        },
      },
      {
        // "Part of Project?" — reads "No" or "Yes · <Project> · <Vendor>". Typing
        // follows the grid's spreadsheet convention: "no"/"-" clears the tag,
        // "yes" marks it without a project, and typing a PROJECT NAME (or a
        // "Project · Vendor" pair, exactly as the cell renders) both marks it and
        // resolves the ids — so a pasted column round-trips.
        key: "project",
        label: "Project",
        read: (g) => {
          if (!g.isProject) return "No";
          const p = g.projectNodeId ? projectById.get(g.projectNodeId) : null;
          const v = g.vendorId ? vendorById.get(g.vendorId) : null;
          return ["Yes", p, v].filter(Boolean).join(" · ");
        },
        editable: () => !locked,
        parse: (raw, g) => {
          const s = raw.trim();
          const low = s.toLowerCase();
          if (s === "" || low === "no" || low === "-" || low === "-") {
            return {
              partial: { isProject: false, projectNodeId: null, vendorId: null },
              run: () => A.editGoal({ id: g.id, isProject: false }),
            };
          }
          // Drop a leading "Yes ·" so the cell's own rendering can be pasted back.
          const rest = s.replace(/^yes\s*(·|\||,|-)?\s*/i, "");
          const [pName, vName] = rest.split(/\s*(?:·|\|)\s*/);
          const projectNodeId = pName ? (projectByName.get(pName.trim().toLowerCase()) ?? null) : null;
          const vendorId = vName ? (vendorByName.get(vName.trim().toLowerCase()) ?? null) : null;
          // A typed name that matches nothing is a typo, not an intent to clear —
          // reject the edit so the previous value stands.
          if (pName && pName.trim() && !projectNodeId) return null;
          return {
            partial: { isProject: true, projectNodeId, vendorId },
            run: () => A.editGoal({ id: g.id, isProject: true, projectNodeId, vendorId }),
          };
        },
      },
      {
        key: "measure",
        label: "Measure",
        read: (g) => g.uom ?? "",
        editable: () => !locked,
        parse: (raw, g) => {
          const v = raw.trim() === "" ? null : raw.trim();
          return { partial: { uom: v }, run: () => A.editGoal({ id: g.id, uom: v }) };
        },
      },
      {
        key: "actual",
        label: "Actual",
        read: (g) => trimDecimal(g.actualQty),
        editable: () => !locked,
        parse: (raw, g) => {
          const v = numOrNull(raw);
          if (v === undefined) return null;
          return { partial: { actualQty: v }, run: () => A.editGoal({ id: g.id, actualQty: v }) };
        },
      },
      {
        key: "target",
        label: "Target",
        read: (g) => trimDecimal(g.targetQty),
        editable: () => !locked,
        parse: (raw, g) => {
          const v = numOrNull(raw);
          if (v === undefined) return null;
          return { partial: { targetQty: v }, run: () => A.editGoal({ id: g.id, targetQty: v }) };
        },
      },
      {
        key: "pct",
        label: "% Done",
        read: (g) => String(autoPctDone(g.targetQty, g.actualQty) ?? g.pctDone),
        // Read-only when Actual ÷ Target drives it (matches the PctCell auto mode).
        editable: (g) => !locked && autoPctDone(g.targetQty, g.actualQty) === null,
        parse: (raw, g) => {
          const n = Number(raw.trim());
          if (!Number.isFinite(n)) return null;
          const p = clampInt(n, 0, 100);
          return { partial: { pctDone: p }, run: () => A.setGoalPctDone({ id: g.id, pctDone: p }) };
        },
      },
      {
        key: "teamPct",
        label: "Team %",
        read: (g) => (g.teamDependencyPct == null ? "" : String(g.teamDependencyPct)),
        editable: () => !locked,
        parse: (raw, g) => {
          const s = raw.trim();
          if (s === "") return { partial: { teamDependencyPct: null }, run: () => A.editGoal({ id: g.id, teamDependencyPct: null }) };
          const n = Number(s);
          if (!Number.isFinite(n)) return null;
          const v = clampInt(n, 0, 100);
          return { partial: { teamDependencyPct: v }, run: () => A.editGoal({ id: g.id, teamDependencyPct: v }) };
        },
      },
      {
        // Delegate is NOT typeable/pasteable (its {employeeId, name, pct} payload
        // has no sane TSV round-trip, like Members) — but it IS a navigable grid
        // column so arrow-nav can land on it and Enter opens the picker. read()
        // gives Copy a readable summary; editable=false makes paste/fill/delete
        // skip it; parse=()=>null rejects any typed/pasted write.
        key: "delegate",
        label: "Delegated",
        read: (g) => (g.delegatedTo ?? []).map((d) => `${d.name ?? ""}${d.pct != null ? ` (${d.pct}%)` : ""}`).filter(Boolean).join(", "),
        editable: () => false,
        parse: () => null,
      },
    ];

    cols.push(
      {
        // #10 — Goal Type taxonomy: KPI / Branding / Strategic / Operational /
        // Essential (goalType enum), NOT the legacy free-text `category`.
        key: "type",
        label: "Type",
        // Built-in code → its label; admin-added custom type → its raw value.
        read: (g) => (g.goalType ? GOAL_TYPE_LABELS[g.goalType as GoalType] ?? g.goalType : ""),
        editable: () => !locked,
        parse: (raw, g) => {
          const trimmed = raw.trim();
          const norm = trimmed.toLowerCase();
          if (norm === "")
            return { partial: { goalType: null }, run: () => A.editGoal({ id: g.id, goalType: null }) };
          // A built-in type persists as its canonical code (unchanged behaviour).
          const code = GOAL_TYPES.find(
            (t) => t === norm || GOAL_TYPE_LABELS[t].toLowerCase() === norm,
          );
          if (code)
            return { partial: { goalType: code }, run: () => A.editGoal({ id: g.id, goalType: code }) };
          // #194 — an admin-added custom Goal Type is stored as its raw label.
          return { partial: { goalType: trimmed }, run: () => A.editGoal({ id: g.id, goalType: trimmed }) };
        },
      },
    );
    // The simplified table drops whatever the Columns picker has hidden from
    // the grid entirely (not just visually) so keyboard nav / copy / paste
    // stay aligned with what's on screen — no phantom columns. It also has no
    // rendered cell for "project" (a Members-style non-round-trippable column
    // in the FULL table only), so that entry is always dropped here.
    if (simplified) {
      const optionalGridKeys = ["measure", "actual", "teamPct", "delegate", "type"];
      const hidden = new Set(optionalGridKeys.filter((k) => !visibleCols.has(k)));
      const byKey = new Map(cols.map((c) => [c.key, c]));
      // Reorder to match the rendered DOM order (orderedColumnKeys) so
      // arrow-nav / copy / paste stay aligned with what's actually on screen.
      const ordered: GridColumn[] = [];
      for (const k of orderedColumnKeys) {
        if (!NAV_COLUMN_KEYS.has(k) || hidden.has(k)) continue;
        const c = byKey.get(k);
        if (c) ordered.push(c);
      }
      return ordered;
    }
    return cols;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roster, locked, isAdmin, weekly, props.projects, props.vendors, simplified, visibleCols, orderedColumnKeys]);

  const grid = useGoalGridEngine({
    rows,
    columns: gridColumns,
    enabled: !locked,
    applyEdit: editField,
  });

  /** Body <td>(s) for one REORDERABLE_COLUMNS key, for row `g` at index `i` —
   *  the counterpart to headerCellsFor() above. `t`/`a` are that row's
   *  already-parsed Target/Actual numbers (the size-threshold sub-label under
   *  each). Always returns an array; "notes" returns two cells. */
  function bodyCellsFor(key: string, g: GoalDTO, i: number, t: number | null, a: number | null): React.ReactNode[] {
    switch (key) {
      case "srno":
        return [
          <td key="srno" className="px-1.5 py-0 align-middle">
            <div className="flex flex-col items-start gap-1">
              {/* The goal CODE is the select/click handle. It is the one cell
                  in the row that is not an inline editor, so making it the
                  trigger opens the Edit popup without competing with typing
                  in the title, target or notes. */}
              {simplified ? (
                <a
                  href={focusHref(g.id)}
                  onClick={(e) => {
                    // Plain left click stays instant (no page reload) —
                    // ctrl/cmd/middle-click and "open in new tab" fall
                    // through to the real href.
                    if (e.button === 0 && !e.metaKey && !e.ctrlKey && !e.shiftKey && !e.altKey) {
                      e.preventDefault();
                      setPreviewGoal(g);
                    }
                  }}
                  aria-label={`Goal: ${g.title || "Untitled goal"} - view details`}
                  className="whitespace-nowrap text-[13px] font-bold text-ink-soft tabular-nums underline decoration-transparent underline-offset-2 transition-colors hover:text-altus-red hover:decoration-current outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/50 rounded-md"
                  style={{ fontFamily: "var(--font-display)" }}
                >
                  {codeOf ? codeOf(g) : goalCode({ period: g.period, periodKey: g.periodKey, position: i + 1, id: g.id })}
                </a>
              ) : (
                <GoalPreview goal={g} ownerName={ownerNameOf?.(g) ?? null}>
                  <span
                    className="whitespace-nowrap text-[13px] font-bold text-ink-soft tabular-nums underline decoration-transparent underline-offset-2 transition-colors hover:text-altus-red hover:decoration-current"
                    style={{ fontFamily: "var(--font-display)" }}
                  >
                    {codeOf ? codeOf(g) : goalCode({ period: g.period, periodKey: g.periodKey, position: i + 1, id: g.id })}
                  </span>
                </GoalPreview>
              )}
            </div>
          </td>,
        ];
      case "area":
        return [
          <td key="area" {...grid.cellProps(i, grid.ci("area"), "pl-1.5 pr-0 py-0 align-middle")}>
            <div className={cn(locked && "pointer-events-none opacity-60")}>
              <GoalLookupSelect
                kind="area"
                noun="Area"
                compact
                placeholder="Area"
                className="[font-family:var(--font-display)]"
                value={g.area ?? ""}
                options={areaOptions}
                custom={customLookups.areas}
                isAdmin={isAdmin}
                onChange={(v) => grid.commit("area", g, v)}
              />
            </div>
          </td>,
        ];
      case "title":
        return [
          <td key="title" {...grid.cellProps(i, grid.ci("title"), "pl-0 pr-1.5 py-0 align-middle")}>
            {/* Single-line, truncated — keeps every row one line tall (dense
                table, column stays narrow) — but a hover tooltip always shows
                the FULL goal text, so nothing is ever actually hidden. */}
            <Tooltip.Provider delayDuration={250}>
              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  <div className="min-w-0">
                    <TextCell
                      value={g.title}
                      disabled={locked}
                      ariaLabel="Goal title"
                      placeholder="Goal…"
                      className="truncate"
                      // Title is required — the "title" column's parse rejects a
                      // blank commit (returns null), so the row is never left
                      // without a name.
                      onCommit={(v) => grid.commit("title", g, v)}
                    />
                  </div>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content
                    side="bottom"
                    align="start"
                    sideOffset={6}
                    collisionPadding={16}
                    className="z-[70]"
                    style={{
                      maxWidth: 420,
                      background: "var(--color-surface-card)",
                      border: "1px solid var(--color-hairline-strong)",
                      borderRadius: 12,
                      boxShadow: "0 16px 40px rgba(15,23,42,0.18)",
                      padding: 12,
                    }}
                  >
                    <p
                      className="whitespace-pre-wrap"
                      style={{ fontSize: 13.5, lineHeight: 1.5, fontWeight: 700, color: "var(--color-ink-strong)" }}
                    >
                      {g.title}
                    </p>
                    <Tooltip.Arrow style={{ fill: "var(--color-surface-card)" }} />
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            </Tooltip.Provider>
            {/* Per Sir: when the Notes column is hidden (Columns picker), Notes
                stays fully out of the table — no fallback trigger under the
                Goal cell either. It's still reachable via the row's Edit
                popup. */}
          </td>,
        ];
      case "measure":
        return [
          <td key="measure" {...grid.cellProps(i, grid.ci("measure"), "px-1.5 py-0 align-middle")}>
            <div className={cn(locked && "pointer-events-none opacity-60")}>
              <GoalLookupSelect
                kind="measure"
                noun="Measure"
                compact
                placeholder="Measure"
                className="[font-family:var(--font-display)]"
                value={g.uom ?? ""}
                options={measureOptions}
                custom={customLookups.measures}
                isAdmin={isAdmin}
                onChange={(v) => grid.commit("measure", g, v)}
              />
            </div>
          </td>,
        ];
      case "actual":
        return [
          <td key="actual" {...grid.cellProps(i, grid.ci("actual"), "px-1.5 py-0 align-middle")}>
            <NumBox
              value={trimDecimal(g.actualQty)}
              disabled={locked}
              ariaLabel="Actual"
              placeholder="Actual"
              className="w-[60px]"
              onCommit={(raw) => grid.commit("actual", g, raw)}
            />
            {Math.abs(a ?? 0) >= 1000 && (
              <p className="mt-0.5 pl-0.5 text-[10.5px] font-semibold text-ink-subtle tabular-nums">
                {fmtNum(g.actualQty)}
              </p>
            )}
          </td>,
        ];
      case "target":
        return [
          <td key="target" {...grid.cellProps(i, grid.ci("target"), "px-1.5 py-0 align-middle")}>
            <NumBox
              value={trimDecimal(g.targetQty)}
              disabled={locked}
              ariaLabel="Target"
              placeholder="Target"
              className="w-[60px]"
              onCommit={(raw) => grid.commit("target", g, raw)}
            />
            {Math.abs(t ?? 0) >= 1000 && (
              <p className="mt-0.5 pl-0.5 text-[10.5px] font-semibold text-ink-subtle tabular-nums">
                {fmtNum(g.targetQty)}
              </p>
            )}
          </td>,
        ];
      case "pct":
        return [
          <td key="pct" {...grid.cellProps(i, grid.ci("pct"), "px-1.5 py-0 align-middle")}>
            {(() => {
              const auto = autoPctDone(g.targetQty, g.actualQty);
              return (
                <PctCell
                  pct={auto ?? g.pctDone}
                  disabled={locked}
                  auto={auto !== null}
                  onCommit={(p) => grid.commit("pct", g, String(p))}
                />
              );
            })()}
          </td>,
        ];
      case "teamPct":
        return [
          <td key="teamPct" {...grid.cellProps(i, grid.ci("teamPct"), "px-1.5 py-0 align-middle")}>
            <NumBox
              value={g.teamDependencyPct == null ? "" : String(g.teamDependencyPct)}
              min={0}
              max={100}
              disabled={locked}
              ariaLabel="Team participation percent"
              className="w-[56px]"
              onCommit={(raw) => grid.commit("teamPct", g, raw)}
            />
          </td>,
        ];
      case "delegate":
        return [
          <td key="delegate" {...grid.cellProps(i, grid.ci("delegate"), "px-1.5 py-0 align-middle")}>
            <DelegatesCell
              delegates={g.delegatedTo ?? null}
              roster={roster}
              disabled={locked}
              onCommit={(next) => editField(g.id, { delegatedTo: next }, () => A.editGoal({ id: g.id, delegatedTo: next }))}
            />
          </td>,
        ];
      case "targetDate":
        return [
          <td key="targetDate" className="px-1.5 py-0 align-middle">
            <TargetDateInline
              iso={g.targetDate}
              editable={level === "month" && !weekly}
              disabled={locked}
              onCommit={(v) => editField(g.id, { targetDate: v }, () => A.editGoal({ id: g.id, targetDate: v }))}
            />
          </td>,
        ];
      case "owner":
        return [
          level !== "day" ? (
            <td key="owner" className="px-1.5 py-0 align-middle">
              <AssignmentChip goal={g} />
            </td>
          ) : (
            <td key="owner" className="px-1.5 py-0 align-middle" />
          ),
        ];
      case "type":
        return [
          <td key="type" {...grid.cellProps(i, grid.ci("type"), "px-1.5 py-0 align-middle")}>
            <div className={cn(locked && "pointer-events-none opacity-60")}>
              <GoalLookupSelect
                kind="goaltype"
                noun="Type"
                compact
                placeholder="Type"
                className="[font-family:var(--font-display)]"
                value={g.goalType ? GOAL_TYPE_LABELS[g.goalType as GoalType] ?? g.goalType : ""}
                options={simplified ? QUARTER_TYPE_OPTIONS : (goaltypeOptions ?? GOAL_TYPE_OPTIONS)}
                custom={simplified ? [] : (customLookups.goaltypes ?? [])}
                isAdmin={simplified ? false : isAdmin && goaltypeOptions !== undefined}
                onChange={(v) => grid.commit("type", g, v)}
              />
            </div>
          </td>,
        ];
      case "notes":
        return [
          <td key="notes" className="px-1.5 py-0 align-top">
            <NotesCell
              goalId={g.id}
              hasNotes={(g.notes?.trim()?.length ?? 0) > 0}
              expanded={expanded.has(g.id)}
              onToggle={() => toggleExpand(g.id)}
            />
          </td>,
          <td key="attachments" className="px-1.5 py-0 align-top">
            <AttachmentsCell goalId={g.id} expanded={expanded.has(g.id)} onToggle={() => toggleExpand(g.id)} />
          </td>,
        ];
      case "targetDateStatus":
        return [
          <td key="targetDateStatus" className="px-1.5 py-0 align-middle">
            <TargetDateStatusCell iso={g.targetDate} />
          </td>,
        ];
      default:
        return [];
    }
  }

  /* ---------- bulk actions ---------- */
  const ids = React.useMemo(() => [...selected], [selected]);

  function bulkDelete() {
    removeRows(
      ids,
      () => A.bulkArchiveGoals({ ids }),
      `${ids.length} goal${ids.length === 1 ? "" : "s"} moved to the recycle bin`,
      clearSelection,
    );
  }
  function bulkSetMembers(team: TeamRef[]) {
    const sel = new Set(ids);
    const value = team.length ? team : null;
    // #7 — adding members bulk-shares onto their boards (server auto-flips too).
    const share = (value ?? []).some((m) => m.employeeId);
    setRows((prev) => prev.map((r) => (sel.has(r.id) ? { ...r, teamInvolved: value, shareWithTeam: share } : r)));
    run(
      async () => {
        for (const id of ids) {
          const res = await A.editGoal({ id, teamInvolved: value });
          if (!res.ok) return res;
        }
        return { ok: true } as ActionRes;
      },
      `Members set on ${ids.length} goal${ids.length === 1 ? "" : "s"}`,
      clearSelection,
    );
  }
  function bulkSetDelegate(delegates: DelegRef[]) {
    const sel = new Set(ids);
    const value = delegates.length ? delegates : null;
    setRows((prev) => prev.map((r) => (sel.has(r.id) ? { ...r, delegatedTo: value } : r)));
    run(
      async () => {
        for (const id of ids) {
          const res = await A.editGoal({ id, delegatedTo: value });
          if (!res.ok) return res;
        }
        return { ok: true } as ActionRes;
      },
      value
        ? `Delegated ${ids.length} goal${ids.length === 1 ? "" : "s"}`
        : `Delegation cleared on ${ids.length} goal${ids.length === 1 ? "" : "s"}`,
      clearSelection,
    );
  }
  // Human label for a chosen child period key (Q2 / Apr / Week 2 / Mon).
  const childLabelFor = React.useCallback(
    (key: string) => childMap?.targets.find((t) => t.key === key)?.label ?? periodKeyLabel(key),
    [childMap],
  );

  /** Copy the selected goals into the given CHILD periods, with a collision policy. */
  const performCopy = React.useCallback(
    (keys: string[], onDuplicate?: "skip" | "replace") => {
      const cl = childMap;
      if (!cl || keys.length === 0) return;
      const selIds = [...selected];
      startTransition(async () => {
        let copied = 0;
        let skipped = 0;
        let err = "";
        for (const key of keys) {
          const res = await bulkCopyGoalsToPeriod({
            ids: selIds,
            targetLevel: cl.childLevel,
            targetKey: key,
            ...(onDuplicate ? { onDuplicate } : {}),
          });
          if (res.ok) {
            copied += res.copied;
            skipped += res.skipped;
          } else {
            err = res.error;
          }
        }
        const labels = keys.map((k) => cl.targets.find((t) => t.key === k)?.label ?? k);
        const dest = labels.length <= 2 ? labels.join(" and ") : `${labels.length} ${cl.childNoun}s`;

        // Nothing landed and nothing was a duplicate ⇒ it genuinely failed.
        if (copied === 0 && skipped === 0) {
          fireToast({ message: err || "Nothing was copied.", type: "error" });
          return;
        }

        // Everything was already there. That is not a failure, but calling it a
        // success would be a lie — nothing changed, and the reason matters more
        // than the outcome here.
        if (copied === 0) {
          fireToast({
            message: `Already in ${dest} - nothing to copy.`,
            type: "info",
          });
          clearSelection();
          return;
        }

        scheduleRefresh();
        clearSelection();
        const noun = `${LEVEL_ADJ[level]} Goal${copied === 1 ? "" : "s"}`;
        let msg = `${copied} ${noun} copied to ${dest}.`;
        if (skipped > 0) msg += ` ${skipped} already there, skipped.`;
        // A partial failure must not read as a clean success: some destinations
        // took the copy and at least one refused, and the refusal is the half
        // the user has to act on.
        if (err) {
          fireToast({ message: `${msg} Some copies failed: ${err}`, type: "error" });
          return;
        }
        fireToast({ message: msg, type: "success" });
      });
    },
    [childMap, selected, level, scheduleRefresh, clearSelection],
  );

  /** Entry point from the Copy-to menu: detect collisions first, then either
   *  copy straight away or open the Skip/Replace/Cancel prompt. */
  const requestCopy = React.useCallback(
    (keys: string[]) => {
      const cl = childMap;
      if (!cl || keys.length === 0) return;
      const selIds = [...selected];
      startTransition(async () => {
        const det = await detectCopyCollisions({ ids: selIds, targetLevel: cl.childLevel, targetKeys: keys });
        if (!det.ok) {
          fireToast({ message: det.error, type: "error" });
          return;
        }
        if (Object.keys(det.collisions).length > 0) {
          setDupPrompt({ keys, collisions: det.collisions });
        } else {
          performCopy(keys, undefined);
        }
      });
    },
    [childMap, selected, performCopy],
  );

  function bulkMove(targetKey: string, label: string) {
    const selIds = [...selected];
    run(
      async () => {
        for (const id of selIds) {
          const res = await moveGoalToPeriod({ id, periodKey: targetKey });
          if (!res.ok) return res;
        }
        return { ok: true } as ActionRes;
      },
      `Moved ${selIds.length} goal${selIds.length === 1 ? "" : "s"} to ${label}`,
      clearSelection,
    );
  }

  function bulkStatus(pct: number, label: string) {
    const sel = new Set(ids);
    setRows((prev) => prev.map((r) => (sel.has(r.id) ? { ...r, pctDone: pct } : r)));
    run(
      async () => {
        for (const id of ids) {
          const res = await A.setGoalPctDone({ id, pctDone: pct });
          if (!res.ok) return res;
        }
        return { ok: true } as ActionRes;
      },
      `${ids.length} goal${ids.length === 1 ? "" : "s"} marked "${label}"`,
      clearSelection,
    );
  }

  function bulkTargetDate(iso: string | null) {
    const sel = new Set(ids);
    setRows((prev) => prev.map((r) => (sel.has(r.id) ? { ...r, targetDate: iso } : r)));
    run(
      async () => {
        for (const id of ids) {
          const res = await A.editGoal({ id, targetDate: iso });
          if (!res.ok) return res;
        }
        return { ok: true } as ActionRes;
      },
      iso
        ? `Target date set on ${ids.length} goal${ids.length === 1 ? "" : "s"}`
        : `Target date cleared on ${ids.length} goal${ids.length === 1 ? "" : "s"}`,
      clearSelection,
    );
  }

  function bulkDivide() {
    run(
      async () => {
        for (const id of ids) {
          const res = await divideYearlyGoal({ id });
          if (!res.ok) return res;
        }
        return { ok: true } as ActionRes;
      },
      `Divided ${ids.length} goal${ids.length === 1 ? "" : "s"} into 4 quarters + 12 months`,
      clearSelection,
    );
  }

  /* ---------- empty state ---------- */
  if (rows.length === 0) {
    return (
      <div
        className="wg-rise grid place-items-center rounded-2xl border px-6 py-14 text-center"
        style={{
          borderColor: "var(--color-hairline)",
          background: `linear-gradient(160deg, ${redTint(4)}, var(--color-surface-card))`,
        }}
      >
        <span
          className="mb-3 grid size-12 place-items-center rounded-2xl"
          style={{ background: redTint(10) }}
        >
          <ListChecks size={22} className="text-altus-red" />
        </span>
        <p className="text-[16px] font-bold text-ink-strong" style={{ fontFamily: "var(--font-serif)" }}>
          No goals yet
        </p>
        <p className="mt-1 max-w-xs text-[13px] leading-relaxed text-ink-soft">
          This bucket is a blank page. Add a goal above and it will land here, ready to edit inline.
        </p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* scoped slider chrome */}
      <style>{`
        /* No vertical dividers - a clean list feel with only horizontal rules. */
        .gtv-table th, .gtv-table td { border-right: none; }
        /* Frozen header - the same crisp glass strip as the Tasks table, at a
           smaller size than the shared text-table-head utility (dense table). */
        .gtv-table thead th {
          position: sticky;
          top: 0;
          z-index: 6;
          background-image: linear-gradient(180deg, rgba(255,255,255,0.94), rgba(244,246,249,0.90));
          backdrop-filter: blur(10px) saturate(140%);
          -webkit-backdrop-filter: blur(10px) saturate(140%);
          box-shadow: inset 0 -1px 0 var(--color-hairline-strong);
          font-size: 11px;
          padding-top: 6px;
          padding-bottom: 6px;
        }
      `}</style>

      {/* ---------- sticky bulk-actions bar ---------- */}
      {selected.size > 0 && (
        <div
          className="wg-rise sticky top-2 z-30 mb-3 flex flex-wrap items-center gap-2 overflow-hidden rounded-section border px-4 py-2.5"
          style={{
            borderColor: "color-mix(in srgb, var(--color-altus-red) 22%, var(--color-hairline-strong))",
            background: "linear-gradient(180deg, rgba(255,255,255,0.92), rgba(250,251,252,0.86))",
            backdropFilter: "blur(16px) saturate(150%)",
            WebkitBackdropFilter: "blur(16px) saturate(150%)",
            boxShadow: "0 12px 32px -12px rgba(225, 6, 0, 0.18), 0 6px 20px -8px rgba(15,23,42,0.16)",
          }}
        >
          {/* Brand accent rail — marks the bar as a live, armed control strip. */}
          <span
            aria-hidden
            className="absolute inset-y-0 left-0 w-[3px]"
            style={{ background: "linear-gradient(180deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
          />
          <span className="inline-flex items-center gap-2 text-[14px] font-bold text-ink-strong">
            <span
              className="inline-flex items-center justify-center min-w-6 h-6 px-2 rounded-pill text-white tabular-nums text-[12.5px] font-black"
              style={{
                background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
                boxShadow: "0 3px 8px -3px rgba(225, 6, 0, 0.5)",
              }}
            >
              {selected.size}
            </span>
            selected
          </span>

          <span className="mx-1 h-5 w-px bg-hairline" aria-hidden />

          {/* Edit — only when EXACTLY one row is selected (single-goal edit). */}
          {!weekly && selected.size === 1 && (
            <button
              type="button"
              onClick={() => {
                const g = rows.find((r) => selected.has(r.id));
                if (g) setEditingGoal(g);
              }}
              className={cn(MENU_BTN, FOCUS_RING)}
            >
              <Pencil size={14} strokeWidth={2.2} /> Edit
            </button>
          )}

          <button
            type="button"
            onClick={bulkDelete}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-pill border px-3 py-1.5 text-[13px] font-bold text-altus-red bg-surface-card shadow-[0_1px_2px_rgba(15,23,42,0.05)] hover:bg-altus-red/8 transition-colors",
              FOCUS_RING,
            )}
            style={{ borderColor: "color-mix(in srgb, var(--color-altus-red) 35%, transparent)" }}
          >
            <Trash2 size={14} strokeWidth={2.2} /> Delete
          </button>

          {level === "year" && (
            <>
              <span className="mx-0.5 hidden h-5 w-px sm:block" style={{ background: "var(--color-hairline-strong)" }} />
              <button
                type="button"
                onClick={bulkDivide}
                title="Divide each selected yearly goal into 4 quarters + 12 months"
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-pill border px-3 py-1.5 text-[13px] font-bold text-altus-red bg-surface-card shadow-[0_1px_2px_rgba(15,23,42,0.05)] hover:bg-altus-red/8 transition-colors",
                  FOCUS_RING,
                )}
                style={{ borderColor: "color-mix(in srgb, var(--color-altus-red) 35%, transparent)" }}
              >
                <Split size={14} strokeWidth={2.2} /> Divide into 4Q + 12M
              </button>
            </>
          )}

          <span className="mx-0.5 hidden h-5 w-px sm:block" style={{ background: "var(--color-hairline-strong)" }} />

          <BulkMembers roster={roster} count={selected.size} onApply={bulkSetMembers} />
          {!weekly && <BulkDelegate roster={roster} count={selected.size} onApply={bulkSetDelegate} />}

          {/* Status bulk-action — dropped from Quarterly's bar (goal status here
              is tracked via % Done + the Type taxonomy, not a status verdict). */}
          {!simplified && (
            <>
              <span className="mx-0.5 hidden h-5 w-px sm:block" style={{ background: "var(--color-hairline-strong)" }} />
              <BulkStatusMenu onPick={bulkStatus} />
            </>
          )}

          {!weekly && (
            <>
              {/* Context-aware copy: only the CURRENT level's immediate child periods. */}
              {childMap && childMap.targets.length > 0 && (
                <>
                  <span className="mx-0.5 hidden h-5 w-px sm:block" style={{ background: "var(--color-hairline-strong)" }} />
                  <CopyToMenu childMap={childMap} count={selected.size} onCopy={requestCopy} />
                </>
              )}

              {/* Move to a sibling bucket at this level (quarter / month only). */}
              {siblings.length > 0 && (
                <MoveToMenu siblings={siblings} noun={level === "quarter" ? "quarter" : "month"} onMove={bulkMove} />
              )}

              {/* Target date — an editable deadline only exists on month goals.
                  PHASE 2: week deadlines are composer-driven on the weekly board. */}
              {level === "month" && <BulkTargetDate onApply={bulkTargetDate} />}
            </>
          )}

          <button
            type="button"
            onClick={clearSelection}
            className={cn(
              "ml-auto inline-flex items-center gap-1.5 rounded-pill bg-surface-card px-3 py-1.5 text-[13px] font-semibold text-ink-subtle transition-colors hover:text-ink-strong",
              FOCUS_RING,
            )}
          >
            <X size={14} strokeWidth={2.4} /> Clear
          </button>
        </div>
      )}

      {/* ---------- the table ---------- */}
      <div
        className="wg-rise bg-surface-card rounded-section border border-hairline overflow-x-auto overflow-y-auto overscroll-x-contain max-h-[calc(100vh-260px)]"
        onKeyDown={grid.onKeyDown}
        onBlur={(e) => {
          // Clear the active-cell highlight when focus leaves the table entirely
          // (fixes the stuck red/highlight box that never went away).
          if (!e.currentTarget.contains(e.relatedTarget as Node | null)) grid.blur();
        }}
        style={{
          boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04), 0 16px 40px -24px rgba(15, 23, 42, 0.20)",
        }}
      >
        <table className="gtv-table w-full border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-hairline-strong">
              <th className={cn(TH, "w-7 pl-2 pr-1")}>
                <BrandCheck
                  checked={allSelected}
                  indeterminate={someSelected}
                  onToggle={toggleAll}
                  label="Select all goals"
                />
              </th>
              {orderedColumnKeys.flatMap((k) =>
                headerCellsFor(k).map((cell) => (
                  <th
                    key={cell.reactKey}
                    className={cn(
                      cell.className,
                      draggableCols && "cursor-grab touch-none select-none",
                      dragColKey === k && "opacity-40",
                    )}
                    onPointerDown={
                      draggableCols
                        ? (e) => {
                            e.preventDefault();
                            startColDrag(k);
                          }
                        : undefined
                    }
                    onPointerEnter={draggableCols ? () => crossCol(k) : undefined}
                    onPointerUp={draggableCols ? () => crossCol(k) : undefined}
                  >
                    {cell.label}
                  </th>
                )),
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((g, i) => {
              const isSel = selected.has(g.id);
              const t = num(g.targetQty);
              const a = num(g.actualQty);
              return (
                <React.Fragment key={g.id}>
                <tr
                  className={cn(
                    "group border-b border-gray-200 transition-colors",
                    !isSel && "hover:bg-slate-50/80",
                  )}
                  style={{
                    background: isSel ? redTint(6) : undefined,
                  }}
                >
                  {/* select — checking the box also opens the Edit popup
                      automatically (unchecking just deselects). */}
                  <td className="py-0 pl-2 pr-1 align-middle">
                    <BrandCheck
                      checked={isSel}
                      onToggle={() => {
                        toggleRow(g.id);
                        if (simplified && !isSel) setPreviewGoal(g);
                      }}
                      label={`Select "${g.title}"`}
                    />
                  </td>

                  {orderedColumnKeys.flatMap((k) => bodyCellsFor(k, g, i, t, a))}

                </tr>
                {expanded.has(g.id) && (
                  <GoalDetailRow
                    goalId={g.id}
                    notes={g.notes}
                    canWrite={!locked}
                    colSpan={
                      simplified
                        ? // "notes" is one key in visibleCols but now renders TWO
                          // physical columns (Notes + Attachments) — count it twice.
                          6 +
                          visibleCols.size +
                          (visibleCols.has("notes") ? 1 : 0) +
                          (level === "month" || level === "week" ? 1 : 0)
                        : level === "month" || level === "week"
                          ? 13
                          : 12
                    }
                    nodeKind={detailKind}
                    assignment={assignmentInfo(g)}
                    // No View button on the table itself (first screen) — only
                    // on the standalone /goals/[id] full-detail screen.
                    showAttachmentView={false}
                    onSaveNotes={(n) => patchNotes(g.id, n)}
                    onClose={() => {
                      toggleExpand(g.id);
                      requestAnimationFrame(() =>
                        document.querySelector<HTMLElement>(`[data-notes-toggle="${g.id}"]`)?.focus(),
                      );
                    }}
                  />
                )}
                </React.Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Select-a-row flow: click the code badge (or check its row) opens a
          VIEW-ONLY popup — no inputs, no Save. Editing stays on the table's
          own inline cells (Area/Goal/Target/% Done/Type). */}
      {previewGoal && (
        <GoalDetailPopup
          goal={previewGoal}
          onClose={closePreview}
        />
      )}

      {editingGoal && (
        <GoalEditDialog
          mode={{ kind: "edit", goal: editingGoal }}
          roster={roster}
          open={!!editingGoal}
          onOpenChange={(o) => {
            if (!o) setEditingGoal(null);
          }}
        />
      )}

      <DupCollisionDialog
        open={dupPrompt != null}
        collisions={dupPrompt?.collisions ?? {}}
        labelFor={childLabelFor}
        onResolve={(mode) => {
          const pending = dupPrompt;
          setDupPrompt(null);
          if (mode && pending) performCopy(pending.keys, mode);
        }}
      />
    </div>
  );
}
