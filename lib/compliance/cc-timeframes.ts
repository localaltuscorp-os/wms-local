import { addDays, formatDeadline, mondayOf, weekdayShort } from "@/lib/compliance/schedule";
import type {
  CompliancePeriodColumn,
  CompliancePeriodKind,
} from "@/lib/compliance/period-checks";

export const CC_TIMEFRAMES = [
  "daily",
  "weekly",
  "monthly",
  "quarterly",
  "half_yearly",
  "yearly",
  "consolidated",
] as const;

export type CcTimeframe = (typeof CC_TIMEFRAMES)[number];

export const CC_TIMEFRAME_LABEL: Record<CcTimeframe, string> = {
  daily: "Daily",
  weekly: "Weekly",
  monthly: "Monthly",
  quarterly: "Quarterly",
  half_yearly: "6-Months",
  yearly: "Yearly",
  consolidated: "Consolidated",
};

export function ccTimeframe(value: string | undefined): CcTimeframe {
  return CC_TIMEFRAMES.includes(value as CcTimeframe)
    ? (value as CcTimeframe)
    : "daily";
}

export function ccPeriodKind(view: CcTimeframe): CompliancePeriodKind {
  return view === "consolidated" ? "weekly" : view;
}

/** User-facing day picker label; dates themselves follow the app-wide DD-MMM-YYYY rule. */
export function ccDayLabel(date: string): string {
  return `${weekdayShort(date)} · ${formatDeadline(date)}`;
}

export function ccMonthKeys(year: number): string[] {
  return Array.from(
    { length: 12 },
    (_, index) => `${year}-${String(index + 1).padStart(2, "0")}`,
  );
}

const MONTHS = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];

/** The columns immediately following Mins in each CC timeframe. */
export function ccPeriodColumns(
  view: Exclude<CcTimeframe, "consolidated">,
  date: string,
  year: number,
): CompliancePeriodColumn[] {
  if (view === "daily") {
    const day = Number(date.slice(8, 10));
    return [
      {
        key: `daily:${date}`,
        label: weekdayShort(date).toUpperCase(),
        detail: formatDeadline(date),
        periodYear: Number(date.slice(0, 4)),
        periodMonth: Number(date.slice(5, 7)),
        weekNo: day,
        current: true,
      },
    ];
  }

  if (view === "weekly") {
    const start = mondayOf(date);
    return Array.from({ length: 7 }, (_, index) => {
      const day = addDays(start, index);
      return {
        key: `weekly:${start}:${index + 1}`,
        label: `WK-${index + 1}`,
        detail: `${weekdayShort(day)} ${day.slice(8, 10)}`,
        periodYear: Number(start.slice(0, 4)),
        periodMonth: Number(start.slice(5, 7)),
        weekNo: index + 1,
        current: day === date,
      };
    });
  }

  if (view === "monthly") {
    return MONTHS.map((label, index) => ({
      key: `monthly:${year}:${index + 1}`,
      label,
      detail: `${label} ${year}`,
      periodYear: year,
      periodMonth: index + 1,
      weekNo: 0,
      current:
        Number(date.slice(0, 4)) === year &&
        Number(date.slice(5, 7)) === index + 1,
    }));
  }

  if (view === "quarterly") {
    return [1, 2, 3, 4].map((quarter) => ({
      key: `quarterly:${year}:${quarter}`,
      label: `Q${quarter}`,
      detail: `Quarter ${quarter} · ${year}`,
      periodYear: year,
      periodMonth: quarter * 3,
      weekNo: quarter,
      current: Math.ceil(Number(date.slice(5, 7)) / 3) === quarter,
    }));
  }

  if (view === "half_yearly") {
    return [
      { label: "H1", month: 6, detail: `Jan–Jun ${year}` },
      { label: "H2", month: 12, detail: `Jul–Dec ${year}` },
    ].map((half, index) => ({
      key: `half:${year}:${index + 1}`,
      label: half.label,
      detail: half.detail,
      periodYear: year,
      periodMonth: half.month,
      weekNo: index + 1,
      current:
        (index === 0 && Number(date.slice(5, 7)) <= 6) ||
        (index === 1 && Number(date.slice(5, 7)) >= 7),
    }));
  }

  return [
    {
      key: `yearly:${year}`,
      label: "FULL YEAR",
      detail: String(year),
      periodYear: year,
      periodMonth: 12,
      weekNo: 0,
      current: Number(date.slice(0, 4)) === year,
    },
  ];
}
