/**
 * Per-device display scaling (design: "fit the UI to the screen").
 *
 * Stored in localStorage, NOT the DB, on purpose: the right scale is a property
 * of the SCREEN the user is on (a 55" monitor vs a 13" laptop vs a phone), not
 * their account — so it must not sync across devices. `auto` measures the
 * viewport and scales the whole UI up on big displays / keeps it comfortable on
 * small ones; the manual presets let a user override per device.
 *
 * Applied via CSS `zoom` on <html> (see DisplayScaleProvider + the no-flash
 * script in app/layout.tsx). `zoom` scales px AND rem uniformly — important
 * here because the app mixes Tailwind rem classes with many inline-px styles,
 * so rem-only font scaling would scale things inconsistently.
 */

export const DISPLAY_SCALE_KEY = "altus.displayScale";
export const DISPLAY_SCALE_EVENT = "altus:displayscale";

export type DisplayScaleMode = "auto" | "smaller" | "default" | "larger" | "largest";

export const DISPLAY_SCALE_OPTIONS: { value: DisplayScaleMode; label: string; hint: string }[] = [
  { value: "auto", label: "Auto-fit", hint: "Scales to your screen" },
  { value: "smaller", label: "Smaller", hint: "90%" },
  { value: "default", label: "Default", hint: "100%" },
  { value: "larger", label: "Larger", hint: "115%" },
  { value: "largest", label: "Largest", hint: "130%" },
];

const MANUAL_FACTORS: Record<Exclude<DisplayScaleMode, "auto">, number> = {
  smaller: 0.9,
  default: 1.0,
  larger: 1.15,
  largest: 1.3,
};

// Auto-fit: scale up wider viewports so large monitors fill out, but cap it so
// the *effective* layout width (zoom shrinks it) never drops a desktop
// breakpoint into the mobile layout. Reference 1440px renders at 1.0×.
const AUTO_REFERENCE_WIDTH = 1440;
const AUTO_MIN = 1.0;
const AUTO_MAX = 1.35;

/** The zoom factor for a mode at a given viewport width. */
export function computeFactor(mode: DisplayScaleMode, viewportWidth: number): number {
  if (mode !== "auto") return MANUAL_FACTORS[mode] ?? 1.0;
  const raw = viewportWidth / AUTO_REFERENCE_WIDTH;
  const clamped = Math.min(AUTO_MAX, Math.max(AUTO_MIN, raw));
  return Math.round(clamped * 100) / 100;
}

/** Read the saved mode (defaults to auto). Safe on the server (returns auto). */
export function readScaleMode(): DisplayScaleMode {
  if (typeof localStorage === "undefined") return "auto";
  const v = localStorage.getItem(DISPLAY_SCALE_KEY);
  if (v === "auto" || v === "smaller" || v === "default" || v === "larger" || v === "largest") {
    return v;
  }
  return "auto";
}
