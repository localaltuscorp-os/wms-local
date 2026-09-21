"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Repeat, X } from "lucide-react";
import { Chevroned } from "@/components/ui/chevroned-select";
import { fireToast } from "@/lib/toast";
import { EXEC_CATEGORIES, categoryColors, execCategory, type ExecCategoryKey } from "@/lib/exec-calendar/taxonomy";
import { addMonths, durationLabel, minToLabel } from "@/lib/exec-calendar/grid";
import { stampExecRoutine } from "@/app/(app)/events/actions";
import { ExecRoutineDeleteList } from "./routine-delete";

/**
 * ROUTINE STAMPING (§4B) — the thing that turns a week somebody typed in into a
 * decade of the master sheet.
 *
 * "Every weekday 07:00–08:00, Exercise, from today until March" is three
 * clicks, and it writes REAL BLOCKS rather than a rule the calendar re-evaluates
 * on every read. That is the important design decision and it is worth stating
 * plainly: once stamped, an individual Tuesday can be moved or deleted like any
 * other block, and it stays moved. A repeating rule cannot offer that without
 * growing an exception table, which is a second source of truth.
 *
 * The presets exist because the brief names them: the daily morning habit, the
 * fixed consulting day, the weekend cohort, the executive break.
 */

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TIME_STEP = 30;
const TIMES = Array.from({ length: (24 * 60) / TIME_STEP }, (_, i) => i * TIME_STEP);

const FIELD =
  "w-full rounded-lg border border-hairline bg-surface-card px-2.5 py-2 text-[13px] text-ink-strong outline-none transition focus:border-[var(--color-altus-red)]";
const LABEL = "mb-1 block text-[11px] font-bold uppercase tracking-wide text-ink-subtle";

interface Preset {
  label: string;
  title: string;
  categoryKey: ExecCategoryKey;
  days: number[];
  startMin: number;
  endMin: number;
}

const PRESETS: Preset[] = [
  { label: "Morning habit", title: "Exercise", categoryKey: "personal", days: [0, 1, 2, 3, 4], startMin: 7 * 60, endMin: 8 * 60 },
  { label: "Weekend cohort", title: "BSS batch", categoryKey: "grad_workshop", days: [5, 6], startMin: 15 * 60, endMin: 20 * 60 },
  { label: "Consulting day", title: "Client consulting", categoryKey: "consulting", days: [1], startMin: 10 * 60, endMin: 18 * 60 },
  { label: "Executive break", title: "Break", categoryKey: "wkly_off", days: [4], startMin: 17 * 60, endMin: 19 * 60 },
];

