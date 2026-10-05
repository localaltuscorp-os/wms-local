import { describe, expect, it } from "vitest";
import { DOER_KPI_DROP_STATUS, doerKpiDropStatus } from "@/lib/tasks/kpi-drop";

describe("doer KPI task drops", () => {
  it("maps each writable KPI to its canonical task status", () => {
    expect(DOER_KPI_DROP_STATUS).toEqual({
      notRead: "dont_know",
      notStarted: "not_started",
      initiated: "initiated",
      followUp: "follow_up",
      needInfo: "need_info",
      done: "done",
      abandoned: "abandoned",
    });
  });

  it("refuses filter-only and initiator-only KPI keys", () => {
    expect(doerKpiDropStatus("total")).toBeNull();
    expect(doerKpiDropStatus("approved")).toBeNull();
  });
});
