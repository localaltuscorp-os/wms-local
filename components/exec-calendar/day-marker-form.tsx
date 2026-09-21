"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Plus, Trash2, X } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { MarkerDatePicker } from "./marker-date-picker";
import { deleteDayMarker, saveDayMarker } from "@/app/(app)/events/actions";
import {
  MARKER_BG,
  MARKER_FG,
  MARKER_MAX_LABEL,
  chipDate,
  expandRange,
  normaliseDates,
  type DayMarker,
  type MarkerMode,
} from "@/lib/exec-calendar/day-markers";

const MODES: { key: MarkerMode; label: string }[] = [
  { key: "day", label: "One Day" },
  { key: "range", label: "Time Period" },
  { key: "dates", label: "Individual Days" },
];

const FIELD =
  "w-full rounded-lg border border-hairline bg-surface-card px-2.5 py-2 text-[13px] text-ink-strong outline-none transition focus:border-[var(--color-altus-red)]";
const LABEL = "mb-1 block text-[11px] font-bold uppercase tracking-wide text-ink-subtle";

/**
 * The "Day Marker" section of the block drawer (asked 2026-09-18): a label for
 * what the day is ("Final exam") and the days it covers, entered one of three
 * ways - toggled above the picker as One Day | Time Period | Individual Days.
 *
 * INDIVIDUAL DAYS works like adding people to a WhatsApp group: pick a date,
 * press Add, and it joins a queue of chips below the picker, each with an ✕ on
 * its LEFT that takes it out again. A date can only be in the queue once.
 * Everything - the calendar highlight and the chips - comes from one list, so
 * the two can never disagree.
 */
