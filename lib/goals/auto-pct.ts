/**
 * Auto % Done from Actual / Target.
 *
 * Standard convention (Actual / Target, in that column order): progress is the
 * achieved value ÷ the goal — e.g. Actual 50 of Target 100 ⇒ 50%, 100 / 100 ⇒
 * 100%. Keeping it a pure function of the two numbers means the progress can't
 * drift, and it's shared by the web inline table, the cascade edit action, the
 * bulk import, and the mobile edit endpoint so every surface agrees.
 *
 * Returns null when it is NOT computable (no/zero Target to divide by, or no
 * Actual) — in that case the caller leaves % Done as a manually-entered value.
 */

function toNum(v: string | number | null | undefined): number {
  if (typeof v === "number") return v;
  if (v == null) return NaN;
  const s = String(v).trim();
  if (s === "") return NaN;
  return Number(s);
}

/** Computed % done (0–100, rounded) = Actual ÷ Target, or null when not drivable. */
export function autoPctDone(
  target: string | number | null | undefined,
  actual: string | number | null | undefined,
): number | null {
  const t = toNum(target);
  const a = toNum(actual);
  // Target is the denominator — it must be a positive number; Actual the numerator.
  if (!Number.isFinite(t) || t <= 0 || !Number.isFinite(a) || a < 0) return null;
  return Math.max(0, Math.min(100, Math.round((a / t) * 100)));
}

/** The goal status that matches a % done, mirroring setGoalPctDone. */
export function statusForPct(pct: number): "done" | "initiated" | "not_started" {
  return pct >= 100 ? "done" : pct > 0 ? "initiated" : "not_started";
}
