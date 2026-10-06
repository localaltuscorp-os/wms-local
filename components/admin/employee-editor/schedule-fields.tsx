"use client";

import { Select } from "@/components/ui/select";
import { WORKER_TYPE_LABELS, WORKER_TYPES, asWorkerType, type WorkerType } from "@/lib/attendance/worker-type";
import { Card, Field, NO_CHANGE, NumberInput, TimeInput, inputClass } from "./primitives";

export const WEEKDAY_OPTIONS = [
  { value: "0", label: "Sunday" }, { value: "1", label: "Monday" }, { value: "2", label: "Tuesday" },
  { value: "3", label: "Wednesday" }, { value: "4", label: "Thursday" }, { value: "5", label: "Friday" }, { value: "6", label: "Saturday" },
];

const WORKER_TYPE_OPTIONS = WORKER_TYPES.map((workerType) => ({ value: workerType, label: WORKER_TYPE_LABELS[workerType] }));

export interface ScheduleDraft {
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
  extras?: React.ReactNode;
  previewWorkerType: WorkerType;
}

export function ScheduleFields({ bulk, draft, onChange, extras, previewWorkerType }: ScheduleFieldsProps) {
  const workerType = draft.workerType ?? previewWorkerType;
  const typeOptions = bulk ? [{ value: NO_CHANGE, label: "No Change" }, ...WORKER_TYPE_OPTIONS] : WORKER_TYPE_OPTIONS;
  const weeklyOffOptions = bulk ? [{ value: NO_CHANGE, label: "No Change" }, ...WEEKDAY_OPTIONS] : WEEKDAY_OPTIONS;

  return <Card title="Attendance & Work Schedule">
    <div className="grid grid-cols-2 gap-3 max-[520px]:grid-cols-1">
      <Field label="Employee Type">
        <Select value={draft.workerType ?? (bulk ? NO_CHANGE : workerType)} onValueChange={(value) => onChange({ workerType: value === NO_CHANGE ? null : asWorkerType(value) })} options={typeOptions} />
      </Field>
      <Field label="Weekly Off">
        <Select value={draft.weeklyOff == null ? NO_CHANGE : String(draft.weeklyOff)} onValueChange={(value) => onChange({ weeklyOff: value === NO_CHANGE ? null : Number(value) })} options={weeklyOffOptions} />
      </Field>
      <Field label="Official Start"><TimeInput bulk={bulk} value={draft.offStart} onChange={(value) => onChange({ offStart: value })} placeholder="10:00" /></Field>
      <Field label="Late After"><TimeInput bulk={bulk} value={draft.lateAfter} onChange={(value) => onChange({ lateAfter: value })} placeholder={workerType === "second_half" ? "15:30" : "10:50"} /></Field>
      <Field label="Official End"><TimeInput bulk={bulk} value={draft.offEnd} onChange={(value) => onChange({ offEnd: value })} placeholder="19:00" /></Field>
      <Field label="Early Before"><TimeInput bulk={bulk} value={draft.earlyBefore} onChange={(value) => onChange({ earlyBefore: value })} placeholder="19:20" /></Field>
    </div>
    {extras}
  </Card>;
}

export { NumberInput, inputClass };
