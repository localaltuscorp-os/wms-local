import { describe, it, expect } from "vitest";
import {
  VIEW_EMPLOYEE_PARAM,
  canViewEmployee,
  hasViewableOthers,
  incentivePageTitle,
  narrowToEmployee,
  viewablePeople,
  viewedEmployeeName,
} from "@/lib/incentive/analytics/viewer";
import type { AnalyticsScope } from "@/lib/incentive/analytics/model";
import { buildIncentiveAnalytics } from "@/lib/incentive/analytics/model";
import { resolvePeriod, selectableYears } from "@/lib/incentive/analytics/periods";

/**
 * THE INCENTIVE EMPLOYEE VIEWER — the "Viewing: <name>" control.
 *
 * Two things have to hold, and the brief names both:
 *
 *   1. A MANAGER OR ADMIN CAN LOOK AT SOMEBODY ELSE, and switching employee
 *      updates the whole dashboard.
 *   2. NOBODY ELSE CAN. Not by pressing a button that is not drawn, and not by
 *      typing `?emp=` — the parameter selects one person OUT OF the set the
 *      server already resolved for the caller, and is refused for anybody else.
 *
 * The narrowing helpers are pure, so the refusal is testable without a database:
 * the scope fixtures below stand in for what `incentiveAnalyticsScopeFor` would
 * have returned for each kind of viewer.
 */

const SELF = "11111111-1111-1111-1111-111111111111";
const REPORT = "22222222-2222-2222-2222-222222222222";
const STRANGER = "33333333-3333-3333-3333-333333333333";

/** Manan, the super-admins, or anybody Access Control granted the org to. */
const ORG_WIDE: AnalyticsScope = {
  all: true,
  employeeIds: new Set(),
  viewerId: SELF,
  label: "Everyone",
};

/** A manager: themselves plus their downline. */
const MANAGER: AnalyticsScope = {
  all: false,
  employeeIds: new Set([SELF, REPORT]),
  viewerId: SELF,
  label: "You and your team",
  canSeeTeam: true,
};

/** An ordinary employee: themselves and nobody else. */
const EMPLOYEE: AnalyticsScope = {
  all: false,
  employeeIds: new Set([SELF]),
  viewerId: SELF,
  label: "You",
};

const ROSTER = [
  { id: REPORT, name: "Shreya Randhe" },
  { id: SELF, name: "Om Jadhav" },
  { id: STRANGER, name: "Unrelated Person" },
];

describe("who a viewer may look at", () => {
  it("lets a company-wide viewer look at anyone", () => {
    expect(canViewEmployee(ORG_WIDE, REPORT)).toBe(true);
    expect(canViewEmployee(ORG_WIDE, STRANGER)).toBe(true);
  });

  it("lets a manager look at their downline and nobody else", () => {
    expect(canViewEmployee(MANAGER, REPORT)).toBe(true);
    expect(canViewEmployee(MANAGER, SELF)).toBe(true);
    // The whole point: a manager cannot ask for a colleague outside their line.
    expect(canViewEmployee(MANAGER, STRANGER)).toBe(false);
  });

  it("lets an ordinary employee look at nobody but themselves", () => {
    expect(canViewEmployee(EMPLOYEE, SELF)).toBe(true);
    expect(canViewEmployee(EMPLOYEE, REPORT)).toBe(false);
    expect(canViewEmployee(EMPLOYEE, STRANGER)).toBe(false);
  });

  it("treats a missing id as no", () => {
    for (const scope of [ORG_WIDE, MANAGER, EMPLOYEE]) {
      expect(canViewEmployee(scope, null)).toBe(false);
      expect(canViewEmployee(scope, undefined)).toBe(false);
      expect(canViewEmployee(scope, "")).toBe(false);
    }
  });
});

