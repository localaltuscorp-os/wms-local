/**
 * EXECUTIVE MASTER CALENDAR — the category taxonomy (spec §3).
 *
 * The old Monthly Events Master let anyone invent a category and pick a colour,
 * which is why a decade of the master sheet has "PSO", "PS", "Consulting" and
 * "Sales" sitting in whatever colour was free that week. This module takes the
 * opposite position, and it is the whole point of §3: the taxonomy is FIXED, it
 * lives in code, and BEHAVIOUR hangs off the category rather than off the
 * colour. Protected time is protected because it is Personal & Wellness, not
 * because somebody remembered to tick a box.
 *
 * THE SET WAS REPLACED ON 2026-09-18 with the fourteen categories the team
 * actually plans with (Sales, Fixed, Consulting, CQ, PS, …), each with the exact
 * colour of the master sheet. Migration 0237 moved every stored block and
 * routine from the seven old keys to these.
 *
 * COLOURS ARE THE SHEET'S HEX VALUES. The team reads the calendar by colour, so
 * each category carries its sheet colour and `categoryColors` derives the fill,
 * the border and the text from it. Very light ones (CQ's yellow, Grad Workshop's
 * cream) get a darker border and text so they stay readable on white.
 *
 * PURE. No database, no environment, no React — so the rules are unit-tested
 * directly and the same constants drive the grid, the legend, the analytics
 * buckets and the conflict checks without a second source of truth.
 */

/** The fourteen categories, in legend order (2026-09-18). */
export type ExecCategoryKey =
  | "sales"
  | "fixed"
  | "consulting"
  | "cq"
  | "ps"
  | "staff_time"
  | "lead_gen"
  | "grad_workshop"
  | "flexible_time"
  | "festival"
  | "wkly_off"
  | "family_time"
  | "personal"
  | "siaa_exam";

/**
 * The analytics buckets of §4D. Several categories can share a bucket — the
 * dashboard asks "how much client delivery?", not "how much of category 3".
 */
export type ExecBucket =
  | "client-delivery"
  | "sales-growth"
  | "training-cohorts"
  | "operations"
  | "personal-recovery"
  | "unbilled";

export interface ExecCategory {
  key: ExecCategoryKey;
  /** Legend label, and what the editor's category picker shows. */
  label: string;
  /** One line under the label in the legend panel. */
  blurb: string;
  /** The master sheet's colour for this category. */
  hex: string;
  /** Which §4D bucket this category's minutes count towards. */
  bucket: ExecBucket;
  /**
   * PROTECTED TIME (§3, §5). Nothing may be booked over it by anyone other than
   * the owner: `findConflicts` in ./privacy.ts refuses the overlap outright
   * rather than warning.
   */
  protected: boolean;
  /** Unused by the grid (the block's own all-day flag decides); kept for the type. */
  allDay: boolean;
  /** Offers the client picker. Every category does now - the client is optional. */
  linksClient: boolean;
  /** Offers the batch field — cohort programmes (CQ, PS, workshops). */
  linksCohort: boolean;
  /**
   * Words that identify this category in free text. Used by `guessCategory` to
   * classify pasted sheet cells ("BSS 90 S21", "BNI Premier", "TDS Returns").
   */
  keywords: readonly string[];
}

const cat = (
  key: ExecCategoryKey,
  label: string,
  hex: string,
  bucket: ExecBucket,
  blurb: string,
  keywords: readonly string[],
  opts: { protected?: boolean; linksCohort?: boolean } = {},
): ExecCategory => ({
  key,
  label,
  hex,
  bucket,
  blurb,
  keywords,
  protected: opts.protected ?? false,
  allDay: false,
  linksClient: true,
  linksCohort: opts.linksCohort ?? false,
});

export const EXEC_CATEGORIES: readonly ExecCategory[] = [
  cat("sales", "Sales", "#7F00FF", "sales-growth", "Sales calls, pitches, proposals, BNI and networking.",
    ["sales", "pitch", "proposal", "bni", "premier", "networking", "strategy"]),
  cat("fixed", "Fixed", "#FF0000", "client-delivery", "Fixed commitments that don't move.", ["fixed"]),
  cat("consulting", "Consulting", "#FF8C00", "client-delivery", "Client consulting, reviews and account work.",
    ["consulting", "client", "account", "review", "handholding", "hh", "sprint connect"]),
  cat("cq", "CQ", "#FFFF00", "training-cohorts", "CQ batches and sessions.", ["cq"], { linksCohort: true }),
  cat("ps", "PS", "#FFC000", "training-cohorts", "PS batches and sessions.", ["ps", "pso"], { linksCohort: true }),
  cat("staff_time", "Staff Time", "#82E0AA", "operations", "Staff syncs, accounts, returns and compliance.",
    ["staff", "staff sync", "tds", "gst", "return", "returns", "accounts", "map", "compliance", "audit", "payroll"]),
  cat("lead_gen", "Lead Gen", "#F1948A", "sales-growth", "Lead generation and outreach.",
    ["lead gen", "lead generation", "lead", "leads", "outreach"]),
  cat("grad_workshop", "Grad Workshop", "#FFFDC0", "training-cohorts", "Graduate workshops, BSS, colloquiums, orientations.",
    ["grad", "graduate", "workshop", "bss", "batch", "colloquium", "orientation", "conclave", "session"], { linksCohort: true }),
  cat("flexible_time", "Flexible Time", "#00FF00", "operations", "Open time that can move.", ["flexible", "flex"]),
  cat("festival", "Festival Marker", "#FF00FF", "unbilled", "Festivals and holidays.",
    ["festival", "holiday", "diwali", "independence", "ganesh", "chaturthi", "navratri", "office closed"]),
  cat("wkly_off", "Wkly Off/Break", "#A6A6A6", "personal-recovery", "Weekly off, breaks and leave. Protected.",
    ["weekly off", "wkly off", "off", "break", "vacation", "leave", "recharge"], { protected: true }),
  cat("family_time", "Family Time", "#4A90E2", "personal-recovery", "Time with family. Protected.", ["family"], { protected: true }),
  cat("personal", "Personal", "#0000FF", "personal-recovery", "Exercise, health and personal time. Protected.",
    ["exercise", "gym", "health", "personal", "walk", "yoga", "birthday"], { protected: true }),
  cat("siaa_exam", "Siaa Exam", "#6E6E6E", "personal-recovery", "Siaa exams.", ["siaa", "exam"]),
];

