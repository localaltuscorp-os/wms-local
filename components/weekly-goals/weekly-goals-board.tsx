"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import {
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Plus,
  Trash2,
  CopyPlus,
  ExternalLink,
  BarChart3,
  Loader2,
} from "lucide-react";
import { PRIORITY_LABELS, TASK_PRIORITIES, type TaskPriority } from "@/db/enums";
import { fireToast } from "@/lib/toast";
import type { WeeklyGoalRow } from "@/lib/queries/weekly-goals";
import { WeeklyGoalsImport } from "@/components/weekly-goals/weekly-goals-import";
import {
  createWeeklyGoal,
  editWeeklyGoal,
  setWeeklyGoalPct,
  carryOverWeeklyGoal,
  deleteWeeklyGoal,
  setWeeklyGoalIncentive,
} from "@/app/(app)/weekly-goals/actions";

const PRIORITY_TONE: Record<TaskPriority, string> = {
  imp_urgent: "red",
  imp_not_urgent: "amber",
  not_imp_urgent: "blue",
  not_imp_not_urgent: "slate",
};

const PCT_PRESETS = [0, 25, 50, 75, 100];

interface Props {
  me: { id: string; isAdmin: boolean };
  weekStart: string;
  weekLabel: string;
  isCurrentWeek: boolean;
  scopeEmp: string;
  employees: { id: string; name: string }[];
  rows: WeeklyGoalRow[];
  clientOptions: string[];
  subjectOptions: string[];
  prevWeek: string;
  nextWeek: string;
  thisWeek: string;
}

export function WeeklyGoalsBoard(props: Props) {
  const router = useRouter();

  function go(params: Record<string, string>) {
    const sp = new URLSearchParams();
    for (const [k, v] of Object.entries(params)) if (v) sp.set(k, v);
    router.push(`/weekly-goals?${sp.toString()}` as Route);
  }

  // Group rows by employee when an admin is viewing "all".
  const grouped = React.useMemo(() => {
    const map = new Map<string, { name: string; rows: WeeklyGoalRow[] }>();
    for (const r of props.rows) {
      if (!map.has(r.employeeId)) map.set(r.employeeId, { name: r.employeeName, rows: [] });
      map.get(r.employeeId)!.rows.push(r);
    }
    return [...map.entries()];
  }, [props.rows]);

  const showingAll = props.scopeEmp === "all";

  return (
    <main className="mx-auto max-w-[1600px] px-12 max-md:px-4 pt-8 pb-24">
      {/* Header ------------------------------------------------------- */}
      <header className="mb-6 flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1
            className="text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 900,
              fontSize: "clamp(36px, 3.8vw, 52px)",
              letterSpacing: "-0.025em",
              lineHeight: 1,
            }}
          >
            Weekly Goals
          </h1>
          <p className="mt-2 text-ink-muted font-semibold" style={{ fontSize: 17 }}>
            Top priorities each team member commits to finishing this week.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <WeeklyGoalsImport
            employeeId={props.scopeEmp}
            weekStart={props.weekStart}
            weekLabel={props.weekLabel}
            isAdmin={props.me.isAdmin}
          />
          <Link
            href={"/weekly-goals/dashboard" as Route}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-[14.5px] font-bold text-white transition-all hover:brightness-110 active:scale-[0.98]"
            style={{
              background:
                "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
              boxShadow: "0 6px 18px -6px rgba(225, 6, 0, 0.55)",
            }}
          >
            <BarChart3 size={16} strokeWidth={2.4} />
            Performance Dashboard
          </Link>
        </div>
      </header>

      {/* Controls: week nav + employee scope -------------------------- */}
      <div className="mb-6 flex items-center gap-3 flex-wrap">
        <div className="inline-flex items-center rounded-full border border-hairline bg-surface-card overflow-hidden">
          <button
            type="button"
            aria-label="Previous week"
            onClick={() => go({ week: props.prevWeek, emp: props.scopeEmp })}
            className="px-3 py-2 hover:bg-black/[0.03] transition-colors"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="px-4 py-2 inline-flex items-center gap-2 font-bold text-ink-strong text-[15px] tabular-nums border-x border-hairline">
            <CalendarDays size={16} className="text-ink-muted" />
            {props.weekLabel}
          </span>
          <button
            type="button"
            aria-label="Next week"
            onClick={() => go({ week: props.nextWeek, emp: props.scopeEmp })}
            className="px-3 py-2 hover:bg-black/[0.03] transition-colors"
          >
            <ChevronRight size={18} />
          </button>
        </div>
        {!props.isCurrentWeek && (
          <button
            type="button"
            onClick={() => go({ week: props.thisWeek, emp: props.scopeEmp })}
            className="px-4 py-2 rounded-full border border-hairline bg-surface-card font-bold text-[14px] text-ink-soft hover:text-ink-strong transition-colors"
          >
            This week
          </button>
        )}

        {props.me.isAdmin && (
          <select
            value={props.scopeEmp}
            onChange={(e) => go({ week: props.weekStart, emp: e.target.value })}
            className="ml-auto px-4 py-2 rounded-full border border-hairline bg-surface-card font-bold text-[14px] text-ink-strong"
          >
            <option value="all">All team members</option>
            {props.employees.map((e) => (
              <option key={e.id} value={e.id}>
                {e.name}
              </option>
            ))}
          </select>
        )}
      </div>

      {/* Body --------------------------------------------------------- */}
      {showingAll ? (
        grouped.length === 0 ? (
          <EmptyState />
        ) : (
          <div className="space-y-8">
            {grouped.map(([empId, g]) => (
              <section key={empId}>
                <h2 className="mb-2 font-black text-ink-strong text-[18px]">
                  {g.name}{" "}
                  <span className="text-ink-muted font-bold text-[14px]">
                    · {g.rows.length} {g.rows.length === 1 ? "goal" : "goals"} ·{" "}
                    {avg(g.rows)}% avg
                  </span>
                </h2>
                <GoalsTable {...props} rows={g.rows} lockedEmployeeId={empId} />
              </section>
            ))}
            {/* Admin can still add for a specific person via the picker. */}
          </div>
        )
      ) : (
        <>
          <GoalsTable {...props} lockedEmployeeId={props.scopeEmp} />
          <AddRow
            me={props.me}
            employeeId={props.scopeEmp}
            weekStart={props.weekStart}
            clientOptions={props.clientOptions}
            subjectOptions={props.subjectOptions}
          />
        </>
      )}
    </main>
  );
}

