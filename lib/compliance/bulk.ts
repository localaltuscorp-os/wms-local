/**
 * WCC / MCC — BULK UPLOAD FROM EXCEL (account holder, 2026-09-19).
 *
 * PURE and client-safe. ONE manifest of the template's columns, read by both
 * sides: the workbook generator (lib/compliance/bulk-template.ts) writes these
 * headers, dropdowns and hints, and the upload dialog reads a filled sheet back
 * with `readComplianceMatrix` — so a column can never be in the template and
 * unknown to the importer. The server (`bulkAddCompliances`) checks every row
 * again; nothing here is trusted on its own.
 *
 * ── THE COLUMNS ──────────────────────────────────────────────────────────
 *   WCC  Employee* · Section · Compliance* · Frequency* · Days · Mins · Target · Unit
 *        Frequency: Mon to Sat · Mon to Sun · Each Day of the Week (repeats
 *                   on each day listed in Days) — the pop-up's own three
 *        Mins:      how many minutes it takes each time (lib/compliance/minutes)
 *   MCC  Employee* · Section · Compliance* · Frequency* · Deadline Day* ·
 *        2nd Deadline Day · 3rd Deadline Day · Due Month · Target · Unit
 *        Frequency: Monthly · 2 times/month · 3 times/month · Alternate Month ·
 *                   Quarterly · Half Yearly · Annually (lib/compliance/mcc-frequency)
 *
 * ── READING A SHEET ──────────────────────────────────────────────────────
 * The header row is FOUND, not assumed — the template's title rows above it,
 * a sheet someone rebuilt by hand, or rows pasted from Excel all read. Headers
 * match loosely ("Due month", "DUE MONTH *", "Month"). Every row comes back
 * with what it will become in words, and its errors (it will not be added) and
 * warnings (added, but something was ignored). Blank rows are skipped.
 */

import {
  DEADLINES_PER_MONTH,
  MCC_FREQUENCIES,
  MCC_FREQUENCY_LABEL,
  MONTH_END,
  MONTH_LONG,
  MONTH_SHORT,
  mccDetail,
  needsStartMonth,
  normalizeMccSchedule,
  type MccFrequency,
} from "./mcc-frequency";
import { checkQuantity, quantityTargetOf, quantityText } from "./quantity";
import { MAX_MINUTES, parseMinutes } from "./minutes";
import type { ComplianceKind } from "./schedule";

/** The most rows one upload takes. */
export const COMPLIANCE_BULK_MAX = 500;

/** A title as compared for "already on the checklist": case and spacing aside. */
export function normTitle(s: string): string {
  return s.trim().replace(/\s+/g, " ").toLowerCase();
}

