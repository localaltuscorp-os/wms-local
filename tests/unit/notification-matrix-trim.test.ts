import { describe, it, expect } from "vitest";
import { resolveChannels } from "@/lib/notifications/resolve-channels";
import type { NotificationMatrix } from "@/lib/notifications/resolve-channels";

// The agreed trimmed matrix (mirrors db/migrations/0044). Email is kept only
// for task_assigned and the daily overdue_digest; everything else is inbox-only.
const TRIMMED: NotificationMatrix = {
  task_assigned: ["email"],
  task_initiated: [],
  status_changed: [],
  approved: [],
  declined: [],
  reassigned: [],
  transferred: [],
  cancelled: [],
  commented: [],
  overdue_digest: ["email"],
};

describe("trimmed notification matrix", () => {
  it("keeps email for task_assigned (email only — no push/slack/whatsapp)", () => {
    expect(resolveChannels("task_assigned", TRIMMED)).toEqual(["email"]);
  });

  it("keeps email for the daily overdue_digest", () => {
    expect(resolveChannels("overdue_digest", TRIMMED)).toEqual(["email"]);
  });

  it("makes status_changed inbox-only (no outbound channels)", () => {
    expect(resolveChannels("status_changed", TRIMMED)).toEqual([]);
  });

  it("makes commented inbox-only", () => {
    expect(resolveChannels("commented", TRIMMED)).toEqual([]);
  });

  it("makes every other task event inbox-only", () => {
    for (const k of [
      "task_initiated",
      "approved",
      "declined",
      "reassigned",
      "transferred",
      "cancelled",
    ] as const) {
      expect(resolveChannels(k, TRIMMED)).toEqual([]);
    }
  });
});
