/**
 * SP1 — THE CALL LOG'S VOCABULARY AND ARITHMETIC (DCC-SPEC §7, §8).
 *
 * Jeevan's "Reference Calling Sheet" records, of the calls a person made on a
 * day, how many landed on each of fifteen outcomes. That is a different question
 * from the compliance board, which asks whether a duty was DONE — so it has its
 * own table, its own screen and this, its own module.
 *
 * ── WHY BAND MEMBERSHIP IS THE WHOLE FILE ──────────────────────────────────
 * Every figure below the fifteen rows is derived from which band an outcome
 * sits in. Connected, Could Not Connected and all five ratios are one partition
 * of the same fifteen numbers, so the partition is declared ONCE, here, and
 * nothing downstream is allowed a second opinion about it.
 *
 * PURE and client-safe — no `server-only`, no database. The fill screen is a
 * client component and needs the same totals as the server-rendered grid.
 */

/* ── THE FIFTEEN, IN SHEET ORDER ──────────────────────────────────────────── */

export const SP1_DISPOSITIONS = [
  "registered",
  "registered_next",
  "verbal_yes",
  "tentative",
  "tentative_next",
  "call_next",
  "get_back",
  "not_interested",
  "dnd",
  "past_attended",
  "old_graduate",
  "no_busy",
  "ringing",
  "call_back",
  "wrong_number",
] as const;

export type Sp1Disposition = (typeof SP1_DISPOSITIONS)[number];

/**
 * The labels are the SHEET's, character for character — including "Old
 * Gratuate", which is misspelled there. The report is read side by side with
 * the Google Sheet it replaces, so a silent correction here would make two rows
 * that are the same row look like two different ones.
 */
export const SP1_LABEL: Record<Sp1Disposition, string> = {
  registered: "Registered",
  registered_next: "Registered for Next",
  verbal_yes: "Verbal Yes",
  tentative: "Tentative",
  tentative_next: "Tentative for Next",
  call_next: "Call for Next",
  get_back: "I will get back if I want",
  not_interested: "Not Interested",
  dnd: "DND",
  past_attended: "Past Attended",
  old_graduate: "Old Gratuate",
  no_busy: "No Busy",
  ringing: "Ringing",
  call_back: "Call Back",
  wrong_number: "Wrong Number",
};

export function isSp1Disposition(s: string): s is Sp1Disposition {
  return (SP1_DISPOSITIONS as readonly string[]).includes(s);
}

/* ── THE EIGHT COLOURS ────────────────────────────────────────────────────── */

/**
 * The sheet's own palette. Eight tones, not four: "Not Interested" is solid red
 * while "I will get back if I want" is a rose with red text, and flattening
 * them would lose a distinction the person reading the sheet relies on.
 */
export type Sp1Tone =
  | "won"
  | "warm"
  | "later"
  | "soft"
  | "dead"
  | "past"
  | "plain"
  | "bad";

export const SP1_TONE: Record<Sp1Disposition, Sp1Tone> = {
  registered: "won",
  registered_next: "won",
  verbal_yes: "won",
  tentative: "warm",
  tentative_next: "warm",
  call_next: "later",
  get_back: "soft",
  not_interested: "dead",
  dnd: "dead",
  past_attended: "past",
  old_graduate: "past",
  no_busy: "plain",
  ringing: "plain",
  call_back: "plain",
  wrong_number: "bad",
};

export const SP1_TONE_STYLE: Record<Sp1Tone, { bg: string; fg: string }> = {
  won: { bg: "#D9EAD3", fg: "#274E13" },
  warm: { bg: "#FCE5CD", fg: "#7F4B04" },
  later: { bg: "#FFF2CC", fg: "#7F6000" },
  soft: { bg: "#F7DCDC", fg: "#CC0000" },
  dead: { bg: "#CC0000", fg: "#FFFFFF" },
  past: { bg: "#EAD1DC", fg: "#A64D79" },
  plain: { bg: "#FFFFFF", fg: "#3C4043" },
  bad: { bg: "#6B6B6B", fg: "#FFFFFF" },
};

/* ── THE PARTITION ────────────────────────────────────────────────────────── */

/**
 * Rows 1–11 count as CONNECTED: a human answered, whatever they then said.
 * "Not Interested" and "DND" are people declining, not calls that failed to
 * reach anybody. Rows 12–15 never reached a person — including "Wrong Number",
 * which reached the wrong one and so bought nothing.
 *
 * DECLARED AS A SET, not as `index < 11`: the order of the fifteen is a
 * presentation fact that may change, and membership of this band is not.
 */
