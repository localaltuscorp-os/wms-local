import { describe, it, expect } from "vitest";
import {
  EXEC_CATEGORIES,
  categoryColors,
  execCategory,
  guessCategory,
  isProtectedCategory,
} from "@/lib/exec-calendar/taxonomy";
import { canEdit, checkConflicts } from "@/lib/exec-calendar/privacy";
import { buildAllocation, eventMinutes } from "@/lib/exec-calendar/analytics";
import { DEFAULT_GRID } from "@/lib/exec-calendar/grid";

/* ── §3 taxonomy ─────────────────────────────────────────────────────────── */

describe("the fixed taxonomy", () => {
  it("is the fourteen categories of the master sheet, with its colours (2026-09-18)", () => {
    expect(EXEC_CATEGORIES.map((c) => [c.label, c.hex])).toEqual([
      ["Sales", "#7F00FF"],
      ["Fixed", "#FF0000"],
      ["Consulting", "#FF8C00"],
      ["CQ", "#FFFF00"],
      ["PS", "#FFC000"],
      ["Staff Time", "#82E0AA"],
      ["Lead Gen", "#F1948A"],
      ["Grad Workshop", "#FFFDC0"],
      ["Flexible Time", "#00FF00"],
      ["Festival Marker", "#FF00FF"],
      ["Wkly Off/Break", "#A6A6A6"],
      ["Family Time", "#4A90E2"],
      ["Personal", "#0000FF"],
      ["Siaa Exam", "#6E6E6E"],
    ]);
  });

  it("protects weekly off, family and personal time, and nothing else", () => {
    expect(EXEC_CATEGORIES.filter((c) => c.protected).map((c) => c.key)).toEqual([
      "wkly_off", "family_time", "personal",
    ]);
  });

  it("offers the (optional) client picker on every category", () => {
    expect(EXEC_CATEGORIES.every((c) => c.linksClient)).toBe(true);
  });

  it("offers the batch field on the cohort programmes only", () => {
    expect(EXEC_CATEGORIES.filter((c) => c.linksCohort).map((c) => c.key)).toEqual(["cq", "ps", "grad_workshop"]);
  });

  it("derives every shade from the category's own colour", () => {
    for (const c of EXEC_CATEGORIES) {
      const colors = categoryColors(c.key);
      for (const v of Object.values(colors)) expect(v).toMatch(/^(#[0-9A-F]{6}|color-mix\(in srgb, #[0-9A-F]{6} .+\))$/i);
    }
  });

  it("darkens the border and text of a very light colour so it stays readable", () => {
    expect(categoryColors("cq").deep).toMatch(/#111/);
    expect(categoryColors("cq").base).not.toBe("#FFFF00");
    expect(categoryColors("sales").base).toBe("#7F00FF");
  });

  it("falls back rather than throwing on a key it does not know", () => {
    expect(execCategory("nonsense").key).toBe("staff_time");
    expect(execCategory("ops").key).toBe("staff_time"); // a pre-0237 key
    expect(isProtectedCategory("nonsense")).toBe(false);
  });
});

describe("classifying a decade of sheet cells", () => {
  it("reads the cells from the master sheet", () => {
    expect(guessCategory("BSS 90 S21")).toBe("grad_workshop");
    expect(guessCategory("BNI Premier")).toBe("sales");
    expect(guessCategory("TDS Returns")).toBe("staff_time");
    expect(guessCategory("Manan Sir Break")).toBe("wkly_off");
    expect(guessCategory("Exercise")).toBe("personal");
    expect(guessCategory("Independence Day")).toBe("festival");
    expect(guessCategory("CQ 12 S3")).toBe("cq");
    expect(guessCategory("PS 76 S5")).toBe("ps");
    expect(guessCategory("Siaa exam")).toBe("siaa_exam");
    expect(guessCategory("Family dinner")).toBe("family_time");
  });

  it("prefers the longer keyword when two match", () => {
    // "lead gen" must beat the bare "lead" (both Lead Gen), and "staff sync" the bare "staff".
    expect(guessCategory("Lead Gen block")).toBe("lead_gen");
    expect(guessCategory("Staff sync")).toBe("staff_time");
  });

  it("admits it does not know rather than guessing", () => {
    expect(guessCategory("Sukhsons")).toBeNull();
    expect(guessCategory("")).toBeNull();
    expect(guessCategory("   ")).toBeNull();
  });
});

/* ── Authorship ──────────────────────────────────────────────────────────
   The privacy layer (public / busy / private masking) was REMOVED on
   2026-09-17: the module exists so people can see each other's schedule, so
   everything is visible and only authorship is restricted. Its tests went with
   it; what remains is the rule that survived.
   ───────────────────────────────────────────────────────────────────────── */

const OWNER = "owner-1";
const owner = { employeeId: OWNER, isOwner: true };
const teammate = { employeeId: "someone-else" };

describe("who may change a block", () => {
  const block = { ownerId: OWNER };

  it("lets the owner edit their own", () => {
    expect(canEdit(block, owner)).toBe(true);
    expect(canEdit(block, { employeeId: OWNER })).toBe(true);
  });

  it("lets a calendar admin edit anybody's", () => {
    expect(canEdit(block, { employeeId: "pa-1", isCalendarAdmin: true })).toBe(true);
  });

  it("REFUSES a colleague, who can still read it", () => {
    expect(canEdit(block, teammate)).toBe(false);
  });
});

/* ── §5 conflict prevention ──────────────────────────────────────────────── */

const gym = { id: "g", day: "2026-09-14", startMin: 420, endMin: 480, categoryKey: "personal" };
const call = { id: "c", day: "2026-09-14", startMin: 600, endMin: 660, categoryKey: "client" };

describe("booking over somebody's diary", () => {
  it("passes when nothing overlaps", () => {
    const v = checkConflicts(
      { day: "2026-09-14", startMin: 900, endMin: 960, categoryKey: "client" },
      [gym, call],
      teammate,
    );
    expect(v.ok).toBe(true);
  });

  it("REFUSES an assistant booking over protected time", () => {
    const v = checkConflicts(
      { day: "2026-09-14", startMin: 450, endMin: 510, categoryKey: "client" },
      [gym],
      teammate,
    );
    expect(v.ok).toBe(false);
    if (!v.ok) expect(v.blockedBy.id).toBe("g");
  });

  it("lets the OWNER overrule their own exercise hour", () => {
    const v = checkConflicts(
      { day: "2026-09-14", startMin: 450, endMin: 510, categoryKey: "client" },
      [gym],
      owner,
    );
    expect(v.ok).toBe(true);
  });

  it("only warns about an ordinary double booking", () => {
    const v = checkConflicts(
      { day: "2026-09-14", startMin: 630, endMin: 690, categoryKey: "client" },
      [call],
      teammate,
    );
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.warnings.map((w) => w.id)).toEqual(["c"]);
  });

  it("does not clash with itself when being retimed", () => {
    const v = checkConflicts({ ...call, startMin: 615 }, [call], teammate);
    expect(v.ok).toBe(true);
    if (v.ok) expect(v.warnings).toEqual([]);
  });

  it("treats touching ends as free, not as a clash", () => {
    const v = checkConflicts(
      { day: "2026-09-14", startMin: 480, endMin: 540, categoryKey: "client" },
      [gym],
      teammate,
    );
    expect(v.ok).toBe(true);
  });

  it("ignores an untimed block entirely", () => {
    const v = checkConflicts(
      { day: "2026-09-14", startMin: null, endMin: null, categoryKey: "client" },
      [gym],
      teammate,
    );
    expect(v.ok).toBe(true);
  });
});

/* ── §4D analytics ───────────────────────────────────────────────────────── */

describe("where the time went", () => {
  const week = [
    { day: "2026-09-14", categoryKey: "consulting", startMin: 600, endMin: 780 },  // 3h
    { day: "2026-09-15", categoryKey: "fixed", startMin: 600, endMin: 660 },       // 1h
    { day: "2026-09-16", categoryKey: "grad_workshop", startMin: 900, endMin: 1200 }, // 5h
    { day: "2026-09-17", categoryKey: "sales", startMin: 600, endMin: 660 },       // 1h
    { day: "2026-09-18", categoryKey: "personal", startMin: 420, endMin: 480 },    // 1h
    { day: "2026-09-18", categoryKey: "festival", startMin: null, endMin: null, allDay: true },
  ];

  it("counts nothing for an all-day marker or an untimed row", () => {
    expect(eventMinutes({ day: "x", categoryKey: "festival", startMin: null, endMin: null, allDay: true })).toBe(0);
    expect(eventMinutes({ day: "x", categoryKey: "consulting", startMin: null, endMin: null })).toBe(0);
  });

  it("totals each bucket and shares out the COMMITTED time", () => {
    const r = buildAllocation(week, "2026-09-14", "2026-09-20", DEFAULT_GRID);
    expect(r.committedMinutes).toBe(11 * 60);
    const by = Object.fromEntries(r.buckets.map((b) => [b.bucket, b]));
    expect(by["client-delivery"]!.minutes).toBe(4 * 60);
    expect(by["training-cohorts"]!.percent).toBeCloseTo(45.5, 1);
    expect(by["personal-recovery"]!.minutes).toBe(60);
  });

  it("reports how much of the window is spoken for, separately", () => {
    const r = buildAllocation(week, "2026-09-14", "2026-09-20", DEFAULT_GRID);
    // 06:30–23:00 is 16.5 hours a day. The same 661.5 booked minutes that were
    // 10.5% of the old 15-hour window are this share of the wider one.
    const window = (DEFAULT_GRID.endMin - DEFAULT_GRID.startMin) * 7;
    expect(r.windowMinutes).toBe(window);
    expect(r.windowShare).toBeCloseTo((0.105 * 15 * 60 * 7 * 100) / window, 1);
  });

  it("ignores events outside the range", () => {
    const r = buildAllocation(week, "2026-09-14", "2026-09-15", DEFAULT_GRID);
    expect(r.committedMinutes).toBe(4 * 60);
  });

  it("raises the personal-time alert when it is crowded out", () => {
    const r = buildAllocation(week, "2026-09-14", "2026-09-20", DEFAULT_GRID);
    const alert = r.alerts.find((a) => a.bucket === "personal-recovery");
    expect(alert).toBeDefined();
    expect(alert!.actual).toBeLessThan(alert!.target);
  });

  it("stays quiet when the floors are met", () => {
    const balanced = [
      { day: "2026-09-14", categoryKey: "consulting", startMin: 600, endMin: 660 },
      { day: "2026-09-14", categoryKey: "lead_gen", startMin: 660, endMin: 720 },
      { day: "2026-09-14", categoryKey: "family_time", startMin: 420, endMin: 480 },
    ];
    expect(buildAllocation(balanced, "2026-09-14", "2026-09-20", DEFAULT_GRID).alerts).toEqual([]);
  });

  it("raises nothing for an empty quarter, rather than crying 0%", () => {
    const r = buildAllocation([], "2026-10-01", "2026-12-31", DEFAULT_GRID);
    expect(r.alerts).toEqual([]);
    expect(r.committedMinutes).toBe(0);
    expect(r.buckets.every((b) => b.percent === 0)).toBe(true);
  });
});
