/**
 * HR LETTERS — self-hosted font library for the "Edit freely" rich editor.
 *
 * 54 curated Google-Fonts families, LATIN subset, self-hosted under
 * `public/letter-fonts/*.woff2` (downloaded once; ~3.7 MB total). Self-hosting
 * is deliberate: the letter PDF is printed by a MINIMAL headless Chromium
 * (@sparticuz/chromium on Vercel) that does NOT ship Arial / Calibri / Times,
 * so any system-font choice would silently fall back there. Every family here
 * is embedded into the PDF document (see render-rich.ts) AND served to the
 * browser editor (public/letter-fonts/letter-fonts.css), so what you pick in
 * the editor is EXACTLY what prints.
 *
 * This module is PURE DATA + pure helpers — no `node:fs` — so it is safe to
 * import from the client editor. The base64 inlining for the PDF lives in the
 * server-only render-rich.ts, driven by this same registry.
 */

export type LetterFontCategory = "serif" | "sans" | "mono" | "script" | "display";

export interface LetterFont {
  /** kebab id + filename stem (`<id>-<weight>.woff2`). */
  id: string;
  /** Exact @font-face family name (what gets stored inline in the letter). */
  family: string;
  /** CSS generic fallback appended to the stack. */
  generic: string;
  category: LetterFontCategory;
  /** Weights that were downloaded for this family. */
  weights: number[];
}

/** The self-hosted library. Keep in sync with public/letter-fonts/. */
export const LETTER_FONTS: readonly LetterFont[] = [
  { id: "merriweather", family: "Merriweather", generic: "serif", category: "serif", weights: [400, 700] },
  { id: "lora", family: "Lora", generic: "serif", category: "serif", weights: [400, 700] },
  { id: "pt-serif", family: "PT Serif", generic: "serif", category: "serif", weights: [400, 700] },
  { id: "source-serif", family: "Source Serif 4", generic: "serif", category: "serif", weights: [400, 700] },
  { id: "playfair-display", family: "Playfair Display", generic: "serif", category: "serif", weights: [400, 700] },
  { id: "eb-garamond", family: "EB Garamond", generic: "serif", category: "serif", weights: [400, 700] },
  { id: "cormorant", family: "Cormorant Garamond", generic: "serif", category: "serif", weights: [400, 700] },
  { id: "libre-baskerville", family: "Libre Baskerville", generic: "serif", category: "serif", weights: [400, 700] },
  { id: "crimson-text", family: "Crimson Text", generic: "serif", category: "serif", weights: [400, 700] },
  { id: "noto-serif", family: "Noto Serif", generic: "serif", category: "serif", weights: [400, 700] },
  { id: "bitter", family: "Bitter", generic: "serif", category: "serif", weights: [400, 700] },
  { id: "spectral", family: "Spectral", generic: "serif", category: "serif", weights: [400, 700] },
  { id: "roboto-slab", family: "Roboto Slab", generic: "serif", category: "serif", weights: [400, 700] },
  { id: "domine", family: "Domine", generic: "serif", category: "serif", weights: [400, 700] },
  { id: "cardo", family: "Cardo", generic: "serif", category: "serif", weights: [400, 700] },
  { id: "alegreya", family: "Alegreya", generic: "serif", category: "serif", weights: [400, 700] },
  { id: "vollkorn", family: "Vollkorn", generic: "serif", category: "serif", weights: [400, 700] },
  { id: "frank-ruhl", family: "Frank Ruhl Libre", generic: "serif", category: "serif", weights: [400, 700] },
  { id: "roboto", family: "Roboto", generic: "sans-serif", category: "sans", weights: [400, 700] },
  { id: "open-sans", family: "Open Sans", generic: "sans-serif", category: "sans", weights: [400, 700] },
  { id: "lato", family: "Lato", generic: "sans-serif", category: "sans", weights: [400, 700] },
  { id: "montserrat", family: "Montserrat", generic: "sans-serif", category: "sans", weights: [400, 700] },
  { id: "poppins", family: "Poppins", generic: "sans-serif", category: "sans", weights: [400, 700] },
  { id: "inter", family: "Inter", generic: "sans-serif", category: "sans", weights: [400, 700] },
  { id: "nunito", family: "Nunito", generic: "sans-serif", category: "sans", weights: [400, 700] },
  { id: "nunito-sans", family: "Nunito Sans", generic: "sans-serif", category: "sans", weights: [400, 700] },
  { id: "work-sans", family: "Work Sans", generic: "sans-serif", category: "sans", weights: [400, 700] },
  { id: "raleway", family: "Raleway", generic: "sans-serif", category: "sans", weights: [400, 700] },
  { id: "source-sans", family: "Source Sans 3", generic: "sans-serif", category: "sans", weights: [400, 700] },
  { id: "mulish", family: "Mulish", generic: "sans-serif", category: "sans", weights: [400, 700] },
  { id: "rubik", family: "Rubik", generic: "sans-serif", category: "sans", weights: [400, 700] },
  { id: "karla", family: "Karla", generic: "sans-serif", category: "sans", weights: [400, 700] },
  { id: "dm-sans", family: "DM Sans", generic: "sans-serif", category: "sans", weights: [400, 700] },
  { id: "manrope", family: "Manrope", generic: "sans-serif", category: "sans", weights: [400, 700] },
  { id: "josefin-sans", family: "Josefin Sans", generic: "sans-serif", category: "sans", weights: [400, 700] },
  { id: "barlow", family: "Barlow", generic: "sans-serif", category: "sans", weights: [400, 700] },
  { id: "fira-sans", family: "Fira Sans", generic: "sans-serif", category: "sans", weights: [400, 700] },
  { id: "pt-sans", family: "PT Sans", generic: "sans-serif", category: "sans", weights: [400, 700] },
  { id: "cabin", family: "Cabin", generic: "sans-serif", category: "sans", weights: [400, 700] },
  { id: "oswald", family: "Oswald", generic: "sans-serif", category: "sans", weights: [400, 700] },
  { id: "titillium", family: "Titillium Web", generic: "sans-serif", category: "sans", weights: [400, 700] },
  { id: "quicksand", family: "Quicksand", generic: "sans-serif", category: "sans", weights: [400, 700] },
  { id: "roboto-mono", family: "Roboto Mono", generic: "monospace", category: "mono", weights: [400, 700] },
  { id: "jetbrains-mono", family: "JetBrains Mono", generic: "monospace", category: "mono", weights: [400, 700] },
  { id: "source-code", family: "Source Code Pro", generic: "monospace", category: "mono", weights: [400, 700] },
  { id: "ibm-plex-mono", family: "IBM Plex Mono", generic: "monospace", category: "mono", weights: [400, 700] },
  { id: "space-mono", family: "Space Mono", generic: "monospace", category: "mono", weights: [400, 700] },
  { id: "inconsolata", family: "Inconsolata", generic: "monospace", category: "mono", weights: [400, 700] },
  { id: "dancing-script", family: "Dancing Script", generic: "cursive", category: "script", weights: [400, 700] },
  { id: "caveat", family: "Caveat", generic: "cursive", category: "script", weights: [400, 700] },
  { id: "pacifico", family: "Pacifico", generic: "cursive", category: "script", weights: [400] },
  { id: "lobster", family: "Lobster", generic: "cursive", category: "display", weights: [400] },
  { id: "comfortaa", family: "Comfortaa", generic: "cursive", category: "display", weights: [400, 700] },
  { id: "abril-fatface", family: "Abril Fatface", generic: "serif", category: "display", weights: [400] },
];

