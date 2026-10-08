import { describe, expect, it } from "vitest";
import { foldPunchSessions } from "@/lib/attendance/punch-pairs";

const at = (value: string) => new Date(value);

describe("attendance punch pairs", () => {
  it("adds every completed pair from the same day", () => {
    const days = foldPunchSessions([
      { kind: "in", loggedAt: at("2026-10-08T03:00:00Z") },
      { kind: "out", loggedAt: at("2026-10-08T06:00:00Z") },
      { kind: "in", loggedAt: at("2026-10-08T09:00:00Z") },
      { kind: "out", loggedAt: at("2026-10-08T13:00:00Z") },
      { kind: "in", loggedAt: at("2026-10-08T15:00:00Z") },
      { kind: "out", loggedAt: at("2026-10-08T16:30:00Z") },
    ], "UTC");

    expect(days.get("2026-10-08")).toMatchObject({ workedMinutes: 510, firstInAt: "03:00", lastOutAt: "16:30" });
  });

  it("splits an overnight pair exactly at the local midnight", () => {
    const days = foldPunchSessions([
      { kind: "in", loggedAt: at("2026-10-08T15:00:00Z") },
      { kind: "out", loggedAt: at("2026-10-08T18:00:00Z") },
      { kind: "in", loggedAt: at("2026-10-08T21:00:00Z") },
      { kind: "out", loggedAt: at("2026-10-09T02:00:00Z") },
    ], "UTC");

    // 3pm–6pm = 3h and 9pm–2am = 3h before midnight + 2h after midnight.
    expect(days.get("2026-10-08")?.workedMinutes).toBe(360);
    expect(days.get("2026-10-09")?.workedMinutes).toBe(120);
  });
});