describe("narrowing to one employee", () => {
  it("refuses somebody outside the scope — this is the ?emp= boundary", () => {
    // A crafted URL for a colleague the viewer has no line to.
    expect(narrowToEmployee(MANAGER, STRANGER, "Unrelated Person")).toBeNull();
    expect(narrowToEmployee(EMPLOYEE, REPORT, "Shreya Randhe")).toBeNull();
    expect(narrowToEmployee(EMPLOYEE, STRANGER, "Unrelated Person")).toBeNull();
  });

  it("narrows a company-wide view to the one person", () => {
    const scoped = narrowToEmployee(ORG_WIDE, REPORT, "Shreya Randhe");
    expect(scoped).not.toBeNull();
    expect(scoped!.all).toBe(false);
    expect([...scoped!.employeeIds]).toEqual([REPORT]);
    expect(scoped!.label).toBe("Shreya Randhe");
    // The signed-in identity is untouched — it is NOT swapped for the person
    // being viewed, or a manager would inherit the report's own-view rights.
    expect(scoped!.viewerId).toBe(SELF);
  });

  it("carries the CTC entitlement across, and only when the viewer had it", () => {
    // An org-wide viewer could already read every CTC on the page; narrowing to
    // one of them must not take it away, or Grade and % of CTC would blank out
    // the moment they picked somebody.
    expect(narrowToEmployee(ORG_WIDE, REPORT, "Shreya Randhe")!.ctcUnrestricted).toBe(true);
    // A manager never had it, so the restriction stays exactly as it was.
    expect(narrowToEmployee(MANAGER, REPORT, "Shreya Randhe")!.ctcUnrestricted).toBe(false);
  });
});

describe("the picker's rows", () => {
  it("puts self first, then everybody else alphabetically", () => {
    const people = viewablePeople(ORG_WIDE, ROSTER);
    expect(people.map((p) => p.id)).toEqual([SELF, REPORT, STRANGER]);
  });

  it("offers a manager only themselves and their downline", () => {
    const people = viewablePeople(MANAGER, ROSTER);
    expect(people.map((p) => p.id)).toEqual([SELF, REPORT]);
    expect(people.some((p) => p.id === STRANGER)).toBe(false);
  });

  it("offers an ordinary employee only themselves", () => {
    const people = viewablePeople(EMPLOYEE, ROSTER);
    expect(people.map((p) => p.id)).toEqual([SELF]);
    // Which is what decides that no picker is drawn at all.
    expect(hasViewableOthers(people, SELF)).toBe(false);
  });

  it("draws a picker exactly when there is somebody else", () => {
    expect(hasViewableOthers(viewablePeople(ORG_WIDE, ROSTER), SELF)).toBe(true);
    expect(hasViewableOthers(viewablePeople(MANAGER, ROSTER), SELF)).toBe(true);
  });
});

describe("the page title", () => {
  it("names the employee being viewed", () => {
    expect(incentivePageTitle("Om Jadhav")).toBe("Incentive | Om Jadhav");
    expect(incentivePageTitle("Shreya Randhe")).toBe("Incentive | Shreya Randhe");
  });

  it("falls back to the viewer when no employee is selected", () => {
    expect(viewedEmployeeName(ROSTER, "", "Om Jadhav")).toBe("Om Jadhav");
  });

  it("names the selected employee when one is", () => {
    expect(viewedEmployeeName(ROSTER, REPORT, "Om Jadhav")).toBe("Shreya Randhe");
  });

  it("falls back to the viewer for an id the picker does not hold", () => {
    // Cannot happen through the UI, and must not print somebody else's name by
    // accident if it ever does.
    expect(viewedEmployeeName(ROSTER, "not-a-real-id", "Om Jadhav")).toBe("Om Jadhav");
  });

  it("keeps the parameter name the URL and the server share", () => {
    expect(VIEW_EMPLOYEE_PARAM).toBe("emp");
  });
});

describe("the CTC entitlement reaches the figures", () => {
  const period = resolvePeriod({ kind: "month", month: "2026-08" })!;

  function build(scope: AnalyticsScope) {
    return buildIncentiveAnalytics({
      period,
      currentMonth: "2026-09",
      employees: [
        { id: REPORT, name: "Shreya Randhe", code: "A-1", monthlyCtc: 100_000, joinedMonth: "2024-01" },
      ],
      inactiveNameKeys: new Set<string>(),
      excludedEmployeeIds: new Set<string>(),
      ledger: [
        {
          key: "e1",
          source: "entry",
          employeeId: REPORT,
          empName: "Shreya Randhe",
          label: "Incentive",
          month: "2026-08",
          approved: 5_000,
          paid: 5_000,
        },
      ],
      requests: [],
      catalog: [],
      targets: [],
      scope,
      viewer: { id: SELF, name: "Om Jadhav" },
    });
  }

  it("shows the viewed person's CTC to a viewer who was entitled to it", () => {
    // What an org-wide viewer gets after picking somebody.
    const out = build({ ...narrowToEmployee(ORG_WIDE, REPORT, "Shreya Randhe")! });
    const row = out.employees.find((e) => e.employeeId === REPORT)!;
    expect(row.ctcState).toBe("ok");
    expect(row.ctc).toBe(100_000);
    expect(row.pctOfCtc).toBe(5);
  });

  it("still withholds it from a viewer who was not", () => {
    // The existing privacy rule, unchanged: a manager reading a report's pay is
    // exactly what the restriction exists to stop.
    const out = build(narrowToEmployee(MANAGER, REPORT, "Shreya Randhe")!);
    const row = out.employees.find((e) => e.employeeId === REPORT)!;
    expect(row.ctcState).toBe("restricted");
    expect(row.ctc).toBeNull();
    // The percentage is still computed — it is the grade's basis — but the
    // salary figure it came from is not shown.
    expect(row.pctOfCtc).toBe(5);
  });
});

