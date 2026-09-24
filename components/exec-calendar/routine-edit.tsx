"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { CalendarRange, ChevronDown, Loader2, Pencil } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { categoryColors, execCategory, EXEC_CATEGORIES, type ExecCategoryKey } from "@/lib/exec-calendar/taxonomy";
import { Chevroned } from "@/components/ui/chevroned-select";
import { durationLabel, minToLabel, parseDay } from "@/lib/exec-calendar/grid";
import {
  dateFromYmd,
  buildRule,
  detectPreset,
  humanSummary,
  presetOptions,
  ruleForPreset,
  type PresetKey,
} from "@/lib/recurrence/google-recurrence";
import { CustomRecurrenceDialog } from "@/components/recurrence/custom-recurrence-dialog";
import { listMyRoutines, updateExecRoutine, type RoutineSummary } from "@/app/(app)/events/actions";

/**
 * "Edit a Routine" (2026-09-24) — took the old "Stamp a routine" tab's slot
 * once stamping itself moved into the event editor's inline Repeat picker
 * (see event-editor.tsx). Same card-list shell as `ExecRoutineDeleteList`,
 * each card opening an edit form with THE SAME field set the event editor's
 * recurrence-aware form offers, pre-filled from the routine's current values.
 *
 * A legacy routine (stamped before the Google-Calendar-style picker existed)
 * has no `recurrenceRule` — its `daysOfWeek` is translated into an equivalent
 * WEEKLY/DAILY rule the moment its card opens, so every routine reads through
 * the one picker from here on; saving writes the rule back, migrating it
 * forward.
 */

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const TIME_STEP = 30;
const TIMES = Array.from({ length: (24 * 60) / TIME_STEP }, (_, i) => i * TIME_STEP);
const FIELD =
  "w-full rounded-lg border border-hairline bg-surface-card px-2.5 py-2 text-[13px] text-ink-strong outline-none transition focus:border-[var(--color-altus-red)]";
const LABEL = "mb-1 block text-[11px] font-bold uppercase tracking-wide text-ink-subtle";

