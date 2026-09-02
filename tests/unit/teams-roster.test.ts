import { describe, expect, it } from "vitest";
import { TEAM_ROSTER, teamLabel, teamOption } from "@/lib/teams/roster";

describe("team roster", () => {
  it("is exactly T1..T6, in order", () => {
    expect(TEAM_ROSTER.map((t) => t.value)).toEqual(["t1", "t2", "t3", "t4", "t5", "t6"]);
    expect(TEAM_ROSTER.map((t) => t.label)).toEqual([
      "T1 — Manan Vasa",
      "T2 — Ruchita Ambre",
      "T3 — Jeevan Bharambe",
      "T4 — Rutvisha Mehta",
      "T5 — Rohan Choudhary",
      "T6 — Mitul Mehta",
    ]);
  });

  it("keys every team by a distinct manager email", () => {
    const emails = TEAM_ROSTER.map((t) => t.managerEmail.toLowerCase());
    expect(new Set(emails).size).toBe(emails.length);
    for (const e of emails) expect(e).toContain("@");
  });

  it("looks a team up case-insensitively and trims", () => {
    expect(teamOption("T3")?.managerEmail).toBe("jeevanbharambe.altuscorp@gmail.com");
    expect(teamOption("  t3 ")?.value).toBe("t3");
  });

  it("returns undefined for a value that is not a team", () => {
    expect(teamOption("mine")).toBeUndefined();
    expect(teamOption("Sales")).toBeUndefined();
  });

  /**
   * A bookmark saved before the T1..T6 switch still carries `?team=Sales` or
   * `?team=mine`. The chip has to stay removable, so the label falls back to
   * the raw value rather than rendering blank.
   */
  it("falls back to the raw value for retired options", () => {
    expect(teamLabel("t1")).toBe("T1 — Manan Vasa");
    expect(teamLabel("Sales")).toBe("Sales");
    expect(teamLabel("mine")).toBe("mine");
  });
});
