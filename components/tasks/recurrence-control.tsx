"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Repeat } from "lucide-react";
import type { TaskRecurrence } from "@/db/enums";
import { Select } from "@/components/ui/select";

/**
 * Google-Calendar-faithful recurrence picker.
 *
 * A preset dropdown (Does not repeat / Daily / Weekly on … / Monthly on the
 * Nth … / Annually on … / Every weekday / Custom…) plus a "Custom…" dialog
 * that mirrors Google's: "Repeat every N [day|week|month|year]", weekday
 * chips, "on day N" vs "on the Nth weekday", and Ends (Never / On date /
 * After N occurrences). Emits a `recurrence` enum + an RRULE string the
 * materializer engine understands (FREQ/INTERVAL/BYDAY/BYMONTHDAY/UNTIL/COUNT).
 */

const WD = [
  { code: "SU", short: "S", full: "Sunday" },
  { code: "MO", short: "M", full: "Monday" },
  { code: "TU", short: "T", full: "Tuesday" },
  { code: "WE", short: "W", full: "Wednesday" },
  { code: "TH", short: "T", full: "Thursday" },
  { code: "FR", short: "F", full: "Friday" },
  { code: "SA", short: "S", full: "Saturday" },
] as const;
const WEEKDAY_SET = ["MO", "TU", "WE", "TH", "FR"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];
const NTH_WORD = ["first", "second", "third", "fourth", "fifth"];

const wdCode = (d: Date) => WD[d.getDay()]!.code;
const wdFull = (d: Date) => WD[d.getDay()]!.full;
const nthOfMonth = (d: Date) => Math.floor((d.getDate() - 1) / 7) + 1; // 1..5
const isLastWeekdayOfMonth = (d: Date) =>
  d.getDate() + 7 > new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