const CONNECTED: ReadonlySet<Sp1Disposition> = new Set<Sp1Disposition>([
  "registered",
  "registered_next",
  "verbal_yes",
  "tentative",
  "tentative_next",
  "call_next",
  "get_back",
  "not_interested",
  "dnd",
  "past_attended",
  "old_graduate",
]);

export function isConnected(d: Sp1Disposition): boolean {
  return CONNECTED.has(d);
}

/* ── COUNTS AND METRICS ───────────────────────────────────────────────────── */

export type Sp1Counts = Record<Sp1Disposition, number>;

export function emptyCounts(): Sp1Counts {
  const out = {} as Sp1Counts;
  for (const d of SP1_DISPOSITIONS) out[d] = 0;
  return out;
}

export interface Sp1Metrics {
  totalCalls: number;
  connected: number;
  couldNotConnect: number;
  /** null = no denominator. The screen prints an em-dash, never 0%. */
  connectedRatio: number | null;
  notConnectedRatio: number | null;
  connectedToNotConnected: number | null;
  registeredToConnected: number | null;
  tentativeToConnected: number | null;
}

/**
 * A ratio with NO denominator is null, not zero.
 *
 * This is the single most important line in the file. `0%` on a day nobody
 * worked reports a real failure that did not happen — and it would then be
 * averaged into the weekly total and into the performance ranking. The sheet's
 * own `#DIV/0!` is the bug being fixed here, not the behaviour being copied.
 */
function ratio(numerator: number, denominator: number): number | null {
  return denominator === 0 ? null : numerator / denominator;
}

export function metricsOf(counts: Sp1Counts): Sp1Metrics {
  let connected = 0;
  let couldNotConnect = 0;
  for (const d of SP1_DISPOSITIONS) {
    if (isConnected(d)) connected += counts[d];
    else couldNotConnect += counts[d];
  }
  const totalCalls = connected + couldNotConnect;
  return {
    totalCalls,
    connected,
    couldNotConnect,
    connectedRatio: ratio(connected, totalCalls),
    notConnectedRatio: ratio(couldNotConnect, totalCalls),
    connectedToNotConnected: ratio(connected, couldNotConnect),
    /* REGISTERED ALONE, not the green band. Folding "Registered for Next" and
       "Verbal Yes" into the conversion measure would quietly inflate it — a
       verbal yes is not a registration. Same for Tentative. */
    registeredToConnected: ratio(counts.registered, connected),
    tentativeToConnected: ratio(counts.tentative, connected),
  };
}

/* ── FORMATTING ───────────────────────────────────────────────────────────── */

export const EM_DASH = "—";

export function pct(v: number | null): string {
  return v === null ? EM_DASH : `${(v * 100).toFixed(1)}%`;
}

export function asRatio(v: number | null): string {
  return v === null ? EM_DASH : `${v.toFixed(2)} : 1`;
}

/* ── DATES ────────────────────────────────────────────────────────────────── */

const WEEKDAY = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;
const MONTH = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** UTC throughout — a calendar day has no time, so a timezone can only break it. */
function utc(ymd: string): Date {
  return new Date(`${ymd}T00:00:00Z`);
}

/** `2026-09-14` → `{ label: "14-Sep-2026", weekday: "Monday" }`. */
export function describeDay(ymd: string): { label: string; weekday: string } {
  const d = utc(ymd);
  return {
    label: `${String(d.getUTCDate()).padStart(2, "0")}-${MONTH[d.getUTCMonth()]}-${d.getUTCFullYear()}`,
    weekday: WEEKDAY[d.getUTCDay()]!,
  };
}

