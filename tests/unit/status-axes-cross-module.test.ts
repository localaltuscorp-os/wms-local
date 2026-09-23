import { describe, it, expect } from "vitest";
import {
  DOER_STATUSES,
  DOER_STATUS_LABEL,
  INITIATOR_STATUSES,
  INITIATOR_STATUS_LABEL,
} from "@/lib/status/axes";
import {
  USER_TASK_STATUSES,
  ADMIN_TASK_STATUSES,
  DOER_TASK_STATUSES,
  isDeprecatedStatus,
} from "@/db/enums";
import {
  PLAN_WORKING_STATUSES,
  PLAN_RESTRICTED_STATUSES,
  PLAN_STATUS_LABEL,
  selectableStatuses,
} from "@/lib/project-plan/status";
import {
  DEFAULT_ADMIN_COLUMN_ORDER,
  USER_COLUMN_ORDER,
} from "@/lib/kanban-columns";
import { codeOf } from "../fixtures/source-code";

/**
 * ONE VOCABULARY, THREE MODULES.
 *
 * The reason this file exists: before 2026-09-14 each module owned its own
 * status list, and they drifted — `on_hold` was a doer value in Tasks and an
 * initiator value in Projects, and Goals had no initiator axis at all. Nothing
 * caught it, because nothing ever compared the lists.
 *
 * These tests compare the lists. A module that quietly grows its own copy, or
 * adds a value to one axis in one place, fails here.
 */

const DOER_LABELS = [
  "Not Read",
  "Not Started",
  "Initiated",
  "Follow Up",
  "Need Info",
  "Done",
  "Abandoned",
];
const INITIATOR_LABELS = ["Approved", "Not Approved", "On Hold", "Archived"];

describe("Tasks speaks the shared vocabulary", () => {
  it("offers the seven doer statuses in its picker", () => {
    expect(DOER_TASK_STATUSES.map((s) => DOER_STATUS_LABEL[s])).toEqual(DOER_LABELS);
  });

  it("uses the same seven for its filters, columns and importers", () => {
    expect([...USER_TASK_STATUSES]).toEqual([...DOER_STATUSES]);
  });

  it("keeps every doer status as a column on the doer board", () => {
    for (const s of DOER_STATUSES) {
      expect(DEFAULT_ADMIN_COLUMN_ORDER).toContain(s);
      expect(USER_COLUMN_ORDER).toContain(s);
    }
  });

  it("keeps On Hold OFF the doer board — it is an initiator column now", () => {
    expect(DEFAULT_ADMIN_COLUMN_ORDER).not.toContain("on_hold");
    expect(USER_COLUMN_ORDER).not.toContain("on_hold");
  });

  it("never offers a deprecated status to an admin either", () => {
    expect(ADMIN_TASK_STATUSES.filter(isDeprecatedStatus)).toEqual([]);
  });
});

describe("Projects speaks the shared vocabulary", () => {
  it("reuses the doer axis rather than redeclaring it", () => {
    expect([...PLAN_WORKING_STATUSES]).toEqual([...DOER_STATUSES]);
  });

  it("labels every value the same way the other modules do", () => {
    for (const s of DOER_STATUSES) {
      expect(PLAN_STATUS_LABEL[s]).toBe(DOER_STATUS_LABEL[s]);
    }
    for (const s of INITIATOR_STATUSES) {
      expect(PLAN_STATUS_LABEL[s]).toBe(INITIATOR_STATUS_LABEL[s]);
    }
  });
});

describe("the labels themselves", () => {
  it("are exactly the two lists Manan asked for", () => {
    expect(DOER_STATUSES.map((s) => DOER_STATUS_LABEL[s])).toEqual(DOER_LABELS);
    expect(INITIATOR_STATUSES.map((s) => INITIATOR_STATUS_LABEL[s])).toEqual(
      INITIATOR_LABELS,
    );
  });
});
