/**
 * tokens.ts — the Goals design contract (Elevation Blueprint §2.0, Wave 1).
 *
 * SINGLE source of truth for the canvas's visual system: the amber accent +
 * alpha ramp, the motion contract, the 6-step type scale, and the semantic
 * colors. Before this file, `accentMix`/`ACCENT`/`SPRING` were copy-pasted
 * into ~8 sibling files with freehand alpha stops (4, 5, 6, 8, 10, 14, 22,
 * 35, 40, 45, 55…) — every consumer now imports from HERE and nowhere else.
 *
 * Brand laws: the `--module-accent` identity (now the Altus brand RED — every
 * in-module accent is red; only the Hub cards keep per-module colours) is the
 * ONLY accent in components/goals/canvas/**. No CSS zoom/transform on
 * ancestor wrappers (Radix-portal law). Motion is reduced-motion-gated at
 * every call-site.
 */

import { GOALS_ACCENT, GOALS_ACCENT_DEEP } from "@/components/goals/cascade/util";

/* ------------------------------------------------------------------ */
/* Accent — Altus red identity, var-first so the wrapper re-skin wins  */
/* ------------------------------------------------------------------ */

export const ACCENT = `var(--module-accent, ${GOALS_ACCENT})`;
export const ACCENT_DEEP = `var(--module-accent-deep, ${GOALS_ACCENT_DEEP})`;

/** The one amber alpha ramp. Every translucent amber in the canvas goes
 *  through this — never a freehand `color-mix(... #b45309 ...)`. */
export const accentMix = (pct: number) =>
  `color-mix(in srgb, var(--module-accent, ${GOALS_ACCENT}) ${pct}%, transparent)`;

/** The 5 sanctioned ramp stops (§2.0) — washes → fills → active fills →
 *  strong borders/focus → selection rings. Freehand stops map mechanically:
 *  4–6→wash, 8–14→fill, 18–22→active, 35–45→strong, 55→selection. These are
 *  also published as `--goals-tint-1..5` on the canvas wrapper. */
export const TINT = {
  wash: 5,
  fill: 10,
  active: 18,
  strong: 40,
  selection: 55,
} as const;

/* ------------------------------------------------------------------ */
/* Motion contract                                                     */
/* ------------------------------------------------------------------ */

/** House spring — reserved for shared-element `layoutId` morphs and FLIP
 *  reorders. One narrated motion per user action (choreography law §2.0). */
export const SPRING = { type: "spring", stiffness: 380, damping: 34 } as const;
/** Alias per the blueprint's naming — the layout-morph spring IS the house
 *  spring; there is deliberately no second spring. */
export const SPRING_LAYOUT = SPRING;

/** Standard deceleration ease for tweened transitions. */
export const EASE_OUT = [0.22, 1, 0.36, 1] as const;

/** Duration ladder (seconds): hover/press → state swaps → panel entrances. */
export const DUR = { micro: 0.15, state: 0.2, panel: 0.32 } as const;

/** Entrance stagger: 55ms × index, capped at 8 rows. */
export const STAGGER_S = 0.055;
export const STAGGER_CAP = 8;

/* ------------------------------------------------------------------ */
/* Type scale — 6 steps, 11px floor                                    */
/* ------------------------------------------------------------------ */

/**
 * "Readability is non-negotiable — default bigger type." Nothing in the
 * canvas renders below 11px; every legacy 9/9.5/10/10.5px promotes to
 * `micro`. Weight law: max ONE 900-weight element per component (the
 * display hero or the stat figure); chips cap at 700; hints/body at 500.
 *
 * Tailwind class fragments — compose with color/tracking utilities.
 */
export const TYPE = {
  /** Panel hero — the one 900 allowed per panel (Fraunces via --font-serif). */
  display: "text-[24px] font-black tracking-[-0.02em]",
  /** Card titles. */
  title: "text-[15px] font-bold",
  /** Notes, sentences, sub-lines. */
  body: "text-[13.5px] font-medium",
  /** Section headers — small caps voice. */
  label: "text-[12px] font-bold uppercase tracking-[0.06em]",
  /** KPI bigs / panel % — the other sanctioned 900. */
  stat: "text-[28px] font-black tabular-nums",
  /** Chips, codes — THE FLOOR. Pair with font-bold, never font-black. */
  micro: "text-[11px]",
} as const;

/* ------------------------------------------------------------------ */
/* Semantic colors — named, never inline hexes                         */
/* ------------------------------------------------------------------ */

export const SEM_GREEN = "#15803d"; // on-track / done
export const SEM_RISK = "#b91c1c"; //  at-risk / over-allocated — the ONLY red
export const SEM_ORIGIN = "#1e3a8a"; // origin blue (cascaded-from marker)

/* ------------------------------------------------------------------ */
/* Scoped CSS vars — spread into the canvas wrapper (goals-canvas.tsx) */
/* ------------------------------------------------------------------ */

/** `--goals-tint-1..5` so plain CSS/arbitrary-value classNames can hit the
 *  ramp without re-deriving the mix. Published once, on the wrapper. */
export const GOALS_TINT_VARS: Record<string, string> = {
  "--goals-tint-1": accentMix(TINT.wash),
  "--goals-tint-2": accentMix(TINT.fill),
  "--goals-tint-3": accentMix(TINT.active),
  "--goals-tint-4": accentMix(TINT.strong),
  "--goals-tint-5": accentMix(TINT.selection),
};
