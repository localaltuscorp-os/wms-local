/**
 * Profile v2 — appearance application.
 *
 * The user's accent preference is stored as a 6-digit hex. To make it
 * actually re-tint the UI, we map it onto the brand accent CSS variables
 * the whole app already consumes (`--color-altus-red*` and the `--vp-cyan*`
 * RGB-triplet family used by nav pills, hover rails, focus glows). Setting
 * these on <html> (server-rendered) cascades everywhere.
 *
 * For the default Altus red (#E10600) this reproduces the exact values
 * hard-coded in globals.css, so default users see no change.
 */

const DEEP_FACTOR = 0.747; // 225*0.747 ≈ 168  → #E10600 deep ≈ #A80400

function clampByte(n: number): number {
  return Math.max(0, Math.min(255, Math.round(n)));
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!m || !m[1]) return null;
  const int = parseInt(m[1], 16);
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => clampByte(n).toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

/**
 * Build the CSS custom-property overrides for a given accent hex.
 * Returns an empty object for an invalid hex (caller keeps defaults).
 * Keys are CSS variable names; values are strings — usable both as a
 * React inline `style` object and via `element.style.setProperty`.
 */
export function accentVars(hex: string): Record<string, string> {
  const rgb = hexToRgb(hex);
  if (!rgb) return {};
  const { r, g, b } = rgb;
  const dr = clampByte(r * DEEP_FACTOR);
  const dg = clampByte(g * DEEP_FACTOR);
  const db = clampByte(b * DEEP_FACTOR);
  const normalized = rgbToHex(r, g, b);
  // ── TONAL STOPS (2026-08) ─────────────────────────────────────────────────
  // This runs on EVERY request and lands inline on <html>, so it beats
  // globals.css and MUST mirror it exactly. --color-altus-red stays the user's
  // real accent because it paints ACTIONS (buttons, CTA gradients) that carry
  // white text; the pastel tint is exposed separately as --color-altus-red-soft
  // for soft fills. Derived from the stored seed, so no DB migration.
  const mixWhite = (c: number, pct: number) => clampByte(c * pct + 255 * (1 - pct));
  const container = rgbToHex(mixWhite(r, 0.22), mixWhite(g, 0.22), mixWhite(b, 0.22));
  const deep = rgbToHex(dr, dg, db);
  // Edge sits between the ink and the container — ≥3:1 on white for borders/dots.
  const mix2 = (a: number, bb: number, pct: number) => clampByte(a * pct + bb * (1 - pct));
  const er = mix2(dr, mixWhite(r, 0.22), 0.45);
  const eg = mix2(dg, mixWhite(g, 0.22), 0.45);
  const eb = mix2(db, mixWhite(b, 0.22), 0.45);
  const edge = rgbToHex(er, eg, eb);
  return {
    "--user-accent": normalized,
    // The raw seed stays reachable for anything that genuinely needs full chroma.
    "--color-altus-red-seed": normalized,
    "--color-altus-red": normalized,
    "--color-altus-red-soft": container,
    "--color-altus-red-deep": deep,
    "--color-altus-red-edge": edge,
    "--color-altus-red-wash": rgbToHex(mixWhite(r, 0.06), mixWhite(g, 0.06), mixWhite(b, 0.06)),
    // The --vp-* family paints nav pills / hover rails / focus glows.
    "--vp-cyan": `${r} ${g} ${b}`,
    "--vp-cyan-deep": `${dr} ${dg} ${db}`,
    "--vp-cyan-glow": `rgba(${r}, ${g}, ${b}, 0.25)`,
    "--vp-cyan-tint": `rgba(${r}, ${g}, ${b}, 0.08)`,
  };
}

/** The default Altus-red accent, used when the user hasn't set one. */
export const DEFAULT_ACCENT = "#E10600";

/** Normalises a stored value to a valid accent hex (falls back to default). */
export function resolveAccent(value: string | null | undefined): string {
  return value && /^#[0-9a-fA-F]{6}$/.test(value) ? value : DEFAULT_ACCENT;
}
