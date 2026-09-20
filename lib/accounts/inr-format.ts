/**
 * INDIAN CURRENCY PRESENTATION — Lakh / Crore, full figures, and words.
 *
 * NO "server-only" here, deliberately. The matrix renders these in the browser
 * and the PDF renders them in Node; if the two used different helpers the
 * emailed report could round a figure differently from the screen it was read
 * off, which on a reconciliation sheet is the one failure that matters.
 *
 * The unit rule is the brief's, taken literally:
 *   Rs. 0 – Rs. 99,99,999        → Lakh   (Rs. 75,50,000 → Rs. 75.50 Lakh)
 *   Rs. 1,00,00,000 and above → Crore  (Rs. 1,25,00,000 → Rs. 1.25 Crore)
 *
 * Two decimals always, so a column of figures stays aligned on the point.
 * Negatives keep their sign OUTSIDE the rupee symbol (−Rs. 25.00 Lakh) — that is
 * how a debit reads, and the matrix's red/green already carries the meaning.
 */

const LAKH = 100_000;
const CRORE = 10_000_000;

/** `1,25,00,000` — Indian grouping, no symbol. */
const groupIn = new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 });

/**
 * Glyph set. The default is the real rupee sign and a typographic minus, which
 * is what the browser should show.
 *
 * `pdf` exists because pdfkit's built-in Helvetica is WinAnsi-encoded and has
 * NO glyph for either ₹ (U+20B9) or − (U+2212): the first render of the emailed
 * report printed every figure as "¹25.00 Lakh" and every debit as '" 4.50 Lakh'.
 * The app's only bundled fonts are .woff2, which pdfkit cannot embed, so the
 * PDF spells the currency "Rs." and uses an ASCII hyphen. Same numbers, glyphs
 * the format can actually draw.
 */
export type InrGlyphs = { rupee: string; minus: string };
/**
 * BOTH SETS SPELL THE RUPEE "Rs." NOW (Manan, 2026-09-15). The screen set kept
 * the ₹ glyph and the PDF set spelled it out, which meant the emailed report
 * and the screen it was read off disagreed about the one character every figure
 * on the page starts with. One spelling, everywhere.
 *
 * The pair survives because the MINUS still differs: the browser gets the
 * typographic − (which lines up with the digits in a tabular-nums column) and
 * pdfkit's WinAnsi Helvetica, which has no glyph for it, gets an ASCII hyphen.
 */
export const INR_SCREEN: InrGlyphs = { rupee: "Rs. ", minus: "−" };
export const INR_PDF: InrGlyphs = { rupee: "Rs. ", minus: "-" };

/** `Rs. 1,25,00,000` — the exact figure, for tooltips and any full-value display. */
export function formatFullInr(n: number, g: InrGlyphs = INR_SCREEN): string {
  const sign = n < 0 ? g.minus : "";
  return `${sign}${g.rupee}${groupIn.format(Math.abs(Math.round(n)))}`;
}

/** Indian grouping with exactly two decimals — for figures where the paise are
 *  the point. */
