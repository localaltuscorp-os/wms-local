import { MONTH_SHORT, weeksOfMonth, type WeekOfMonth } from "@/lib/accounts/weekly";

/** The shared status set and colours used by the Accounts checklists. */
export { WEEKLY_CHECK_STATUSES as COMPLIANCE_PERIOD_STATUSES, weeklyStatusTone as compliancePeriodTone } from "@/lib/accounts/weekly";

export type CompliancePeriodKind = "wcc" | "mcc";

export type CompliancePeriodColumn = {
  key: string;
  label: string;
  detail: string;
  periodYear: number;
  periodMonth: number;
  weekNo: number;
  current: boolean;
};

/** The five calendar week buckets used by Accounts: 1–7 … 29–end. */
export function wccPeriodColumns(today: string): CompliancePeriodColumn[] {
  const year = Number(today.slice(0, 4));
  const month = Number(today.slice(5, 7));
  const currentWeek = Math.min(5, Math.floor((Number(today.slice(8, 10)) - 1) / 7) + 1);
  return weeksOfMonth(year, month).map((week: WeekOfMonth) => ({
    key: `wcc:${year}:${month}:${week.weekNo}`,
    label: `WK${week.weekNo}`,
    detail: week.label,
    periodYear: year,
    periodMonth: month,
    weekNo: week.weekNo,
    current: week.weekNo === currentWeek,
  }));
}

/** The Apr–Mar financial-year columns used by the Accounts monthly checklist. */
export function mccPeriodColumns(today: string): CompliancePeriodColumn[] {
  const year = Number(today.slice(0, 4));
  const currentMonth = Number(today.slice(5, 7));
  const fyStart = currentMonth >= 4 ? year : year - 1;
  return Array.from({ length: 12 }, (_, index) => {
    const month = ((index + 3) % 12) + 1;
    const monthYear = month >= 4 ? fyStart : fyStart + 1;
    return {
      key: `mcc:${fyStart}:${month}`,
      label: `${MONTH_SHORT[month - 1]?.toUpperCase()} '${String(monthYear).slice(-2)}`,
      detail: `${MONTH_SHORT[month - 1]} ${monthYear}`,
      periodYear: fyStart,
      periodMonth: month,
      weekNo: 0,
      current: month === currentMonth,
    };
  });
}

export function compliancePeriodKey(itemId: string, period: Pick<CompliancePeriodColumn, "periodYear" | "periodMonth" | "weekNo">) {
  return `${itemId}:${period.periodYear}:${period.periodMonth}:${period.weekNo}`;
}
