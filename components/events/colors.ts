/**
 * Colour system for the Monthly Events Master calendar (design §5).
 *
 * A curated ~16-swatch, CVD-aware palette (each ≥3:1 vs white) that the colour
 * picker (context menu → "Change colour", event editor) offers as swatches, plus
 * a luminance helper that auto-chooses black/white text over any background so
 * event labels stay readable regardless of the category / override colour.
 */

/** Curated accessible palette — swatches for per-event colour overrides. */
export const EVENT_PALETTE: readonly string[] = [
  "#F5D90A", // PS yellow
  "#FBE9A0", // BSS light-yellow
  "#F6A6A0", // lead-gen light-red
  "#E4572E", // vivid red-orange
  "#2A9D8F", // teal (consulting)
  "#118AB2", // cyan-blue
  "#4361EE", // indigo
  "#7209B7", // violet
  "#B5179E", // magenta
  "#F72585", // pink
  "#588157", // moss green
  "#9BCF53", // lime
  "#F4A261", // amber
  "#8D6E63", // brown (travel)
  "#495867", // slate (reserved)
  "#0A9396", // deep aqua
];

/** Neutral fallback when a category/override colour is missing. */
export const DEFAULT_EVENT_COLOR = "#94A3B8";

function clampChannel(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

/** Parse a #rgb / #rrggbb string to [r,g,b] (0–255). Returns null on garbage. */
export function hexToRgb(hex: string): [number, number, number] | null {
  const h = hex.trim().replace(/^#/, "");
  if (h.length === 3) {
    const r = parseInt(h[0]! + h[0]!, 16);
    const g = parseInt(h[1]! + h[1]!, 16);
    const b = parseInt(h[2]! + h[2]!, 16);
    if ([r, g, b].some(Number.isNaN)) return null;
    return [r, g, b];
  }
  if (h.length === 6) {
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    if ([r, g, b].some(Number.isNaN)) return null;
    return [r, g, b];
  }
  return null;
}

/** Relative luminance (WCAG) of a hex colour, 0 (black) → 1 (white). */
export function luminance(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 1;
  const [r, g, b] = rgb.map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Readable ink colour (near-black or white) for text over `bg`. */
export function readableTextColor(bg: string): string {
  return luminance(bg) > 0.5 ? "#0b1220" : "#ffffff";
}

/** A slightly darkened border colour derived from the fill (for depth). */
export function borderColor(bg: string): string {
  const rgb = hexToRgb(bg);
  if (!rgb) return "rgba(15,23,42,0.18)";
  const [r, g, b] = rgb.map((c) => clampChannel(Math.round(c * 0.82))) as [
    number,
    number,
    number,
  ];
  return `rgb(${r} ${g} ${b})`;
}

/** The effective fill colour for an event: override → category → default. */
export function eventColor(
  colorOverride: string | null,
  categoryColor: string | null | undefined,
): string {
  return colorOverride ?? categoryColor ?? DEFAULT_EVENT_COLOR;
}