const groupPaise = new Intl.NumberFormat("en-IN", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * `Rs. 26,19,630.22` — the figure to the paise, grouping and all.
 *
 * `formatFullInr` rounds to whole rupees, which is right for a grid but wrong
 * wherever the paise ARE the message. The Vasa matrix's real disagreements are
 * sub-rupee: 26,19,630.00 against 26,19,630.22 prints as the same number under
 * the rounding formatter, so a cell would explain its red by quoting a
 * difference of "Rs. 0". Paise are dropped only when there are none, so an ordinary
 * whole-rupee balance still reads as one.
 */
export function formatPreciseInr(n: number, g: InrGlyphs = INR_SCREEN): string {
  const sign = n < 0 ? g.minus : "";
  const abs = Math.abs(n);
  const whole = Math.round(abs * 100) % 100 === 0;
  return `${sign}${g.rupee}${whole ? groupIn.format(Math.round(abs)) : groupPaise.format(abs)}`;
}

/**
 * `Rs. 25.00 Lakh` / `Rs. 1.25 Crore` — the abbreviated figure.
 *
 * NOT USED ANYWHERE, and deliberately so: the Vasa Family section prints full
 * figures via formatFullInr because "Rs. 1.72 Crore" hides the digits a
 * reconciliation is checked against, and the 2026-09-15 brief made that the
 * rule for the whole app. Kept because it is the only implementation of the
 * Lakh/Crore split, and a surface that genuinely needs the short form should
 * call this rather than grow a second one — but reach for `formatFullInr`
 * first, which is what "wherever there is amount" now means.
 *
 * Zero returns a plain `Rs. 0` rather than "Rs. 0.00 Lakh": the matrix is
 * mostly empty cells, and a grid of "0.00 Lakh" is noise standing in for
 * nothing.
 */
export function formatCompactInr(n: number, g: InrGlyphs = INR_SCREEN): string {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs === 0) return `${g.rupee}0`;
  const sign = n < 0 ? g.minus : "";
  if (abs >= CRORE) return `${sign}${g.rupee}${(abs / CRORE).toFixed(2)} Crore`;
  return `${sign}${g.rupee}${(abs / LAKH).toFixed(2)} Lakh`;
}

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];
const TENS = [
  "", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety",
];

/** 0–99 in words; hyphenated in the tens, as the brief's example is. */
function twoDigits(n: number): string {
  if (n < 20) return ONES[n] ?? "";
  const t = TENS[Math.floor(n / 10)] ?? "";
  const o = ONES[n % 10] ?? "";
  return o ? `${t}-${o}` : t;
}

/** 0–999 in words. */
function threeDigits(n: number): string {
  const h = Math.floor(n / 100);
  const rest = n % 100;
  const parts: string[] = [];
  if (h) parts.push(`${ONES[h]} Hundred`);
  if (rest) parts.push(twoDigits(rest));
  return parts.join(" ");
}

/**
 * `One Crore Twenty-Five Lakh Rupees` — the INDIAN scale (crore · lakh ·
 * thousand · hundred), not the short scale, so the words match the figure
 * beside them rather than translating it into millions.
 *
 * Paise are dropped: every figure on this sheet is a whole-rupee balance, and a
 * tooltip reading "…and Fifty Paise" on a rounded display would be a second,
 * quieter disagreement between the two numbers.
 */
export function inrInWords(n: number): string {
  const value = Math.abs(Math.round(n));
  if (value === 0) return "Zero Rupees";

  const crore = Math.floor(value / CRORE);
  const lakh = Math.floor((value % CRORE) / LAKH);
  const thousand = Math.floor((value % LAKH) / 1000);
  const rest = value % 1000;

  const parts: string[] = [];
  if (crore) parts.push(`${threeDigits(crore)} Crore`);
  if (lakh) parts.push(`${twoDigits(lakh)} Lakh`);
  if (thousand) parts.push(`${twoDigits(thousand)} Thousand`);
  if (rest) parts.push(threeDigits(rest));

  const words = parts.join(" ");
  // "One Rupee", not "One Rupees" — the only place the noun is singular.
  const noun = value === 1 ? "Rupee" : "Rupees";
  return `${n < 0 ? "Minus " : ""}${words} ${noun}`;
}

/**
 * The two-line hover text: the exact figure, then the same figure in words.
 *
 * A newline in a native `title` renders as two lines in every browser, which is
 * why it is used rather than a floating element. The matrix cells are `<input>`s
 * inside a horizontally-scrolling table — an overlay tooltip there has to fight
 * the scroll container's clipping and would sit on top of the cell the user is
 * about to type into.
 */
export function inrTooltip(n: number): string {
  return `${formatFullInr(n)}\n${inrInWords(n)}`;
}
