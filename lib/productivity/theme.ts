import type { Grade } from "./calc";

/**
 * The Productivity Dashboard's colour system — ONE source for the screen, the
 * Full Report and the PDF.
 *
 * The discipline the module holds to: colour is an ACCENT, never a surface.
 * Cards and report blocks stay white; a section is identified by a 3px cap, an
 * icon chip and — only where the value carries a judgement — the metric's own
 * colour. That keeps five colours on one page reading as enterprise software
 * rather than a scoreboard.
 *
 * Each theme carries two values because they do different jobs:
 *   • `accent` — the saturated tone, for 3px caps and icon chips (large areas
 *     of colour, no contrast requirement).
 *   • `ink` — the darkened form, used wherever the colour carries TEXT, so every
 *     coloured number clears AA on a white card.
 * `tint` backs the icon chip and nothing else.
 *
 * PURE by design — no React, no `server-only` — so the pdfkit renderer can read
 * the same hexes the browser does.
 */

export interface SectionTheme {
  accent: string;
  ink: string;
  tint: string;
}

/** KPI — indigo. Matches the module's own identity accent in `module-theme`. */
export const KPI_THEME: SectionTheme = { accent: "#4f46e5", ink: "#4338ca", tint: "#eef2ff" };
/** Goals — amber/gold. */
export const GOALS_THEME: SectionTheme = { accent: "#f59e0b", ink: "#b45309", tint: "#fffbeb" };
/** Tasks — red/orange, the urgency section. */
export const TASKS_THEME: SectionTheme = { accent: "#ef4444", ink: "#b91c1c", tint: "#fef2f2" };
/** Training — violet. */
export const TRAINING_THEME: SectionTheme = { accent: "#8b5cf6", ink: "#6d28d9", tint: "#f5f3ff" };
/** Manager — emerald. */
export const MANAGER_THEME: SectionTheme = { accent: "#10b981", ink: "#047857", tint: "#ecfdf5" };

/**
 * THE GRADE PALETTE — one hex per letter, and the only place any of them is
 * written down. Screen, Full Report, PDF, the team table and the distribution
 * chart all resolve a grade's colour through here, so the same letter can never
 * appear in two different tones on two different surfaces.
 *
 * The ladder runs O → A → B → C → D → F: pastel purple for the exceptional
 * tier, then grass green, sky blue and mustard yellow through the working
 * grades, and two distinct reds at the bottom. D is a MEDIUM scarlet and F a
 * blood red — the failure state is darker and more severe rather than merely
 * "more red", so the two never blur into one another in a column of badges.
 *
 * Every grade is drawn BOLD, on its solid hex, inside a thin black outline
 * (`GRADE_OUTLINE`). The outline is what makes the light end of this palette —
 * the pastel purple and the sky blue especially — hold its shape against a white
 * card instead of dissolving into it. The letter itself is always printed too:
 * colour is never the only signal anywhere in this module.
 */
export const GRADE_COLORS: Record<Grade, string> = {
  O: "#C4A7F0", // pastel purple — exceptional
  A: "#4CAF50", // grass green — excellent
  B: "#7FC8F2", // sky blue — good
  C: "#E3B505", // mustard yellow — caution / average
  D: "#EF5350", // medium scarlet — poor
  F: "#8A0303", // blood red — critical
};

/**
 * The hairline every grade chip, swatch and chart slice is outlined in. Thin and
 * pure black by design: at 1px it reads as a drawn edge rather than a border,
 * and it is what keeps the pastel and light grades legible on white.
 */
export const GRADE_OUTLINE = "#000000";

/** Best → worst. Drives legends and the distribution chart's slice order so
 *  every list of grades reads in the same direction. */
export const GRADE_ORDER: readonly Grade[] = ["O", "A", "B", "C", "D", "F"];

/** The colour a grade is drawn in. Never the only signal — every surface prints
 *  the letter itself. */
export function gradeColor(grade: Grade): string {
  return GRADE_COLORS[grade];
}

/**
 * The text colour to lay ON a solid `gradeColor` chip.
 *
 * Dark ink on everything except F. Five of the six grades are mid-to-light tones
 * that white simply cannot survive on — white on the pastel purple is ≈1.6:1 —
 * whereas near-black clears AA on all of them by a wide margin (the tightest is
 * D at ≈4.7:1). F is the one dark hex in the palette and takes white.
 *
 * Note what this does NOT do — it never darkens the grade colour itself. The
 * chip stays the exact hex on every surface; only the glyph on top changes.
 */
export function gradeOnColor(grade: Grade): string {
  return grade === "F" ? "#FFFFFF" : "#111827";
}

/**
 * Overdue urgency ramp — red → orange → yellow as the bucket gets fresher, plus
 * the separate attention tone for "need help" (a flag, not an age).
 *
 * A count of ZERO is the good outcome and is drawn neutral-dark instead: a red
 * "0" would read as a problem where there is none.
 */
export const TASK_COLOR = {
  over15: "#b91c1c",
  days8to14: "#c2410c",
  days1to7: "#a16207",
  needHelp: "#b45309",
} as const;
