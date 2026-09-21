/**
 * HR LETTERS — "Fit to one page".
 *
 * The appraisal letters must print on ONE A4 sheet without being cut off. With
 * the switch on, a letter is tightened in steps until it fits (FIT_PLAN):
 *
 *   1. the normal layout;
 *   2. COMPACT spacing — shorter line height, smaller gaps between paragraphs,
 *      bullets, term rows and the sign-off — at full text size;
 *   3. compact spacing with the text scaled down, one FIT_STEPS step at a time.
 *
 * Every surface walks the same plan and stops at the first step that fits:
 *
 *   · browser print / on-screen preview — CSS zoom + a compact attribute on the
 *     letterhead body (components/hr/letters/use-fit-one-page.ts);
 *   · structured PDF (pdfkit)           — font sizes and gaps scaled
 *     (lib/hr/letters/pdf.ts);
 *   · free-edit PDF (headless Chromium) — CSS zoom + RICH_COMPACT_CSS
 *     (lib/hr/letters/render-rich.ts).
 *
 * A letter that still does not fit at the floor prints at the floor, on two
 * pages, rather than shrinking into something unreadable.
 *
 * PURE + CLIENT-SAFE: no Node APIs (TextDecoder is in both runtimes).
 */

/** One printed A4 page of letter body: 1123px sheet − 196px header − 100px footer. */
export const PAGE_CONTENT_H = 1123 - 196 - 100;

/** The text scales tried, largest first. The last one is the floor. */
export const FIT_STEPS = [1, 0.95, 0.9, 0.86, 0.82, 0.78] as const;

export const FIT_FLOOR: number = FIT_STEPS[FIT_STEPS.length - 1]!;

export interface FitStep {
  /** Tighter spacing (line height, gaps). */
  compact: boolean;
  /** Text scale / CSS zoom. */
  scale: number;
}

/** The normal layout first, then compact spacing at every text scale. */
export const FIT_PLAN: readonly FitStep[] = [
  { compact: false, scale: 1 },
  ...FIT_STEPS.map((scale) => ({ compact: true, scale })),
];

/** In the pdfkit renderer, compact spacing multiplies every vertical gap by this. */
export const FIT_COMPACT_SPACING = 0.6;

/** Compact spacing for the free-edit PDF — mirrors the editor's compact rules. */
export const RICH_COMPACT_CSS =
  ".alh-body{line-height:1.5;}" +
  ".alh-body p{margin:0 0 7px;}" +
  ".alh-body ul,.alh-body ol{margin:0 0 7px;}" +
  ".alh-body li{margin:0 0 2px;}" +
  ".alh-body h1{margin:0 0 6px;}" +
  ".alh-body h2,.alh-body h3{margin:8px 0 4px;}" +
  ".alh-body table{margin:0 0 8px;}" +
  ".alh-body th,.alh-body td{padding:3px 8px;}" +
  ".alh-body .alw-termtable{margin:4px 0 10px;}" +
  ".alh-body .alw-termtable th.alw-tt-label,.alh-body .alw-termtable td.alw-tt-val{padding:4px 10px;}";

/**
 * Letters that open with "Fit to one page" switched ON — the two revised-CTC
 * letters, which fit one page. The Offer (Selection) letter is a designed
 * two-page letter and does not fit even at the floor, so its switch starts OFF
 * (it stays available, and says "Still 2 pages" when turned on).
 */
const FIT_ONE_PAGE_DEFAULT = new Set<string>(["appraisal-revised-ctc", "promotion-revised-ctc"]);

export function fitOnePageDefault(templateKey: string): boolean {
  return FIT_ONE_PAGE_DEFAULT.has(templateKey);
}

/**
 * How many pages a PDF has, by counting its page objects. Both renderers write
 * plain page objects, so this is reliable for them; 0 means "could not tell",
 * which callers treat as "keep this render" rather than shrinking blindly.
 */
export function countPdfPages(bytes: Uint8Array | string): number {
  const text = typeof bytes === "string" ? bytes : new TextDecoder("latin1").decode(bytes);
  const matches = text.match(/\/Type\s*\/Page(?![a-zA-Z])/g);
  return matches ? matches.length : 0;
}
