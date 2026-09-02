"use client";

import { Select } from "@/components/ui/select";
import {
  WORKER_TYPE_LABELS,
  WORKER_TYPES,
  asWorkerType,
  type WorkerType,
} from "@/lib/attendance/worker-type";
import { Card, Field, NO_CHANGE, NumberInput, TimeInput, inputClass } from "./primitives";
import { hoursLabel, requirementFor, targetsFor, to12h } from "./schedule-format";

/**
 * ATTENDANCE & WORK SCHEDULE — the right column of the employee editor, shared
 * verbatim by single and bulk mode.
 *
 * ⚠ THIS IS THE SOURCE OF TRUTH THE ATTENDANCE ENGINE READS. Every figure shown
 * here is derived from `lib/attendance/hours-rule.ts` — the same constants the
 * grader and the salary engine read (see ./schedule-format). Nothing is
 * hardcoded: a full-timer's 9h/54h and a part-timer's 4.5h/27h both fall out of
 * those constants, so this panel cannot drift from what Attendance actually
 * enforces. If the policy changes, it changes there and shows up here.
 */

export const WEEKDAY_OPTIONS = [
  { value: "0", label: "Sunday" },
  { value: "1", label: "Monday" },
  { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" },
  { value: "4", label: "Thursday" },
  { value: "5", label: "Friday" },
  { value: "6", label: "Saturday" },
];

const WORKER_TYPE_OPTIONS = WORKER_TYPES.map((w) => ({
  value: w,
  label: WORKER_TYPE_LABELS[w],
}));

export interface ScheduleDraft {
  /** null in bulk mode = "No Change". */
  workerType: WorkerType | null;
  weeklyOff: number | null;
  offStart: string | null;
  lateAfter: string | null;
  offEnd: string | null;
  earlyBefore: string | null;
}

export interface ScheduleFieldsProps {
  bulk: boolean;
  draft: ScheduleDraft;
  onChange: (patch: Partial<ScheduleDraft>) => void;
  /** Single mode only — the type-specific rate/threshold inputs. */
  extras?: React.ReactNode;
  /** In bulk mode, the worker type the summary should preview. */
  previewWorkerType: WorkerType;
}

export function ScheduleFields({
  bulk,
  draft,
  onChange,
  extras,
  previewWorkerType,
}: ScheduleFieldsProps) {
  const wt = draft.workerType ?? previewWorkerType;

  return (
    <>
      <Card title="Attendance & Work Schedule">
        <Field label="Employee Type">
          <Select
            value={draft.workerType ?? (bulk ? NO_CHANGE : wt)}
            onValueChange={(v) =>
              onChange({ workerType: v === NO_CHANGE ? null : asWorkerType(v) })
            }
            options={
              bulk
                ? [{ value: NO_CHANGE, label: "No Change" }, ...WORKER_TYPE_OPTIONS]
                : WORKER_TYPE_OPTIONS
            }
          />
          {/* Dynamic requirement, straight from the attendance resolver. */}
          {draft.workerType || !bulk ? (
            <p className="mt-1.5 text-[12.5px] font-semibold text-ink-subtle tabular-nums">
              Requires {requirementFor(wt)}
            </p>
          ) : null}
        </Field>

        <Field label="Weekly Off">
          <Select
            value={draft.weeklyOff == null ? NO_CHANGE : String(draft.weeklyOff)}
            onValueChange={(v) =>
              onChange({ weeklyOff: v === NO_CHANGE ? null : Number(v) })
            }
            options={
              bulk
                ? [{ value: NO_CHANGE, label: "No Change" }, ...WEEKDAY_OPTIONS]
                : WEEKDAY_OPTIONS
            }
          />
        </Field>

        <div className="grid grid-cols-2 gap-3 max-[520px]:grid-cols-1">
          <Field label="Official Start">
            <TimeInput
              bulk={bulk}
              value={draft.offStart}
              onChange={(v) => onChange({ offStart: v })}
              placeholder="10:00"
            />
          </Field>
          <Field label="Late After">
            <TimeInput
              bulk={bulk}
              value={draft.lateAfter}
              onChange={(v) => onChange({ lateAfter: v })}
              placeholder={wt === "second_half" ? "15:30" : "10:50"}
            />
          </Field>
          <Field label="Official End">
            <TimeInput
              bulk={bulk}
              value={draft.offEnd}
              onChange={(v) => onChange({ offEnd: v })}
              placeholder="19:00"
            />
          </Field>
          <Field label="Early Before">
            <TimeInput
              bulk={bulk}
              value={draft.earlyBefore}
              onChange={(v) => onChange({ earlyBefore: v })}
              placeholder="19:20"
            />
          </Field>
        </div>

        <p className="text-[12.5px] text-ink-subtle" style={{ lineHeight: 1.55 }}>
          Leave a time blank to fall back to the company default. These values are
          what the Attendance system grades against — nothing is duplicated.
        </p>

        {extras}
      </Card>

      <ScheduleSummaryCard bulk={bulk} draft={draft} workerType={wt} />
    </>
  );
}

/**
 * The live read-back of what was just configured. Deliberately re-derived from
 * the draft on every keystroke rather than stored anywhere: it is a VIEW of the
 * schedule, never a second copy of it.
 */
function ScheduleSummaryCard({
  bulk,
  draft,
  workerType,
}: {
  bulk: boolean;
  draft: ScheduleDraft;
  workerType: WorkerType;
}) {
  const { daily, weekly } = targetsFor(workerType);
  const off =
    draft.weeklyOff == null
      ? null
      : WEEKDAY_OPTIONS.find((d) => d.value === String(draft.weeklyOff))?.label ?? null;
  const start = to12h(draft.offStart ?? "");
  const end = to12h(draft.offEnd ?? "");
  const unchanged = (
    <span className="font-semibold text-ink-subtle">Unchanged</span>
  );

  return (
    <Card title="Schedule Summary" tone="muted">
      <div className="space-y-1.5">
        <div className="text-[17px] font-black text-ink-strong">
          {bulk && !draft.workerType ? unchanged : WORKER_TYPE_LABELS[workerType]}
        </div>
        {!bulk || draft.workerType ? (
          <div className="text-[14px] font-bold tabular-nums text-altus-red">
            {hoursLabel(daily)}/day · {hoursLabel(weekly)}/week
          </div>
        ) : null}
        <div className="text-[14px] text-ink-soft">
          {off ? `${off} weekly off` : bulk ? unchanged : "No weekly off set"}
        </div>
        <div className="text-[14px] tabular-nums text-ink-soft">
          {start || end ? (
            <>
              {start || "company default"} → {end || "company default"}
            </>
          ) : bulk ? (
            unchanged
          ) : (
            "Company default hours"
          )}
        </div>
      </div>
      {bulk ? (
        <p className="mt-3 text-[12.5px] text-ink-subtle" style={{ lineHeight: 1.55 }}>
          Anything left on <b>No Change</b> keeps each employee&apos;s own value.
        </p>
      ) : null}
    </Card>
  );
}

/** Re-exported so the single-mode extras can share the same input styling. */
export { NumberInput, inputClass };
