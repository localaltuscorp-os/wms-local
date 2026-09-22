"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Select } from "@/components/ui/select";
import {
  UNITS,
  WD,
  buildRule,
  seedDraft,
  nthLabel,
  wdCode,
  wdFull,
  ymd,
  type Draft,
  type Freq,
} from "@/lib/recurrence/google-recurrence";

/**
 * GOOGLE'S "Custom recurrence" DIALOG — one copy, every surface.
 *
 * "Repeat every N [day|week|month|year]", weekday chips when weekly, day-of-
 * month vs nth-weekday when monthly, and Ends (Never / On a date / After N
 * occurrences). Lifted out of the task Schedule section when the Job
 * Description form was asked for the same picker, so the two cannot drift.
 *
 * Emits the finished RRULE plus the `Draft` behind it — the JD needs the rule,
 * the task form needs the frequency off the draft, and neither should have to
 * re-parse what this already knows.
 */
export function CustomRecurrenceDialog({
  open,
  onOpenChange,
  anchor,
  rule,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** The start date every unasked-for detail is read from. */
  anchor: Date;
  rule: string | null;
  onDone: (result: { draft: Draft; rule: string }) => void;
}) {
  const [draft, setDraft] = React.useState<Draft>(() => seedDraft(rule, anchor));

  // Re-seed each time the dialog opens so it reflects the current rule.
  React.useEffect(() => {
    if (open) setDraft(seedDraft(rule, anchor));
  }, [open, rule, anchor]);

  function patch(p: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...p }));
  }

  function toggleDay(code: string) {
    setDraft((d) => {
      const has = d.byday.includes(code);
      const byday = has ? d.byday.filter((c) => c !== code) : [...d.byday, code];
      // Never leave a weekly rule with no day at all — it would repeat never.
      return { ...d, byday: byday.length ? byday : [wdCode(anchor)] };
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 z-[110]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[120] -translate-x-1/2 -translate-y-1/2 w-full max-w-[460px] rounded-xl bg-white border border-[#E2E8F0] p-6 shadow-lg max-h-[calc(100dvh-32px)] overflow-y-auto">
          <Dialog.Title className="font-serif text-xl text-ink-strong mb-5">
            Custom Recurrence
          </Dialog.Title>

          {/* Repeat every N [unit] */}
          <div className="flex items-center gap-2.5 mb-5">
            <span className="text-[14.5px] font-semibold text-ink-strong">Repeat every</span>
            <input
              type="number"
              min={1}
              max={999}
              value={draft.interval}
              onChange={(e) => patch({ interval: Math.max(1, Number(e.target.value) || 1) })}
              className="nt-input w-20 text-center tabular-nums"
            />
            <Select
              value={draft.freq}
              onValueChange={(v) => patch({ freq: v as Freq })}
              options={UNITS.map((u) => ({ value: u.value, label: u.label(draft.interval) }))}
              className="w-auto min-w-[8rem]"
              // This Select lives INSIDE the nested Custom-recurrence dialog
              // (z-[120]); its popover defaults to z-[100] and would render
              // BEHIND the dialog (the "completely broken" unit dropdown). Lift it.
              contentClassName="z-[130]"
            />
          </div>

          {/* Weekly → weekday chips */}
          {draft.freq === "WEEKLY" && (
            <div className="mb-5">
              <p className="text-[13.5px] font-semibold text-ink-soft mb-2">Repeat on</p>
              <div className="flex items-center gap-1.5">
                {WD.map((d, i) => {
                  const days = draft.byday.length ? draft.byday : [wdCode(anchor)];
                  const on = days.includes(d.code);
                  return (
                    <button
                      key={d.code + i}
                      type="button"
                      onClick={() => toggleDay(d.code)}
                      aria-pressed={on}
                      aria-label={d.full}
                      className="h-9 w-9 rounded-full text-[13px] font-bold transition-colors"
                      style={{
                        background: on ? "var(--color-altus-red)" : "var(--color-surface-soft)",
                        color: on ? "#fff" : "var(--color-ink-soft)",
                        border: "1px solid var(--color-hairline)",
                      }}
                    >
                      {d.short}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Monthly → day-of-month vs nth weekday */}
          {draft.freq === "MONTHLY" && (
            <div className="mb-5">
              <Select
                value={draft.monthlyMode}
                onValueChange={(v) => patch({ monthlyMode: v as "day" | "weekday" })}
                options={[
                  { value: "day", label: `Monthly on day ${anchor.getDate()}` },
                  {
                    value: "weekday",
                    label: `Monthly on the ${nthLabel(anchor)} ${wdFull(anchor)}`,
                  },
                ]}
                contentClassName="z-[130]"
              />
            </div>
          )}

          {/* Ends */}
          <div className="mb-6">
            <p className="text-[13.5px] font-semibold text-ink-soft mb-2.5">Ends</p>
            <div className="flex flex-col gap-3">
              <label className="inline-flex items-center gap-2.5 text-[14.5px] text-ink-strong cursor-pointer">
                <input
                  type="radio"
                  name="ends"
                  checked={draft.endsType === "never"}
                  onChange={() => patch({ endsType: "never" })}
                  style={{ accentColor: "var(--color-altus-red)" }}
                />
                Never
              </label>
              <label className="inline-flex items-center gap-2.5 text-[14.5px] text-ink-strong cursor-pointer">
                <input
                  type="radio"
                  name="ends"
                  checked={draft.endsType === "until"}
                  onChange={() =>
                    patch({
                      endsType: "until",
                      until: draft.until ?? ymd(new Date(anchor.getTime() + 90 * 86400000)),
                    })
                  }
                  style={{ accentColor: "var(--color-altus-red)" }}
                />
                On
                <input
                  type="date"
                  value={draft.until ?? ""}
                  disabled={draft.endsType !== "until"}
                  onChange={(e) => patch({ endsType: "until", until: e.target.value || null })}
                  className="nt-input"
                  style={{ maxWidth: 180 }}
                />
              </label>
              <label className="inline-flex items-center gap-2.5 text-[14.5px] text-ink-strong cursor-pointer">
                <input
                  type="radio"
                  name="ends"
                  checked={draft.endsType === "count"}
                  onChange={() => patch({ endsType: "count", count: draft.count ?? 13 })}
                  style={{ accentColor: "var(--color-altus-red)" }}
                />
                After
                <input
                  type="number"
                  min={1}
                  max={999}
                  value={draft.count ?? 13}
                  disabled={draft.endsType !== "count"}
                  onChange={(e) =>
                    patch({ endsType: "count", count: Math.max(1, Number(e.target.value) || 1) })
                  }
                  className="nt-input w-20 text-center tabular-nums"
                />
                occurrences
              </label>
            </div>
          </div>

          <div className="flex justify-end gap-2">
            <Dialog.Close asChild>
              <button type="button" className="px-4 py-2.5 text-[14px] font-medium text-ink-soft">
                Cancel
              </button>
            </Dialog.Close>
            <button
              type="button"
              onClick={() => {
                onDone({ draft, rule: buildRule(draft, anchor) });
                onOpenChange(false);
              }}
              className="rounded-md py-2.5 px-5 text-[14px] font-semibold text-white"
              style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}
            >
              Done
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
