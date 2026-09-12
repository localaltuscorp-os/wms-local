/**
 * JOB DESCRIPTION — how often a task comes round.
 *
 * PURE, and no `server-only`: the form previews the next few due dates as you
 * pick a frequency, and the push job computes the same dates on the server.
 *
 * ── WHY THIS IS STRUCTURED AND NOT A LABEL ───────────────────────────────────
 * Four of the ten frequencies the business uses cannot be expressed as a set of
 * weekdays at all — "Once in 15 Days", "Once in 30 Days", "Monthly on 2nd
 * Saturday", "First Monday of Month". The DCC schedule model stores a 7-bit
 * weekday mask, so those four have nowhere to live there, and string-matching a
 * label at push time is exactly how the DCC frequency parser ended up needing a
 * `needsReview` escape hatch for everything it could not classify.
 *
 * So the JD owns the richer model and PROJECTS DOWN when pushing (see
 * `toDccSchedule`). Nothing widens dcc_kpi_items, which carries live history
 * behind a gate that blocks punch-out.
 *
 * All dates are calendar days as YYYY-MM-DD strings, in Asia/Kolkata. Nothing
 * here converts through an instant.
 */

/** 0 = Monday … 6 = Sunday. Matches the DCC weekday bit order. */
export type Weekday = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export type Recurrence =
  /** "Does not repeat" — one day, then never again. */
  | { kind: "once"; date: string }
  | { kind: "daily" }
  | { kind: "weekdays"; days: Weekday[] }
  | { kind: "interval"; everyDays: number; anchor: string }
  | { kind: "monthly_ordinal"; ordinal: 1 | 2 | 3 | 4 | -1; weekday: Weekday }
  /** "Annually on [date]" — the same calendar date each year. */
  | { kind: "yearly"; month: number; day: number }
  | { kind: "custom"; label: string };

/**
 * The dropdown, in Google Calendar's vocabulary (account holder, 2026-09-12).
 *
 * ── THE FIVE PATTERNS THAT LEFT THE LIST STILL WORK ──────────────────────
 * Mon-Wed-Fri, Tue-Sat, Once in 15 Days, Once in 30 Days and First Monday of
 * Month were offered here until this change, and rows are stored holding them.
 * They are SHAPES, not list entries — `describeRecurrence`, `isDueOn` and
 * `toDccSchedule` all still handle them, so an existing job description keeps
 * working and keeps reading correctly. What changed is only what a NEW one can
 * be set to from this menu; anything else goes through Custom.
 *
 * Removing the shapes as well would have turned every one of those rows into
 * "Unknown" the day this shipped.
 */
export const FREQUENCY_OPTIONS: readonly { id: string; label: string; value: Recurrence }[] = [
  { id: "once", label: "Does not repeat", value: { kind: "once", date: "" } },
  { id: "daily", label: "Daily", value: { kind: "daily" } },
  { id: "sat", label: "Weekly on Saturday", value: { kind: "weekdays", days: [5] } },
  {
    id: "sat2",
    label: "Monthly on the second Saturday",
    value: { kind: "monthly_ordinal", ordinal: 2, weekday: 5 },
  },
  { id: "yearly", label: "Annually on [Date]", value: { kind: "yearly", month: 1, day: 1 } },
  {
    id: "weekday",
    label: "Every weekday (Monday to Friday)",
    value: { kind: "weekdays", days: [0, 1, 2, 3, 4] },
  },
  { id: "custom", label: "Custom…", value: { kind: "custom", label: "" } },
] as const;

/** Which options need a date field revealed beside them. */
export const FREQUENCY_NEEDS_DATE = new Set(["once", "yearly"]);

const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

/** `2026-09-12` → `12/09/2026`, the way the business writes dates. */
function dmy(ymd: string): string {
  const p = parts(ymd);
  if (!p) return ymd;
  return `${String(p.d).padStart(2, "0")}/${String(p.m).padStart(2, "0")}/${p.y}`;
}
const ORDINAL_NAMES: Record<string, string> = {
  "1": "First",
  "2": "2nd",
  "3": "3rd",
  "4": "4th",
  "-1": "Last",
};

const YMD = /^(\d{4})-(\d{2})-(\d{2})$/;

function parts(ymd: string): { y: number; m: number; d: number } | null {
  const m = YMD.exec(ymd.trim());
  return m ? { y: Number(m[1]), m: Number(m[2]), d: Number(m[3]) } : null;
}

/** Monday-based weekday of a calendar date. */
export function weekdayOf(ymd: string): Weekday | null {
  const p = parts(ymd);
  if (!p) return null;
  const js = new Date(Date.UTC(p.y, p.m - 1, p.d)).getUTCDay(); // 0 = Sunday
  return ((js + 6) % 7) as Weekday;
}

function daysApart(from: string, to: string): number | null {
  const a = parts(from);
  const b = parts(to);
  if (!a || !b) return null;
  return Math.round(
    (Date.UTC(b.y, b.m - 1, b.d) - Date.UTC(a.y, a.m - 1, a.d)) / 86_400_000,
  );
}

/**
 * Which calendar date the n-th given weekday of a month falls on.
 * `ordinal` -1 means the last one in the month.
 */
export function nthWeekdayOfMonth(
  year: number,
  month: number, // 1..12
  ordinal: 1 | 2 | 3 | 4 | -1,
  weekday: Weekday,
): string | null {
  if (month < 1 || month > 12) return null;

  if (ordinal === -1) {
    const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
    for (let d = last; d >= 1; d--) {
      const js = new Date(Date.UTC(year, month - 1, d)).getUTCDay();
      if (((js + 6) % 7) === weekday) return iso(year, month, d);
    }
    return null;
  }

  let seen = 0;
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  for (let d = 1; d <= daysInMonth; d++) {
    const js = new Date(Date.UTC(year, month - 1, d)).getUTCDay();
    if (((js + 6) % 7) === weekday) {
      seen += 1;
      if (seen === ordinal) return iso(year, month, d);
    }
  }
  // A month can hold only four of a given weekday, so a 5th never resolves.
  return null;
}

