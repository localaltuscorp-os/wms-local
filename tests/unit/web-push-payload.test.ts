import { describe, it, expect } from "vitest";
import { buildPushPayload } from "@/lib/web-push/payload";

describe("buildPushPayload", () => {
  it("returns title/body/url/tag/kind for task_assigned", () => {
    const p = buildPushPayload("task_assigned", {
      actorName: "Apeksha",
      taskSubject: "KYC 4471",
      body: "due Tue",
      shortId: "abc1234567",
      taskId: "uuid-1",
    });
    expect(p.title).toBe("Apeksha assigned you a task");
    expect(p.body).toContain("KYC 4471");
    expect(p.url).toBe("/tasks/uuid-1");
    expect(p.tag).toBe("task:uuid-1");
    expect(p.kind).toBe("task_assigned");
  });

  it("payload is JSON-stringifyable under 4KB", () => {
    const p = buildPushPayload("task_assigned", {
      actorName: "X",
      taskSubject: "Y".repeat(200),
      body: "Z".repeat(500),
      shortId: "abc1234567",
      taskId: "uuid",
    });
    expect(JSON.stringify(p).length).toBeLessThan(4096);
  });

  it("renders the right title verb per kind", () => {
    const ctx = {
      actorName: "Manan",
      taskSubject: "S",
      shortId: "s",
      taskId: "t",
    };
    expect(buildPushPayload("approved", ctx).title).toBe(
      "Manan approved your task",
    );
    expect(buildPushPayload("declined", ctx).title).toBe(
      "Manan declined your task",
    );
    expect(buildPushPayload("commented", ctx).title).toBe(
      "Manan commented on your task",
    );
    // overdue_digest ignores actor
    expect(buildPushPayload("overdue_digest", ctx).title).toBe(
      "You have overdue tasks",
    );
  });

  it("falls back to subject-only body when no body is provided", () => {
    const p = buildPushPayload("status_changed", {
      actorName: "A",
      taskSubject: "Just the subject",
      shortId: "x",
      taskId: "t",
    });
    expect(p.body).toBe("Just the subject");
  });
});
