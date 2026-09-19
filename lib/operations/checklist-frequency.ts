/**
 * EVENT CHECKLIST — how often a row comes round.
 *
 * PURE, and no `server-only`: the grid reads the Frequency column and the
 * current Target Date from these in the browser.
 *
 * ── ONE STORED VALUE, TWO COLUMNS ────────────────────────────────────────
 * A row stores ONE thing: Google Calendar's RRULE (`recurrence_rule`, the same
 * grammar a WMS task's repeat holds). Target Date edits it through Google's own
 * menu — "Weekly on Friday", "Monthly on the third Wednesday", Custom… — and
 * the Frequency column (Daily / Weekly / Monthly / Quarterly / Yearly) is READ
 * from it. Picking a frequency writes the matching rule. Two stored fields
 * would be two chances for "Weekly" to sit beside a monthly rule.
 */

import { parseRRule, generateOccurrences } from "@/lib/recurrence/rrule";
import {
  dateFromYmd,
  humanSummary,
  detectPreset,
  presetOptions,
  ruleForPreset,
  wdCode,
} from "@/lib/recurrence/google-recurrence";

export type Frequency = "once" | "daily" | "weekly" | "monthly" | "quarterly" | "yearly";

/** The Frequency menu, in order — the WMS words plus One-time. */
export const FREQUENCIES: readonly { key: Frequency; label: string }[] = [
  { key: "once", label: "One-time" },
  { key: "daily", label: "Daily" },
  { key: "weekly", label: "Weekly" },
  { key: "monthly", label: "Monthly" },
  { key: "quarterly", label: "Quarterly" },
  { key: "yearly", label: "Yearly" },
];

export const FREQUENCY_LABEL: Record<Frequency, string> = Object.fromEntries(
  FREQUENCIES.map((f) => [f.key, f.label]),
) as Record<Frequency, string>;

/**
 * Which Frequency a rule is. `custom` is a rule none of the six names — every
 * 2 weeks, every 6 months — which the column shows in words instead.
 */
export function frequencyOf(rule: string | null | undefined): Frequency | "custom" {
  if (!rule) return "once";
  const p = parseRRule(rule);
  if (!p) return "once";
  const every = Math.max(1, p.interval || 1);
  if (p.freq === "DAILY") return every === 1 ? "daily" : "custom";
  if (p.freq === "WEEKLY") return every === 1 ? "weekly" : "custom";
  if (p.freq === "MONTHLY") return every === 1 ? "monthly" : every === 3 ? "quarterly" : "custom";
  if (p.freq === "YEARLY") return every === 1 ? "yearly" : "custom";
  return "custom";
}

/**
 * The rule a Frequency stands for, spoken about the row's date — the way
 * Google's menu is: weekly lands on that weekday, monthly on that weekday's
 * place in the month, quarterly on that day of the month every three months.
 */
export function ruleForFrequency(key: Frequency, anchorYmd: string): string | null {
  const anchor = dateFromYmd(anchorYmd);
  switch (key) {
    case "once":
      return null;
    case "daily":
      return ruleForPreset("daily", anchor);
    case "weekly":
      return `FREQ=WEEKLY;BYDAY=${wdCode(anchor)}`;
    case "monthly":
      return ruleForPreset("monthly", anchor);
    case "quarterly":
      return `FREQ=MONTHLY;INTERVAL=3;BYMONTHDAY=${anchor.getDate()}`;
    case "yearly":
      return ruleForPreset("yearly", anchor);
  }
}

/** What the Frequency column reads: "Weekly", or a custom rule in words. */
export function frequencyText(rule: string | null | undefined, anchorYmd: string | null): string {
  const f = frequencyOf(rule);
  if (f !== "custom") return FREQUENCY_LABEL[f];
  return (anchorYmd && humanSummary(rule ?? null, dateFromYmd(anchorYmd))) || "Custom";
}

/** Google's line under the date — "Weekly on Friday" — or null for a one-off. */
export function repeatText(rule: string | null | undefined, anchorYmd: string | null): string | null {
  if (!rule || !anchorYmd) return null;
  const anchor = dateFromYmd(anchorYmd);
  const preset = detectPreset(rule, anchor);
  if (preset === "none") return null;
  if (preset === "custom") return humanSummary(rule, anchor);
  return presetOptions(anchor).find((o) => o.key === preset)?.label ?? null;
}

/**
 * When the date moves, a PRESET rule moves with it — "Weekly on Wednesday"
 * becomes "Weekly on Thursday" — or the menu would name one day and the rule
 * mean another. A custom rule is the user's own sentence and is kept.
 */
export function reanchorRule(
  rule: string | null | undefined,
  fromYmd: string | null,
  toYmd: string,
): string | null {
  if (!rule) return null;
  const f = frequencyOf(rule);
  if (fromYmd) {
    const preset = detectPreset(rule, dateFromYmd(fromYmd));
    if (preset !== "none" && preset !== "custom") return ruleForPreset(preset, dateFromYmd(toYmd));
  }
  if (f === "quarterly") return ruleForFrequency("quarterly", toYmd);
  return rule;
}

const utc = (ymd: string) => new Date(`${ymd}T00:00:00Z`);

/**
 * The occurrence a repeating row is due on as of `refYmd`: the latest one on or
 * before it, or the first (the row's own date) when that is still ahead. A
 * one-off row is always due on its own date.
 *
 * This is the Target Date the grid shows and measures +/- Days against — a
 * daily row is due today, not on the day it was first set.
 */
export function currentOccurrence(
  anchorYmd: string | null,
  rule: string | null | undefined,
  refYmd: string,
): string | null {
  if (!anchorYmd) return null;
  if (!rule || anchorYmd >= refYmd) return anchorYmd;
  const parsed = parseRRule(rule);
  if (!parsed) return anchorYmd;

  /* generateOccurrences stops at 200 dates, so a daily row set a year ago
     would stall. Walking on from the last date it returned is exact for every
     rule without a COUNT (the anchor of such a rule is itself an occurrence);
     a COUNT rule ends within its own count, so one pass is always enough. */
  let from = anchorYmd;
  for (let pass = 0; pass < 40; pass++) {
    const dates = generateOccurrences(parsed, utc(from), utc(refYmd));
    if (dates.length === 0) return from;
    from = dates[dates.length - 1]!;
    if (dates.length < 200 || parsed.count !== null) return from;
  }
  return from;
}
