import { describe, it, expect } from "vitest";
import {
  employeeEventCopy,
  settingsEventCopy,
  type ActivityRow,
} from "@/lib/transforms/activity";

function row(overrides: Partial<ActivityRow>): ActivityRow {
  return {
    id: "x",
    source: "employee",
    taskId: null,
    taskSubject: null,
    taskTitle: "",
    taskStatus: "not_started",
    targetEmployeeId: null,
    targetEmployeeName: null,
    settingScope: null,
    settingTargetId: null,
    actorId: "actor",
    actorName: "Manan",
    actorAvatarUrl: null,
    eventType: "unknown",
    fromValue: null,
    toValue: null,
    note: null,
    createdAt: new Date(),
    ...overrides,
  };
}

describe("employeeEventCopy", () => {
  it.each([
    ["invited",       "invited Jane"],
    ["invite_resent", "re-sent invite to Jane"],
    ["edited",        "edited Jane's profile"],
    ["deactivated",   "deactivated Jane"],
    ["reactivated",   "reactivated Jane"],
  ])("renders %s as '%s'", (eventType, expected) => {
    expect(
      employeeEventCopy(row({ source: "employee", eventType, targetEmployeeName: "Jane" })),
    ).toBe(expected);
  });

  it("falls back gracefully on unknown event type", () => {
    expect(
      employeeEventCopy(row({ source: "employee", eventType: "wild_card", targetEmployeeName: "Jane" })),
    ).toBe("wild card (Jane)");
  });

  it("uses 'an employee' when targetEmployeeName is null", () => {
    expect(
      employeeEventCopy(row({ source: "employee", eventType: "invited" })),
    ).toBe("invited an employee");
  });
});

describe("settingsEventCopy", () => {
  it.each([
    [{ scope: "org_settings", evt: "updated" },        "updated organisation settings"],
    [{ scope: "status_settings", evt: "updated" },     "updated status settings"],
    [{ scope: "notification_matrix", evt: "updated" }, "updated notification routing"],
    [{ scope: "department", evt: "created" },          "created a department"],
    [{ scope: "department", evt: "updated" },          "updated a department"],
    [{ scope: "department", evt: "deleted" },          "deleted a department"],
  ])("renders (scope=%s) as '%s'", ({ scope, evt }, expected) => {
    expect(
      settingsEventCopy(row({ source: "settings", settingScope: scope, eventType: evt })),
    ).toBe(expected);
  });

  it("disambiguates org_settings.updated → notification routing when toValue.notificationMatrix is present", () => {
    expect(
      settingsEventCopy(
        row({
          source: "settings",
          settingScope: "org_settings",
          eventType: "updated",
          toValue: { notificationMatrix: { invited: { email: true } } },
        }),
      ),
    ).toBe("updated notification routing");
  });

  it("falls back to '<evt> (<scope>)' for unknown pairs", () => {
    expect(
      settingsEventCopy(row({ source: "settings", settingScope: "wild_scope", eventType: "some_event" })),
    ).toBe("some event (wild scope)");
  });

  it("emits just event when scope is null", () => {
    expect(
      settingsEventCopy(row({ source: "settings", settingScope: null, eventType: "ad_hoc" })),
    ).toBe("ad hoc");
  });
});
