/**
 * Pure helpers for the weekly-goal weight model. Weights are each goal's SHARE
 * of the week and must sum to exactly 100 per (employee, week). Client-safe.
 */

/** Even-split 100 across `count` goals; remainder goes to the earliest goals. */
export function evenSplit(count: number): number[] {
  if (count <= 0) return [];
  const base = Math.floor(100 / count);
  const rem = 100 - base * count;
  return Array.from({ length: count }, (_, i) => base + (i < rem ? 1 : 0));
}

export function weightsSum(weights: Array<number | null | undefined>): number {
  return weights.reduce<number>((a, b) => a + (Number(b) || 0), 0);
}

export function weightsSumTo100(weights: Array<number | null | undefined>): boolean {
  return weights.length > 0 && weightsSum(weights) === 100;
}
