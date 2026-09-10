const numberFmt = new Intl.NumberFormat("en-IN");

export function formatCount(n: number): string {
  return numberFmt.format(n);
}

const timeFmt = new Intl.DateTimeFormat("en-IN", {
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
});

export function formatTime(d: Date): string {
  return timeFmt.format(d);
}

const MONTHS_TITLE = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * CANONICAL Altus date format — the ONE way every user-facing date renders,
 * across all modules: `dd MMM yyyy` with a TITLE-CASE 3-letter month, e.g.
 * `01 Jan 2026`, `07 Aug 2026`. (Permanent rule — never dd-mm-yyyy or slashes.)
 *
 * Accepts a Date, an ISO / `YYYY-MM-DD` string, or ms. A `YYYY-MM-DD` string is
 * parsed as a LOCAL calendar day (no UTC-midnight day-shift). Empty / invalid
 * input returns "" (or the original string if it wasn't a parseable date).
 */
export function formatDate(input: Date | string | number | null | undefined): string {
  if (input == null || input === "") return "";
  let date: Date;
  if (input instanceof Date) {
    date = input;
  } else if (typeof input === "string") {
    const m = input.match(/^(\d{4})-(\d{2})-(\d{2})/);
    date = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(input);
  } else {
    date = new Date(input);
  }
  if (Number.isNaN(date.getTime())) return typeof input === "string" ? input : "";
  const dd = String(date.getDate()).padStart(2, "0");
  return `${dd} ${MONTHS_TITLE[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * HR MODULE date format — `DD-MMM-YYYY`, e.g. `21-Jan-1984`. Identical to
 * {@link formatDate} in every respect except the separator, so the parsing
 * rules above (local calendar day for `YYYY-MM-DD`, "" for empty, the original
 * string for unparseable input) all still hold.
 *
 * Deliberately a SEPARATE function rather than a change to `formatDate`: the
 * hyphenated form was asked for across the HR module specifically, and
 * `formatDate` is the canonical app-wide format used by ~90 files outside HR
 * that must keep rendering `21 Jan 1984`.
 */
export function formatDateHr(input: Date | string | number | null | undefined): string {
  const spaced = formatDate(input);
  // Only rewrite our own `dd MMM yyyy` output; a passed-through unparseable
  // string must survive untouched rather than have its spaces mangled.
  return /^\d{2} [A-Z][a-z]{2} -?\d+$/.test(spaced) ? spaced.replace(/ /g, "-") : spaced;
}

/**
 * Calendar day (YYYY-MM-DD) of `d` in the given IANA timezone. Used by
 * attendance to pin a punch to the employee's own "today" regardless of
 * the server's timezone (Vercel runs UTC).
 */
export function localDateString(timeZone: string, d: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

/** Clock time of `d` in the given IANA timezone (e.g. "10:42 am"). */
export function formatTimeInTz(d: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("en-IN", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(d);
}

const inrFmt = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

/** ₹ amount in Indian digit grouping, no paise (e.g. "₹1,25,000"). */
export function formatInr(n: number): string {
  return inrFmt.format(n);
}

export function formatDelta(n: number): string {
  if (n > 0) return `↑ ${n}`;
  if (n < 0) return `↓ ${Math.abs(n)}`;
  return `→ 0`;
}

import type { TaskStatus, StatusColorToken } from "@/db/enums";

// M5.1 — client-side fallback maps for status labels + colors. Server
// Components should call `getStatusDisplayMap()` (lib/queries/status-display.ts)
// instead so admin renames flow through. These exist for purely-client surfaces
// and as a safety net if a DB read fails.
export const STATUS_LABELS_FALLBACK: Record<TaskStatus, string> = {
  dont_know:    "Not Read",
  not_started:  "Not Started",
  initiated:    "Initiated",
  follow_up:    "Follow Up",         // legacy — kept for already-imported rows
  need_help:    "Need Help",
  on_hold:      "On Hold",
  need_info:    "Need Info",         // Tier-3 NEW
  follow_up_1:  "Follow Up 1",       // Tier-3 NEW
  follow_up_2:  "Follow Up 2",       // Tier-3 NEW
  follow_up_3:  "Follow Up 3",       // Tier-3 NEW
  done:         "Done",
  approved:     "Approved",
  not_approved: "Not Approved",
  cancelled:    "Cancelled",
  transferred:  "Transferred",
};

// Manan's status colour scheme (2026-05): Not Started=light blue,
// Initiated=yellow, Need Info/Need Help=red, Follow Up 1/2/3=orange,
// Done=green, Not Approved=light red (rose), Approved=purple,
// Cancelled=dark grey (slate), Transferred=brown.
export const STATUS_TONES_FALLBACK: Record<TaskStatus, StatusColorToken> = {
  dont_know:    "stone",
  not_started:  "blue",
  initiated:    "yellow",
  follow_up:    "orange",            // legacy follow-up → orange family
  need_help:    "red",
  on_hold:      "slate",
  need_info:    "red",
  follow_up_1:  "orange",
  follow_up_2:  "orange",
  follow_up_3:  "orange",
  done:         "green",
  approved:     "purple",
  not_approved: "rose",
  cancelled:    "slate",
  transferred:  "brown",
};

/** The four colours one status badge needs: fill, text, hairline and dot. */
export interface StatusBadgeStyle {
  /** Pill background. */
  bg: string;
  /** Pill text. */
  ink: string;
  /** 1px pill border. */
  border: string;
  /** The leading dot — the most saturated of the four. */
  dot: string;
}

/**
 * HIGH-CONTRAST status badges (2026-08).
 *
 * Badges used to be derived from a single `--color-<token>` via
 * `color-mix(… 12%, transparent)` for the fill and `… 30%` for the border. At
 * 12% of an already-pale token the fill was within a couple of percent of white,
 * so on a white table every badge read as "faint grey rectangle with coloured
 * text" and the statuses were hard to tell apart at a glance.
 *
 * These are LITERAL values, not derived ones, because the spec is literal:
 * Tailwind's -100 fill / -950 (or -900) ink / -300 hairline / -600 dot. Deriving
 * them from the CSS variables would have meant redefining those variables, and
 * they are shared with a dozen non-status surfaces (reimbursements, incentive,
 * projects…) that were never asked to change.
 *
 * Token → family, and why:
 *   yellow → AMBER    Initiated. Pale yellow on white was the worst offender.
 *   blue   → INDIGO   Not Started. Washed-out light blue → vivid indigo.
 *   green  → EMERALD  Done.
 *   red    → RED      Need Info / Need Help — the "critical" family.
 *   rose   → RED      Not Approved. Deliberately the SAME red: "washed pink"
 *                     was the complaint, and a declined task is a red event,
 *                     not a pink one.
 *   orange → ORANGE   Follow Up.
 *   amber  → ORANGE   On Hold. Grouped with Follow Up in the spec. On Hold
 *                     carries the `amber` token in status_settings (not the
 *                     `slate` the fallback map guesses), so it gets its own
 *                     entry here and Cancelled — which really is slate — is
 *                     left alone.
 *
 * purple / slate / stone / brown were not named in the spec. They get the SAME
 * -100/-950/-300/-600 treatment in their own hue so one column of badges reads
 * as one system rather than five loud chips beside four faint ones. In
 * particular Approved stays PURPLE: the spec's "Done / Approved (Green)"
 * heading would make an approved task indistinguishable from a merely-done one,
 * which is the distinction the approval column exists to draw.
 */
export const STATUS_BADGE_STYLES: Record<StatusColorToken, StatusBadgeStyle> = {
  // ── Named in the spec ────────────────────────────────────────────────────
  yellow: { bg: "#FEF3C7", ink: "#78350F", border: "#FCD34D", dot: "#D97706" }, // amber
  blue:   { bg: "#E0E7FF", ink: "#1E1B4B", border: "#C7D2FE", dot: "#4F46E5" }, // indigo
  green:  { bg: "#D1FAE5", ink: "#022C22", border: "#6EE7B7", dot: "#059669" }, // emerald
  red:    { bg: "#FEE2E2", ink: "#450A0A", border: "#FCA5A5", dot: "#DC2626" },
  rose:   { bg: "#FEE2E2", ink: "#450A0A", border: "#FCA5A5", dot: "#DC2626" }, // → red
  orange: { bg: "#FFEDD5", ink: "#431407", border: "#FDBA74", dot: "#EA580C" },
  amber:  { bg: "#FFEDD5", ink: "#431407", border: "#FDBA74", dot: "#EA580C" }, // → orange
  // ── Same treatment, own hue ──────────────────────────────────────────────
  purple: { bg: "#F3E8FF", ink: "#3B0764", border: "#D8B4FE", dot: "#9333EA" },
  slate:  { bg: "#E2E8F0", ink: "#0F172A", border: "#CBD5E1", dot: "#475569" },
  stone:  { bg: "#E7E5E4", ink: "#292524", border: "#D6D3D1", dot: "#78716C" },
  brown:  { bg: "#EDE0CF", ink: "#3F2A15", border: "#D3B892", dot: "#8A6234" },
};

/**
 * Resolve a `status_settings.color_token` to its badge colours.
 *
 * The column accepts a raw hex as well as one of the named tokens (see
 * lib/validators/color-token.ts), so an admin-set custom colour has no entry
 * above. Those fall back to the old derive-from-one-colour behaviour, which is
 * the only thing possible with a single input — but with the fill pushed from
 * 12% to 22% so a custom badge is not left conspicuously fainter than the
 * eleven built-ins beside it.
 */
export function statusBadgeStyle(token: string | null | undefined): StatusBadgeStyle {
  const known = token && (STATUS_BADGE_STYLES as Record<string, StatusBadgeStyle>)[token];
  if (known) return known;
  const c = token && token.startsWith("#") ? token : "var(--color-stone)";
  return {
    bg: `color-mix(in srgb, ${c} 22%, white)`,
    ink: `color-mix(in srgb, ${c} 78%, black)`,
    border: `color-mix(in srgb, ${c} 45%, white)`,
    dot: c,
  };
}

/**
 * Parse the date shapes Billing actually receives into calendar parts. Returns
 * null for anything that is not a date, so callers can fall back to the raw
 * text rather than printing a mangled result.
 *
 * Handles:
 *   2026-08-13[…]            ISO / Postgres `date`
 *   13-Aug-2026              already formatted (idempotent)
 *   04/14/2026 7:05 AM       US: slashes + 12-hour clock  → MONTH first
 *   02-12-2026 9:21          non-US: hyphens + 24-hour    → DAY first
 *
 * The slash/hyphen split is not a guess: across the whole billing sheet every
 * slash value carries AM/PM and every hyphen value uses a 24-hour clock, with
 * zero exceptions — the two locales that produce those formats disagree about
 * day/month order, and the clock style is what tells them apart.
 */
function parseLooseDate(raw: string): { y: number; m: number; d: number } | null {
  const v = raw.trim();
  if (!v) return null;

  let m = v.match(/^(\d{4})-(\d{2})-(\d{2})/); // ISO
  if (m) return { y: +m[1]!, m: +m[2]!, d: +m[3]! };

  m = v.match(/^(\d{1,2})-([A-Za-z]{3})-(\d{4})$/); // 13-Aug-2026
  if (m) {
    const idx = MONTHS_TITLE.findIndex((x) => x.toLowerCase() === m![2]!.toLowerCase());
    return idx >= 0 ? { y: +m[3]!, m: idx + 1, d: +m[1]! } : null;
  }

  m = v.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); // slashes → month first
  if (m) return { y: +m[3]!, m: +m[1]!, d: +m[2]! };

  m = v.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/); // hyphens → day first
  if (m) return { y: +m[3]!, m: +m[2]!, d: +m[1]! };

  return null;
}

/**
 * dd-Mon-yyyy (e.g. "02-Dec-2026") — the ONE date format used across Billing.
 * Any time component is dropped: the UI shows calendar days, never clock times.
 *
 * Hyphens and a named month rather than all digits: "02/12/2026" reads as
 * 2 December to an Indian reader and 12 February to an American one, and a
 * payment schedule is exactly where that ambiguity costs money.
 *
 * Reformatted TEXTUALLY, never via `new Date()`: `new Date("2026-08-13")` is
 * UTC midnight, which renders as the 12th west of Greenwich — a calendar date
 * must not shift by timezone.
 */
/**
 * Minutes → HH:MM, for a DURATION shown as clock time rather than a decimal.
 *
 * "3.5" reads as three and a half only after a beat of arithmetic; "03:30" is
 * the same fact with none. Hours are not capped at 24 — this is an elapsed
 * total, so 30 hours is 30:00, not 06:00.
 */
export function formatHoursMinutes(totalMinutes: number): string {
  const safe = Number.isFinite(totalMinutes) ? Math.max(0, Math.round(totalMinutes)) : 0;
  const hours = Math.floor(safe / 60);
  const mins = safe % 60;
  return `${String(hours).padStart(2, "0")}:${String(mins).padStart(2, "0")}`;
}

export function formatDMonY(input: Date | string | null | undefined): string {
  if (input == null || input === "") return "";
  if (input instanceof Date) {
    if (Number.isNaN(input.getTime())) return "";
    return `${String(input.getDate()).padStart(2, "0")}-${MONTHS_TITLE[input.getMonth()]}-${input.getFullYear()}`;
  }
  const p = parseLooseDate(input);
  if (!p) return input;
  const mon = MONTHS_TITLE[p.m - 1];
  if (!mon || p.d < 1 || p.d > 31) return input;
  return `${String(p.d).padStart(2, "0")}-${mon}-${p.y}`;
}
