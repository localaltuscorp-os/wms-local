"use client";

import * as React from "react";
import { Repeat } from "lucide-react";
import type { TaskRecurrence } from "@/db/enums";
import { Select } from "@/components/ui/select";
import { CustomRecurrenceDialog } from "@/components/recurrence/custom-recurrence-dialog";
import {
  buildRule,
  detectPreset,
  humanSummary,
  presetOptions,
  ruleForPreset,
  type PresetKey,
} from "@/lib/recurrence/google-recurrence";

/**
 * Google-Calendar-faithful recurrence picker.
 *
 * A preset dropdown (Does not repeat / Daily / Weekly on … / Monthly on the
 * Nth … / Annually on … / Every weekday / Custom…) plus a "Custom…" dialog
 * that mirrors Google's. Emits a `recurrence` enum + an RRULE string the
 * materializer engine understands (FREQ/INTERVAL/BYDAY/BYMONTHDAY/UNTIL/COUNT).
 *
 * The vocabulary itself lives in `lib/recurrence/google-recurrence.ts` and the
 * dialog in `components/recurrence/custom-recurrence-dialog.tsx` — both shared
 * with the Job Description form, which asks the same question.
 */

const FREQ_OF_PRESET: Record<Exclude<PresetKey, "none" | "custom">, TaskRecurrence> = {
  daily: "daily",
  weekly: "weekly",
  monthly: "monthly",
  yearly: "yearly",
  weekday: "weekly",
};

interface Props {
  anchor: Date;
  recurrence: TaskRecurrence | null;
  recurrenceRule: string | null;
  onChange: (next: { recurrence: TaskRecurrence | null; recurrenceRule: string | null }) => void;
}

export function RecurrenceControl({ anchor, recurrence, recurrenceRule, onChange }: Props) {
  const [open, setOpen] = React.useState(false);
  const preset = recurrence ? detectPreset(recurrenceRule, anchor) : "none";

  function selectPreset(key: PresetKey) {
    if (key === "none") return onChange({ recurrence: null, recurrenceRule: null });
    if (key === "custom") return setOpen(true);
    onChange({ recurrence: FREQ_OF_PRESET[key], recurrenceRule: ruleForPreset(key, anchor) });
  }

  const summary = preset === "custom" ? humanSummary(recurrenceRule, anchor) : null;

  return (
    <div className="grid grid-cols-[80px_1fr] gap-3 items-start max-md:grid-cols-1 max-md:gap-2">
      <span
        className="inline-flex items-center gap-1.5 uppercase font-bold tracking-[0.08em] pt-2.5"
        style={{
          fontFamily: "var(--font-mono-display), ui-monospace, monospace",
          fontSize: 12,
          color: "var(--color-ink-muted)",
        }}
      >
        <Repeat size={12} strokeWidth={2.4} />
        Repeat
      </span>
      <div>
        <Select
          value={preset}
          onValueChange={(v) => selectPreset(v as PresetKey)}
          options={presetOptions(anchor).map((o) => ({ value: o.key, label: o.label }))}
        />
        {summary && (
          <p className="mt-2 text-[13px] font-semibold" style={{ color: "rgb(var(--vp-cyan-deep))" }}>
            {summary}{" "}
            <button
              type="button"
              onClick={() => setOpen(true)}
              className="underline underline-offset-2 hover:text-altus-red"
            >
              Edit
            </button>
          </p>
        )}
      </div>

      <CustomRecurrenceDialog
        open={open}
        onOpenChange={setOpen}
        anchor={anchor}
        rule={recurrenceRule}
        onDone={({ draft }) =>
          onChange({
            recurrence: draft.freq.toLowerCase() as TaskRecurrence,
            recurrenceRule: buildRule(draft, anchor),
          })
        }
      />
    </div>
  );
}
