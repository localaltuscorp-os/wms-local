import { describe, it, expect } from "vitest";
import {
  KPI_BUCKET_KEYS,
  kpiBucketOf,
  inKpiBucket,
  isCountableTask,
  isOpenTask,
} from "@/lib/dashboard/kpi-buckets";
import { TASK_STATUSES } from "@/db/enums";

describe("kpiBucketOf", () => {
  it("puts every live status on exactly one card", () => {
    // The bug this guards: dont_know / on_hold / need_help / follow_up_1..3
    // matched no branch of the old classifier, so they were counted in TOTAL
    // and displayed on no card at all.
    const uncounted = TASK_STATUSES.filter(
      (status) => isCountableTask({ status }) && kpiBucketOf({ status }) === null,
    );
    expect(uncounted).toEqual([]);
  });

  it("lets the admin's approval verdict override the doer's status", () => {
    expect(kpiBucketOf({ status: "done", approvalStatus: "not_approved" })).toBe("notApproved");
    expect(kpiBucketOf({ status: "initiated", approvalStatus: "approved" })).toBe("done");
  });

  it("reads the legacy terminal statuses when there is no verdict column", () => {
    expect(kpiBucketOf({ status: "approved" })).toBe("done");
    expect(kpiBucketOf({ status: "not_approved" })).toBe("notApproved");
  });

  it("folds the retired need_help into Need Info", () => {
    expect(kpiBucketOf({ status: "need_help" })).toBe("needHelp");
    expect(kpiBucketOf({ status: "need_info" })).toBe("needHelp");
  });

  it("treats statuses with no card of their own as Pending", () => {
    for (const status of ["initiated", "follow_up", "follow_up_2", "on_hold", "dont_know"] as const) {
      expect(kpiBucketOf({ status })).toBe("pending");
    }
  });
});

describe("isCountableTask", () => {
  it("drops archived work", () => {
    expect(isCountableTask({ status: "done", archived: true })).toBe(false);
    expect(kpiBucketOf({ status: "done", archived: true })).toBeNull();
  });

  it("drops cancelled and transferred from either column", () => {
    expect(isCountableTask({ status: "cancelled" })).toBe(false);
    expect(isCountableTask({ status: "transferred" })).toBe(false);
    expect(isCountableTask({ status: "done", approvalStatus: "cancelled" })).toBe(false);
    expect(isCountableTask({ status: "done", approvalStatus: "transferred" })).toBe(false);
  });
});

describe("inKpiBucket", () => {
  it("matches every countable task under `total`", () => {
    expect(inKpiBucket({ status: "not_started" }, "total")).toBe(true);
    expect(inKpiBucket({ status: "cancelled" }, "total")).toBe(false);
  });

  it("partitions total across the other five", () => {
    const rows = TASK_STATUSES.map((status) => ({ status }));
    const total = rows.filter((t) => inKpiBucket(t, "total")).length;
    const parts = KPI_BUCKET_KEYS.filter((k) => k !== "total").reduce(
      (sum, key) => sum + rows.filter((t) => inKpiBucket(t, key)).length,
      0,
    );
    expect(parts).toBe(total);
  });
});

describe("isOpenTask", () => {
  it("counts sent-back work as open", () => {
    // The operational summary used to test PENDING_STATUSES, which excludes
    // not_approved — so the most overdue work on the board was missing from
    // the Overdue chip.
    expect(isOpenTask({ status: "not_approved" })).toBe(true);
    expect(isOpenTask({ status: "done", approvalStatus: "not_approved" })).toBe(true);
  });

  it("does not count delivered or excluded work", () => {
    expect(isOpenTask({ status: "done" })).toBe(false);
    expect(isOpenTask({ status: "initiated", approvalStatus: "approved" })).toBe(false);
    expect(isOpenTask({ status: "cancelled" })).toBe(false);
    expect(isOpenTask({ status: "initiated", archived: true })).toBe(false);
  });
});
