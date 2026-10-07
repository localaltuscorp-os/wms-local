export type IncentiveTargetPeriod = "month" | "quarter" | "year";

/** Monthly target is 10% of monthly salary. Other periods scale this base. */
export function monthlyIncentiveTarget(monthlySalary: number): number {
  return Math.max(0, Number.isFinite(monthlySalary) ? monthlySalary : 0) * 0.1;
}

export function periodTargetBase(monthlySalary: number, period: IncentiveTargetPeriod): number {
  const months = period === "quarter" ? 3 : period === "year" ? 12 : 1;
  return monthlyIncentiveTarget(monthlySalary) * months;
}

/** Entered stretched target wins. Missing stretched target uses period base. */
export function effectiveIncentiveTarget(
  monthlySalary: number,
  period: IncentiveTargetPeriod,
  stretchedTarget?: number | null,
): number {
  return stretchedTarget != null && Number.isFinite(stretchedTarget) && stretchedTarget > 0
    ? stretchedTarget
    : periodTargetBase(monthlySalary, period);
}