/** Header / value matching: lowercase letters and digits only. */
export function normKey(v: unknown): string {
  return String(v ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

/* ── WCC's frequencies — the pop-up's "When" (account holder, 2026-09-19) ── */

export const WCC_FREQUENCIES = ["mon_to_sat", "mon_to_sun", "each_day"] as const;
export type WccFrequency = (typeof WCC_FREQUENCIES)[number];

export const WCC_FREQUENCY_LABEL: Record<WccFrequency, string> = {
  mon_to_sat: "Mon to Sat",
  mon_to_sun: "Mon to Sun",
  each_day: "Each Day of the Week",
};

const WCC_ALIASES: Record<WccFrequency, string[]> = {
  mon_to_sat: ["mon to sat", "mon-sat", "monday to saturday", "daily", "working days", "6 days"],
  mon_to_sun: ["mon to sun", "mon-sun", "monday to sunday", "every day", "everyday", "all days", "all 7 days", "7 days"],
  each_day: [
    "each day of the week", "each day", "selected days", "selected day", "specific days", "on selected days",
    "on these days", "days of the week", "custom", "days",
  ],
};

const MCC_ALIASES: Record<MccFrequency, string[]> = {
  monthly: ["monthly", "every month", "once a month", "1 time/month", "1 time a month", "per month"],
  twice_monthly: ["2 times/month", "2 times a month", "2 times per month", "twice a month", "twice monthly", "semi monthly", "semimonthly"],
  thrice_monthly: ["3 times/month", "3 times a month", "3 times per month", "thrice a month", "thrice monthly"],
  alternate_month: ["alternate month", "alternate months", "every alternate month", "every 2 months", "every two months", "every other month"],
  quarterly: ["quarterly", "every quarter", "once a quarter", "every 3 months", "every three months"],
  half_yearly: ["half yearly", "half-yearly", "half year", "every 6 months", "every six months", "semi annual", "semi annually", "biannual", "biannually", "twice a year", "six monthly"],
  annually: ["annually", "annual", "yearly", "once a year", "every year", "every 12 months"],
};

function matchFrom<K extends string>(aliases: Record<K, string[]>, raw: unknown): K | null {
  const k = normKey(raw);
  if (!k) return null;
  for (const [code, list] of Object.entries(aliases) as [K, string[]][]) {
    if (list.some((a) => normKey(a) === k)) return code;
  }
  return null;
}

export const wccFrequencyOf = (raw: unknown) => matchFrom(WCC_ALIASES, raw);
export const mccFrequencyOf = (raw: unknown) => matchFrom(MCC_ALIASES, raw);

/* ── Days of the week (WCC) ──────────────────────────────────────────────── */

const WEEKDAY_LONG = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
export const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Suggestions for the Days dropdown — any other list of days can be typed. */
export const WCC_DAY_PRESETS = [
  "Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun",
  "Mon, Thu", "Tue, Fri", "Mon, Wed, Fri", "Tue, Thu, Sat", "Sat, Sun", "Mon - Fri",
];

/** "Mon", "monday", "Tu", "Thurs", "Mondays", "Weds" → the day; two letters at least. */
function weekdayOf(token: string): number | null {
  const t = token.toLowerCase().replace(/[^a-z]/g, "");
  if (t.length < 2) return null;
  for (const word of t.endsWith("s") && t.length > 2 ? [t, t.slice(0, -1)] : [t]) {
    const i = WEEKDAY_LONG.findIndex((d) => d.startsWith(word));
    if (i >= 0) return i;
  }
  return null;
}

/**
 * A Days cell → weekday numbers (Monday = 0), or the words that could not be
 * read. "Mon, Wed & Fri", "Monday/Thursday", "Mon - Sat", "tue thu".
 */
export function parseWeekdays(raw: unknown): { days: number[] } | { error: string } {
  const text = String(raw ?? "")
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/\s+to\s+/g, "-")
    .trim();
  if (!text) return { days: [] };
  const found = new Set<number>();
  for (const piece of text.split(/[,&/;+|]|\band\b/)) {
    const p = piece.trim();
    if (!p) continue;
    const range = /^([a-z]+)\s*-\s*([a-z]+)$/.exec(p);
    if (range) {
      const a = weekdayOf(range[1]!);
      const b = weekdayOf(range[2]!);
      if (a === null || b === null) return { error: `"${piece.trim()}" is not a range of days — write it like Mon - Fri.` };
      for (let d = a; ; d = (d + 1) % 7) {
        found.add(d);
        if (d === b) break;
      }
      continue;
    }
    for (const word of p.split(/\s+/)) {
      const d = weekdayOf(word);
      if (d === null) return { error: `"${word}" is not a day — use Mon, Tue, Wed, Thu, Fri, Sat, Sun.` };
      found.add(d);
    }
  }
  return { days: [...found].sort((a, b) => a - b) };
}

/** "Mon, Wed & Fri". */
export function weekdaysText(days: readonly number[]): string {
  const names = days.map((d) => WEEKDAY_SHORT[d]!);
  return names.length > 1 ? `${names.slice(0, -1).join(", ")} & ${names[names.length - 1]}` : (names[0] ?? "");
}

/* ── Deadline days and months (MCC) ──────────────────────────────────────── */

/** The Deadline Day dropdown: 1–30, then the month's last day. */
export const LAST_DAY_LABEL = "Last day";
export const DAY_OPTIONS: (number | string)[] = [...Array.from({ length: 30 }, (_, i) => i + 1), LAST_DAY_LABEL];

/**
 * A Deadline Day cell → 1–31 (31 = month-end), "blank", or an error.
 * 5 · "5" · "5th" · "Day 5" · "Last day" · "Month end" · "EOM" · 31.
 */
export function parseDeadlineDay(raw: unknown): number | "blank" | { error: string } {
  if (typeof raw === "number") {
    if (Number.isInteger(raw) && raw >= 1 && raw <= 31) return raw;
    return { error: `${raw} is not a day of the month — use 1 to 30, or ${LAST_DAY_LABEL}.` };
  }
  const t = String(raw ?? "").trim().toLowerCase();
  if (!t) return "blank";
  if (/^(last( day)?( of (the )?month)?|month ?-?end|end( of (the )?month)?|eom)$/.test(t)) return MONTH_END;
  const m = /^(?:day\s*)?(\d{1,2})(?:st|nd|rd|th)?$/.exec(t);
  if (m && +m[1]! >= 1 && +m[1]! <= 31) return +m[1]!;
  return { error: `"${String(raw).trim()}" is not a deadline day — use 1 to 30, or ${LAST_DAY_LABEL}.` };
}

/**
 * A Due Month cell → 1–12, "blank", or an error. "June" · "Jun" · 6 · "06" ·
 * a date in that month (an Excel date arrives as its serial number).
 */
export function parseMonth(raw: unknown): number | "blank" | { error: string } {
  if (typeof raw === "number") {
    if (Number.isInteger(raw) && raw >= 1 && raw <= 12) return raw;
    if (raw > 60 && raw < 110000) {
      // An Excel date serial (day 1 = 1900-01-01, with the phantom 29 Feb 1900).
      return new Date(Date.UTC(1899, 11, 30) + Math.floor(raw) * 86_400_000).getUTCMonth() + 1;
    }
    return { error: `${raw} is not a month — use Jan to Dec.` };
  }
  const t = String(raw ?? "").trim().toLowerCase();
  if (!t) return "blank";
  if (/^\d{1,2}$/.test(t) && +t >= 1 && +t <= 12) return +t;
  const word = /^([a-z]{3,9})\b/.exec(t)?.[1];
  if (word) {
    const i = MONTH_LONG.findIndex((mo) => mo.toLowerCase().startsWith(word) && word.length >= 3);
    if (i >= 0) return i + 1;
  }
  const iso = /^\d{4}-(\d{2})(?:-\d{2})?$/.exec(t) ?? /^\d{1,2}[/.-](\d{1,2})[/.-]\d{2,4}$/.exec(t);
  if (iso && +iso[1]! >= 1 && +iso[1]! <= 12) return +iso[1]!;
  return { error: `"${String(raw).trim()}" is not a month — use Jan to Dec.` };
}

/* ── The columns ─────────────────────────────────────────────────────────── */

export type BulkField =
  | "employee"
  | "section"
  | "compliance"
  | "frequency"
  | "days"
  | "day1"
  | "day2"
  | "day3"
  | "dueMonth"
  | "mins"
  | "target"
  | "unit";

/** Which list backs a column's dropdown in the template. */
export type BulkList = "people" | "wccFrequency" | "wccDays" | "mccFrequency" | "day" | "month" | null;

export interface BulkColumn {
  field: BulkField;
  header: string;
  /** Always needed; or needed only for some frequencies ("depends"). */
  required: "yes" | "depends" | "no";
  width: number;
  aliases: string[];
  list: BulkList;
  /** Only the listed values may be picked — typing anything else is refused in Excel. */
  strict: boolean;
  /** What Excel shows when a cell in the column is selected (Excel caps it at 255). */
  prompt: string;
  /** The How to use sheet's fuller note. */
  help: string;
}

const COL: Record<BulkField, Omit<BulkColumn, "prompt" | "help"> & { prompt: Record<ComplianceKind, string>; help: Record<ComplianceKind, string> }> = {
  employee: {
    field: "employee", header: "Employee", required: "yes", width: 26, list: "people", strict: true,
    aliases: ["employee name", "name", "person", "doer", "owner", "assigned to", "assignee", "email"],
    prompt: {
      wcc: "Whose checklist it goes on. Pick from the list — only people you can add compliances for are in it.",
      mcc: "Whose checklist it goes on. Pick from the list — only people you can add compliances for are in it.",
    },
    help: {
      wcc: "Required. Pick from the dropdown. The list holds only the people you may add compliances for — yourself and your team. An email address also works.",
      mcc: "Required. Pick from the dropdown. The list holds only the people you may add compliances for — yourself and your team. An email address also works.",
    },
  },
  section: {
    field: "section", header: "Section", required: "no", width: 18, list: null, strict: false,
    aliases: ["group", "category", "area", "head"],
    prompt: { wcc: "Optional grouping, e.g. Calls, Reporting. Up to 120 characters.", mcc: "Optional grouping, e.g. Accounts, Reporting. Up to 120 characters." },
    help: { wcc: "Optional. A short grouping shown under the compliance — Calls, Reporting, Office.", mcc: "Optional. A short grouping shown under the compliance — Accounts, Reporting, Statutory." },
  },
  compliance: {
    field: "compliance", header: "Compliance", required: "yes", width: 46, list: null, strict: false,
    aliases: ["compliance name", "title", "task", "activity", "what", "description", "kpi", "weekly compliance", "monthly compliance"],
    prompt: {
      wcc: "What must be done, e.g. Send 25 follow-up emails. Up to 300 characters. A count in the title makes Done ask how many.",
      mcc: "What must be done, e.g. File the GST return. Up to 300 characters.",
    },
    help: {
      wcc: "Required. What must be done, up to 300 characters. A count written in it — \"Send 25 emails\" — makes Done ask how many were completed, unless a Target is given.",
      mcc: "Required. What must be done, up to 300 characters. A count written in it — \"Publish 4 case studies\" — makes Done ask how many were completed, unless a Target is given.",
    },
  },
  frequency: {
    field: "frequency", header: "Frequency", required: "yes", width: 18, list: null, strict: true,
    aliases: ["how often", "schedule", "repeat", "recurrence", "cycle"],
    prompt: {
      wcc: "Mon to Sat = every day but Sunday. Mon to Sun = every day. Each Day of the Week = repeats on each day you list in Days.",
      mcc: "Monthly · 2 times/month · 3 times/month · Alternate Month · Quarterly · Half Yearly · Annually.",
    },
    help: {
      wcc: "Required. Mon to Sat — due every day, Monday to Saturday. Mon to Sun — due every day of the week, Sunday too. Each Day of the Week — repeats on each day listed in Days (Mon, Wed, Fri is due on those three days every week).",
      mcc: "Required. Monthly, 2 times/month, 3 times/month, Alternate Month, Quarterly, Half Yearly or Annually — see the frequency table below.",
    },
  },
  days: {
    field: "days", header: "Days", required: "depends", width: 20, list: "wccDays", strict: false,
    aliases: ["day", "weekdays", "on days", "which days", "due days"],
    prompt: {
      wcc: "Only for Each Day of the Week: the days it repeats on. Pick or type them: Mon, Wed, Fri · Tue & Thu · Mon - Fri.",
      mcc: "",
    },
    help: {
      wcc: "Needed for Each Day of the Week: the days it repeats on. Pick from the dropdown or type your own — \"Mon, Wed, Fri\", \"Tue & Thu\", \"Mon - Fri\". Not used for Mon to Sat or Mon to Sun.",
      mcc: "",
    },
  },
  day1: {
    field: "day1", header: "Deadline Day", required: "yes", width: 15, list: "day", strict: true,
    aliases: ["deadline", "due day", "day of month", "1st deadline day", "first deadline day", "deadline day 1", "day 1"],
    prompt: { wcc: "", mcc: "The day of the month it is due: 1 to 30, or Last day. For 2 / 3 times a month, the first deadline." },
    help: { wcc: "", mcc: "Required. 1 to 30, or Last day (the month's last day — the 28th, 29th, 30th or 31st). A day past a short month's end falls on its last day. For 2 / 3 times a month this is the first deadline." },
  },
  day2: {
    field: "day2", header: "2nd Deadline Day", required: "depends", width: 17, list: "day", strict: true,
    aliases: ["second deadline day", "deadline day 2", "day 2", "2nd deadline"],
    prompt: { wcc: "", mcc: "Only for 2 times/month and 3 times/month — the second deadline, later than the first." },
    help: { wcc: "", mcc: "For 2 times/month and 3 times/month only: the second deadline, later in the month than the first." },
  },
  day3: {
    field: "day3", header: "3rd Deadline Day", required: "depends", width: 17, list: "day", strict: true,
    aliases: ["third deadline day", "deadline day 3", "day 3", "3rd deadline"],
    prompt: { wcc: "", mcc: "Only for 3 times/month — the third deadline, later than the second." },
    help: { wcc: "", mcc: "For 3 times/month only: the third deadline, later in the month than the second." },
  },
  dueMonth: {
    field: "dueMonth", header: "Due Month", required: "depends", width: 14, list: "month", strict: true,
    aliases: ["month", "starting month", "start month", "first month", "first due month", "in month"],
    prompt: {
      wcc: "",
      mcc: "For Alternate Month, Quarterly, Half Yearly, Annually: a month it is due in. The rest follow — Quarterly from June is due Jun, Sep, Dec, Mar.",
    },
    help: {
      wcc: "",
      mcc: "For Alternate Month, Quarterly, Half Yearly and Annually: a month it is due in; the others follow every 2, 3, 6 or 12 months. Quarterly from June is due in June, September, December and March. Leave blank for Monthly and 2 / 3 times a month.",
    },
  },
  mins: {
    field: "mins", header: "Mins", required: "no", width: 10, list: null, strict: false,
    aliases: ["minutes", "min", "time", "time in mins", "time (mins)", "time taken", "time required", "duration", "mins required", "compliance mins"],
    prompt: {
      wcc: `Optional. How many minutes it takes each time it is due, e.g. 15. A whole number, 1 to ${MAX_MINUTES}. The checklist adds them up per day.`,
      mcc: "",
    },
    help: {
      wcc: `Optional. How many minutes the compliance takes each time it is due — a whole number, 1 to ${MAX_MINUTES} (a day). The checklist shows it in its Mins column and adds it up for all the Dailys, all the Mondays, all the Tuesdays and so on.`,
      mcc: "",
    },
  },
  target: {
    field: "target", header: "Target", required: "no", width: 11, list: null, strict: false,
    aliases: ["target quantity", "quantity", "qty", "how many", "count"],
    prompt: {
      wcc: "Optional. How many it asks for, e.g. 25. Above 1, marking Done asks how many were completed. Blank = read from the title.",
      mcc: "Optional. How many it asks for, e.g. 25. Above 1, marking Done asks how many were completed. Blank = read from the title.",
    },
    help: {
      wcc: "Optional. A whole number, 1 or more. Above 1, marking it Done asks how many were completed (18 of 25). Blank: a count in the title is used; 1: simply Done.",
      mcc: "Optional. A whole number, 1 or more. Above 1, marking it Done asks how many were completed (18 of 25). Blank: a count in the title is used; 1: simply Done.",
    },
  },
  unit: {
    field: "unit", header: "Unit", required: "no", width: 13, list: null, strict: false,
    aliases: ["units", "uom", "of what"],
    prompt: { wcc: "Optional. What is counted — emails, calls. Shown beside the count.", mcc: "Optional. What is counted — returns, reports. Shown beside the count." },
    help: { wcc: "Optional. What is counted — emails, calls, visits. Shown beside the count (18 / 25 emails).", mcc: "Optional. What is counted — returns, reports, visits. Shown beside the count (3 / 4 reports)." },
  },
};

const FIELDS: Record<ComplianceKind, BulkField[]> = {
  wcc: ["employee", "section", "compliance", "frequency", "days", "mins", "target", "unit"],
  mcc: ["employee", "section", "compliance", "frequency", "day1", "day2", "day3", "dueMonth", "target", "unit"],
};

/** The template's columns for a checklist, in order. */
export function bulkColumns(kind: ComplianceKind): BulkColumn[] {
  return FIELDS[kind].map((f) => {
    const c = COL[f];
    return {
      ...c,
      list: f === "frequency" ? (kind === "wcc" ? "wccFrequency" : "mccFrequency") : c.list,
      prompt: c.prompt[kind],
      help: c.help[kind],
    };
  });
}

/** The words a frequency dropdown offers. */
export function frequencyLabels(kind: ComplianceKind): string[] {
  return kind === "wcc"
    ? WCC_FREQUENCIES.map((f) => WCC_FREQUENCY_LABEL[f])
    : MCC_FREQUENCIES.map((f) => MCC_FREQUENCY_LABEL[f]);
}

/** Months as the Due Month dropdown writes them. */
export const MONTH_OPTIONS = MONTH_LONG;

/* ── People ──────────────────────────────────────────────────────────────── */

export interface BulkPerson {
  id: string;
  name: string;
  email: string | null;
}

/**
 * How each person is written in the Employee dropdown — their name, or, where
 * two people share one, "Name (email)" so the pick is never ambiguous.
 */
export function personLabels(people: readonly BulkPerson[]): Map<string, string> {
  const count = new Map<string, number>();
  for (const p of people) count.set(normKey(p.name), (count.get(normKey(p.name)) ?? 0) + 1);
  return new Map(people.map((p) => [p.id, (count.get(normKey(p.name)) ?? 0) > 1 && p.email ? `${p.name} (${p.email})` : p.name]));
}

function findPerson(raw: unknown, people: readonly BulkPerson[], labels: Map<string, string>): BulkPerson | { error: string } {
  const text = String(raw ?? "").trim();
  const k = normKey(text);
  const byLabel = people.filter((p) => normKey(labels.get(p.id)) === k);
  if (byLabel.length === 1) return byLabel[0]!;
  const byEmail = people.filter((p) => p.email && p.email.toLowerCase() === text.toLowerCase());
  if (byEmail.length === 1) return byEmail[0]!;
  const byName = people.filter((p) => normKey(p.name) === k);
  if (byName.length === 1) return byName[0]!;
  if (byName.length > 1) return { error: `Two people are called ${text} — pick "Name (email)" from the list.` };
  return { error: `"${text}" is not someone you can add compliances for — pick from the Employee list.` };
}

/* ── Reading a sheet ─────────────────────────────────────────────────────── */

export interface BulkRow {
  /** The row number as Excel shows it. */
  line: number;
  ownerId: string | null;
  ownerName: string | null;
  title: string;
  section: string | null;
  /** The frequency as read — "Quarterly", "Selected days" — or what was written. */
  frequency: string;
  /** When, in words, as the checklist will show it. */
  when: string;
  wcc: { mode: "days" | "weekly"; weekdays: number[] } | null;
  mcc: { frequency: MccFrequency; days: (number | null)[]; startMonth: number | null } | null;
  targetQuantity: number | null;
  unit: string | null;
  /** WCC's Mins — minutes it takes each time; null when not given. */
  minutes: number | null;
  /** What Done will ask for — "25 emails" — or null for simply Done. */
  counts: string | null;
  /** It will not be added until these are fixed. */
  errors: string[];
  /** It will be added; something in it was ignored. */
  warnings: string[];
}

const cellText = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());

