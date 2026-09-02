import { describe, it, expect } from "vitest";
import { buildSlackBlocks } from "@/lib/slack/templates";

const baseCtx = {
  actorName: "Apeksha",
  taskSubject: "KYC for loan 4471",
  body: "due Tue",
  shortId: "abc1234567",
};

describe("buildSlackBlocks", () => {
  it("emits 3 top-level blocks for task_assigned", () => {
    const blocks = buildSlackBlocks("task_assigned", baseCtx);
    expect(blocks).toHaveLength(3);
    expect((blocks[0] as { type: string }).type).toBe("context");
    expect((blocks[1] as { type: string }).type).toBe("section");
    expect((blocks[2] as { type: string }).type).toBe("actions");
  });

  it("uses kind-appropriate emoji in the context block", () => {
    const blocks = buildSlackBlocks("approved", baseCtx);
    const context = blocks[0] as {
      elements: Array<{ text: string }>;
    };
    expect(context.elements[0]!.text).toContain(":white_check_mark:");
  });

  it("includes a short-link button on every kind", () => {
    const kinds = [
      "task_assigned",
      "task_initiated",
      "status_changed",
      "approved",
      "declined",
      "reassigned",
      "transferred",
      "cancelled",
      "commented",
      "overdue_digest",
    ] as const;
    for (const k of kinds) {
      const blocks = buildSlackBlocks(k, baseCtx);
      const actions = blocks[blocks.length - 1] as {
        elements: Array<{ url: string }>;
      };
      expect(actions.elements[0]!.url).toContain("/t/abc1234567");
    }
  });
});
