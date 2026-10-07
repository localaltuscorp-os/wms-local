import { INCENTIVE_FIELDS, type IncentiveField } from "@/lib/incentive-fields";

export const MAX_SPLIT_COLUMNS = 5;

export const splitEmployeeHeader = (n: number) => `Split ${n} Employee`;
export const splitPercentageHeader = (n: number) => `Split ${n} Percentage`;

export function requestFields(): IncentiveField[] {
  const seen = new Set<string>();
  return Object.values(INCENTIVE_FIELDS).flatMap((fields) => fields).filter((field) => {
    if (field.type === "static" || seen.has(field.key)) return false;
    seen.add(field.key);
    return true;
  });
}

export function bulkRequestHeaders(): string[] {
  return [
    "Employee",
    "Incentive Type",
    ...requestFields().map((field) => field.key),
    ...Array.from({ length: MAX_SPLIT_COLUMNS }, (_, i) => i + 1).flatMap((n) => [
      splitEmployeeHeader(n),
      splitPercentageHeader(n),
    ]),
  ];
}

export function bulkRequestFieldId(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}