function avg(rows: WeeklyGoalRow[]): number {
  if (rows.length === 0) return 0;
  return Math.round(rows.reduce((a, r) => a + r.pctDone, 0) / rows.length);
}

function EmptyState() {
  return (
    <div
      className="bg-surface-card rounded-section border border-hairline p-10 text-center"
      style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
    >
      <p className="font-bold" style={{ fontSize: 20, color: "var(--color-ink-strong)" }}>
        No weekly goals set yet.
      </p>
      <p className="mt-2 font-semibold" style={{ fontSize: 15, color: "var(--color-ink-muted)" }}>
        Pick a team member, then add their top priorities for the week below.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Table                                                               */
/* ------------------------------------------------------------------ */

const TH =
  "px-3 py-2.5 text-left text-[12px] font-black uppercase tracking-[0.05em] text-ink-muted whitespace-nowrap";
const TD = "px-3 py-2 align-top text-[14px] text-ink-strong";

function GoalsTable(
  props: Pick<Props, "me" | "clientOptions" | "subjectOptions" | "weekStart"> & {
    rows: WeeklyGoalRow[];
    lockedEmployeeId: string;
  },
) {
  if (props.rows.length === 0) {
    return (
      <div className="rounded-section border border-hairline bg-surface-card p-6 text-center text-ink-muted font-semibold text-[14px]">
        No goals for this week yet.
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-section border border-hairline bg-surface-card">
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-hairline bg-black/[0.015]">
            <th className={TH} style={{ width: 48 }}>
              #
            </th>
            <th className={TH}>Client</th>
            <th className={TH}>Subject</th>
            <th className={TH}>Priority</th>
            <th className={TH} style={{ width: 70 }}>
              Incentive
            </th>
            <th className={TH} style={{ width: 60 }}>
              KPI
            </th>
            <th className={TH}>Target</th>
            <th className={TH} style={{ width: 200 }}>
              % Done
            </th>
            <th className={TH}>Explanation</th>
            <th className={TH} style={{ width: 90 }}>
              <span className="sr-only">Actions</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {props.rows.map((row, i) => (
            <GoalRow
              key={row.id}
              row={row}
              srNo={i + 1}
              me={props.me}
              clientOptions={props.clientOptions}
              subjectOptions={props.subjectOptions}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function GoalRow({
  row,
  srNo,
  me,
  clientOptions,
  subjectOptions,
}: {
  row: WeeklyGoalRow;
  srNo: number;
  me: { id: string; isAdmin: boolean };
  clientOptions: string[];
  subjectOptions: string[];
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const canEdit = me.isAdmin || row.employeeId === me.id;

  function save(patch: Parameters<typeof editWeeklyGoal>[0]) {
    start(async () => {
      await editWeeklyGoal(patch);
      router.refresh();
    });
  }
  function savePct(pctDone: number) {
    start(async () => {
      await setWeeklyGoalPct({ id: row.id, pctDone });
      router.refresh();
    });
  }

  return (
    <tr className="border-b border-hairline last:border-0 hover:bg-black/[0.012] transition-colors">
      <td className={`${TD} tabular-nums font-bold text-ink-muted`}>{srNo}</td>

      {/* Client */}
      <td className={TD}>
        <ComboInput
          value={row.client ?? ""}
          options={clientOptions}
          disabled={!canEdit}
          placeholder="Client…"
          onCommit={(v) => save({ id: row.id, client: v || null })}
        />
      </td>

      {/* Subject */}
      <td className={TD}>
        <ComboInput
          value={row.subject ?? ""}
          options={subjectOptions}
          disabled={!canEdit}
          placeholder="Subject…"
          onCommit={(v) => save({ id: row.id, subject: v || null })}
        />
      </td>

      {/* Priority */}
      <td className={TD}>
        <PriorityPicker
          value={row.priority}
          disabled={!canEdit}
          onChange={(p) => save({ id: row.id, priority: p })}
        />
      </td>

      {/* Incentive */}
      <td className={`${TD} text-center`}>
        <IncentiveCell
          id={row.id}
          incentive={row.incentive}
          amount={row.incentiveAmount}
          canEdit={canEdit}
          isAdmin={me.isAdmin}
          onToggle={(v) => save({ id: row.id, incentive: v })}
        />
      </td>

      {/* KPI */}
      <td className={`${TD} text-center`}>
        <YesNo
          value={row.kpi}
          disabled={!canEdit}
          onChange={(v) => save({ id: row.id, kpi: v })}
        />
      </td>

      {/* Target */}
      <td className={TD} style={{ minWidth: 160 }}>
        <AutoTextarea
          value={row.targetDone ?? ""}
          disabled={!canEdit}
          placeholder="What does done look like?"
          onCommit={(v) => save({ id: row.id, targetDone: v || null })}
        />
      </td>

      {/* % Done */}
      <td className={TD}>
        <PctControl value={row.pctDone} disabled={!canEdit} onChange={savePct} />
      </td>

      {/* Explanation + link */}
      <td className={TD} style={{ minWidth: 180 }}>
        <AutoTextarea
          value={row.explanation ?? ""}
          disabled={!canEdit}
          placeholder="Notes…"
          onCommit={(v) => save({ id: row.id, explanation: v || null })}
        />
        <LinkField
          value={row.linkUrl ?? ""}
          disabled={!canEdit}
          onCommit={(v) => save({ id: row.id, linkUrl: v || null })}
        />
        {row.carriedFromId && (
          <span className="mt-1 inline-block text-[11px] font-bold text-ink-muted">
            ↪ carried over
          </span>
        )}
      </td>

      {/* Actions */}
      <td className={TD}>
        <div className="flex items-center gap-1">
          {pending && <Loader2 size={14} className="animate-spin text-ink-muted" />}
          {canEdit && <CarryOverButton id={row.id} pct={row.pctDone} />}
          {canEdit && <DeleteButton id={row.id} name={row.client || row.subject || row.targetDone || "this goal"} />}
        </div>
      </td>
    </tr>
  );
}

/* ------------------------------------------------------------------ */
/* Field controls                                                       */
/* ------------------------------------------------------------------ */

/**
 * Type-ahead text field with a properly-anchored suggestion dropdown. Replaces
 * the old native <datalist>, whose option list the browser positioned itself
 * (often floating mid-page / above the field). This dropdown is CSS-anchored
 * directly under the input. Free text is allowed; suggestions just speed entry.
 */
function ComboInput({
  value,
  options,
  disabled,
  placeholder,
  onCommit,
  onChange,
  inputRef,
  className,
}: {
  value: string;
  options: string[];
  disabled?: boolean;
  placeholder?: string;
  onCommit?: (v: string) => void;
  onChange?: (v: string) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
  className?: string;
}) {
  const [v, setV] = React.useState(value);
  const [open, setOpen] = React.useState(false);
  const [hi, setHi] = React.useState(0);
  const wrapRef = React.useRef<HTMLDivElement>(null);
  const localRef = React.useRef<HTMLInputElement>(null);
  const ref = inputRef ?? localRef;
  React.useEffect(() => setV(value), [value]);

  React.useEffect(() => {
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  const filtered = React.useMemo(() => {
    const q = v.trim().toLowerCase();
    const base = q ? options.filter((o) => o.toLowerCase().includes(q)) : options;
    return base.slice(0, 50);
  }, [options, v]);

  function set(next: string) { setV(next); onChange?.(next); }
  function commit(next: string) { const t = next.trim(); if (t !== value) onCommit?.(t); }
  function choose(opt: string) { set(opt); setOpen(false); if (opt !== value) onCommit?.(opt); ref.current?.focus(); }

  return (
    <div className="relative" ref={wrapRef}>
      <input
        ref={ref}
        type="text"
        value={v}
        disabled={disabled}
        placeholder={placeholder}
        onChange={(e) => { set(e.target.value); setOpen(true); setHi(0); }}
        onFocus={() => setOpen(true)}
        onBlur={() => commit(v)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") { e.preventDefault(); setOpen(true); setHi((h) => Math.min(h + 1, filtered.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
          else if (e.key === "Enter") { if (open && filtered[hi]) { e.preventDefault(); choose(filtered[hi]); } }
          else if (e.key === "Escape") { setOpen(false); }
        }}
        className={className ?? "w-full min-w-[120px] rounded-md border border-hairline bg-white px-2 py-1.5 text-[13.5px] font-semibold text-ink-strong outline-none focus:border-altus-red/50 disabled:bg-transparent disabled:border-transparent"}
      />
      {open && !disabled && filtered.length > 0 && (
        <ul
          role="listbox"
          className="absolute left-0 right-0 top-full z-50 mt-1 max-h-56 overflow-y-auto rounded-md border bg-surface-card py-1"
          style={{ borderColor: "var(--color-hairline-strong)", boxShadow: "0 16px 40px -12px rgba(15,23,42,0.28)", minWidth: 160 }}
        >
          {filtered.map((opt, i) => (
            <li
              key={opt}
              role="option"
              aria-selected={i === hi}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setHi(i)}
              onClick={() => choose(opt)}
              className="cursor-pointer truncate px-3 py-1.5 text-[13.5px] font-semibold text-ink-strong"
              style={{ background: i === hi ? "var(--color-surface-soft)" : "transparent" }}
            >
              {opt}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function AutoTextarea({
  value,
  disabled,
  placeholder,
  onCommit,
}: {
  value: string;
  disabled?: boolean;
  placeholder?: string;
  onCommit: (v: string) => void;
}) {
  const [v, setV] = React.useState(value);
  React.useEffect(() => setV(value), [value]);
  return (
    <textarea
      value={v}
      rows={2}
      disabled={disabled}
      placeholder={placeholder}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onCommit(v.trim())}
      className="w-full resize-y rounded-md border border-hairline bg-white px-2 py-1.5 text-[13px] font-medium text-ink-strong outline-none focus:border-altus-red/50 disabled:bg-transparent disabled:border-transparent"
    />
  );
}

function LinkField({
  value,
  disabled,
  onCommit,
}: {
  value: string;
  disabled?: boolean;
  onCommit: (v: string) => void;
}) {
  const [v, setV] = React.useState(value);
  React.useEffect(() => setV(value), [value]);
  return (
    <div className="mt-1 flex items-center gap-1">
      <input
        type="url"
        value={v}
        disabled={disabled}
        placeholder="https://link to proof"
        onChange={(e) => setV(e.target.value)}
        onBlur={() => v !== value && onCommit(v.trim())}
        className="w-full rounded-md border border-hairline bg-white px-2 py-1 text-[12px] font-medium text-blue-700 outline-none focus:border-altus-red/50 disabled:bg-transparent disabled:border-transparent"
      />
      {value && (
        <a href={value} target="_blank" rel="noreferrer" aria-label="Open link">
          <ExternalLink size={14} className="text-blue-600 shrink-0" />
        </a>
      )}
    </div>
  );
}

function PriorityPicker({
  value,
  disabled,
  onChange,
}: {
  value: TaskPriority;
  disabled?: boolean;
  onChange: (p: TaskPriority) => void;
}) {
  const tone = PRIORITY_TONE[value];
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as TaskPriority)}
      className="rounded-full px-2.5 py-1 text-[12.5px] font-bold outline-none disabled:appearance-none"
      style={{
        background: `color-mix(in srgb, var(--color-${tone}) 14%, transparent)`,
        color: `var(--color-${tone}-deep)`,
        border: `1px solid color-mix(in srgb, var(--color-${tone}) 40%, transparent)`,
      }}
    >
      {TASK_PRIORITIES.map((p) => (
        <option key={p} value={p}>
          {PRIORITY_LABELS[p]}
        </option>
      ))}
    </select>
  );
}

function YesNo({
  value,
  disabled,
  onChange,
}: {
  value: boolean;
  disabled?: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => onChange(!value)}
      className="rounded-full px-2.5 py-1 text-[12px] font-black transition-colors disabled:opacity-60"
      style={{
        background: value
          ? "color-mix(in srgb, var(--color-green) 16%, transparent)"
          : "color-mix(in srgb, var(--color-slate) 12%, transparent)",
        color: value ? "var(--color-green-deep)" : "var(--color-ink-muted)",
      }}
    >
      {value ? "Yes" : "No"}
    </button>
  );
}

function PctControl({
  value,
  disabled,
  onChange,
}: {
  value: number;
  disabled?: boolean;
  onChange: (v: number) => void;
}) {
  const [v, setV] = React.useState(String(value));
  React.useEffect(() => setV(String(value)), [value]);
  const tone = value >= 100 ? "green" : value >= 50 ? "amber" : value > 0 ? "orange" : "slate";

  function commit(n: number) {
    const clamped = Math.max(0, Math.min(100, Math.round(n)));
    onChange(clamped);
  }

  return (
    <div className="flex flex-col gap-1.5 min-w-[180px]">
      <div className="flex items-center gap-2">
        <div className="h-2 flex-1 rounded-full bg-black/[0.06] overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${value}%`,
              background: `linear-gradient(90deg, var(--color-${tone}), var(--color-${tone}-deep))`,
            }}
          />
        </div>
        <input
          type="number"
          min={0}
          max={100}
          value={v}
          disabled={disabled}
          onChange={(e) => setV(e.target.value)}
          onBlur={() => Number(v) !== value && commit(Number(v))}
          className="w-14 rounded-md border border-hairline bg-white px-1.5 py-1 text-[13px] font-bold tabular-nums text-ink-strong text-right outline-none focus:border-altus-red/50 disabled:bg-transparent disabled:border-transparent"
        />
        <span className="text-[12px] font-bold text-ink-muted">%</span>
      </div>
      {!disabled && (
        <div className="flex gap-1">
          {PCT_PRESETS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => commit(p)}
              className="flex-1 rounded px-1 py-0.5 text-[10.5px] font-bold text-ink-muted hover:bg-black/[0.05] hover:text-ink-strong transition-colors"
            >
              {p}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function CarryOverButton({ id, pct }: { id: string; pct: number }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  function carry() {
    start(async () => {
      // Keep progress when partially done so the next week starts where we left
      // off; a fully-fresh repeat (pct 0) carries nothing.
      await carryOverWeeklyGoal({ id, keepProgress: pct > 0 && pct < 100 });
      router.refresh();
    });
  }
  return (
    <button
      type="button"
      onClick={carry}
      disabled={pending}
      title="Carry over to next week"
      className="rounded-md p-1.5 text-ink-muted hover:bg-black/[0.05] hover:text-ink-strong transition-colors"
    >
      <CopyPlus size={15} />
    </button>
  );
}

function DeleteButton({ id, name }: { id: string; name: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  function performDelete() {
    start(async () => {
      await deleteWeeklyGoal({ id });
      setConfirmOpen(false);
      router.refresh();
    });
  }
  return (
    <>
      <button
        type="button"
        onClick={() => setConfirmOpen(true)}
        disabled={pending}
        title="Delete goal"
        className="rounded-md p-1.5 text-ink-muted hover:bg-red-50 hover:text-altus-red transition-colors"
      >
        <Trash2 size={15} />
      </button>
      <DeleteGoalDialog
        name={name}
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        pending={pending}
        onConfirm={performDelete}
      />
    </>
  );
}

/**
 * Two-step delete confirmation — same pattern as the project-tree / incentive
 * delete dialogs. Step 1 reviews; step 2 requires typing the goal name.
 */
function DeleteGoalDialog({
  name,
  open,
  onOpenChange,
  pending,
  onConfirm,
}: {
  name: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  pending: boolean;
  onConfirm: () => void;
}) {
  const [step, setStep] = React.useState<1 | 2>(1);
  const [typed, setTyped] = React.useState("");
  React.useEffect(() => {
    if (!open) { setStep(1); setTyped(""); }
  }, [open]);
  const confirmable = typed.trim().toLowerCase() === name.trim().toLowerCase();

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-black/40" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[100] w-full max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-surface-card p-6 max-h-[calc(100dvh-32px)] overflow-y-auto"
          style={{ border: "1px solid var(--color-hairline-strong)", boxShadow: "0 24px 60px -16px rgba(15,23,42,0.4)" }}
        >
          <div className="flex items-start gap-3 mb-4">
            <span aria-hidden className="inline-flex shrink-0 items-center justify-center size-10 rounded-xl"
              style={{ background: "color-mix(in srgb, var(--color-altus-red) 12%, transparent)", color: "var(--color-altus-red)" }}>
              <Trash2 size={19} strokeWidth={2.2} />
            </span>
            <div className="min-w-0">
              <Dialog.Title className="text-ink-strong"
                style={{ fontFamily: "var(--font-serif)", fontStyle: "italic", fontSize: 22, letterSpacing: "-0.01em" }}>
                Delete weekly goal?
              </Dialog.Title>
              <Dialog.Description className="text-[14px] text-ink-subtle mt-1" style={{ lineHeight: 1.5 }}>
                {step === 1 ? "Step 1 of 2 — review what will be removed." : "Step 2 of 2 — confirm to finish."}
              </Dialog.Description>
            </div>
          </div>

          {step === 1 ? (
            <>
              <div className="rounded-chip p-4 mb-4"
                style={{ background: "var(--color-surface-soft)", border: "1px solid var(--color-hairline)" }}>
                <p className="text-[15px] text-ink-strong font-semibold break-words">“{name}”</p>
                <ul className="mt-2 space-y-1 text-[13.5px] text-ink-soft" style={{ lineHeight: 1.5 }}>
                  <li>• Removes this goal and its % progress history.</li>
                  <li>• Any linked incentive entry is handled separately.</li>
                  <li>• This <strong>cannot be undone</strong>.</li>
                </ul>
              </div>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => onOpenChange(false)}
                  className="px-4 py-2.5 text-[14px] font-semibold text-ink-soft hover:text-ink-strong transition-colors">
                  Cancel
                </button>
                <button type="button" onClick={() => setStep(2)}
                  className="rounded-pill px-5 py-2.5 text-[14px] font-bold text-white transition-all hover:-translate-y-px"
                  style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}>
                  Continue
                </button>
              </div>
            </>
          ) : (
            <>
              <p className="text-[14px] text-ink-soft mb-2" style={{ lineHeight: 1.55 }}>
                Type <span className="font-bold text-ink-strong">{name}</span> to confirm deletion.
              </p>
              <input
                autoFocus
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter" && confirmable && !pending) onConfirm(); }}
                placeholder={name}
                className="w-full rounded-md border px-3.5 py-2.5 text-[15px] outline-none focus:border-altus-red mb-4"
                style={{ borderColor: "var(--color-hairline-strong)" }}
              />
              <div className="flex justify-between gap-2">
                <button type="button" onClick={() => setStep(1)} disabled={pending}
                  className="px-4 py-2.5 text-[14px] font-semibold text-ink-soft hover:text-ink-strong transition-colors disabled:opacity-50">
                  ← Back
                </button>
                <button type="button" onClick={onConfirm} disabled={!confirmable || pending}
                  className="rounded-pill px-5 py-2.5 text-[14px] font-bold text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed enabled:hover:-translate-y-px"
                  style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}>
                  {pending ? "Deleting…" : "Permanently delete"}
                </button>
              </div>
            </>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/* ------------------------------------------------------------------ */
/* Fast add row                                                         */
/* ------------------------------------------------------------------ */

function AddRow({
  me,
  employeeId,
  weekStart,
  clientOptions,
  subjectOptions,
}: {
  me: { id: string; isAdmin: boolean };
  employeeId: string;
  weekStart: string;
  clientOptions: string[];
  subjectOptions: string[];
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [client, setClient] = React.useState("");
  const [subject, setSubject] = React.useState("");
  const [priority, setPriority] = React.useState<TaskPriority>("imp_not_urgent");
  const [incentive, setIncentive] = React.useState(false);
  const [kpi, setKpi] = React.useState(false);
  const [targetDone, setTargetDone] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const clientRef = React.useRef<HTMLInputElement>(null);

  // No employee selected yet (admin on "all" view) — adding is disabled there.
  const canAdd = Boolean(employeeId) && employeeId !== "all";

  function submit() {
    if (!canAdd) return;
    if (!client.trim() && !subject.trim() && !targetDone.trim()) {
      setError("Add a client, subject, or target before saving.");
      return;
    }
    setError(null);
    start(async () => {
      const res = await createWeeklyGoal({
        employeeId,
        weekStart,
        client: client.trim() || null,
        subject: subject.trim() || null,
        priority,
        incentive,
        kpi,
        targetDone: targetDone.trim() || null,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      // Reset for the next quick entry, keep focus on Client for speed.
      setClient("");
      setSubject("");
      setTargetDone("");
      setIncentive(false);
      setKpi(false);
      router.refresh();
      clientRef.current?.focus();
    });
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) submit();
  }

  if (!canAdd) return null;

  return (
    <div
      className="mt-4 rounded-section border border-dashed border-hairline bg-surface-card p-4"
      onKeyDown={onKeyDown}
    >
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-[12px] font-black uppercase tracking-[0.05em] text-ink-muted">
          Add priority
        </span>
        <ComboInput
          value={client}
          options={clientOptions}
          onChange={setClient}
          inputRef={clientRef}
          placeholder="Client"
          className="w-40 rounded-md border border-hairline bg-white px-2.5 py-1.5 text-[13.5px] font-semibold outline-none focus:border-altus-red/50"
        />
        <ComboInput
          value={subject}
          options={subjectOptions}
          onChange={setSubject}
          placeholder="Subject"
          className="w-40 rounded-md border border-hairline bg-white px-2.5 py-1.5 text-[13.5px] font-semibold outline-none focus:border-altus-red/50"
        />
        <select
          value={priority}
          onChange={(e) => setPriority(e.target.value as TaskPriority)}
          className="rounded-md border border-hairline bg-white px-2.5 py-1.5 text-[13.5px] font-bold outline-none"
        >
          {TASK_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {PRIORITY_LABELS[p]}
            </option>
          ))}
        </select>
        <label className="inline-flex items-center gap-1 text-[13px] font-bold text-ink-soft">
          <input type="checkbox" checked={incentive} onChange={(e) => setIncentive(e.target.checked)} />
          Incentive
        </label>
        <label className="inline-flex items-center gap-1 text-[13px] font-bold text-ink-soft">
          <input type="checkbox" checked={kpi} onChange={(e) => setKpi(e.target.checked)} />
          KPI
        </label>
        <input
          value={targetDone}
          onChange={(e) => setTargetDone(e.target.value)}
          placeholder="Target"
          className="min-w-[180px] flex-1 rounded-md border border-hairline bg-white px-2.5 py-1.5 text-[13.5px] font-medium outline-none focus:border-altus-red/50"
        />
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-[14px] font-bold text-white transition-all hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
          style={{
            background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
          }}
        >
          {pending ? <Loader2 size={15} className="animate-spin" /> : <Plus size={15} />}
          Add
        </button>
      </div>
      {error && <p className="mt-2 text-[13px] font-semibold text-altus-red">{error}</p>}
      <p className="mt-2 text-[12px] font-semibold text-ink-muted">
        Tip: press ⌘/Ctrl + Enter to save and keep adding.
      </p>
    </div>
  );
}

/** Incentive Yes/No + (admin-only) a ₹ amount that flows to the Incentive tab. */
function IncentiveCell({
  id, incentive, amount, canEdit, isAdmin, onToggle,
}: {
  id: string; incentive: boolean; amount: number;
  canEdit: boolean; isAdmin: boolean; onToggle: (v: boolean) => void;
}) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const [amt, setAmt] = React.useState(String(amount || ""));
  React.useEffect(() => setAmt(String(amount || "")), [amount]);

  function toggle(v: boolean) {
    if (isAdmin) {
      start(async () => {
        const res = await setWeeklyGoalIncentive({ id, incentive: v, amount: Number(amt) || 0 });
        if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
        if (v && (Number(amt) || 0) > 0) fireToast({ message: "Added to the Incentive tab.", type: "success" });
        router.refresh();
      });
    } else {
      onToggle(v);
    }
  }
  function saveAmt() {
    if (!isAdmin) return;
    start(async () => {
      const res = await setWeeklyGoalIncentive({ id, incentive: true, amount: Number(amt) || 0 });
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      fireToast({ message: (Number(amt) || 0) > 0 ? "Incentive saved to the Incentive tab." : "Incentive cleared.", type: "success" });
      router.refresh();
    });
  }

  return (
    <div className="inline-flex flex-col items-center gap-1">
      <YesNo value={incentive} disabled={!canEdit || pending} onChange={toggle} />
      {incentive && isAdmin && (
        <span className="inline-flex items-center gap-0.5">
          <span className="text-[11px] text-ink-muted">₹</span>
          <input
            type="number" min={0} value={amt}
            onChange={(e) => setAmt(e.target.value)}
            onBlur={() => Number(amt) !== amount && saveAmt()}
            placeholder="0"
            className="w-16 rounded-md border border-hairline bg-white px-1.5 py-1 text-[12px] text-right tabular-nums outline-none focus:border-altus-red/50"
          />
        </span>
      )}
      {incentive && !isAdmin && amount > 0 && (
        <span className="text-[11px] font-bold text-ink-soft tabular-nums">₹{amount.toLocaleString("en-IN")}</span>
      )}
    </div>
  );
}