export function DayMarkerForm({
  initial,
  defaultDay,
  today,
  onClose,
}: {
  /** An existing marker to edit, or null for a new one. */
  initial: DayMarker | null;
  /** Where a new marker starts (the day the drawer was opened on). */
  defaultDay: string;
  today?: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const [label, setLabel] = React.useState(initial?.label ?? "");
  const [mode, setMode] = React.useState<MarkerMode>(initial?.mode ?? "day");
  const [dates, setDates] = React.useState<string[]>(initial?.dates ?? [defaultDay]);
  /** Time Period: the first click, waiting for the second. */
  const [rangeStart, setRangeStart] = React.useState<string | null>(null);
  /** Individual Days: the date picked but not yet added. */
  const [pending, setPending] = React.useState<string | null>(null);
  const [anchor, setAnchor] = React.useState(initial?.dates[0] ?? defaultDay);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => setError(null), [label, mode, dates]);

  function switchMode(next: MarkerMode) {
    if (next === mode) return;
    setMode(next);
    setRangeStart(null);
    setPending(null);
    // Keep what makes sense: a single day survives every switch; a period or a
    // set narrows to its first day when going to One Day.
    if (next === "day") setDates((d) => d.slice(0, 1));
    if (next === "range" && dates.length > 1) setDates((d) => expandRange(d[0]!, d.at(-1)!));
  }

  function pick(day: string) {
    if (mode === "day") {
      setDates([day]);
      return;
    }
    if (mode === "range") {
      if (!rangeStart) {
        setRangeStart(day);
        setDates([day]);
      } else {
        setDates(expandRange(rangeStart, day));
        setRangeStart(null);
      }
      return;
    }
    setPending(day);
  }

  function addPending() {
    if (!pending) return;
    setDates((d) => normaliseDates([...d, pending]));
    setPending(null);
  }

  function removeDate(day: string) {
    setDates((d) => d.filter((x) => x !== day));
  }

  async function submit() {
    if (busy) return;
    if (!label.trim()) return setError("Say what the day is marked for");
    if (dates.length === 0) return setError("Pick at least one date");
    setBusy(true);
    const res = await saveDayMarker({ id: initial?.id, label: label.trim(), mode, dates });
    setBusy(false);
    if (!res.ok) return setError(res.error);
    fireToast({ message: initial ? "Day marker updated" : "Day marker added", type: "success" });
    onClose();
    router.refresh();
  }

  async function remove() {
    if (!initial || busy) return;
    setBusy(true);
    const res = await deleteDayMarker(initial.id);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    fireToast({ message: "Day marker removed", type: "success" });
    onClose();
    router.refresh();
  }

  const selected = React.useMemo(() => new Set(dates), [dates]);
  const hint =
    mode === "day"
      ? "Pick the day."
      : mode === "range"
        ? rangeStart
          ? "Now pick the last day of the period."
          : "Pick the first day, then the last."
        : "Pick a date and press Add. Repeat for each day.";

  return (
    <>
      <div className="flex-1 space-y-3.5 px-4 py-4">
        <div>
          <label className={LABEL} htmlFor="marker-label">Mark the day for</label>
          <input
            id="marker-label"
            className={FIELD}
            value={label}
            autoFocus
            maxLength={MARKER_MAX_LABEL}
            placeholder="e.g. Final exam, Exam week, Diwali"
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>

        <div>
          <span className={LABEL}>Dates</span>
          <div className="mb-2 grid grid-cols-3 gap-0.5 rounded-lg border border-hairline bg-surface-soft p-0.5" role="tablist" aria-label="How the dates are chosen">
            {MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                role="tab"
                aria-selected={mode === m.key}
                onClick={() => switchMode(m.key)}
                className="whitespace-nowrap rounded-md px-1.5 py-1.5 text-[11.5px] font-bold transition"
                style={
                  mode === m.key
                    ? { background: "var(--color-altus-red)", color: "#fff" }
                    : { color: "var(--color-ink-muted)" }
                }
              >
                {m.label}
              </button>
            ))}
          </div>

          <MarkerDatePicker
            anchor={anchor}
            onAnchor={setAnchor}
            selected={selected}
            pending={mode === "dates" ? pending : null}
            today={today}
            onPick={pick}
          />
          <p className="mt-1.5 text-[11.5px] text-ink-subtle">{hint}</p>

          {mode === "dates" && (
            <div className="mt-2 flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-[12.5px] font-semibold text-ink-strong">
                {pending ? chipDate(pending) : <span className="text-ink-subtle">No date picked</span>}
              </span>
              <button
                type="button"
                onClick={addPending}
                disabled={!pending || selected.has(pending)}
                title={pending && selected.has(pending) ? "Already added" : undefined}
                className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-lg px-3 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-40"
                style={{ background: "var(--color-altus-red)" }}
              >
                <Plus size={14} /> Add
              </button>
            </div>
          )}

          {/* The selected dates. For Individual Days it is the queue of chips,
              each removable; for one day or a period, a summary. */}
          {mode === "dates" ? (
            <div
              className="mt-2 flex min-h-[44px] flex-wrap content-start gap-1.5 rounded-lg border border-hairline bg-surface-soft p-2"
              aria-label="Added dates"
            >
              {dates.length === 0 && <span className="self-center text-[12px] text-ink-subtle">Added dates appear here.</span>}
              {dates.map((d) => (
                <span
                  key={d}
                  className="inline-flex items-center gap-1 rounded-pill py-1 pl-1 pr-2.5 text-[12px] font-semibold"
                  style={{ background: MARKER_BG, color: MARKER_FG }}
                >
                  <button
                    type="button"
                    onClick={() => removeDate(d)}
                    aria-label={`Remove ${chipDate(d)}`}
                    className="grid h-5 w-5 place-items-center rounded-full transition hover:bg-white/20"
                  >
                    <X size={12} strokeWidth={2.6} />
                  </button>
                  {chipDate(d)}
                </span>
              ))}
            </div>
          ) : (
            dates.length > 0 && (
              <p className="mt-2 rounded-lg bg-surface-soft px-3 py-2 text-[12.5px] font-semibold text-ink-strong">
                {dates.length === 1
                  ? chipDate(dates[0]!)
                  : `${chipDate(dates[0]!)} – ${chipDate(dates.at(-1)!)} · ${dates.length} days`}
              </p>
            )
          )}
        </div>

        {error && (
          <p className="rounded-lg px-3 py-2 text-center text-[12px] font-semibold" style={{ background: "var(--color-red-bg)", color: "var(--color-red-deep)" }}>
            {error}
          </p>
        )}
      </div>

      <footer className="flex items-center gap-2 border-t border-hairline px-4 py-3">
        {initial && (
          <button
            onClick={remove}
            disabled={busy}
            className="rounded-lg border border-hairline p-2 text-ink-muted transition hover:text-[var(--color-red-deep)]"
            aria-label="Delete marker"
          >
            <Trash2 size={15} />
          </button>
        )}
        <button onClick={onClose} className="ml-auto rounded-lg border border-hairline px-3 py-2 text-[12.5px] font-bold text-ink-strong">
          Cancel
        </button>
        <button
          onClick={submit}
          disabled={busy || !label.trim() || dates.length === 0}
          className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12.5px] font-bold text-white disabled:opacity-50"
          style={{ background: "var(--color-altus-red)" }}
        >
          {busy && <Loader2 size={14} className="animate-spin" />}
          {initial ? "Save" : "Add marker"}
        </button>
      </footer>
    </>
  );
}
