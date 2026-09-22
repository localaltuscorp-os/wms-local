/**
 * GOOGLE CALENDAR'S RECURRENCE VOCABULARY — the words and the shapes.
 *
 * PURE, and no `server-only`: the pickers run in the browser and the JD form
 * previews the next few due dates as you choose.
 *
 * ── WHY THIS IS ITS OWN MODULE ───────────────────────────────────────────────
 * Two surfaces ask the same question — the task Schedule section and the Job
 * Description form — and the account holder asked for both to read exactly like
 * the calendar people already use. Two copies of "Monthly on the third
 * Wednesday" is two chances to drift, and the drift is invisible: each screen
 * looks right on its own. So the vocabulary lives here once and both import it.
 *
 * Everything below is a VIEW over an RRULE string plus an anchor date. The
 * anchor is what makes the menu read the way Google's does: the presets are
 * sentences ABOUT the start date ("Weekly on Wednesday"), not a fixed list.
 *
 * Dates here are LOCAL calendar days, matching the `Date` a picker hands us.
 * `lib/recurrence/rrule.ts` does the UTC occurrence arithmetic; this module
 * only ever asks a Date for its own weekday and day-of-month.
 */

export type Freq = "DAILY" | "WEEKLY" | "MONTHLY" | "YEARLY";
export type EndsType = "never" | "until" | "count";

export const WD = [
  { code: "SU", short: "S", full: "Sunday" },
  { code: "MO", short: "M", full: "Monday" },
  { code: "TU", short: "T", full: "Tuesday" },
  { code: "WE", short: "W", full: "Wednesday" },
  { code: "TH", short: "T", full: "Thursday" },
  { code: "FR", short: "F", full: "Friday" },
  { code: "SA", short: "S", full: "Saturday" },
] as const;

/** Monday-to-Friday, the "Every weekday" preset. */
export const WEEKDAY_SET = ["MO", "TU", "WE", "TH", "FR"];

export const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

const NTH_WORD = ["first", "second", "third", "fourth", "fifth"];

export const wdCode = (d: Date) => WD[d.getDay()]!.code;
export const wdFull = (d: Date) => WD[d.getDay()]!.full;

/** 1..5 — which occurrence of its own weekday this date is within its month. */
export const nthOfMonth = (d: Date) => Math.floor((d.getDate() - 1) / 7) + 1;

export const isLastWeekdayOfMonth = (d: Date) =>
  d.getDate() + 7 > new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();

/* "the last Friday" reads better than "the fifth Friday", and a fifth weekday
   does not exist in most months — so a date in the final week is always spoken
   and stored as the last one. */
export const nthLabel = (d: Date) =>
  isLastWeekdayOfMonth(d) ? "last" : NTH_WORD[nthOfMonth(d) - 1]!;
export const nthRRuleNum = (d: Date) => (isLastWeekdayOfMonth(d) ? -1 : nthOfMonth(d));

export function ymd(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * `2026-09-16` → a Date at LOCAL midnight.
 *
 * Never `new Date(str)` for a bare date: that reads it as UTC, so west of
 * Greenwich it lands on the previous day and every preset names the wrong
 * weekday.
 */
export function dateFromYmd(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return new Date();
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

/** The custom dialog's working state — what the fields edit before Done. */
export interface Draft {
  freq: Freq;
  interval: number;
  /** Weekly day list, RRULE codes. Empty = "the anchor's own weekday". */
  byday: string[];
  monthlyMode: "day" | "weekday";
  endsType: EndsType;
  until: string | null;
  count: number | null;
}

/**
 * RRULE → Draft. Returns null on anything without a FREQ, which is how a blank
 * or unparseable rule falls back to a fresh draft rather than a wrong one.
 */
export function parseDraft(rule: string | null): Draft | null {
  if (!rule) return null;
  const d: Draft = {
    freq: "DAILY",
    interval: 1,
    byday: [],
    monthlyMode: "day",
    endsType: "never",
    until: null,
    count: null,
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
        d.freq = f;
        sawFreq = true;
      }
    } else if (key === "INTERVAL") {
      const n = Number(val);
      if (Number.isInteger(n) && n >= 1) d.interval = n;
    } else if (key === "BYDAY") {
      const toks = val.split(",").filter(Boolean);
      // A single "2MO"-shaped token is a MONTHLY nth-weekday, not a day list.
      if (toks.length === 1 && /^-?\d+[A-Z]{2}$/i.test(toks[0]!)) {
        d.monthlyMode = "weekday";
      } else {
        d.byday = toks.map((t) => t.toUpperCase());
      }
    } else if (key === "BYMONTHDAY") {
      d.monthlyMode = "day";
    } else if (key === "UNTIL") {
      const m = val.match(/^(\d{4})-?(\d{2})-?(\d{2})/);
      if (m) {
        d.until = `${m[1]}-${m[2]}-${m[3]}`;
        d.endsType = "until";
      }
    } else if (key === "COUNT") {
      const n = Number(val);
      if (n >= 1) {
        d.count = n;
        d.endsType = "count";
      }
    }
  }
  return sawFreq ? d : null;
}