describe("the dashboard's subject, and the monthly series", () => {
  const quarter = resolvePeriod({ kind: "quarter", quarter: "2026-Q3" })!;

  function build(opts: {
    subjectId?: string;
    targets?: { empName: string; employeeId: string | null; periodMonth: string; periodType: "month" | "quarter"; amount: number }[];
    ledger?: { month: string; approved: number; employeeId: string; empName: string }[];
  }) {
    return buildIncentiveAnalytics({
      period: quarter,
      currentMonth: "2026-09",
      employees: [
        { id: SELF, name: "Om Jadhav", code: "A-0", monthlyCtc: 120_000, joinedMonth: "2023-01" },
        { id: REPORT, name: "Shreya Randhe", code: "A-1", monthlyCtc: 100_000, joinedMonth: "2024-01" },
      ],
      inactiveNameKeys: new Set<string>(),
      excludedEmployeeIds: new Set<string>(),
      ledger: (
        opts.ledger ?? [
          { month: "2026-07", approved: 1_000, employeeId: REPORT, empName: "Shreya Randhe" },
          { month: "2026-08", approved: 2_000, employeeId: REPORT, empName: "Shreya Randhe" },
          { month: "2026-09", approved: 4_000, employeeId: REPORT, empName: "Shreya Randhe" },
        ]
      ).map((l, i) => ({
        key: `e${i}`,
        source: "entry" as const,
        employeeId: l.employeeId,
        empName: l.empName,
        label: "Incentive",
        month: l.month,
        approved: l.approved,
        paid: l.approved,
      })),
      requests: [],
      catalog: [],
      targets: (opts.targets ?? []).map((t) => ({
        empName: t.empName,
        employeeId: t.employeeId,
        periodMonth: `${t.periodMonth}-01`,
        periodType: t.periodType,
        amount: t.amount,
      })),
      scope: narrowToEmployee(ORG_WIDE, REPORT, "Shreya Randhe")!,
      viewer: { id: SELF, name: "Om Jadhav" },
      ...(opts.subjectId ? { subjectId: opts.subjectId } : {}),
    });
  }

  it("makes `me` the person the dashboard is ABOUT, not the person reading it", () => {
    // The bug this closes: with `?emp=` the KPI band's Grade and % of CTC cards
    // read from `me`, and `me` used to mean "the signed-in employee" — so
    // opening a colleague's dashboard printed the READER's grade under the
    // colleague's name.
    const out = build({ subjectId: REPORT });
    expect(out.me?.employeeId).toBe(REPORT);
    expect(out.me?.name).toBe("Shreya Randhe");
    expect(out.employees.find((e) => e.employeeId === SELF)).toBeUndefined();
  });

  it("falls back to the viewer when no subject is named", () => {
    // Every caller that predates `subjectId` — the whole rest of the module.
    const out = build({});
    expect(out.me?.employeeId).toBe(SELF);
    expect(out.me?.name).toBe("Om Jadhav");
  });

  it("buckets earnings by month, one entry per month of the period", () => {
    const out = build({ subjectId: REPORT });
    expect(out.monthly.map((m) => m.month)).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(out.monthly.map((m) => m.earned)).toEqual([1_000, 2_000, 4_000]);
    // And it adds up to the same money the Total Actual KPI shows.
    expect(out.monthly.reduce((s, m) => s + m.earned, 0)).toBe(out.summary.earned);
  });

  it("distinguishes a month with no target from a month with a target of zero", () => {
    const out = build({
      subjectId: REPORT,
      targets: [
        { empName: "Shreya Randhe", employeeId: REPORT, periodMonth: "2026-08", periodType: "month", amount: 5_000 },
      ],
    });
    expect(out.monthly.map((m) => m.target)).toEqual([null, 5_000, null]);
  });

  it("does NOT spread a quarterly target across its months", () => {
    // A Q3 target is one commitment for the period, not three monthly ones
    // nobody set — the same reason it is excluded from July's monthly figure.
    const out = build({
      subjectId: REPORT,
      targets: [
        { empName: "Shreya Randhe", employeeId: REPORT, periodMonth: "2026-07", periodType: "quarter", amount: 90_000 },
      ],
    });
    expect(out.monthly.map((m) => m.target)).toEqual([null, null, null]);
    // It is still the period's target, which is what Target vs Actual reads.
    expect(out.summary.target).toBe(90_000);
  });

  it("shows a genuine zero for a month nothing happened in, not a gap", () => {
    const out = build({
      subjectId: REPORT,
      ledger: [{ month: "2026-09", approved: 3_000, employeeId: REPORT, empName: "Shreya Randhe" }],
    });
    expect(out.monthly.map((m) => m.earned)).toEqual([0, 0, 3_000]);
  });
});

