import { describe, it, expect } from "vitest";
import {
  bucketsFor,
  computeDccDashboard,
  historyStartFor,
  outcomeOf,
  previousWindow,
  rankingScore,
  type DashboardEntry,
  type DashboardItem,
  type DashboardPerson,
} from "@/lib/dcc/dashboard";

/**
 * THE DCC DASHBOARD'S NUMBERS.
 *
 * Dates below are real: 2026-09-13 is a Sunday, 2026-09-14 a Monday and
 * 2026-09-15 (the "today" of these tests) a Tuesday. "Daily" KPIs are Mon–Sat,
 * so the Sunday must never count as due.
 */

const TODAY = "2026-09-15";
const DAILY = 0b111111; // Mon–Sat

const person = (id: string, departments: string[] = []): DashboardPerson => ({
  id,
  name: `Person ${id}`,
  avatarUrl: null,
  departments,
});

const item = (id: string, owner: string, over: Partial<DashboardItem> = {}): DashboardItem => ({
  id,
  ownerEmployeeId: owner,
  section: "Self Hygiene",
  code: null,
  title: `KPI ${id}`,
  weekdays: DAILY,
  scheduleKind: "scheduled",
  isParticipantList: false,
  activeFrom: null,
  ...over,
});

const entry = (itemId: string, entryDate: string, status: string | null, over: Partial<DashboardEntry> = {}): DashboardEntry => ({
  itemId,
  entryDate,
  status,
  valueNumber: null,
  note: null,
  subjectId: null,
  ...over,
});

function run(opts: {
  people?: DashboardPerson[];
  items: DashboardItem[];
  entries?: DashboardEntry[];
  from: string;
  to?: string;
  reviews?: { ownerEmployeeId: string; reviewDate: string; status: string | null }[];
}) {
  return computeDccDashboard({
    people: opts.people ?? [person("a")],
    items: opts.items,
    entries: opts.entries ?? [],
    reviews: opts.reviews ?? [],
    from: opts.from,
    to: opts.to ?? TODAY,
    today: TODAY,
  });
}

describe("what an entry counts as", () => {
  it("reads the four statuses case-insensitively", () => {
    expect(outcomeOf(entry("x", TODAY, "DONE"))).toBe("done");
    expect(outcomeOf(entry("x", TODAY, "Not done"))).toBe("notDone");
    expect(outcomeOf(entry("x", TODAY, "NA"))).toBe("na");
    expect(outcomeOf(entry("x", TODAY, " pending "))).toBe("pending");
  });

  it("counts a value or a note with no status as filled, not missed", () => {
    // The fill board's rule: status OR value OR note.
    expect(outcomeOf(entry("x", TODAY, null, { valueNumber: "0" }))).toBe("noted");
    expect(outcomeOf(entry("x", TODAY, null, { note: "called twice" }))).toBe("noted");
  });

  it("treats a missing or empty entry as unfilled", () => {
    expect(outcomeOf(undefined)).toBe("unfilled");
    expect(outcomeOf(entry("x", TODAY, "", { note: "  " }))).toBe("unfilled");
  });
});

describe("what is due", () => {
  it("skips Sunday for a Mon–Sat KPI", () => {
    const r = run({ items: [item("k", "a")], from: "2026-09-13", to: "2026-09-14" });
    expect(r.totals.due).toBe(1); // Monday only
  });

  it("never counts weekly, adhoc or participant KPIs as due", () => {
    const r = run({
      items: [
        item("s", "a"),
        item("w", "a", { scheduleKind: "weekly" }),
        item("h", "a", { scheduleKind: "adhoc", weekdays: null }),
        item("p", "a", { isParticipantList: true }),
      ],
      from: "2026-09-14",
      to: "2026-09-14",
    });
    expect(r.totals.due).toBe(1);
    expect(r.people[0]!.kpis).toBe(4);
    expect(r.people[0]!.scheduledKpis).toBe(1);
  });

  it("ignores participant slot entries when judging a KPI", () => {
    const r = run({
      items: [item("k", "a")],
      entries: [entry("k", "2026-09-14", "Done", { subjectId: "subject-1" })],
      from: "2026-09-14",
      to: "2026-09-14",
    });
    expect(r.totals.unfilled).toBe(1);
  });

  it("never counts a KPI as due before it existed", () => {
    // Added on Monday 14th: the Saturday before it is not a miss.
    const r = run({ items: [item("k", "a", { activeFrom: "2026-09-14" })], from: "2026-09-12", to: "2026-09-14" });
    expect(r.totals.due).toBe(1);
    expect(r.people[0]!.prevTally.due).toBe(0);
  });

  it("never runs a window past today", () => {
    const r = run({ items: [item("k", "a")], from: "2026-09-14", to: "2026-09-20" });
    expect(r.window.to).toBe(TODAY);
    expect(r.totals.due).toBe(2);
  });
});