/** The CSS `font-family` value stored inline when a family is chosen. */
export function letterFontStack(f: Pick<LetterFont, "family" | "generic">): string {
  return `"${f.family}", ${f.generic}`;
}

/** Category display order + labels for the toolbar's grouped dropdown. */
export const LETTER_FONT_CATEGORY_LABEL: Record<LetterFontCategory, string> = {
  serif: "Serif",
  sans: "Sans-serif",
  mono: "Monospace",
  script: "Handwriting",
  display: "Display",
};

const CATEGORY_ORDER: LetterFontCategory[] = ["serif", "sans", "mono", "script", "display"];

/** Families grouped by category (for <optgroup>s), in a sensible order. */
export function letterFontGroups(): { label: string; fonts: LetterFont[] }[] {
  return CATEGORY_ORDER.map((cat) => ({
    label: LETTER_FONT_CATEGORY_LABEL[cat],
    fonts: LETTER_FONTS.filter((f) => f.category === cat),
  })).filter((g) => g.fonts.length > 0);
}

/**
 * Given arbitrary letter-body HTML, return the subset of library families whose
 * name actually appears in a `font-family` declaration — so the PDF only
 * embeds the fonts it needs. Matches on the bare family name (the inline value
 * is `"Family", generic`, so a substring match on the quoted name is enough).
 */
export function letterFontsUsedIn(html: string): LetterFont[] {
  if (!html) return [];
  return LETTER_FONTS.filter((f) => html.includes(f.family));
}