describe("the Specific Year period", () => {
  it("resolves to the whole calendar year, twelve months", () => {
    const p = resolvePeriod({ kind: "year", year: "2025" })!;
    expect(p.kind).toBe("year");
    expect(p.label).toBe("2025");
    expect(p.months).toHaveLength(12);
    expect(p.months[0]).toBe("2025-01");
    expect(p.months[11]).toBe("2025-12");
    expect(p.start).toBe("2025-01-01");
    expect(p.endExclusive).toBe("2026-01-01");
  });

  it("compares rank movement against the year before", () => {
    const p = resolvePeriod({ kind: "year", year: "2025" })!;
    expect(p.previous?.months).toHaveLength(12);
    expect(p.previous?.months[0]).toBe("2024-01");
  });

  it("reads as the year, not as the month span it spans", () => {
    // "Jan – Dec 2025" would make the reader count months to check what they
    // picked; the year IS the unit.
    expect(resolvePeriod({ kind: "year", year: "2025" })!.label).not.toContain("–");
  });

  it("allows the current and past years, refuses a future one", () => {
    const now = new Date("2026-09-24T06:00:00Z");
    expect(resolvePeriod({ kind: "year", year: "2026" }, now)).not.toBeNull();
    expect(resolvePeriod({ kind: "year", year: "2025" }, now)).not.toBeNull();
    // A future year has no incentives to analyse; refusing it here is what stops
    // a crafted request asking for one.
    expect(resolvePeriod({ kind: "year", year: "2027" }, now)).toBeNull();
  });

  it("refuses a year before the floor, and anything malformed", () => {
    for (const bad of ["2019", "1999", "abcd", "26", "2026-Q1", "", " 2026 "]) {
      expect(resolvePeriod({ kind: "year", year: bad }), bad).toBeNull();
    }
    expect(resolvePeriod({ kind: "year", year: null })).toBeNull();
    expect(resolvePeriod({ kind: "year" })).toBeNull();
  });

  it("keeps the picker's years newest-first and inside the floor", () => {
    const now = new Date("2026-09-24T06:00:00Z");
    expect(selectableYears(now)).toEqual(["2026", "2025", "2024", "2023", "2022", "2021", "2020"]);
  });

  it("leaves the existing kinds alone", () => {
    // The year kind is an ADDITION — every period the dashboard already offered
    // must keep resolving exactly as it did.
    const now = new Date("2026-09-24T06:00:00Z");
    expect(resolvePeriod({ kind: "current_month" }, now)!.months).toEqual(["2026-09"]);
    expect(resolvePeriod({ kind: "month", month: "2026-07" }, now)!.months).toEqual(["2026-07"]);
    expect(resolvePeriod({ kind: "quarter", quarter: "2026-Q3" }, now)!.months).toEqual([
      "2026-07",
      "2026-08",
      "2026-09",
    ]);
    expect(resolvePeriod({ kind: "last_3" }, now)!.months).toEqual(["2026-07", "2026-08", "2026-09"]);
    expect(resolvePeriod({ kind: "ytd" }, now)!.months).toHaveLength(9);
    // YTD and the year kind are NOT the same control: January-to-now versus the
    // whole calendar year. Both are kept.
    expect(resolvePeriod({ kind: "ytd" }, now)!.months).toHaveLength(9);
    expect(resolvePeriod({ kind: "year", year: "2026" }, now)!.months).toHaveLength(12);
  });
});
