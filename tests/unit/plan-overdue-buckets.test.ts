import { describe, expect, it } from "vitest";
import {
  DEFAULT_WMS_FILTER,
  OVERDUE_LABEL,
  OVERDUE_OPTIONS,
  applyWmsFilter,
  daysOverdue,
  isFilterActive,
  overdueBucket,
  overdueLabel,
  sortByAttention,
  type OverdueFilter,
} from "@/components/goals/plan/wms-filters";
import type { SourceItem } from "@/components/goals/plan/types";
import { formatDuration, taskTimeLabel } from "@/lib/goals/plan-time";

const TODAY = "2026-08-17";

function task(dueYmd: string | null, extra: Partial<SourceItem> = {}): SourceItem {
  return {
    id: `t-${dueYmd ?? "none"}-${extra.priority ?? "p"}`,
    kind: "task",
    title: "task",
    subtitle: null,
    meta: null,
    added: false,
    dueYmd,
    ...extra,
  };
}

describe("overdue buckets", () => {
  it("counts whole IST days late from ymd strings", () => {
    expect(daysOverdue("2026-08-17", TODAY)).toBe(0);
    expect(daysOverdue("2026-08-16", TODAY)).toBe(1);
    expect(daysOverdue("2026-08-18", TODAY)).toBe(-1);
    expect(daysOverdue(null, TODAY)).toBeNull();
  });

  it("places each task in exactly the bucket Sir specified", () => {
    const cases: [string | null, OverdueFilter][] = [
      ["2026-08-18", "not_due"], // tomorrow
      ["2026-09-30", "not_due"], // far future
      [null, "not_due"], // undated — nothing at risk yet
      ["2026-08-17", "today"],
      ["2026-08-16", "od_1_3"], // yesterday
      ["2026-08-14", "od_1_3"], // 3 days
      ["2026-08-13", "od_4_7"], // 4 days
      ["2026-08-10", "od_4_7"], // 7 days
      ["2026-08-09", "od_8_14"], // 8 days
      ["2026-08-03", "od_8_14"], // 14 days
      ["2026-08-02", "od_15_21"], // 15 days
      ["2026-07-27", "od_15_21"], // 21 days
      ["2026-07-26", "od_22_plus"], // 22 days
      ["2026-01-01", "od_22_plus"],
    ];
    for (const [due, bucket] of cases) {
      expect(overdueBucket(task(due), TODAY), `due ${due}`).toBe(bucket);
    }
  });

  it("covers every bucket in the dropdown, plus the unfiltered default", () => {
    expect(OVERDUE_OPTIONS).toContain("all");
    for (const key of Object.keys(OVERDUE_LABEL) as OverdueFilter[]) {
      expect(OVERDUE_OPTIONS).toContain(key);
    }
    // Rule 2's exact wording, so the UI can never drift from the spec.
    expect(OVERDUE_LABEL.not_due).toBe("Not Due");
    expect(OVERDUE_LABEL.today).toBe("Due Today");
    expect(OVERDUE_LABEL.od_22_plus).toBe("Overdue 22+ Days");
  });
});

describe("wms filtering", () => {
  const items = [
    task("2026-07-01", { priority: "not_imp_not_urgent" }), // 22+
    task("2026-08-16", { priority: "imp_urgent" }), // 1-3
    task("2026-08-17", { priority: "imp_urgent" }), // today
    task("2026-08-25", { priority: "imp_not_urgent" }), // not due
  ];

  it("defaults to showing everything", () => {
    expect(isFilterActive(DEFAULT_WMS_FILTER)).toBe(false);
    expect(applyWmsFilter(items, DEFAULT_WMS_FILTER, TODAY)).toHaveLength(4);
  });

  it("narrows to one bucket", () => {
    const got = applyWmsFilter(items, { overdue: "od_1_3", priority: "all" }, TODAY);
    expect(got.map((i) => i.dueYmd)).toEqual(["2026-08-16"]);
  });

  it("combines bucket and priority", () => {
    const got = applyWmsFilter(items, { overdue: "od_22_plus", priority: "imp_urgent" }, TODAY);
    expect(got).toHaveLength(0);
  });

  it("leads with the OLDEST overdue work, not the highest priority", () => {
    const ordered = sortByAttention(items, TODAY).map((i) => i.dueYmd);
    expect(ordered).toEqual(["2026-07-01", "2026-08-16", "2026-08-17", "2026-08-25"]);
  });

  it("labels how late a task is, and says nothing when it isn't", () => {
    expect(overdueLabel("2026-08-16", TODAY)).toBe("1 day overdue");
    expect(overdueLabel("2026-08-05", TODAY)).toBe("12 days overdue");
    expect(overdueLabel("2026-08-17", TODAY)).toBeNull();
    expect(overdueLabel(null, TODAY)).toBeNull();
  });
});

describe("task time labels", () => {
  it("formats durations the way rule 15 asks", () => {
    expect(formatDuration(30)).toBe("30 min");
    expect(formatDuration(60)).toBe("1 hr");
    expect(formatDuration(90)).toBe("1 hr 30 min");
  });

  it("prefers a real scheduled block, in IST", () => {
    // 11:00 UTC = 16:30 IST, 12:00 UTC = 17:30 IST.
    const label = taskTimeLabel({
      startsAt: new Date("2026-08-17T11:00:00Z"),
      endsAt: new Date("2026-08-17T12:00:00Z"),
      allDay: false,
      estimatedMinutes: 45,
    });
    expect(label).toBe("4:30 PM – 5:30 PM");
  });

  it("falls back to planned effort, and invents nothing", () => {
    expect(taskTimeLabel({ estimatedMinutes: 45 })).toBe("45 min");
    expect(taskTimeLabel({ startsAt: new Date("2026-08-17T11:00:00Z"), allDay: true })).toBeNull();
    expect(taskTimeLabel({})).toBeNull();
    expect(taskTimeLabel(null)).toBeNull();
  });
});
