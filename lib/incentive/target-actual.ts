import { nameKey } from "@/lib/incentive/payout-sources";

export function actualForTargetPeriod(
  actualByPeriod: ReadonlyMap<string, ReadonlyMap<string, number>>,
  periodStart: string,
  periodEnd: string,
  subjectKey: string,
  productName: string,
): number {
  return (
    actualByPeriod
      .get(`${periodStart}|${periodEnd}`)
      ?.get(`${subjectKey}|${nameKey(productName)}`) ?? 0
  );
}
