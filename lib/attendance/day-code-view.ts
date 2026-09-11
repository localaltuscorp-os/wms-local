// THE ATTENDANCE COLOUR LANGUAGE — one palette, every surface.
//
// Pure and client-safe (no `server-only`, no I/O), because the calendar tiles
// and the daily salary report rows are both client components and both need it.
//
// ── WHY THIS FILE EXISTS ───────────────────────────────────────────────────
// These colours were a `switch` inside `components/attendance/month-calendar.tsx`,
// which was fine while exactly one surface drew a graded day. The daily salary
// report draws them too, and a second copy of the hex values is how two screens
// showing the same August end up disagreeing about what orange means. The spec
// for the report is explicit — "Reuse the existing Attendance page color
// language. Do not introduce a completely new visual system" — and the only way
// to actually honour that is for there to be one place the values live.
//
// Every value below is lifted VERBATIM from that switch. Nothing was
// re-designed in the move; the calendar renders byte-identically.
//
// ── TILE vs ROW ────────────────────────────────────────────────────────────
// The one thing that genuinely differs by surface is the background, and it has
// to. A 38px calendar tile needs a fill strong enough to read at a glance — a
// weekly off is SOLID slate there, because a pale grey tile looked like a day
// with no record rather than a day nobody was expected. A full-width table row
// with the same fill would be a wall of colour, so rows get a light tint and
// carry their meaning in the status text instead ("Do not make every row
// aggressively saturated. Use a light background tint with stronger status
// text/indicator").
//
// So each entry carries both, from one hue:
//
//   accent    the strong colour — status text, indicators, the row's left edge
//   tile      the calendar tile's fill
//   tileInk   text on top of `tile`
//   rowTint   the table row's background
//
// `rowTint` mixes with `transparent` rather than with `#fff` so a row layers
// over whatever surface it sits on and survives the dark theme; the tile fills
// keep the `#fff` mixes they already had, unchanged.

/** How one graded day looks, on either surface. */
export interface DayCodeStyle {
  /** Human label — "Present", "Worked a holiday/off", "Leave (unpaid)". */
  label: string;
  /** The strong colour: status text, indicators, a row's leading edge. */
  accent: string;
  /** Background for a small calendar tile. */
  tile: string;
  /** Text colour on top of `tile`. */
  tileInk: string;
  /** Background tint for a full-width table row. */
  rowTint: string;
}

const GREEN = "#15803d";
const AMBER = "#d97706";
const RED = "#dc2626";
const SLATE = "#475569";
const PURPLE = "#7c3aed";
const RUST = "#b45309";

/** A light wash of `hue` over whatever the row is sitting on. */
const tint = (hue: string, pct: number): string =>
  `color-mix(in srgb, ${hue} ${pct}%, transparent)`;

/**
 * The palette, keyed by the graded `AttendanceCode`.
 *
 * ── TWO PAIRS THAT DELIBERATELY SHARE A COLOUR ─────────────────────────────
 * `W/O` and `H` are both dark slate: a declared day off and a company holiday
 * mean the same thing to the person reading the calendar — nobody was expected —
 * and only the label needs to tell them apart. Neither may carry a warning
 * colour, because a holiday is not a deviation.
 *
 * `A` and `LWP` are both red. That is the existing language and it is kept on
 * purpose: purple is this app's colour for leave that is PAID (`PL`, `CO`),
 * while an unpaid leave day is one the payroll engine charges for. Colouring it
 * purple would put it visually alongside the day that costs nothing.
 */