function shortDate(ymd: string): string {
  const d = parseDay(ymd);
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

function daysLabel(days: number[]): string {
  if (days.length === 0 || days.length === 7) return "Every day";
  const sorted = [...days].sort();
  if (sorted.join() === "0,1,2,3,4") return "Weekdays";
  if (sorted.join() === "5,6") return "Weekends";
  return sorted.map((d) => WEEKDAYS[d]).join(", ");
}

const RRULE_DAY = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"];
/** This app's 0=Mon..6=Sun → RRULE weekday codes. */
function appDaysToRRuleCodes(days: number[]): string[] {
  return days.map((d) => RRULE_DAY[d]!);
}

/** A routine's recurrence, as a rule string — its own if set, else built from
 *  the legacy `daysOfWeek` (empty = daily, per the old dialog's own rule). */
function ruleOf(r: RoutineSummary): string {
  if (r.recurrenceRule) return r.recurrenceRule;
  if (r.daysOfWeek.length === 0) return "FREQ=DAILY";
  return `FREQ=WEEKLY;BYDAY=${appDaysToRRuleCodes(r.daysOfWeek).join(",")}`;
}

export function ExecRoutineEditList({ today }: { today: string }) {
  const router = useRouter();
  const [routines, setRoutines] = React.useState<RoutineSummary[] | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [editing, setEditing] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    const res = await listMyRoutines(today);
    if (!res.ok) { setError(res.error); return; }
    setRoutines(res.routines);
  }, [today]);

  React.useEffect(() => { void load(); }, [load]);

  if (error) {
    return (
      <p className="rounded-lg px-3 py-2 text-center text-[12px] font-semibold" style={{ background: "var(--color-red-bg)", color: "var(--color-red-deep)" }}>
        {error}
      </p>
    );
  }

  if (routines === null) {
    return (
      <div className="flex items-center justify-center gap-2 py-10 text-[12.5px] text-ink-muted">
        <Loader2 size={15} className="animate-spin" /> Loading your routines
      </div>
    );
  }

  if (routines.length === 0) {
    return (
      <div className="py-10 text-center">
        <CalendarRange size={26} className="mx-auto text-ink-subtle" />
        <p className="mt-2 text-[13px] font-semibold text-ink-strong">No routines yet</p>
        <p className="mt-1 text-[12px] text-ink-muted">
          Give a new block a repeat and it shows up here, ready to change.
        </p>
      </div>
    );
  }

  return (
    <ul className="max-h-[58vh] space-y-2 overflow-y-auto pr-1">
      {routines.map((r) => {
        const col = categoryColors(r.categoryKey);
        const open = editing === r.id;
        const anchor = dateFromYmd(r.fromDate);
        const summary = humanSummary(ruleOf(r), anchor) ?? daysLabel(r.daysOfWeek);
        return (
          <li
            key={r.id}
            className="rounded-xl border px-3 py-2.5 transition"
            style={{
              borderTopColor: open ? "var(--color-altus-red-edge)" : "var(--color-hairline)",
              borderRightColor: open ? "var(--color-altus-red-edge)" : "var(--color-hairline)",
              borderBottomColor: open ? "var(--color-altus-red-edge)" : "var(--color-hairline)",
              borderLeft: `4px solid ${col.base}`,
            }}
          >
            <button
              type="button"
              onClick={() => setEditing(open ? null : r.id)}
              className="flex w-full items-start gap-2 text-left"
              aria-expanded={open}
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2">
                  <span className="text-[13.5px] font-bold text-ink-strong">{r.title}</span>
                  <span className="text-[11px] font-semibold" style={{ color: col.deep }}>
                    {execCategory(r.categoryKey).label}
                  </span>
                </div>
                <div className="mt-0.5 text-[12px] text-ink-muted">
                  {summary} · {minToLabel(r.startMin)} – {minToLabel(r.endMin)}
                </div>
                <div className="text-[11.5px] text-ink-subtle">
                  {shortDate(r.fromDate)} → {shortDate(r.toDate)} · {r.blockCount} block
                  {r.blockCount === 1 ? "" : "s"} on the calendar
                </div>
              </div>
              <span
                className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-[12px] font-bold"
                style={{ borderColor: "var(--color-hairline)", color: "var(--color-ink-muted)" }}
              >
                <Pencil size={12} /> Edit <ChevronDown size={12} className={open ? "rotate-180" : ""} />
              </span>
            </button>

            {open && (
              <RoutineEditForm
                routine={r}
                today={today}
                onSaved={() => {
                  setEditing(null);
                  void load();
                  router.refresh();
                }}
                onCancel={() => setEditing(null)}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}

function RoutineEditForm({
  routine,
  today,
  onSaved,
  onCancel,
}: {
  routine: RoutineSummary;
  today: string;
  onSaved: () => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = React.useState(routine.title);
  const [categoryKey, setCategoryKey] = React.useState<ExecCategoryKey>(routine.categoryKey as ExecCategoryKey);
  const [startMin, setStartMin] = React.useState(routine.startMin);
  const [endMin, setEndMin] = React.useState(routine.endMin);
  const [fromDate, setFromDate] = React.useState(routine.fromDate);
  const [toDate, setToDate] = React.useState(routine.toDate);
  const [rule, setRule] = React.useState(ruleOf(routine));
  const [customOpen, setCustomOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const anchor = dateFromYmd(fromDate);
  const preset = detectPreset(rule, anchor);
  const summary = preset === "custom" ? humanSummary(rule, anchor) : null;
  const valid = title.trim() && endMin > startMin && toDate >= fromDate;

  function selectPreset(key: PresetKey) {
    if (key === "none") return; // a routine always repeats — "none" isn't offered
    if (key === "custom") return setCustomOpen(true);
    setRule(ruleForPreset(key, anchor));
  }

  async function submit() {
    if (!valid || busy) return;
    setBusy(true);
    setError(null);
    const res = await updateExecRoutine({
      id: routine.id,
      today,
      title: title.trim(),
      categoryKey,
      startMin,
      endMin,
      fromDate,
      toDate,
      recurrenceRule: rule,
      daysOfWeek: [],
    });
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    fireToast({
      message: res.skipped > 0 ? `Updated · ${res.created} blocks · skipped ${res.skipped}` : `Updated · ${res.created} blocks`,
      type: "success",
    });
    onSaved();
  }

  return (
    <div className="mt-2.5 space-y-3 border-t border-hairline pt-2.5">
      <div className="flex gap-2">
        <div className="flex-1">
          <label className={LABEL}>Title</label>
          <input className={FIELD} value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="w-[190px] shrink-0">
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

      <div>
        <label className={LABEL}>Repeat</label>
        <Chevroned>
          <select
            className={`${FIELD} appearance-none !pr-9`}
            value={preset}
            onChange={(e) => selectPreset(e.target.value as PresetKey)}
          >
            {presetOptions(anchor)
              .filter((o) => o.key !== "none")
              .map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
          </select>
        </Chevroned>
        {summary && (
          <p className="mt-1.5 text-[12px] font-semibold" style={{ color: "var(--color-altus-red-deep)" }}>
            {summary}{" "}
            <button type="button" onClick={() => setCustomOpen(true)} className="underline underline-offset-2">
              Edit
            </button>
          </p>
        )}
      </div>

      <p className="text-[11.5px] leading-snug text-ink-subtle">
        Every upcoming block this routine put on the calendar is replaced by the edited rule; past blocks
        keep what already happened.
      </p>

      {error && (
        <p className="rounded-lg px-3 py-2 text-[12px] font-semibold" style={{ background: "var(--color-red-bg)", color: "var(--color-red-deep)" }}>
          {error}
        </p>
      )}

      <div className="flex items-center justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-lg border border-hairline px-3 py-2 text-[12.5px] font-bold text-ink-strong">
          Cancel
        </button>
        <button
          type="button"
          onClick={submit}
          disabled={!valid || busy}
          className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12.5px] font-bold text-white disabled:opacity-50"
          style={{ background: "var(--color-altus-red)" }}
        >
          {busy && <Loader2 size={14} className="animate-spin" />}
          Save changes
        </button>
      </div>

      <CustomRecurrenceDialog
        open={customOpen}
        onOpenChange={setCustomOpen}
        anchor={anchor}
        rule={rule}
        onDone={({ draft }) => setRule(buildRule(draft, anchor))}
      />
    </div>
  );
}