function iso(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/**
 * Is this task due on that date?
 *
 * The one question the push job asks, once per JD per day.
 */
export function isDueOn(rec: Recurrence, ymd: string): boolean {
  const p = parts(ymd);
  if (!p) return false;

  switch (rec.kind) {
    case "once":
      // The one day it happens, and never again. No date stored means it can
      // never be due, which is what stops a half-filled form firing daily.
      return rec.date === ymd;
    case "yearly": {
      /* 29 February falls back to the 28th in a common year: a job set for the
         29th must still happen every year, and the alternative — skipping three
         years in four — is never what anybody meant. */
      if (rec.month === 2 && rec.day === 29 && !isLeapYear(p.y)) {
        return p.m === 2 && p.d === 28;
      }
      return p.m === rec.month && p.d === rec.day;
    }
    case "daily": {
      // Mon–Sat. Sunday is the org's default weekly off, and a "daily" task
      // that fires on the rest day produces an overdue row nobody can clear.
      const wd = weekdayOf(ymd);
      return wd !== null && wd !== 6;
    }
    case "weekdays": {
      const wd = weekdayOf(ymd);
      return wd !== null && rec.days.includes(wd);
    }
    case "interval": {
      if (!rec.anchor) return false;
      const gap = daysApart(rec.anchor, ymd);
      if (gap === null || gap < 0) return false;
      // Counted from the anchor, so it drifts across weekdays — which is what
      // "once in 15 days" actually means, as opposed to "every other Friday".
      return rec.everyDays > 0 && gap % rec.everyDays === 0;
    }
    case "monthly_ordinal":
      return nthWeekdayOfMonth(p.y, p.m, rec.ordinal, rec.weekday) === ymd;
    case "custom":
      // Deliberately never auto-due: a custom rule nobody has encoded must not
      // silently fire every day. It shows in the Bank and is pushed by hand.
      return false;
  }
}

/** A human sentence for the Bank list and the form's summary line. */
export function describeRecurrence(rec: Recurrence): string {
  switch (rec.kind) {
    case "once":
      return rec.date ? `Does not repeat — ${dmy(rec.date)}` : "Does not repeat";
    case "yearly":
      return `Annually on ${rec.day} ${MONTH_NAMES[rec.month - 1] ?? ""}`.trim();
    case "daily":
      return "Daily (Mon–Sat)";
    case "weekdays": {
      if (rec.days.length === 0) return "No days selected";
      const names = rec.days.map((d) => WEEKDAY_NAMES[d]?.slice(0, 3) ?? "?");
      return names.length === 1 ? `Every ${WEEKDAY_NAMES[rec.days[0]!]}` : names.join("-");
    }
    case "interval":
      return `Once in ${rec.everyDays} days${rec.anchor ? ` from ${rec.anchor}` : ""}`;
    case "monthly_ordinal":
      return `${ORDINAL_NAMES[String(rec.ordinal)] ?? ""} ${WEEKDAY_NAMES[rec.weekday]} of the month`;
    case "custom":
      return rec.label ? `Custom — ${rec.label}` : "Custom";
  }
}

/**
 * Project onto the DCC schedule model for the auto-push.
 *
 * `weekdays` is the 7-bit mask DCC stores (bit 0 = Monday). Anything the mask
 * cannot express becomes `adhoc`, and the JD cron supplies the date instead —
 * which is honest, where forcing it into a weekday pattern would be a lie the
 * gate then enforces daily.
 */
export function toDccSchedule(rec: Recurrence): {
  scheduleKind: "scheduled" | "weekly" | "monthly" | "adhoc";
  weekdays: number | null;
  frequency: string;
} {
  const mask = (days: Weekday[]) => days.reduce<number>((m, d) => m | (1 << d), 0);
  const frequency = describeRecurrence(rec);

  switch (rec.kind) {
    case "daily":
      return { scheduleKind: "scheduled", weekdays: 0b0111111, frequency };
    case "weekdays":
      return {
        // One day a week is a weekly slot; several named days are each due.
        scheduleKind: rec.days.length === 1 ? "weekly" : "scheduled",
        weekdays: mask(rec.days),
        frequency,
      };
    case "monthly_ordinal":
      return { scheduleKind: "monthly", weekdays: 0, frequency };
    case "interval":
    case "once":
    case "yearly":
    case "custom":
      // The DCC model is a 7-bit weekday mask; none of these can be expressed
      // in it, so the JD cron supplies the date instead. Honest, where forcing
      // them into a weekday pattern would be a lie the gate enforces daily.
      return { scheduleKind: "adhoc", weekdays: null, frequency };
  }
}

/** Runtime guard for the jsonb column — a bad row must not crash the Bank. */
export function isRecurrence(v: unknown): v is Recurrence {
  if (typeof v !== "object" || v === null) return false;
  const k = (v as { kind?: unknown }).kind;
  return (
    k === "once" ||
    k === "daily" ||
    k === "weekdays" ||
    k === "interval" ||
    k === "monthly_ordinal" ||
    k === "yearly" ||
    k === "custom"
  );
}

/** What an unreadable or missing recurrence falls back to. */
export const DEFAULT_RECURRENCE: Recurrence = { kind: "daily" };

export function readRecurrence(v: unknown): Recurrence {
  return isRecurrence(v) ? v : DEFAULT_RECURRENCE;
}