const BY_KEY = new Map<ExecCategoryKey, ExecCategory>(EXEC_CATEGORIES.map((c) => [c.key, c]));

export function isExecCategoryKey(v: string): v is ExecCategoryKey {
  return BY_KEY.has(v as ExecCategoryKey);
}

/** The key an unknown category falls back to (was "ops" before 2026-09-18). */
export const FALLBACK_CATEGORY: ExecCategoryKey = "staff_time";

/**
 * The category for a key. Falls back to Staff Time rather than throwing: a row
 * written by an older build, or a key retired later, must still render — a
 * calendar that refuses to draw is worse than one drawing a grey block.
 */
export function execCategory(key: string): ExecCategory {
  return BY_KEY.get(key as ExecCategoryKey) ?? BY_KEY.get(FALLBACK_CATEGORY)!;
}

/** Relative luminance of a #RRGGBB colour, 0 (black) to 1 (white). */
function luminance(hex: string): number {
  const n = parseInt(hex.slice(1), 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * ch[0]! + 0.7152 * ch[1]! + 0.0722 * ch[2]!;
}

/**
 * The five shades every surface uses, derived from one hex:
 *   base  the swatch and a block's left rule
 *   bg    a block's / box's light fill
 *   pale  a slightly stronger fill (hover, selected)
 *   edge  a box border
 *   deep  text on the fill
 * A very light colour (yellow, cream, mint, the bright greens) would vanish as a
 * border or as text, so for those the border and text are darkened versions of
 * it - the fill keeps the sheet's own colour.
 */
export function hexColors(hex: string): { base: string; deep: string; pale: string; bg: string; edge: string } {
  const light = luminance(hex) > 0.6;
  return {
    base: light ? `color-mix(in srgb, ${hex} 55%, #5c5c3d)` : hex,
    deep: `color-mix(in srgb, ${hex} ${light ? 35 : 55}%, #111)`,
    pale: `color-mix(in srgb, ${hex} ${light ? 70 : 28}%, white)`,
    bg: `color-mix(in srgb, ${hex} ${light ? 45 : 16}%, white)`,
    edge: light ? `color-mix(in srgb, ${hex} 60%, #6b6b4a)` : `color-mix(in srgb, ${hex} 70%, white)`,
  };
}

/** The shades for a category (see hexColors). */
export function categoryColors(key: string): { base: string; deep: string; pale: string; bg: string; edge: string } {
  return hexColors(execCategory(key).hex);
}

export function isProtectedCategory(key: string): boolean {
  return execCategory(key).protected;
}

/** Every category whose minutes land in one analytics bucket. */
export function categoriesInBucket(bucket: ExecBucket): ExecCategory[] {
  return EXEC_CATEGORIES.filter((c) => c.bucket === bucket);
}

/**
 * Classify free text into a category — the import path for ten years of sheet
 * cells, and the "did you mean" behind the editor's category picker.
 *
 * Longest keyword first, so "lead gen" beats "lead" and "office closed" beats
 * "office". Returns null rather than guessing when nothing matches: a wrong
 * category is worse than an unclassified one, because a wrong PROTECTED
 * category would silently start refusing other people's bookings.
 */
export function guessCategory(text: string): ExecCategoryKey | null {
  const hay = ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()} `;
  if (hay.trim().length === 0) return null;

  let best: { key: ExecCategoryKey; len: number } | null = null;
  for (const c of EXEC_CATEGORIES) {
    for (const raw of c.keywords) {
      const kw = raw.toLowerCase();
      const hit = kw.includes(" ") ? hay.includes(` ${kw} `) : hay.includes(` ${kw} `);
      if (hit && (!best || kw.length > best.len)) best = { key: c.key, len: kw.length };
    }
  }
  return best?.key ?? null;
}