export function ExecRoutineDialog({
  today,
  weekStartDay,
  initialMode = "stamp",
  onClose,
}: {
  today: string;
  /** Kept for the caller's convenience; the start date follows `today`. */
  weekStartDay?: string;
  /** Which half opens first; `?routine=delete` lands on the delete list. */
  initialMode?: "stamp" | "delete";
  onClose: () => void;
}) {
  const router = useRouter();
  const [title, setTitle] = React.useState("Exercise");
  const [categoryKey, setCategoryKey] = React.useState<ExecCategoryKey>("personal");
  const [days, setDays] = React.useState<number[]>([0, 1, 2, 3, 4]);
  const [startMin, setStartMin] = React.useState(7 * 60);
  const [endMin, setEndMin] = React.useState(8 * 60);
  // Starts on the day you are looking at — you are already standing on the date
  // you mean, and the field is right there when you mean a different one.
  const [fromDate, setFromDate] = React.useState(today);
  const [toDate, setToDate] = React.useState(addMonths(today, 3));
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  /** "stamp" (default) or "delete" — the two halves of routine management. */
  const [mode, setMode] = React.useState<"stamp" | "delete">(initialMode);

  const col = categoryColors(categoryKey);
  const cat = execCategory(categoryKey);
  const valid = title.trim() && endMin > startMin && toDate >= fromDate;

  const applyPreset = (p: Preset) => {
    setTitle(p.title);
    setCategoryKey(p.categoryKey);
    setDays(p.days);
    setStartMin(p.startMin);
    setEndMin(p.endMin);
  };

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    const res = await stampExecRoutine({
      title: title.trim(),
      categoryKey,
      daysOfWeek: days,
      startMin,
      endMin,
      fromDate,
      toDate,
    });
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    fireToast({
      message:
        res.skipped > 0
          ? `Stamped ${res.created} blocks · skipped ${res.skipped}`
          : `Stamped ${res.created} blocks`,
      type: "success",
    });
    onClose();
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-label="Routines">
      <button className="absolute inset-0 bg-black/30" aria-label="Close" onClick={onClose} />
      <div className="relative w-[520px] max-w-full overflow-hidden rounded-2xl bg-surface-card shadow-2xl">
        <header
          className="flex items-center justify-between border-b border-hairline px-4 py-3"
          style={{ background: mode === "stamp" ? col.bg : "var(--color-surface-soft)" }}
        >
          <div className="flex items-center gap-2">
            <Repeat size={15} style={{ color: mode === "stamp" ? col.deep : "var(--color-ink-muted)" }} />
            <span className="text-[13px] font-bold text-ink-strong">Routines</span>
          </div>
          <button onClick={onClose} aria-label="Close" className="rounded-lg p-1.5 text-ink-muted hover:text-ink-strong">
            <X size={16} />
          </button>
        </header>

        {/* Stamp (default) | Delete — two jobs, one dialog. */}
        <div className="flex gap-1 border-b border-hairline px-4 pt-3">
          {([["stamp", "Stamp a routine"], ["delete", "Delete a routine"]] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setMode(k)}
              className="-mb-px whitespace-nowrap border-b-2 px-3 pb-2 text-[12.5px] font-bold transition"
              style={
                mode === k
                  ? { borderColor: "var(--color-altus-red)", color: "var(--color-altus-red-deep)" }
                  : { borderColor: "transparent", color: "var(--color-ink-muted)" }
              }
            >
              {label}
            </button>
          ))}
        </div>

        {mode === "delete" ? (
          <div className="px-4 py-4">
            <ExecRoutineDeleteList today={today} />
          </div>
        ) : (
        <>
        <div className="space-y-3.5 px-4 py-4">
          <div className="flex flex-wrap gap-1.5">
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => applyPreset(p)}
                className="rounded-pill border border-hairline px-2.5 py-1 text-[11.5px] font-bold text-ink-muted transition hover:border-hairline-strong hover:text-ink-strong"
              >
                {p.label}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <label className={LABEL}>Title</label>
              <input className={FIELD} value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="w-[215px] shrink-0">
              <label className={LABEL}>Category</label>
              <Chevroned>
                <select
                  className={`${FIELD} appearance-none !pr-9`}
                  value={categoryKey}
                  onChange={(e) => setCategoryKey(e.target.value as ExecCategoryKey)}
                >
                  {EXEC_CATEGORIES.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
              </Chevroned>
            </div>
          </div>

          <div>
            <label className={LABEL}>On these days</label>
            <div className="flex gap-1">
              {WEEKDAYS.map((d, i) => {
                const on = days.includes(i);
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setDays((p) => (on ? p.filter((x) => x !== i) : [...p, i].sort()))}
                    className="flex-1 rounded-lg py-1.5 text-[11.5px] font-bold transition"
                    style={
                      on
                        ? { background: col.base, color: "#fff" }
                        : { background: "var(--color-surface-soft)", border: "1px solid var(--color-hairline)", color: "var(--color-ink-muted)" }
                    }
                  >
                    {d}
                  </button>
                );
              })}
            </div>
            {days.length === 0 && (
              <p className="mt-1 text-[11px] text-ink-subtle">No days picked — it will stamp every day in the range.</p>
            )}
          </div>

          <div className="flex items-end gap-2">
            <div className="flex-1">
              <label className={LABEL}>From</label>
              <Chevroned>
                <select className={`${FIELD} appearance-none !pr-9`} value={startMin} onChange={(e) => setStartMin(Number(e.target.value))}>
                  {TIMES.map((m) => <option key={m} value={m}>{minToLabel(m)}</option>)}
                </select>
              </Chevroned>
            </div>
            <div className="flex-1">
              <label className={LABEL}>To</label>
              <Chevroned>
                <select className={`${FIELD} appearance-none !pr-9`} value={endMin} onChange={(e) => setEndMin(Number(e.target.value))}>
                  {TIMES.map((m) => <option key={m} value={m}>{minToLabel(m)}</option>)}
                </select>
              </Chevroned>
            </div>
            <div className="pb-2 text-[12px] font-bold tabular-nums text-ink-muted">
              {endMin > startMin ? durationLabel(endMin - startMin) : "—"}
            </div>
          </div>

          <div className="flex gap-2">
            <div className="flex-1">
              <label className={LABEL}>Starting</label>
              <input type="date" className={FIELD} value={fromDate} onChange={(e) => setFromDate(e.target.value)} />
            </div>
            <div className="flex-1">
              <label className={LABEL}>Until</label>
              <input type="date" className={FIELD} value={toDate} onChange={(e) => setToDate(e.target.value)} />
            </div>
          </div>

          <p className="text-[11.5px] leading-snug text-ink-subtle">
            Writes real blocks, so any single one can be moved or deleted afterwards and stays that
            way. Days that already carry this routine are skipped
            {cat.protected ? "" : ", and so is anything that would land on protected time"}.
          </p>

          {error && (
            <p className="rounded-lg px-3 py-2 text-[12px] font-semibold" style={{ background: "var(--color-red-bg)", color: "var(--color-red-deep)" }}>
              {error}
            </p>
          )}
        </div>

        <footer className="flex items-center justify-end gap-2 border-t border-hairline px-4 py-3">
          <button onClick={onClose} className="rounded-lg border border-hairline px-3 py-2 text-[12.5px] font-bold text-ink-strong">
            Cancel
          </button>
          <button
            onClick={submit}
            disabled={!valid || busy}
            className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12.5px] font-bold text-white disabled:opacity-50"
            style={{ background: "var(--color-altus-red)" }}
          >
            {busy && <Loader2 size={14} className="animate-spin" />}
            Stamp it
          </button>
        </footer>
        </>
        )}
      </div>
    </div>
  );
}