/**
 * Draft + anchor → RRULE. The anchor supplies everything the dialog does not
 * ask for: which weekday a weekly rule lands on, which day of the month.
 */
export function buildRule(d: Draft, anchor: Date): string {
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

export function seedDraft(rule: string | null, anchor: Date): Draft {
  const parsed = parseDraft(rule);
  if (parsed) {
    // Default the weekly selection to the anchor weekday when none stored.
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

export type PresetKey =
  | "none"
  | "daily"
  | "weekly"
  | "monthly"
  | "yearly"
  | "weekday"
  | "custom";

/**
 * The dropdown, spoken about the anchor date — Google's exact seven.
 *
 * "Weekly on Wednesday" and "Monthly on the third Wednesday" are SENTENCES
 * ABOUT THE START DATE, which is the whole reason this takes an anchor. A fixed
 * list ("Weekly on Saturday") is right one day in seven and quietly wrong the
 * rest of the time.
 */
export function presetOptions(anchor: Date): { key: PresetKey; label: string }[] {
  return [
    { key: "none", label: "Does not repeat" },
    { key: "daily", label: "Daily" },
    { key: "weekly", label: `Weekly on ${wdFull(anchor)}` },
    { key: "monthly", label: `Monthly on the ${nthLabel(anchor)} ${wdFull(anchor)}` },
    { key: "yearly", label: `Annually on ${MONTHS[anchor.getMonth()]} ${anchor.getDate()}` },
    { key: "weekday", label: "Every weekday (Monday to Friday)" },
    { key: "custom", label: "Custom…" },
  ];
}

/** The RRULE a preset stands for. `none` has none — the caller stores nothing. */
export function ruleForPreset(
  key: Exclude<PresetKey, "none" | "custom">,
  anchor: Date,
): string {
  switch (key) {
    case "daily":
      return "FREQ=DAILY";
    case "weekly":
      return `FREQ=WEEKLY;BYDAY=${wdCode(anchor)}`;
    case "monthly":
      return `FREQ=MONTHLY;BYDAY=${nthRRuleNum(anchor)}${wdCode(anchor)}`;
    case "weekday":
      return "FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR";
    case "yearly":
      return "FREQ=YEARLY";
  }
}

/**
 * Which preset (if any) a stored rule maps to for this anchor. Anything the
 * seven cannot say — an interval, an end date, a day list — reads as Custom.
 */
export function detectPreset(rule: string | null, anchor: Date): PresetKey {
  const d = parseDraft(rule);
  if (!d) return "none";
  if (d.interval > 1 || d.endsType !== "never") return "custom";
  if (d.freq === "DAILY") return "daily";
  if (d.freq === "WEEKLY") {
    const set = d.byday.slice().sort().join(",");
    if (set === wdCode(anchor)) return "weekly";
    if (set === WEEKDAY_SET.slice().sort().join(",")) return "weekday";
    return "custom";
  }
  if (d.freq === "MONTHLY") return d.monthlyMode === "weekday" ? "monthly" : "custom";
  if (d.freq === "YEARLY") return "yearly";
  return "custom";
}

/** One sentence for a rule the seven presets cannot name. */
export function humanSummary(rule: string | null, anchor: Date): string | null {
  const d = parseDraft(rule);
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
    s +=
      d.monthlyMode === "weekday"
        ? ` on the ${nthLabel(anchor)} ${wdFull(anchor)}`
        : ` on day ${anchor.getDate()}`;
  }
  if (d.endsType === "until" && d.until) s += `, until ${d.until}`;
  if (d.endsType === "count" && d.count) s += `, ${d.count} times`;
  return s;
}

export const UNITS: { value: Freq; label: (n: number) => string }[] = [
  { value: "DAILY", label: (n) => (n === 1 ? "day" : "days") },
  { value: "WEEKLY", label: (n) => (n === 1 ? "week" : "weeks") },
  { value: "MONTHLY", label: (n) => (n === 1 ? "month" : "months") },
  { value: "YEARLY", label: (n) => (n === 1 ? "year" : "years") },
];