const nthLabel = (d: Date) => (isLastWeekdayOfMonth(d) ? "last" : NTH_WORD[nthOfMonth(d) - 1]!);
const nthRRuleNum = (d: Date) => (isLastWeekdayOfMonth(d) ? -1 : nthOfMonth(d));
function ymd(d: Date) {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

type Freq = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
type EndsType = "never" | "until" | "count";

interface Draft {
  freq: Freq;
  interval: number;
  byday: string[]; // weekly list
  monthlyMode: "day" | "weekday";
  endsType: EndsType;
  until: string | null;
  count: number | null;
}

function parseRule(rule: string | null): Draft | null {
  if (!rule) return null;
  const d: Draft = {
    freq: "DAILY", interval: 1, byday: [], monthlyMode: "day",
    endsType: "never", until: null, count: null,
  };
  let sawFreq = false;
  for (const seg of rule.split(";")) {
    const [k, v] = seg.split("=");
    if (!k || v === undefined) continue;
    const key = k.trim().toUpperCase();
    const val = v.trim();
    if (key === "FREQ") {
      const f = val.toUpperCase();
      if (f === "DAILY" || f === "WEEKLY" || f === "MONTHLY" || f === "YEARLY") {
        d.freq = f; sawFreq = true;
      }
    } else if (key === "INTERVAL") {
      const n = Number(val); if (Number.isInteger(n) && n >= 1) d.interval = n;
    } else if (key === "BYDAY") {
      const toks = val.split(",").filter(Boolean);
      if (toks.length === 1 && /^-?\d+[A-Z]{2}$/i.test(toks[0]!)) {
        d.monthlyMode = "weekday";
      } else {
        d.byday = toks.map((t) => t.toUpperCase());
      }
    } else if (key === "BYMONTHDAY") {
      d.monthlyMode = "day";
    } else if (key === "UNTIL") {
      const m = val.match(/^(\d{4})-?(\d{2})-?(\d{2})/);
      if (m) { d.until = `${m[1]}-${m[2]}-${m[3]}`; d.endsType = "until"; }
    } else if (key === "COUNT") {
      const n = Number(val); if (n >= 1) { d.count = n; d.endsType = "count"; }
    }
  }
  return sawFreq ? d : null;
}

/** Build an RRULE string from a draft + the task's anchor date. */
function buildRule(d: Draft, anchor: Date): string {
  const segs = [`FREQ=${d.freq}`];
  if (d.interval > 1) segs.push(`INTERVAL=${d.interval}`);
  if (d.freq === "WEEKLY") {
    const days = d.byday.length ? d.byday : [wdCode(anchor)];
    segs.push(`BYDAY=${days.join(",")}`);
  }
  if (d.freq === "MONTHLY") {
    if (d.monthlyMode === "weekday") {
      segs.push(`BYDAY=${nthRRuleNum(anchor)}${wdCode(anchor)}`);
    } else {
      segs.push(`BYMONTHDAY=${anchor.getDate()}`);
    }
  }
  if (d.endsType === "until" && d.until) segs.push(`UNTIL=${d.until}`);
  if (d.endsType === "count" && d.count && d.count >= 1) segs.push(`COUNT=${d.count}`);
  return segs.join(";");
}

type PresetKey = "none" | "daily" | "weekly" | "monthly" | "yearly" | "weekday" | "custom";

/** Which preset (if any) the current rule maps to for this anchor. */
function detectPreset(rule: string | null, anchor: Date): PresetKey {
  const d = parseRule(rule);
  if (!d) return "none";
  if (d.interval > 1 || d.endsType !== "never") return "custom";
  if (d.freq === "DAILY") return "daily";
  if (d.freq === "WEEKLY") {
    const set = d.byday.slice().sort().join(",");
    if (set === wdCode(anchor)) return "weekly";
    if (set === WEEKDAY_SET.slice().sort().join(",")) return "weekday";
    return "custom";
  }
  if (d.freq === "MONTHLY") {
    return d.monthlyMode === "weekday" ? "monthly" : "custom";
  }
  if (d.freq === "YEARLY") return "yearly";
  return "custom";
}

const FREQ_OF_PRESET: Record<Exclude<PresetKey, "none" | "custom">, TaskRecurrence> = {
  daily: "daily", weekly: "weekly", monthly: "monthly", yearly: "yearly", weekday: "weekly",
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

  const presetOptions: { key: PresetKey; label: string }[] = [
    { key: "none", label: "Does not repeat" },
    { key: "daily", label: "Daily" },
    { key: "weekly", label: `Weekly on ${wdFull(anchor)}` },
    { key: "monthly", label: `Monthly on the ${nthLabel(anchor)} ${wdFull(anchor)}` },
    { key: "yearly", label: `Annually on ${MONTHS[anchor.getMonth()]} ${anchor.getDate()}` },
    { key: "weekday", label: "Every weekday (Monday to Friday)" },
    { key: "custom", label: "Custom…" },
  ];

  function selectPreset(key: PresetKey) {
    if (key === "none") return onChange({ recurrence: null, recurrenceRule: null });
    if (key === "custom") return setOpen(true);
    const rule =
      key === "daily" ? "FREQ=DAILY"
      : key === "weekly" ? `FREQ=WEEKLY;BYDAY=${wdCode(anchor)}`
      : key === "monthly" ? `FREQ=MONTHLY;BYDAY=${nthRRuleNum(anchor)}${wdCode(anchor)}`
      : key === "weekday" ? "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR"
      : "FREQ=YEARLY";
    onChange({ recurrence: FREQ_OF_PRESET[key], recurrenceRule: rule });
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
          options={presetOptions.map((o) => ({ value: o.key, label: o.label }))}
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

      <CustomDialog
        open={open}
        onOpenChange={setOpen}
        anchor={anchor}
        rule={recurrenceRule}
        onDone={(d) =>
          onChange({
            recurrence: d.freq.toLowerCase() as TaskRecurrence,
            recurrenceRule: buildRule(d, anchor),
          })
        }
      />
    </div>
  );
}

function humanSummary(rule: string | null, anchor: Date): string | null {
  const d = parseRule(rule);
  if (!d) return null;
  const unit = { DAILY: "day", WEEKLY: "week", MONTHLY: "month", YEARLY: "year" }[d.freq];
  let s = d.interval > 1 ? `Every ${d.interval} ${unit}s` : `Every ${unit}`;
  if (d.freq === "WEEKLY") {
    const days = (d.byday.length ? d.byday : [wdCode(anchor)])
      .map((c) => WD.find((w) => w.code === c)?.full.slice(0, 3))
      .filter(Boolean)
      .join(", ");
    if (days) s += ` on ${days}`;
  }
  if (d.freq === "MONTHLY") {
    s += d.monthlyMode === "weekday"
      ? ` on the ${nthLabel(anchor)} ${wdFull(anchor)}`
      : ` on day ${anchor.getDate()}`;
  }
  if (d.endsType === "until" && d.until) s += `, until ${d.until}`;
  if (d.endsType === "count" && d.count) s += `, ${d.count} times`;
  return s;
}

const UNITS: { value: Freq; label: (n: number) => string }[] = [
  { value: "DAILY", label: (n) => (n === 1 ? "day" : "days") },
  { value: "WEEKLY", label: (n) => (n === 1 ? "week" : "weeks") },
  { value: "MONTHLY", label: (n) => (n === 1 ? "month" : "months") },
  { value: "YEARLY", label: (n) => (n === 1 ? "year" : "years") },
];

function CustomDialog({
  open,
  onOpenChange,
  anchor,
  rule,
  onDone,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  anchor: Date;
  rule: string | null;
  onDone: (d: Draft) => void;
}) {
  const [draft, setDraft] = React.useState<Draft>(() => seed(rule, anchor));
  // Re-seed each time the dialog opens so it reflects the current rule.
  React.useEffect(() => {
    if (open) setDraft(seed(rule, anchor));
  }, [open, rule, anchor]);

  function patch(p: Partial<Draft>) {
    setDraft((d) => ({ ...d, ...p }));
  }
  function toggleDay(code: string) {
    setDraft((d) => {
      const has = d.byday.includes(code);
      const byday = has ? d.byday.filter((c) => c !== code) : [...d.byday, code];
      return { ...d, byday: byday.length ? byday : [wdCode(anchor)] };
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/30 z-[110]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[120] -translate-x-1/2 -translate-y-1/2 w-full max-w-[460px] rounded-xl bg-white border border-[#E2E8F0] p-6 shadow-lg max-h-[calc(100dvh-32px)] overflow-y-auto">
          <Dialog.Title className="font-serif text-xl text-ink-strong mb-5">
            Custom recurrence
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
                  { value: "weekday", label: `Monthly on the ${nthLabel(anchor)} ${wdFull(anchor)}` },
                ]}
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
                onDone(draft);
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

function seed(rule: string | null, anchor: Date): Draft {
  const parsed = parseRule(rule);
  if (parsed) {
    // Default weekly selection to the anchor weekday when none stored.
    if (parsed.freq === "WEEKLY" && parsed.byday.length === 0) parsed.byday = [wdCode(anchor)];
    return parsed;
  }
  return {
    freq: "WEEKLY",
    interval: 1,
    byday: [wdCode(anchor)],
    monthlyMode: "day",
    endsType: "never",
    until: null,
    count: null,
  };
}
