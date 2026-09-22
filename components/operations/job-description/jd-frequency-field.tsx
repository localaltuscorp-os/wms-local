"use client";

import * as React from "react";
import { CustomRecurrenceDialog } from "@/components/recurrence/custom-recurrence-dialog";
import { dateFromYmd, type PresetKey } from "@/lib/recurrence/google-recurrence";
import { describeRecurrence, frequencyOptionsFor, type Recurrence } from "@/lib/jd/recurrence";

/**
 * THE JOB DESCRIPTION'S "How often" CONTROL — Google Calendar's, exactly.
 *
 * A start date, the seven presets spoken about that date, and `Custom…` opening
 * the same dialog the task Schedule section opens. The list is NOT a constant:
 * pick a Wednesday and it offers "Weekly on Wednesday" and "Monthly on the
 * third Wednesday", which is the whole point of the change.
 *
 * Deliberately a NATIVE `<select>` and the JD form's own input styling, not the
 * task form's. The vocabulary was asked to match the calendar; the chrome was
 * not asked to change, and this form is a grid of plain fields.
 */
export function JdFrequencyField({
  startDate,
  onStartDateChange,
  value,
  onChange,
}: {
  /** The date the job starts — every preset is a sentence about it. */
  startDate: string;
  onStartDateChange: (next: string) => void;
  value: Recurrence;
  onChange: (next: Recurrence) => void;
}) {
  const [preset, setPreset] = React.useState<PresetKey>("daily");
  const [customOpen, setCustomOpen] = React.useState(false);
  /** What the menu said before Custom… opened, so Cancel can put it back. */
  const presetBeforeCustom = React.useRef<PresetKey>("daily");
  const options = React.useMemo(() => frequencyOptionsFor(startDate), [startDate]);
  const anchor = React.useMemo(() => dateFromYmd(startDate), [startDate]);

  /* Re-derive the recurrence whenever the start date moves. "Weekly on
     Wednesday" has to BECOME "Weekly on Thursday" when the date does, or the
     menu says one thing and the stored shape means another. Custom is left
     alone — the dialog's rule is the user's own sentence, and its anchor is
     updated in place rather than rewritten. */
  const applyPreset = React.useCallback(
    (key: PresetKey, date: string) => {
      const next = frequencyOptionsFor(date).find((o) => o.id === key);
      if (next) onChange(next.value);
    },
    [onChange],
  );

  function selectPreset(key: PresetKey) {
    if (key === "custom") {
      presetBeforeCustom.current = preset;
      setPreset(key);
      setCustomOpen(true);
      return;
    }
    setPreset(key);
    applyPreset(key, startDate);
  }

  /* Cancel must put the menu back. Otherwise the dropdown reads "Custom…" while
     the stored rule is still the preset it was before — the form saying one
     thing and saving another, with nothing on screen to give it away. Done
     always leaves an rrule behind, which is how the two are told apart. */
  function closeCustom(open: boolean) {
    setCustomOpen(open);
    if (!open && value.kind !== "rrule") setPreset(presetBeforeCustom.current);
  }

  function changeStartDate(next: string) {
    onStartDateChange(next);
    if (preset === "custom") {
      // Keep the custom rule, re-anchored — the dialog reads its unasked-for
      // details (which weekday, which day of the month) off the start date.
      if (value.kind === "rrule") onChange({ ...value, anchor: next });
    } else {
      applyPreset(preset, next);
    }
  }

  const customRule = value.kind === "rrule" ? value.rule : null;

  /* TWO CELLS, not one (2026-09-18): the form lays Starts on, Frequency and
     Estimated time out as three equal columns, so this returns its two as
     siblings for the parent grid to place. The dialog renders into a portal and
     takes no cell. The labels are spans, not <label>s: the form's own Label is
     one, and a <label> with no `htmlFor` associates with nothing — each input
     carries its accessible name itself. */
  return (
    <>
      <div className="min-w-0">
        <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-500">
          Starts on
        </span>
        <input
          type="date"
          value={startDate}
          onChange={(e) => changeStartDate(e.target.value)}
          aria-label="The date this job starts"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px]"
        />
        <p className="mt-1 text-[11px] text-slate-500">The frequency counts from this day.</p>
      </div>

      <div className="min-w-0">
        <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-500">
          Frequency
        </span>
        <select
          value={preset}
          onChange={(e) => selectPreset(e.target.value as PresetKey)}
          aria-label="How often this job comes round"
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-[13px]"
        >
          {options.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-[11px] text-slate-500">
          {describeRecurrence(value)}
          {preset === "custom" && (
            <>
              {" · "}
              <button
                type="button"
                onClick={() => setCustomOpen(true)}
                className="font-semibold text-slate-600 underline underline-offset-2 hover:text-slate-900"
              >
                Edit custom
              </button>
            </>
          )}
        </p>
      </div>

      <CustomRecurrenceDialog
        open={customOpen}
        onOpenChange={closeCustom}
        anchor={anchor}
        rule={customRule}
        onDone={({ rule }) => onChange({ kind: "rrule", rule, anchor: startDate })}
      />
    </>
  );
}