const STYLES: Record<string, DayCodeStyle> = {
  // PRESENT — the existing green, unchanged.
  P: {
    label: "Present",
    accent: GREEN,
    tile: `color-mix(in srgb, ${GREEN} 12%, #fff)`,
    tileInk: GREEN,
    rowTint: tint(GREEN, 7),
  },
  // WORKED A SUNDAY / WEEKLY OFF / HOLIDAY — green, because green is what this
  // calendar already means by "you were here". Turning up on a day off is the
  // exception worth seeing, so the fill is stronger than an ordinary Present.
  HP: {
    label: "Worked a holiday/off",
    accent: "#14532d",
    tile: `color-mix(in srgb, ${GREEN} 24%, #fff)`,
    tileInk: "#14532d",
    rowTint: tint(GREEN, 12),
  },
  "H-H/D": {
    label: "Half day on a holiday/off",
    accent: "#14532d",
    tile: `color-mix(in srgb, ${GREEN} 24%, #fff)`,
    tileInk: "#14532d",
    rowTint: tint(GREEN, 10),
  },
  // HALF DAY — amber, "partial attendance". Unmistakably distinct from both
  // green and red at tile size.
  "H/D": {
    label: "Half day",
    accent: "#92400e",
    tile: `color-mix(in srgb, ${AMBER} 22%, #fff)`,
    tileInk: "#92400e",
    rowTint: tint(AMBER, 9),
  },
  // ABSENT — red, "no qualifying attendance".
  A: {
    label: "Absent",
    accent: "#991b1b",
    tile: `color-mix(in srgb, ${RED} 20%, #fff)`,
    tileInk: "#991b1b",
    rowTint: tint(RED, 8),
  },
  LWP: {
    label: "Leave (unpaid)",
    accent: "#991b1b",
    tile: `color-mix(in srgb, ${RED} 20%, #fff)`,
    tileInk: "#991b1b",
    rowTint: tint(RED, 8),
  },
  // A DECLARED DAY OFF — dark slate on a tile, a quiet grey on a row.
  "W/O": {
    label: "Weekly off",
    accent: SLATE,
    tile: SLATE,
    tileInk: "#f8fafc",
    rowTint: tint(SLATE, 7),
  },
  H: {
    label: "Holiday",
    accent: SLATE,
    tile: SLATE,
    tileInk: "#f8fafc",
    rowTint: tint(SLATE, 7),
  },
  // PAID LEAVE / COMP-OFF — the existing purple.
  PL: {
    label: "Paid leave",
    accent: "#6d28d9",
    tile: `color-mix(in srgb, ${PURPLE} 12%, #fff)`,
    tileInk: "#6d28d9",
    rowTint: tint(PURPLE, 8),
  },
  CO: {
    label: "Comp-off",
    accent: "#6d28d9",
    tile: `color-mix(in srgb, ${PURPLE} 12%, #fff)`,
    tileInk: "#6d28d9",
    rowTint: tint(PURPLE, 8),
  },
  incomplete: {
    label: "Incomplete (no check-out)",
    accent: RUST,
    tile: `color-mix(in srgb, ${RUST} 8%, #fff)`,
    tileInk: RUST,
    rowTint: tint(RUST, 7),
  },
};

/** A day the month has not reached: no colour, because nothing has happened. */
export const UPCOMING_STYLE: DayCodeStyle = {
  label: "Upcoming",
  accent: "var(--color-ink-subtle)",
  tile: "transparent",
  tileInk: "var(--color-ink-subtle)",
  rowTint: "transparent",
};

/** A code this palette does not know. Neutral, never a warning colour. */
export const NO_RECORD_STYLE: DayCodeStyle = {
  label: "No record",
  accent: "var(--color-ink-subtle)",
  tile: "transparent",
  tileInk: "var(--color-ink-subtle)",
  rowTint: "transparent",
};

/**
 * How a graded day looks. An unknown code falls back to neutral rather than
 * throwing, so a new `AttendanceCode` can never blank a page — it just renders
 * plainly until it is given a colour here.
 */
export function dayCodeStyle(code: string): DayCodeStyle {
  return STYLES[code] ?? NO_RECORD_STYLE;
}

/**
 * The report's `DayStatus` values, mapped onto the code whose colour they wear.
 *
 * `overtime` shares Present's green deliberately: it is the same graded "P" day
 * and the same money, distinguished by its label and by a surplus shown in
 * green (spec §5). `upcoming` has no colour of its own for the same reason a
 * future tile has none.
 */
const STATUS_CODE: Record<string, string> = {
  full_day: "P",
  overtime: "P",
  half_day: "H/D",
  absent: "A",
  holiday: "H",
  holiday_worked: "HP",
  holiday_half: "H-H/D",
  weekly_off: "W/O",
  paid_leave: "PL",
  unpaid_leave: "LWP",
  comp_off: "CO",
  no_checkout: "incomplete",
};

/** How one of the daily report's statuses looks. */
export function dayStatusStyle(status: string): DayCodeStyle {
  if (status === "upcoming") return UPCOMING_STYLE;
  const code = STATUS_CODE[status];
  return code ? dayCodeStyle(code) : NO_RECORD_STYLE;
}

/* ────────────────────────────────────────────────────────────────────────────
   SURPLUS / DEFICIT — the BALANCE column's colours (spec §6)

   Green for banked hours, red for owed, neutral for square. The same three
   colours the money uses elsewhere in the app, so a person does not have to
   learn a second convention halfway down the page.
   ──────────────────────────────────────────────────────────────────────────── */

/** Colour for a signed minute or rupee balance. Zero is deliberately neutral. */
export function balanceColor(value: number): string {
  if (value > 0) return GREEN;
  if (value < 0) return "var(--color-altus-red)";
  return "var(--color-ink-muted)";
}

/** The green the app uses for money added, and for a surplus. */
export const GAIN_COLOR = GREEN;