describe("compliance and filled", () => {
  it("is done ÷ due, with NA counted as not done", () => {
    const r = run({
      items: [item("k1", "a"), item("k2", "a"), item("k3", "a"), item("k4", "a")],
      entries: [
        entry("k1", "2026-09-14", "Done"),
        entry("k2", "2026-09-14", "Done"),
        entry("k3", "2026-09-14", "NA"),
      ],
      from: "2026-09-14",
      to: "2026-09-14",
    });
    const p = r.people[0]!;
    expect(p.tally).toMatchObject({ due: 4, done: 2, na: 1, unfilled: 1 });
    expect(p.compliance).toBe(50);
    expect(p.filled).toBe(75);
  });

  it("compares against the window of the same length just before", () => {
    expect(previousWindow("2026-09-14", "2026-09-15")).toEqual({ from: "2026-09-12", to: "2026-09-13" });
    const r = run({
      items: [item("k", "a")],
      entries: [entry("k", "2026-09-12", "Done"), entry("k", "2026-09-14", "Done")],
      from: "2026-09-14",
    });
    // Previous window: Sat 12 (done) + Sun 13 (not due) → 100%.
    expect(r.people[0]!.prevCompliance).toBe(100);
    // This window: Mon 14 done, Tue 15 still open → 50%.
    expect(r.people[0]!.compliance).toBe(50);
  });
});

describe("today is open, not missed", () => {
  it("reports today's unfilled KPIs separately", () => {
    const r = run({ items: [item("k", "a")], from: "2026-09-14" });
    const p = r.people[0]!;
    expect(r.includesToday).toBe(true);
    expect(p.tally.unfilled).toBe(2);
    expect(p.today.unfilled).toBe(1);
  });

  it("does not break the streak on an unfinished today", () => {
    const r = run({
      items: [item("k", "a")],
      entries: [entry("k", "2026-09-12", "Done"), entry("k", "2026-09-14", "Not done")],
      from: "2026-09-14",
    });
    // Tue 15 open (skipped), Mon 14 filled, Sun 13 not due, Sat 12 filled, Fri 11 blank → 2.
    expect(r.people[0]!.streak).toBe(2);
  });

  it("counts today once it is complete", () => {
    const r = run({
      items: [item("k", "a")],
      entries: [entry("k", TODAY, "Done"), entry("k", "2026-09-14", "Done")],
      from: "2026-09-14",
    });
    expect(r.people[0]!.streak).toBe(2);
  });

  it("excludes today from the days a manager should have reviewed", () => {
    const r = run({
      items: [item("k", "a")],
      from: "2026-09-14",
      reviews: [{ ownerEmployeeId: "a", reviewDate: "2026-09-14", status: "approved" }],
    });
    expect(r.people[0]!.reviews).toEqual({ approved: 1, needsRework: 0, reviewableDays: 1 });
  });
});

describe("heatmap buckets", () => {
  it("is one column per day up to a month", () => {
    const b = bucketsFor("2026-09-01", "2026-09-15");
    expect(b).toHaveLength(15);
    expect(b[0]).toMatchObject({ label: "1", sub: "Tue" });
  });

  it("switches to Monday–Sunday weeks beyond a month, clipped to the window", () => {
    const b = bucketsFor("2026-08-01", "2026-09-15");
    expect(b[0]).toMatchObject({ from: "2026-08-01", to: "2026-08-02", sub: "week" });
    expect(b[1]).toMatchObject({ from: "2026-08-03", to: "2026-08-09" });
    expect(b.at(-1)).toMatchObject({ from: "2026-09-14", to: "2026-09-15" });
  });

  it("adds every day into exactly one bucket", () => {
    const r = run({ items: [item("k", "a")], from: "2026-08-01" });
    const sum = r.people[0]!.buckets.reduce((n, t) => n + t.due, 0);
    expect(sum).toBe(r.people[0]!.tally.due);
  });
});

describe("people, sections and KPIs", () => {
  it("lists people with no KPIs separately instead of ranking them", () => {
    const r = run({ people: [person("a"), person("b")], items: [item("k", "a")], from: "2026-09-14" });
    expect(r.people.map((p) => p.person.id)).toEqual(["a"]);
    expect(r.withoutKpis.map((p) => p.id)).toEqual(["b"]);
  });

  it("ranks the most-missed KPI first and files unsectioned KPIs by name", () => {
    const r = run({
      items: [item("ok", "a"), item("bad", "a", { section: null })],
      entries: [entry("ok", "2026-09-14", "Done")],
      from: "2026-09-14",
      to: "2026-09-14",
    });
    expect(r.items[0]!.item.id).toBe("bad");
    expect(r.items[0]!.missRate).toBe(100);
    expect(r.sections.map((s) => s.section).sort()).toEqual(["Self Hygiene", "Unsectioned"]);
  });

  it("scores the way DCC Ranking does", () => {
    expect(rankingScore(null, 10)).toBeNull();
    expect(rankingScore(100, 30)).toBe(100);
    expect(rankingScore(50, 60)).toBe(60); // streak caps at 30
  });

  it("loads enough history for both the previous window and the streak", () => {
    expect(historyStartFor("2026-09-14", TODAY)).toBe("2026-07-18");
    expect(historyStartFor("2026-01-01", TODAY)).toBe("2025-04-18");
  });
});
