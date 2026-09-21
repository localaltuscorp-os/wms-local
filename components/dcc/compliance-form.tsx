"use client";

import * as React from "react";
import { CalendarDays, Loader2 } from "lucide-react";
import {
  DEFAULT_SCHEDULE,
  WEEKDAYS,
  describeSchedule,
  isCompleteSchedule,
  nextDueOnOrAfter,
  type DccSchedule,
  type DccScheduleChoice,
} from "@/lib/dcc/frequency";
import { describeDay } from "@/lib/dcc/sp1";

/**
 * WRITING A COMPLIANCE — ONE FORM, ADD AND EDIT (DCC-SPEC §5).
 *
 * Shared by My Day (where you write your own) and DCC Masters (where a Team
 * Lead writes somebody else's), so the two cannot offer different fields or
 * different schedules. Adding it in two places is how the old module ended up
 * with a rail advertising what the pages no longer honoured.
 *
 * ── THE SCHEDULE IS PICKED, AND THE PICK IS SHOWN BACK ─────────────────────
 * `frequency` used to be a free-text box, and the row it wrote left `weekdays`
 * NULL — which the scheduler reads as "every day". You could type "Every Friday"
 * and get a compliance due seven days a week, with nothing on screen admitting
 * it. So the days are chosen, and the line under the picker says, in plain
 * words, when the board will actually ask for it — including which day it is
 * next due. A schedule you cannot read back is a schedule you cannot trust.
 *
 * ── WHY THERE IS NO "WEEKLY" OR "AD-HOC" HERE ──────────────────────────────
 * `scheduledDueOn` admits only `scheduled` items to a day, and nothing in this
 * module surfaces the other kinds — so those options would create a compliance
 * that never appears anywhere. Every choice below lands on My Day.
 */

export interface ComplianceDraft {
  title: string;
  section: string;
  code: string;
  schedule: DccSchedule;
  targetNumber: string;
  unit: string;
}

export function emptyDraft(): ComplianceDraft {
  return {
    title: "",
    section: "",
    code: "",
    schedule: DEFAULT_SCHEDULE,
    targetNumber: "",
    unit: "",
  };
}

const CHOICES: { key: DccScheduleChoice; label: string; hint: string }[] = [
  { key: "working", label: "Every working day", hint: "Monday to Saturday" },
  { key: "everyday", label: "Every day", hint: "Sunday included" },
  { key: "days", label: "Chosen days", hint: "Pick them below" },
];

export function ComplianceForm({
  draft,
  onChange,
  onSubmit,
  onCancel,
  busy,
  error,
  submitLabel,
  today,
}: {
  draft: ComplianceDraft;
  onChange: (d: ComplianceDraft) => void;
  onSubmit: () => void;
  onCancel: () => void;
  busy: boolean;
  error?: string | null;
  submitLabel: string;
  /** Today in IST, so "next due" is computed against the right day. */
  today: string;
}) {
  const set = <K extends keyof ComplianceDraft>(k: K, v: ComplianceDraft[K]) =>
    onChange({ ...draft, [k]: v });

  const complete = isCompleteSchedule(draft.schedule);
  const next = complete ? nextDueOnOrAfter(draft.schedule, today) : null;

  function toggleDay(bit: number) {
    const has = draft.schedule.weekdays.includes(bit);
    set("schedule", {
      choice: "days",
      weekdays: has
        ? draft.schedule.weekdays.filter((b) => b !== bit)
        : [...draft.schedule.weekdays, bit].sort((a, b) => a - b),
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
      className="rounded-2xl border border-slate-200 bg-white p-4"
    >
      {error && (
        <p role="alert" className="mb-3 rounded-lg bg-red-50 px-3 py-2 text-[13px] text-red-700">
          {error}
        </p>
      )}

      <label className="block">
        <Label required>What has to be done</Label>
        <input
          required
          autoFocus
          value={draft.title}
          onChange={(e) => set("title", e.target.value)}
          placeholder="Log every client call"
          className="h-9 w-full rounded-md border border-slate-300 px-2.5 text-[13.5px]"
        />
      </label>

      {/* ── WHEN ──────────────────────────────────────────────────────── */}
      <fieldset className="mt-4">
        <legend className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-500">
          When is it due
        </legend>
        <div className="flex flex-wrap gap-1.5">
          {CHOICES.map((c) => {
            const on = draft.schedule.choice === c.key;
            return (
              <button
                key={c.key}
                type="button"
                aria-pressed={on}
                onClick={() =>
                  set("schedule", {
                    choice: c.key,
                    // Carry the days across, so flipping to "Chosen days" and
                    // back does not silently empty a selection you just made.
                    weekdays: draft.schedule.weekdays,
                  })
                }
                title={c.hint}
                className={`inline-flex h-8 items-center rounded-lg px-3 text-[12.5px] font-semibold transition-colors ${
                  on ? "text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"
                }`}
                style={on ? { background: "var(--color-altus-red)" } : undefined}
              >
                {c.label}
              </button>
            );
          })}
        </div>

        {draft.schedule.choice === "days" && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {WEEKDAYS.map((d) => {
              const on = draft.schedule.weekdays.includes(d.bit);
              return (
                <button
                  key={d.bit}
                  type="button"
                  aria-pressed={on}
                  onClick={() => toggleDay(d.bit)}
                  className={`h-8 w-12 rounded-lg text-[12.5px] font-semibold transition-colors ${
                    on
                      ? "bg-slate-800 text-white"
                      : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                  }`}
                >
                  {d.short}
                </button>
              );
            })}
          </div>
        )}

        {/* THE PICK, READ BACK. This line is the whole point of the redesign. */}
        <p
          className={`mt-2 flex items-center gap-1.5 text-[12px] font-semibold ${
            complete ? "text-ink-muted" : "text-red-600"
          }`}
        >
          <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span>
            {describeSchedule(draft.schedule)}
            {next && (
              <>
                {" "}
                Next on {describeDay(next).weekday}, {describeDay(next).label}.
              </>
            )}
          </span>
        </p>
      </fieldset>

      {/* ── THE OPTIONAL REST ─────────────────────────────────────────── */}
      <div className="mt-4 grid grid-cols-4 gap-2 max-md:grid-cols-2">
        {(
          [
            ["section", "Section", "Start of day"],
            ["code", "Code", "ME-01"],
            ["targetNumber", "Target", "12"],
            ["unit", "Unit", "calls"],
          ] as const
        ).map(([k, label, placeholder]) => (
          <label key={k} className="block">
            <Label>{label}</Label>
            <input
              value={draft[k]}
              onChange={(e) => set(k, e.target.value)}
              placeholder={placeholder}
              className="h-9 w-full rounded-md border border-slate-300 px-2.5 text-[13px]"
            />
          </label>
        ))}
      </div>
      <p className="mt-1.5 text-[11.5px] text-ink-subtle">
        A <strong>target</strong> turns the row into a number you fill in rather than a yes or no —
        &ldquo;12 calls&rdquo;. Leave it blank for a plain Done / Not done.
      </p>

      <div className="mt-4 flex items-center gap-2">
        <button
          type="submit"
          disabled={busy || !draft.title.trim() || !complete}
          className="inline-flex h-9 items-center gap-2 rounded-lg px-4 text-[12.5px] font-semibold text-white disabled:opacity-50"
          style={{ background: "var(--color-altus-red)" }}
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          {submitLabel}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="h-9 rounded-lg px-3 text-[12.5px] font-semibold text-slate-600 hover:bg-slate-100"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function Label({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <span className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-500">
      {children}
      {required && <span className="ml-0.5 text-red-500">*</span>}
    </span>
  );
}