/** Find the header row: the first of the top 20 with Compliance and at least one other known column. */
function findHeader(matrix: readonly (readonly unknown[])[], columns: readonly BulkColumn[]): { at: number; map: Map<number, BulkField> } | null {
  for (let r = 0; r < Math.min(matrix.length, 20); r++) {
    const map = new Map<number, BulkField>();
    (matrix[r] ?? []).forEach((cell, i) => {
      const k = normKey(cell);
      if (!k) return;
      const col = columns.find((c) => normKey(c.header) === k || c.aliases.some((a) => normKey(a) === k));
      if (col && ![...map.values()].includes(col.field)) map.set(i, col.field);
    });
    if ([...map.values()].includes("compliance") && map.size >= 2) return { at: r, map };
  }
  return null;
}

/**
 * Read a sheet (rows of cells, as SheetJS's `header: 1` gives them) into rows,
 * each with its errors and warnings. `firstLine` is the Excel row number of
 * `matrix[0]`.
 */
export function readComplianceMatrix(
  matrix: readonly (readonly unknown[])[],
  opts: { kind: ComplianceKind; people: readonly BulkPerson[]; firstLine?: number },
): { rows: BulkRow[]; error?: string } {
  const { kind, people } = opts;
  const columns = bulkColumns(kind);
  const header = findHeader(matrix, columns);
  if (!header) {
    return {
      rows: [],
      error: `No header row found. Use the ${kind.toUpperCase()} template — its columns start ${columns
        .slice(0, 4)
        .map((c) => c.header)
        .join(", ")}…`,
    };
  }
  const present = new Set(header.map.values());
  const missing = columns.filter((c) => c.required === "yes" && !present.has(c.field)).map((c) => c.header);
  if (missing.length) return { rows: [], error: `The sheet has no ${missing.join(", ")} column${missing.length === 1 ? "" : "s"}.` };

  const labels = personLabels(people);
  const firstLine = opts.firstLine ?? 1;
  const rows: BulkRow[] = [];
  const firstSeen = new Map<string, number>();

  for (let r = header.at + 1; r < matrix.length; r++) {
    const cells = matrix[r] ?? [];
    const get = (f: BulkField): unknown => {
      for (const [i, field] of header.map) if (field === f) return cells[i];
      return undefined;
    };
    if ([...header.map.keys()].every((i) => cellText(cells[i]) === "")) continue;
    if (rows.length >= COMPLIANCE_BULK_MAX) {
      return { rows, error: `Only the first ${COMPLIANCE_BULK_MAX} rows are read — upload the rest in a second file.` };
    }
    rows.push(readRow(kind, get, firstLine + r, people, labels, firstSeen));
  }
  return { rows };
}

