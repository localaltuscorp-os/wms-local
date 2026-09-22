import { describe, it, expect } from "vitest";
import {
  TASK_STATUSES,
  USER_TASK_STATUSES,
  PENDING_STATUSES,
  APPROVAL_STATUSES,
  DOER_TASK_STATUSES,
  isDeprecatedStatus,
} from "@/db/enums";
import {
  INITIATOR_STATUSES,
  effectiveInitiatorStatus,
  isDoerStatus,
} from "@/lib/status/axes";

/**
 * ON HOLD CHANGED AXIS on 2026-09-14 (migration 0225).
 *
 * This file used to assert the opposite of most of what it asserts now — that
 * on_hold was user-selectable and counted as pending. It was, and those were
 * the right assertions for a world where the doer picker and the initiator
 * verdicts were one list. Manan split them: a hold is a RULING about the work,
 * not a report on it, so it moved to the initiator axis.
 *
 * The tests are inverted rather than deleted deliberately. "on_hold is not a
 * doer status" is a live rule that a future refactor could quietly undo by
 * re-adding it to one list, and an inverted test catches that where a deleted
 * one would not.
 */
describe("on_hold — an initiator verdict, not a doer status", () => {
  it("is still a physical task_status value, so pre-0225 rows render", () => {
    expect((TASK_STATUSES as readonly string[]).includes("on_hold")).toBe(true);
  });

  it("is retired from the doer axis", () => {
    expect(isDeprecatedStatus("on_hold")).toBe(true);
    expect(isDoerStatus("on_hold")).toBe(false);
    expect((DOER_TASK_STATUSES as readonly string[]).includes("on_hold")).toBe(false);
    expect((USER_TASK_STATUSES as readonly string[]).includes("on_hold")).toBe(false);
  });

  it("no longer counts as pending — a hold is answered by the initiator axis", () => {
    expect((PENDING_STATUSES as readonly string[]).includes("on_hold")).toBe(false);
  });

  it("is an initiator verdict, and a storable one", () => {
    expect((INITIATOR_STATUSES as readonly string[]).includes("on_hold")).toBe(true);
    expect((APPROVAL_STATUSES as readonly string[]).includes("on_hold")).toBe(true);
  });

  it("reads back off a row as On Hold", () => {
    expect(effectiveInitiatorStatus("on_hold", false)).toBe("on_hold");
  });

  it("is outranked by the archive flag, like every other verdict", () => {
    expect(effectiveInitiatorStatus("on_hold", true)).toBe("archived");
  });
});
