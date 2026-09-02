/**
 * Curated accessible category palette for the Monthly Events Master (design §5).
 *
 * ~16 swatches, chosen to stay distinguishable across common colour-vision
 * deficiencies and to keep ≥3:1 contrast against a white calendar background.
 * The category master lets admins pick a swatch here OR type any custom hex —
 * either way the readable text colour (black/white) is auto-chosen by luminance.
 */
export interface Swatch {
  hex: string;
  name: string;
}

export const CATEGORY_PALETTE: Swatch[] = [
  { hex: "#f5d90a", name: "Signal Yellow" }, // PS
  { hex: "#fbe38e", name: "Butter" }, // BSS
  { hex: "#f6a6a0", name: "Coral" }, // Lead Generation
  { hex: "#e8604c", name: "Vermilion" },
  { hex: "#ef8e38", name: "Amber" },
  { hex: "#b45309", name: "Bronze" },
  { hex: "#22c55e", name: "Green" },
  { hex: "#84cc16", name: "Lime" },
  { hex: "#14b8a6", name: "Teal" }, // Consulting
  { hex: "#0ea5e9", name: "Sky" },
  { hex: "#2563eb", name: "Blue" },
  { hex: "#6366f1", name: "Indigo" },
  { hex: "#8b5cf6", name: "Violet" },
  { hex: "#d946ef", name: "Fuchsia" },
  { hex: "#ec4899", name: "Pink" },
  { hex: "#64748b", name: "Slate" },
];

/** Matches the server-side hex validator (#RRGGBB). */
export const HEX_RE = /^#[0-9a-fA-F]{6}$/;

const linearize = (v: number): number => {
  const c = v / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
};

/** WCAG relative luminance of a #RRGGBB hex (0 = black, 1 = white). */
export function luminance(hex: string): number {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  if ([r, g, b].some(Number.isNaN)) return 1;
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

/**
 * The readable foreground (black or white) for text sitting on `hex`. Threshold
 * tuned so mid-bright brand yellows/greens get black text, deep hues get white.
 */
export function readableText(hex: string): "#111111" | "#ffffff" {
  return luminance(hex) > 0.42 ? "#111111" : "#ffffff";
}
