import type { IncentiveStatus } from "@/db/enums";
import type { IncentiveGrade } from "@/lib/incentive/analytics/grading";

/**
 * INCENTIVE COLOUR — one map, expressed in design tokens.
 *
 * Every incentive surface used to carry its own literal hexes (`#16a34a`,
 * `#d97706`, `#E10600`…), which meant four screens could disagree about what
 * "Approved" looks like and none of them followed the employee's own accent
 * (`lib/appearance.ts` rewrites the `--color-altus-red*` family per request, so
 * a literal red opts that pixel out of the user's theme).
 *
 * A tone is a FAMILY NAME from the design system's status ramp, not a colour.
 * `toneFill` / `toneInk` resolve it, and every badge, chip, bar and figure in
 * the module reads from here — so the ramp is changed in one place.
 *
 * The meanings are unchanged from what the module already showed:
 *   green  approved / accrued / paid        amber  waiting / booked
 *   red    not approved / reversed / unpaid blue   due
 *   slate  not due / neutral                teal   settled with Accounts
 */
export type Tone = "green" | "amber" | "red" | "blue" | "slate" | "teal";

/** The container fill — always a tint, never a saturated block. */
export function toneFill(tone: Tone, pct = 14): string {
  return `color-mix(in srgb, ${toneBase(tone)} ${pct}%, transparent)`;
}

/** Ink on that fill — the `-deep` stop, per the design language's rule 1. */
export function toneInk(tone: Tone): string {
  return tone === "red" ? "var(--color-altus-red-deep)" : `var(--color-${tone}-deep)`;
}

/** The solid stop, for progress bars and dots. */
export function toneBase(tone: Tone): string {
  return tone === "red" ? "var(--color-altus-red)" : `var(--color-${tone})`;
}

/** Request workflow states. Same pairings the status pill has always used. */
export const STATUS_TONE: Record<IncentiveStatus, Tone> = {
  pending: "amber",
  approved: "green",
  rejected: "red",
  due: "blue",
  not_due: "slate",
  reversed: "red",
  revision_requested: "amber",
};

/** Dashboard status-summary keys (a superset of the workflow states). */
export const SUMMARY_TONE: Record<string, Tone> = {
  not_approved: "red",
  approved: "green",
  due: "blue",
  not_due: "slate",
  paid: "teal",
  unpaid: "red",
};

/** Booked / Accrued / Paid — client-payment progress, not a workflow state. */
export const PAYMENT_TONE = {
  booked: "amber",
  accrued: "green",
  paid: "teal",
} as const satisfies Record<string, Tone>;

/** Grades. Unchanged semantics: A best … D lowest, null = not graded. */
export const GRADE_TONE: Record<IncentiveGrade, Tone> = {
  A: "green",
  B: "blue",
  C: "amber",
  D: "red",
};

/**
 * Attainment colouring — the thresholds the module already used everywhere
 * (≥100 green · ≥60 amber · below red · unknown slate), in one place so the
 * targets table, the KPI row and the status report cannot drift apart.
 */
export function attainmentTone(pct: number | null | undefined): Tone {
  if (pct == null || !Number.isFinite(pct)) return "slate";
  if (pct >= 100) return "green";
  if (pct >= 60) return "amber";
  return "red";
}