function readRow(
  kind: ComplianceKind,
  get: (f: BulkField) => unknown,
  line: number,
  people: readonly BulkPerson[],
  labels: Map<string, string>,
  firstSeen: Map<string, number>,
): BulkRow {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Employee
  let ownerId: string | null = null;
  let ownerName: string | null = null;
  const who = cellText(get("employee"));
  if (!who) errors.push("Pick the Employee.");
  else {
    const p = findPerson(who, people, labels);
    if ("error" in p) {
      errors.push(p.error);
      ownerName = who;
    } else {
      ownerId = p.id;
      ownerName = p.name;
    }
  }

  // Compliance and Section
  const title = cellText(get("compliance")).replace(/\s+/g, " ");
  if (!title) errors.push("Write the Compliance.");
  else if (title.length > 300) errors.push("The Compliance is longer than 300 characters.");
  const sectionText = cellText(get("section"));
  if (sectionText.length > 120) errors.push("The Section is longer than 120 characters.");

  // Target and Unit
  let targetQuantity: number | null = null;
  const targetText = cellText(get("target"));
  if (targetText) {
    const c = checkQuantity(targetText.replace(/\.0+$/, ""));
    if (!c.ok || c.value < 1) errors.push("The Target must be a whole number, 1 or more — or blank.");
    else targetQuantity = c.value;
  }
  const unitText = cellText(get("unit"));
  if (unitText.length > 40) errors.push("The Unit is longer than 40 characters.");

  // Mins (WCC)
  let minutes: number | null = null;
  const mins = parseMinutes(get("mins"));
  if (!mins.ok) errors.push(mins.error);
  else minutes = mins.value;

  // Frequency and when
  const freqText = cellText(get("frequency"));
  let frequency = freqText;
  let when = "";
  let wcc: BulkRow["wcc"] = null;
  let mcc: BulkRow["mcc"] = null;
  const ignored = (f: BulkField, why: string) => {
    if (cellText(get(f))) warnings.push(`${COL[f].header} ignored — ${why}.`);
  };

  if (!freqText) errors.push("Pick the Frequency.");
  else if (kind === "wcc") {
    const f = wccFrequencyOf(freqText);
    if (!f) errors.push(`"${freqText}" is not a WCC frequency — use Mon to Sat, Mon to Sun or Each Day of the Week.`);
    else {
      frequency = WCC_FREQUENCY_LABEL[f];
      if (f === "mon_to_sat") {
        ignored("days", "Mon to Sat is every day but Sunday");
        wcc = { mode: "days", weekdays: [0, 1, 2, 3, 4, 5] };
        when = "Every day but Sunday";
      } else if (f === "mon_to_sun") {
        ignored("days", "Mon to Sun is every day");
        wcc = { mode: "days", weekdays: [0, 1, 2, 3, 4, 5, 6] };
        when = "Every day";
      } else {
        const d = parseWeekdays(get("days"));
        if ("error" in d) errors.push(d.error);
        else if (d.days.length === 0) errors.push("Each Day of the Week needs its Days — e.g. Mon, Wed, Fri.");
        else {
          wcc = { mode: "days", weekdays: d.days };
          when = `Each ${weekdaysText(d.days)}`;
        }
      }
    }
  } else {
    const f = mccFrequencyOf(freqText);
    if (!f) errors.push(`"${freqText}" is not an MCC frequency — use ${MCC_FREQUENCIES.map((x) => MCC_FREQUENCY_LABEL[x]).join(", ")}.`);
    else {
      frequency = MCC_FREQUENCY_LABEL[f];
      const n = DEADLINES_PER_MONTH[f];
      const dayFields: BulkField[] = ["day1", "day2", "day3"];
      const days: (number | null)[] = [];
      dayFields.forEach((field, i) => {
        if (i >= n) {
          ignored(field, `${frequency} has ${n === 1 ? "one deadline" : `${n} deadlines`} a month`);
          return;
        }
        const d = parseDeadlineDay(get(field));
        if (d === "blank") errors.push(i === 0 ? "Pick the Deadline Day." : `${frequency} needs its ${COL[field].header}.`);
        else if (typeof d === "object") errors.push(d.error);
        else days.push(d >= MONTH_END ? null : d);
      });
      let startMonth: number | null = null;
      if (needsStartMonth(f)) {
        const m = parseMonth(get("dueMonth"));
        if (m === "blank") errors.push(`${frequency} needs its Due Month — a month it is due in.`);
        else if (typeof m === "object") errors.push(m.error);
        else startMonth = m;
      } else {
        ignored("dueMonth", `${frequency} is due every month`);
      }
      if (days.length === n && (!needsStartMonth(f) || startMonth !== null)) {
        const s = normalizeMccSchedule({ frequency: f, days, startMonth });
        if (!s.ok) errors.push(s.error);
        else {
          mcc = { frequency: f, days, startMonth };
          when = mccDetail(s.schedule);
        }
      }
    }
  }

  // The same compliance twice for one person in the sheet.
  if (ownerId && title) {
    const key = `${ownerId}|${normTitle(title)}`;
    const seen = firstSeen.get(key);
    if (seen !== undefined) errors.push(`The same compliance for ${ownerName} as row ${seen}.`);
    else firstSeen.set(key, line);
  }

  const quantity = title ? quantityTargetOf({ title, targetNumber: targetQuantity, unit: unitText || null }) : null;
  return {
    line,
    ownerId,
    ownerName,
    title,
    section: sectionText || null,
    frequency,
    when,
    wcc,
    mcc,
    targetQuantity,
    unit: unitText || null,
    minutes,
    counts: quantity ? quantityText(null, quantity).replace(/^— \/ /, "") + (quantity.source === "title" ? " (from the title)" : "") : null,
    errors,
    warnings,
  };
}

/** What the server action takes for one clean row. */
export function bulkPayload(r: BulkRow) {
  return {
    line: r.line,
    ownerEmployeeId: r.ownerId!,
    title: r.title,
    section: r.section,
    ...(r.wcc ? { wccMode: r.wcc.mode, weekdays: r.wcc.weekdays } : {}),
    ...(r.mcc
      ? { mccFrequency: r.mcc.frequency, mccDays: r.mcc.days, mccStartMonth: r.mcc.startMonth, monthDay: r.mcc.days[0] ?? null }
      : {}),
    targetQuantity: r.targetQuantity,
    unit: r.unit,
    ...(r.minutes !== null ? { minutes: r.minutes } : {}),
  };
}

/** Month words for messages and the template's examples. */
export const monthShort = (m: number) => MONTH_SHORT[m - 1] ?? "";
