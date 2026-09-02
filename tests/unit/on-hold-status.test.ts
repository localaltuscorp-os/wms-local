import { describe, it, expect } from "vitest";
import { TASK_STATUSES, USER_TASK_STATUSES, PENDING_STATUSES } from "@/db/enums";

describe("on_hold status", () => {
  it("is a registered task status", () => {
    expect((TASK_STATUSES as readonly string[]).includes("on_hold")).toBe(true);
  });
  it("is user-selectable", () => {
    expect((USER_TASK_STATUSES as readonly string[]).includes("on_hold")).toBe(true);
  });
  it("counts as pending", () => {
    expect((PENDING_STATUSES as readonly string[]).includes("on_hold")).toBe(true);
  });
});