export function shiftDays(ymd: string, delta: number): string {
  const d = new Date(utc(ymd).getTime() + delta * 86_400_000);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** The Monday on or before `ymd`. Sunday belongs to the week that just ended. */
export function mondayOf(ymd: string): string {
  const dow = utc(ymd).getUTCDay();
  return shiftDays(ymd, dow === 0 ? -6 : 1 - dow);
}

export function isSunday(ymd: string): boolean {
  return utc(ymd).getUTCDay() === 0;
}

/**
 * The WORKING days of `weeks` weeks starting at the Monday of `anchor`.
 *
 * SUNDAY IS NOT A COLUMN. The sheet runs Monday → Saturday and then a Weekly
 * Total, and 19-Sep-2026 is simply absent from it. Emitting a Sunday column
 * would put a permanently empty stripe through every week and drag the weekly
 * ratios toward a day nobody works.
 */
export function sp1WorkingDays(anchor: string, weeks: number): string[] {
  const start = mondayOf(anchor);
  const out: string[] = [];
  for (let w = 0; w < weeks; w++) {
    for (let d = 0; d < 6; d++) out.push(shiftDays(start, w * 7 + d));
  }
  return out;
}

/* ── THE GRID ─────────────────────────────────────────────────────────────── */

export interface Sp1LogRow {
  employeeId: string;
  logDate: string;
  disposition: Sp1Disposition;
  count: number;
}

export interface Sp1Column {
  kind: "day" | "total";
  /** null on a total column. */
  date: string | null;
  label: string;
  /** "" on a total column, so the header's second line stays the same height. */
  weekday: string;
  counts: Sp1Counts;
  metrics: Sp1Metrics;
}

/**
 * Days across, a Weekly Total after each week's Saturday.
 *
 * `dates` is the full working-day list; people are summed into one figure per
 * day, because the grid answers "what did the team do on Tuesday", not "what
 * did each person do". Narrowing to one person is done by passing one person's
 * rows in, not by a second code path here.
 */
export function buildSp1Grid(dates: readonly string[], rows: readonly Sp1LogRow[]): Sp1Column[] {
  const byDate = new Map<string, Sp1Counts>();
  for (const d of dates) byDate.set(d, emptyCounts());
  for (const r of rows) {
    const c = byDate.get(r.logDate);
    // A row outside the window is ignored rather than widening it — the caller
    // decided the window, and a stray date must not appear in the weekly total.
    if (c) c[r.disposition] += r.count;
  }

  const columns: Sp1Column[] = [];
  let week = emptyCounts();
  let weekHasDays = false;

  const closeWeek = () => {
    if (!weekHasDays) return;
    columns.push({
      kind: "total",
      date: null,
      label: "Weekly Total",
      weekday: "",
      counts: week,
      /* RE-COMPUTED FROM SUMMED COUNTS, never by averaging the day columns.
         An average weights a 3-call day the same as a 60-call one, so a single
         quiet morning at 100% would drag a busy week's ratio upward. */
      metrics: metricsOf(week),
    });
    week = emptyCounts();
    weekHasDays = false;
  };

  for (let i = 0; i < dates.length; i++) {
    const date = dates[i]!;
    const counts = byDate.get(date)!;
    const { label, weekday } = describeDay(date);
    columns.push({ kind: "day", date, label, weekday, counts, metrics: metricsOf(counts) });

    for (const d of SP1_DISPOSITIONS) week[d] += counts[d];
    weekHasDays = true;

    const next = dates[i + 1];
    if (!next || mondayOf(next) !== mondayOf(date)) closeWeek();
  }

  return columns;
}

/* ── THE CALCULATED BLOCK ─────────────────────────────────────────────────── */

/**
 * The eight rows under the fifteen, in the sheet's order. Shared by the grid,
 * the single-day dashboard card and the 10 pm email, so the three can never
 * disagree about what "Connected Ratio" means or where it sits.
 */
export const SP1_CALC_ROWS = [
  { key: "totalCalls", label: "Total Calls", kind: "count", tone: "head" },
  { key: "connected", label: "Connected", kind: "count", tone: "good" },
  { key: "couldNotConnect", label: "Could Not Connected", kind: "count", tone: "none" },
  { key: "connectedRatio", label: "Connected Ratio", kind: "pct", tone: "none" },
  { key: "notConnectedRatio", label: "Not Connected Ratio", kind: "pct", tone: "none" },
  { key: "connectedToNotConnected", label: "Connected to Not Connected Ratio", kind: "ratio", tone: "none" },
  { key: "registeredToConnected", label: "Registered to Connected Ratio", kind: "pct", tone: "none" },
  { key: "tentativeToConnected", label: "Tentative to Connected Ratio", kind: "pct", tone: "none" },
] as const;

export type Sp1CalcRow = (typeof SP1_CALC_ROWS)[number];

/** One calculated cell, formatted the way its row wants to be read. */
export function formatCalc(row: Sp1CalcRow, m: Sp1Metrics): string {
  const v = m[row.key];
  if (row.kind === "count") return String(v as number);
  if (row.kind === "pct") return pct(v as number | null);
  return asRatio(v as number | null);
}
