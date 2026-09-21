import { describe, it, expect } from "vitest";
import {
  INCENTIVE_DURATIONS,
  INCENTIVE_TYPE_OPTIONS,
  MAX_ELIGIBILITY_BATCH,
  audienceGroupOf,
  candidateHaystack,
  eligibilityChangeError,
  eligibilityLabel,
  filterCandidates,
  firstIncentiveMasterError,
  formatIncentiveDate,
  hasExpired,
  incentiveDurationLabel,
  incentiveMasterErrors,
  incentiveTypeLabel,
  isCurrentEmployee,
  isCurrentGrant,
  isIncentiveOnOffer,
  isIncentiveType,
  isIsoDate,
  mayBecomeEligible,
  resolveEligibility,
  todayIst,
  windowCoversDate,
  type CandidateRow,
  type EligibilityWindow,
} from "@/lib/incentive/master";
import {
  diffCatalog,
  eligibleGroupsLabel,
  isEligibleFor,
  isNamedEligibility,
  normalizeSnapshot,
  planCatalogNotifications,
  type AudienceEmployee,
  type CatalogSnapshot,
  catalogSnapshot,
} from "@/lib/incentive/notifications/eligibility";
import { codeOf } from "../fixtures/source-code";

/**
 * THE INCENTIVE MASTER + INCENTIVE CHART.
 *
 * Two kinds of assertion, and the second is the one that keeps this true:
 *   1. the rules answer correctly, including at their boundaries, and
 *   2. there is only ONE copy of each rule — so the admin screen, the queries
 *      and the notification audience cannot come to disagree about who is
 *      eligible.
 */

const TODAY = "2026-09-16";

/* ════════════════════════════════════════════════════════════════════════════
   §1 · THE MASTER'S FIELDS
   ════════════════════════════════════════════════════════════════════════════ */

describe("the Master's own fields", () => {
  it("offers exactly the existing incentive types, by their existing labels", () => {
    // Reusing INCENTIVE_TYPES rather than inventing a parallel vocabulary.
    expect(INCENTIVE_TYPE_OPTIONS.map((o) => o.value)).toEqual([
      "bss_conversion",
      "sales_pitch",
      "client_happiness",
      "group_intro",
      "leads_referrals",
    ]);
    expect(incentiveTypeLabel("bss_conversion")).toBe("Conversion");
    expect(incentiveTypeLabel("leads_referrals")).toBe("Leads / Referrals");
  });

  it("treats an unknown or absent type as no type, never as a default", () => {
    expect(isIncentiveType("not_a_type")).toBe(false);
    expect(incentiveTypeLabel(null)).toBeNull();
    expect(incentiveTypeLabel("")).toBeNull();
    expect(incentiveTypeLabel("BSS_CONVERSION")).toBeNull();
  });

  it("has two durations and falls back to Permanent for anything else", () => {
    expect([...INCENTIVE_DURATIONS]).toEqual(["permanent", "one_time"]);
    expect(incentiveDurationLabel("one_time")).toBe("One-Time");
    expect(incentiveDurationLabel(null)).toBe("Permanent");
    expect(incentiveDurationLabel("weekly")).toBe("Permanent");
  });

  it("requires a name and a sane amount", () => {
    expect(incentiveMasterErrors({ name: "", amount: 100 }).name).toBeTruthy();
    expect(incentiveMasterErrors({ name: "A", amount: 100 }).name).toBeTruthy();
    expect(incentiveMasterErrors({ name: "Ok", amount: 100 }).name).toBeUndefined();
    expect(incentiveMasterErrors({ name: "Ok", amount: -1 }).amount).toBeTruthy();
    expect(incentiveMasterErrors({ name: "Ok", amount: 10_000_001 }).amount).toBeTruthy();
    expect(incentiveMasterErrors({ name: "Ok", amount: 0 }).amount).toBeUndefined();
  });

  it("rejects a non-finite amount rather than storing NaN", () => {
    expect(incentiveMasterErrors({ name: "Ok", amount: Number.NaN }).amount).toBeTruthy();
    expect(incentiveMasterErrors({ name: "Ok", amount: Number.POSITIVE_INFINITY }).amount).toBeTruthy();
  });

  it("rejects a malformed Valid Until but ALLOWS one in the past", () => {
    // A campaign that ended in June really did end in June; refusing the save
    // would mean the only way to record it was to lose the fact.
    expect(incentiveMasterErrors({ name: "Ok", amount: 1, validUntil: "2026-13-01" }).validUntil).toBeTruthy();
    expect(incentiveMasterErrors({ name: "Ok", amount: 1, validUntil: "2026-02-31" }).validUntil).toBeTruthy();
    expect(incentiveMasterErrors({ name: "Ok", amount: 1, validUntil: "2020-06-30" }).validUntil).toBeUndefined();
    expect(incentiveMasterErrors({ name: "Ok", amount: 1, validUntil: null }).validUntil).toBeUndefined();
    expect(incentiveMasterErrors({ name: "Ok", amount: 1, validUntil: "" }).validUntil).toBeUndefined();
  });

  it("reports the first problem in a stable, field order", () => {
    expect(firstIncentiveMasterError({ name: "", amount: -5 })).toBe(
      incentiveMasterErrors({ name: "", amount: -5 }).name,
    );
    expect(firstIncentiveMasterError({ name: "Google Review", amount: 50 })).toBeNull();
  });
});

describe("dates", () => {
  it("accepts only real ISO calendar days", () => {
    expect(isIsoDate("2026-09-16")).toBe(true);
    expect(isIsoDate("2024-02-29")).toBe(true); // a real leap day
    expect(isIsoDate("2026-02-29")).toBe(false); // not a leap year
    expect(isIsoDate("2026-9-16")).toBe(false);
    expect(isIsoDate("16-09-2026")).toBe(false);
    expect(isIsoDate("2026-00-10")).toBe(false);
    expect(isIsoDate("2026-09-31")).toBe(false);
    expect(isIsoDate("")).toBe(false);
    expect(isIsoDate(null)).toBe(false);
    expect(isIsoDate(20260916)).toBe(false);
  });

  it("formats as DD-MMM-YYYY, the Incentive module's convention", () => {
    expect(formatIncentiveDate("2026-09-16")).toBe("16-Sep-2026");
    expect(formatIncentiveDate("2026-01-01")).toBe("01-Jan-2026");
    expect(formatIncentiveDate("2026-12-31")).toBe("31-Dec-2026");
    expect(formatIncentiveDate(null)).toBe("—");
    expect(formatIncentiveDate("nonsense")).toBe("—");
  });

  it("reads today in IST, not in the server's zone", () => {
    // 2026-09-16T19:30:00Z is already the 17th in Kolkata (+05:30).
    expect(todayIst(new Date("2026-09-16T19:30:00Z"))).toBe("2026-09-17");
    expect(todayIst(new Date("2026-09-16T18:29:00Z"))).toBe("2026-09-16");
  });
});

describe("on offer, and expiry", () => {
  it("needs BOTH the switch and the date", () => {
    expect(isIncentiveOnOffer({ active: true, validUntil: null }, TODAY)).toBe(true);
    expect(isIncentiveOnOffer({ active: false, validUntil: null }, TODAY)).toBe(false);
    expect(isIncentiveOnOffer({ active: true, validUntil: "2026-09-15" }, TODAY)).toBe(false);
  });

  it("treats Valid Until as INCLUSIVE — the last day still pays", () => {
    expect(isIncentiveOnOffer({ active: true, validUntil: TODAY }, TODAY)).toBe(true);
    expect(hasExpired({ validUntil: TODAY }, TODAY)).toBe(false);
    expect(hasExpired({ validUntil: "2026-09-15" }, TODAY)).toBe(true);
  });

  it("keeps expiry separate from being switched off", () => {
    // An expired incentive stays `active` in the database — nothing silently
    // rewrites a decision nobody made — so the two facts are read separately.
    expect(hasExpired({ validUntil: "2026-09-15" }, TODAY)).toBe(true);
    expect(hasExpired({ validUntil: null }, TODAY)).toBe(false);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
   §2 · ELIGIBILITY WINDOWS
   ════════════════════════════════════════════════════════════════════════════ */

describe("an eligibility window", () => {
  const w: EligibilityWindow = {
    employeeId: "e1",
    effectiveFrom: "2026-09-01",
    removedEffectiveFrom: "2026-10-01",
  };

  it("includes the start day and EXCLUDES the removal day", () => {
    // "Removed with effect from 1 Oct" means the last eligible day is 30 Sep.
    expect(windowCoversDate(w, "2026-08-31")).toBe(false);
    expect(windowCoversDate(w, "2026-09-01")).toBe(true);
    expect(windowCoversDate(w, "2026-09-30")).toBe(true);
    expect(windowCoversDate(w, "2026-10-01")).toBe(false);
  });

  it("runs open-ended while it has not been removed", () => {
    const live: EligibilityWindow = { employeeId: "e1", effectiveFrom: "2026-09-01", removedEffectiveFrom: null };
    expect(windowCoversDate(live, "2030-01-01")).toBe(true);
    expect(windowCoversDate(live, "2026-08-31")).toBe(false);
    expect(isCurrentGrant(live)).toBe(true);
    expect(isCurrentGrant(w)).toBe(false);
  });

  it("covers nothing when granted and removed on the same day", () => {
    const sameDay: EligibilityWindow = {
      employeeId: "e1",
      effectiveFrom: "2026-09-01",
      removedEffectiveFrom: "2026-09-01",
    };
    expect(windowCoversDate(sameDay, "2026-09-01")).toBe(false);
  });
});

describe("who counts as a current employee", () => {
  const base = { id: "e1", isActive: true, employmentStatus: "active", accountType: "employee" };

  it("needs the login, the employment AND an employee account", () => {
    expect(isCurrentEmployee(base)).toBe(true);
    expect(isCurrentEmployee({ ...base, isActive: false })).toBe(false);
    expect(isCurrentEmployee({ ...base, employmentStatus: "former" })).toBe(false);
    expect(isCurrentEmployee({ ...base, employmentStatus: "anonymised" })).toBe(false);
    expect(isCurrentEmployee({ ...base, accountType: "candidate" })).toBe(false);
    expect(isCurrentEmployee({ ...base, accountType: "system" })).toBe(false);
  });

  it("ignores account type only when the caller did not select it", () => {
    // The notification audience query does not select `account_type`; the other
    // two gates must still apply there.
    expect(isCurrentEmployee({ id: "e1", isActive: true, employmentStatus: "active" })).toBe(true);
    expect(isCurrentEmployee({ id: "e1", isActive: false, employmentStatus: "active" })).toBe(false);
  });

  it("checks employment status as well as the login flag", () => {
    // A former employee stays former even if their login is re-enabled.
    expect(isCurrentEmployee({ ...base, isActive: true, employmentStatus: "former" })).toBe(false);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
   §2 · THE RULE — NAMED WINS WHERE IT EXISTS
   ════════════════════════════════════════════════════════════════════════════ */

const PEOPLE = [
  { id: "sales1", isActive: true, employmentStatus: "active", accountType: "employee", designation: "Sales Executive" },
  { id: "sales2", isActive: true, employmentStatus: "active", accountType: "employee", designation: "Consultant" },
  { id: "intern1", isActive: true, employmentStatus: "active", accountType: "employee", designation: "Sales Intern" },
  { id: "gone", isActive: false, employmentStatus: "former", accountType: "employee", designation: "Sales Executive" },
  { id: "cand", isActive: true, employmentStatus: "active", accountType: "candidate", designation: "Sales Executive" },
];

const ON = { active: true, validUntil: null, salesEligible: true, internsEligible: false };

describe("resolveEligibility", () => {
  it("stays RESTRICTED when the last named person is removed, if told so by the flag", () => {
    /* THE MONEY BUG THE MERGE WOULD HAVE SHIPPED. Rohan's table (0216) deletes
       a removed grant rather than dating it, so after the last person is
       removed there are NO rows — and "no rows" is exactly what the inference
       reads as "never restricted", handing the incentive to the whole sales
       group. `named` carries `!applies_to_all` in so the answer comes from the
       flag that actually records the decision. */
    const r = resolveEligibility({
      incentive: ON,
      windows: [],
      employees: PEOPLE,
      today: TODAY,
      named: true,
    });
    expect(r.mode).toBe("named");
    expect(r.employeeIds).toEqual([]);
  });

  it("uses the group flags when the flag says it is open, whatever rows there are", () => {
    const r = resolveEligibility({ incentive: ON, windows: [], employees: PEOPLE, today: TODAY, named: false });
    expect(r.mode).toBe("groups");
    expect(r.employeeIds.sort()).toEqual(["sales1", "sales2"]);
  });

  it("wires the flag in at every caller that has the catalog row", () => {
    // Without this, a caller could still fall back to inference and bring the
    // bug above back for just that screen.
    const q = codeOf("lib/queries/incentive-master.ts");
    const a = codeOf("app/(admin)/admin/incentive-master/actions.ts");
    expect(q).toContain("named: c.appliesToAll === false");
    expect(a).toContain("named: row.appliesToAll === false");
  });

  it("falls back to the group flags when nobody is named", () => {
    const r = resolveEligibility({ incentive: ON, windows: [], employees: PEOPLE, today: TODAY });
    expect(r.mode).toBe("groups");
    expect(r.employeeIds.sort()).toEqual(["sales1", "sales2"]);
  });

  it("reads the intern group off the designation", () => {
    const r = resolveEligibility({
      incentive: { ...ON, salesEligible: false, internsEligible: true },
      windows: [],
      employees: PEOPLE,
      today: TODAY,
    });
    expect(r.employeeIds).toEqual(["intern1"]);
    expect(audienceGroupOf("Sales Intern")).toBe("interns");
    expect(audienceGroupOf("Sales Executive")).toBe("sales");
    expect(audienceGroupOf(null)).toBe("sales");
  });

  it("lets NAMED eligibility override the group flags entirely", () => {
    const r = resolveEligibility({
      incentive: ON, // salesEligible = true, which must now be ignored
      windows: [{ employeeId: "intern1", effectiveFrom: "2026-01-01", removedEffectiveFrom: null }],
      employees: PEOPLE,
      today: TODAY,
    });
    expect(r.mode).toBe("named");
    expect(r.employeeIds).toEqual(["intern1"]);
  });

  it("stays in named mode when the LAST named person is removed", () => {
    // The dangerous case: falling back to the groups here would hand the
    // incentive to everybody the moment the last person was taken off, which is
    // the opposite of what the removal meant.
    const r = resolveEligibility({
      incentive: ON,
      windows: [{ employeeId: "intern1", effectiveFrom: "2026-01-01", removedEffectiveFrom: "2026-02-01" }],
      employees: PEOPLE,
      today: TODAY,
    });
    expect(r.mode).toBe("named");
    expect(r.employeeIds).toEqual([]);
  });

  it("never includes someone who has left, or a candidate", () => {
    const r = resolveEligibility({
      incentive: ON,
      windows: [
        { employeeId: "gone", effectiveFrom: "2026-01-01", removedEffectiveFrom: null },
        { employeeId: "cand", effectiveFrom: "2026-01-01", removedEffectiveFrom: null },
        { employeeId: "sales1", effectiveFrom: "2026-01-01", removedEffectiveFrom: null },
      ],
      employees: PEOPLE,
      today: TODAY,
    });
    expect(r.employeeIds).toEqual(["sales1"]);
  });

  it("makes nobody eligible while the incentive is off offer", () => {
    for (const incentive of [
      { ...ON, active: false },
      { ...ON, validUntil: "2026-09-15" },
    ]) {
      const r = resolveEligibility({
        incentive,
        windows: [{ employeeId: "sales1", effectiveFrom: "2026-01-01", removedEffectiveFrom: null }],
        employees: PEOPLE,
        today: TODAY,
      });
      expect(r.employeeIds).toEqual([]);
      expect(r.onOffer).toBe(false);
      // The mode still reports how eligibility WOULD be decided — the screen
      // needs to say "named" even for a deactivated incentive.
      expect(r.mode).toBe("named");
    }
  });

  it("honours a future grant only once it starts", () => {
    const windows = [{ employeeId: "sales1", effectiveFrom: "2026-10-01", removedEffectiveFrom: null }];
    expect(
      resolveEligibility({ incentive: ON, windows, employees: PEOPLE, today: TODAY }).employeeIds,
    ).toEqual([]);
    expect(
      resolveEligibility({ incentive: ON, windows, employees: PEOPLE, today: "2026-10-01" }).employeeIds,
    ).toEqual(["sales1"]);
  });

  it("copes with an empty roster and an empty Master", () => {
    const r = resolveEligibility({ incentive: ON, windows: [], employees: [], today: TODAY });
    expect(r.employeeIds).toEqual([]);
    expect(r.mode).toBe("groups");
    expect(Number.isFinite(r.employeeIds.length)).toBe(true);
  });
});

describe("the Eligible column's wording", () => {
  it("counts people in named mode and names groups otherwise", () => {
    expect(eligibilityLabel({ mode: "named", count: 3, salesEligible: true, internsEligible: true })).toBe(
      "3 employees",
    );
    expect(eligibilityLabel({ mode: "named", count: 1, salesEligible: false, internsEligible: false })).toBe(
      "1 employee",
    );
    expect(eligibilityLabel({ mode: "named", count: 0, salesEligible: true, internsEligible: true })).toBe(
      "No one",
    );
    expect(eligibilityLabel({ mode: "groups", count: 9, salesEligible: true, internsEligible: true })).toBe(
      "Sales and Interns",
    );
    expect(eligibilityLabel({ mode: "groups", count: 9, salesEligible: true, internsEligible: false })).toBe("Sales");
    expect(eligibilityLabel({ mode: "groups", count: 0, salesEligible: false, internsEligible: true })).toBe(
      "Interns",
    );
    expect(eligibilityLabel({ mode: "groups", count: 0, salesEligible: false, internsEligible: false })).toBe(
      "No one",
    );
  });
});

/* ════════════════════════════════════════════════════════════════════════════
   §3 · SEARCH + FUNCTION FILTER
   ════════════════════════════════════════════════════════════════════════════ */

const row = (over: Partial<CandidateRow>): CandidateRow => ({
  id: "x",
  name: "Somebody",
  employeeCode: null,
  email: "somebody@altuscorp.com",
  departmentId: null,
  departmentName: null,
  designationName: null,
  isActive: true,
  employmentStatus: "active",
  accountType: "employee",
  eligibleFrom: null,
  ...over,
});

const SALES = "dept-sales";
const MARKETING = "dept-marketing";

const ROSTER: CandidateRow[] = [
  row({ id: "1", name: "Rahul Shah", employeeCode: "ALT-101", email: "rahul@altuscorp.com", departmentId: SALES, departmentName: "Sales" }),
  row({ id: "2", name: "Rahul Verma", employeeCode: "ALT-102", email: "rahulv@altuscorp.com", departmentId: MARKETING, departmentName: "Marketing" }),
  row({ id: "3", name: "Priya Nair", employeeCode: "ALT-103", email: "priya@altuscorp.com", departmentId: SALES, departmentName: "Sales", eligibleFrom: "2026-09-01" }),
  row({ id: "4", name: "Sunil Rao", employeeCode: "ALT-104", email: "sunil@altuscorp.com", departmentId: null, departmentName: null }),
];

describe("search and the Function filter work TOGETHER", () => {
  it("is the brief's worked example: Function Sales + search Rahul → only Rahul from Sales", () => {
    const out = filterCandidates(ROSTER, { search: "Rahul", departmentId: SALES });
    expect(out.map((r) => r.name)).toEqual(["Rahul Shah"]);
  });

  it("searches name, employee code and email", () => {
    expect(filterCandidates(ROSTER, { search: "ALT-103" }).map((r) => r.id)).toEqual(["3"]);
    expect(filterCandidates(ROSTER, { search: "rahulv@" }).map((r) => r.id)).toEqual(["2"]);
    expect(filterCandidates(ROSTER, { search: "priya nair" }).map((r) => r.id)).toEqual(["3"]);
    expect(candidateHaystack(ROSTER[0]!)).toContain("alt-101");
  });

  it("ignores case and surrounding whitespace", () => {
    expect(filterCandidates(ROSTER, { search: "  RAHUL sh  " }).map((r) => r.id)).toEqual(["1"]);
  });

  it("filters by Function alone, and keeps people with no Function out of a Function filter", () => {
    expect(filterCandidates(ROSTER, { departmentId: SALES }).map((r) => r.id)).toEqual(["1", "3"]);
    expect(filterCandidates(ROSTER, { departmentId: MARKETING }).map((r) => r.id)).toEqual(["2"]);
    expect(filterCandidates(ROSTER, { departmentId: null }).map((r) => r.id)).toEqual(["1", "2", "3", "4"]);
  });

  it("combines the eligibility scope with both of the others", () => {
    expect(filterCandidates(ROSTER, { scope: "eligible" }).map((r) => r.id)).toEqual(["3"]);
    expect(filterCandidates(ROSTER, { scope: "not_eligible" }).map((r) => r.id)).toEqual(["1", "2", "4"]);
    expect(filterCandidates(ROSTER, { scope: "eligible", departmentId: SALES }).map((r) => r.id)).toEqual(["3"]);
    expect(filterCandidates(ROSTER, { scope: "eligible", search: "Rahul" })).toEqual([]);
  });

  it("returns everything when nothing is filtered, and nothing on no match", () => {
    expect(filterCandidates(ROSTER, {})).toHaveLength(4);
    expect(filterCandidates(ROSTER, { search: "zzzz" })).toEqual([]);
    expect(filterCandidates([], { search: "Rahul" })).toEqual([]);
  });
});

describe("only current employees may be GIVEN eligibility", () => {
  it("refuses someone who has left, is inactive, or is not an employee account", () => {
    expect(mayBecomeEligible(row({}))).toBe(true);
    expect(mayBecomeEligible(row({ isActive: false }))).toBe(false);
    expect(mayBecomeEligible(row({ employmentStatus: "former" }))).toBe(false);
    expect(mayBecomeEligible(row({ accountType: "candidate" }))).toBe(false);
  });

  it("does not stop an existing grant from being ENDED", () => {
    // Someone who left while eligible must stay visible so the eligibility can
    // be closed off with a date — a different question from being added.
    const left = row({ isActive: false, employmentStatus: "former", eligibleFrom: "2026-01-01" });
    expect(mayBecomeEligible(left)).toBe(false);
    expect(left.eligibleFrom).not.toBeNull();
  });
});

/* ════════════════════════════════════════════════════════════════════════════
   §2 · VALIDATING A CHANGE
   ════════════════════════════════════════════════════════════════════════════ */

describe("an eligibility change is validated before it is written", () => {
  const ok = { employeeIds: ["a"], effectiveFrom: TODAY, today: TODAY };

  it("accepts a well-formed change", () => {
    expect(eligibilityChangeError(ok)).toBeNull();
  });

  it("needs at least one employee and refuses a duplicate", () => {
    expect(eligibilityChangeError({ ...ok, employeeIds: [] })).toBe("Pick at least one employee.");
    expect(eligibilityChangeError({ ...ok, employeeIds: ["a", "a"] })).toMatch(/twice/);
  });

  it("caps the batch", () => {
    const many = Array.from({ length: MAX_ELIGIBILITY_BATCH + 1 }, (_, i) => `e${i}`);
    expect(eligibilityChangeError({ ...ok, employeeIds: many })).toMatch(/at most/);
    expect(
      eligibilityChangeError({ ...ok, employeeIds: many.slice(0, MAX_ELIGIBILITY_BATCH) }),
    ).toBeNull();
  });

  it("refuses a malformed date", () => {
    expect(eligibilityChangeError({ ...ok, effectiveFrom: "" })).toMatch(/valid effective date/);
    expect(eligibilityChangeError({ ...ok, effectiveFrom: "16-09-2026" })).toMatch(/valid effective date/);
    expect(eligibilityChangeError({ ...ok, effectiveFrom: "2026-02-30" })).toMatch(/valid effective date/);
  });

  it("allows backdating and forward-dating within five years, and refuses a typo'd year", () => {
    expect(eligibilityChangeError({ ...ok, effectiveFrom: "2025-01-01" })).toBeNull();
    expect(eligibilityChangeError({ ...ok, effectiveFrom: "2031-01-01" })).toBeNull();
    expect(eligibilityChangeError({ ...ok, effectiveFrom: "2019-01-01" })).toMatch(/too far/);
    expect(eligibilityChangeError({ ...ok, effectiveFrom: "2206-09-16" })).toMatch(/too far/);
  });
});

/* ════════════════════════════════════════════════════════════════════════════
   §4 · WHO HEARS ABOUT A CHANGE
   ════════════════════════════════════════════════════════════════════════════ */

const snap = (over: Partial<CatalogSnapshot> = {}): CatalogSnapshot => ({
  name: "Google Review",
  description: null,
  amount: 50,
  salesEligible: true,
  internsEligible: false,
  notes: null,
  active: true,
  ...over,
});

const AUDIENCE: AudienceEmployee[] = [
  { id: "sales1", isActive: true, employmentStatus: "active", designation: "Sales Executive" },
  { id: "sales2", isActive: true, employmentStatus: "active", designation: "Consultant" },
  { id: "intern1", isActive: true, employmentStatus: "active", designation: "Sales Intern" },
  { id: "gone", isActive: false, employmentStatus: "former", designation: "Sales Executive" },
];

describe("the notification audience follows the same eligibility rule", () => {
  it("named eligibility decides the audience, overriding the flags", () => {
    const s = snap({ eligibleEmployeeIds: ["intern1"] });
    expect(isNamedEligibility(s)).toBe(true);
    expect(isEligibleFor(s, AUDIENCE[2]!)).toBe(true); // intern1, named
    expect(isEligibleFor(s, AUDIENCE[0]!)).toBe(false); // sales1, flagged but not named
  });

  it("an EMPTY named list means nobody, not 'use the groups'", () => {
    const s = snap({ eligibleEmployeeIds: [] });
    expect(isEligibleFor(s, AUDIENCE[0]!)).toBe(false);
    expect(eligibleGroupsLabel(s)).toBe("No one");
  });

  it("uses the group flags when no list is present", () => {
    expect(isEligibleFor(snap(), AUDIENCE[0]!)).toBe(true);
    expect(isEligibleFor(snap(), AUDIENCE[2]!)).toBe(false);
    expect(eligibleGroupsLabel(snap())).toBe("Sales");
  });

  it("never notifies someone inactive, or an inactive incentive's audience", () => {
    expect(isEligibleFor(snap({ eligibleEmployeeIds: ["gone"] }), AUDIENCE[3]!)).toBe(false);
    expect(isEligibleFor(snap({ active: false, eligibleEmployeeIds: ["sales1"] }), AUDIENCE[0]!)).toBe(false);
  });

  it("describes a named audience by its size", () => {
    expect(eligibleGroupsLabel(snap({ eligibleEmployeeIds: ["a"] }))).toBe("1 named employee");
    expect(eligibleGroupsLabel(snap({ eligibleEmployeeIds: ["a", "b"] }))).toBe("2 named employees");
  });
});

describe("adding and removing named employees produces the right notices", () => {
  it("tells the people ADDED that they are now eligible, and nobody else", () => {
    const plan = planCatalogNotifications({
      eventType: "updated",
      before: snap({ eligibleEmployeeIds: ["sales1"] }),
      after: snap({ eligibleEmployeeIds: ["sales1", "intern1"] }),
      employees: AUDIENCE,
      actorId: null,
    });
    expect(plan.newlyEligible).toEqual(["intern1"]);
    expect(plan.removed).toEqual([]);
    // sales1 stays eligible and nothing about the incentive itself changed, so
    // they are not told anything.
    expect(plan.updated).toEqual([]);
  });

  it("tells the people REMOVED, and nobody else", () => {
    const plan = planCatalogNotifications({
      eventType: "updated",
      before: snap({ eligibleEmployeeIds: ["sales1", "intern1"] }),
      after: snap({ eligibleEmployeeIds: ["sales1"] }),
      employees: AUDIENCE,
      actorId: null,
    });
    expect(plan.removed).toEqual(["intern1"]);
    expect(plan.newlyEligible).toEqual([]);
    expect(plan.updated).toEqual([]);
  });

  it("tells everyone still eligible when the incentive ITSELF changed", () => {
    const plan = planCatalogNotifications({
      eventType: "updated",
      before: snap({ eligibleEmployeeIds: ["sales1"], amount: 50 }),
      after: snap({ eligibleEmployeeIds: ["sales1"], amount: 75 }),
      employees: AUDIENCE,
      actorId: null,
    });
    expect(plan.updated).toEqual(["sales1"]);
  });

  it("never notifies the person who made the change", () => {
    const plan = planCatalogNotifications({
      eventType: "updated",
      before: snap({ eligibleEmployeeIds: [] }),
      after: snap({ eligibleEmployeeIds: ["sales1", "sales2"] }),
      employees: AUDIENCE,
      actorId: "sales1",
    });
    expect(plan.newlyEligible).toEqual(["sales2"]);
  });

  it("treats deactivating as a removal for everyone who was eligible", () => {
    const plan = planCatalogNotifications({
      eventType: "updated",
      before: snap({ eligibleEmployeeIds: ["sales1", "intern1"] }),
      after: snap({ eligibleEmployeeIds: ["sales1", "intern1"], active: false }),
      employees: AUDIENCE,
      actorId: null,
    });
    expect(plan.removed.sort()).toEqual(["intern1", "sales1"]);
  });

  it("tells everyone eligible when the incentive is deleted", () => {
    const plan = planCatalogNotifications({
      eventType: "deleted",
      before: snap({ eligibleEmployeeIds: ["sales1", "intern1"] }),
      after: null,
      employees: AUDIENCE,
      actorId: null,
    });
    expect(plan.deleted.sort()).toEqual(["intern1", "sales1"]);
  });

  it("tells the newly-eligible when a NEW incentive names them", () => {
    const plan = planCatalogNotifications({
      eventType: "created",
      before: null,
      after: snap({ eligibleEmployeeIds: ["intern1"] }),
      employees: AUDIENCE,
      actorId: null,
    });
    expect(plan.created).toEqual(["intern1"]);
  });

  it("reports moving from group eligibility to a named list as a real change", () => {
    const plan = planCatalogNotifications({
      eventType: "updated",
      before: snap(), // groups: sales
      after: snap({ eligibleEmployeeIds: ["intern1"] }),
      employees: AUDIENCE,
      actorId: null,
    });
    expect(plan.newlyEligible).toEqual(["intern1"]);
    expect(plan.removed.sort()).toEqual(["sales1", "sales2"]);
  });
});

describe("the change log records what changed", () => {
  it("sees the new 0232 fields", () => {
    expect(diffCatalog(snap(), snap({ incentiveType: "client_happiness" }))).toEqual([
      { field: "incentiveType", label: "Incentive type", from: "—", to: "Client Happiness" },
    ]);
    expect(diffCatalog(snap(), snap({ productName: "BSS" }))).toEqual([
      { field: "productName", label: "Product", from: "—", to: "BSS" },
    ]);
    expect(diffCatalog(snap(), snap({ duration: "one_time" }))).toEqual([
      { field: "duration", label: "Duration", from: "Permanent", to: "One-Time" },
    ]);
    expect(diffCatalog(snap(), snap({ validUntil: "2026-12-31" }))).toEqual([
      { field: "validUntil", label: "Valid until", from: "—", to: "2026-12-31" },
    ]);
  });

  it("never puts employee ids in a change line — it counts them", () => {
    const [change] = diffCatalog(
      snap({ eligibleEmployeeIds: ["a"] }),
      snap({ eligibleEmployeeIds: ["a", "b"] }),
    );
    expect(change).toEqual({
      field: "eligibleEmployeeIds",
      label: "Eligible employees",
      from: "1 employee",
      to: "2 employees",
    });
    expect(JSON.stringify(change)).not.toContain('"a"');
  });

  it("does not treat a re-ordered list as a change", () => {
    expect(
      diffCatalog(snap({ eligibleEmployeeIds: ["a", "b"] }), snap({ eligibleEmployeeIds: ["b", "a"] })),
    ).toEqual([]);
  });

  it("reports nothing for a re-save that changed nothing", () => {
    expect(diffCatalog(snap(), snap())).toEqual([]);
    expect(
      diffCatalog(snap({ eligibleEmployeeIds: ["a"] }), snap({ eligibleEmployeeIds: ["a"] })),
    ).toEqual([]);
  });

  it("still diffs a snapshot written before 0232, which has none of the fields", () => {
    const legacy = snap();
    delete legacy.incentiveType;
    delete legacy.productName;
    delete legacy.duration;
    delete legacy.validUntil;
    expect(diffCatalog(legacy, snap())).toEqual([]);
    expect(diffCatalog(legacy, snap({ amount: 75 }))).toHaveLength(1);
  });
});

describe("a snapshot survives the round trip through jsonb", () => {
  it("reads the 0232 fields back", () => {
    const s = snap({
      incentiveType: "group_intro",
      productName: "PS",
      duration: "one_time",
      validUntil: "2026-12-31",
      eligibleEmployeeIds: ["a", "b"],
    });
    expect(normalizeSnapshot(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });

  it("keeps ABSENT distinct from an empty list", () => {
    // `undefined` means "the group flags govern"; `[]` means "nobody". Reading
    // one back as the other would silently change who is eligible.
    expect(normalizeSnapshot({ name: "x", amount: 1 })?.eligibleEmployeeIds).toBeUndefined();
    expect(normalizeSnapshot({ name: "x", amount: 1, eligibleEmployeeIds: [] })?.eligibleEmployeeIds).toEqual([]);
  });

  it("survives garbage without throwing", () => {
    expect(normalizeSnapshot(null)).toBeNull();
    expect(normalizeSnapshot("nope")).toBeNull();
    expect(normalizeSnapshot({})).toBeNull();
    expect(normalizeSnapshot({ name: "x", amount: "not a number" })?.amount).toBe(0);
    expect(
      normalizeSnapshot({ name: "x", amount: 1, eligibleEmployeeIds: ["a", 7, null] })?.eligibleEmployeeIds,
    ).toEqual(["a"]);
  });
});

describe("catalogSnapshot", () => {
  const dbRow = {
    name: "Google Review",
    description: "  ",
    amount: "50.00",
    salesEligible: true,
    internsEligible: null,
    notes: null,
    active: true,
    incentiveType: "client_happiness",
    duration: "permanent",
    validUntil: "2026-12-31",
  };

  it("carries the product NAME and the eligible ids, sorted", () => {
    const s = catalogSnapshot(dbRow, { productName: "BSS", eligibleEmployeeIds: ["b", "a"] });
    expect(s.productName).toBe("BSS");
    expect(s.eligibleEmployeeIds).toEqual(["a", "b"]);
    expect(s.amount).toBe(50);
    expect(s.incentiveType).toBe("client_happiness");
    expect(s.validUntil).toBe("2026-12-31");
    // Blank description normalises to null so a whitespace edit is not a change.
    expect(s.description).toBeNull();
    expect(s.internsEligible).toBe(false);
  });

  it("leaves the eligible list ABSENT when none was given", () => {
    expect(catalogSnapshot(dbRow).eligibleEmployeeIds).toBeUndefined();
    expect(catalogSnapshot(dbRow, {}).eligibleEmployeeIds).toBeUndefined();
    expect(catalogSnapshot(dbRow, { eligibleEmployeeIds: [] }).eligibleEmployeeIds).toEqual([]);
  });

  it("trims a Date or timestamp valid-until down to a calendar day", () => {
    expect(catalogSnapshot({ ...dbRow, validUntil: "2026-12-31T00:00:00.000Z" }).validUntil).toBe("2026-12-31");
    expect(catalogSnapshot({ ...dbRow, validUntil: null }).validUntil).toBeNull();
  });
});

/* ════════════════════════════════════════════════════════════════════════════
   ONE COPY OF EACH RULE
   ════════════════════════════════════════════════════════════════════════════ */

describe("no module re-states the eligibility rule", () => {
  it("the notification audience imports the group rule instead of repeating it", () => {
    const el = codeOf("lib/incentive/notifications/eligibility.ts");
    expect(el).toMatch(/from "@\/lib\/incentive\/master"/);
    // The intern test is `looksLikeInternDesignation`, and it must be reached
    // through master.ts rather than imported again here.
    expect(el).not.toMatch(/looksLikeInternDesignation/);
  });

  it("the query layer folds with the shared rule rather than its own SQL", () => {
    const q = codeOf("lib/queries/incentive-master.ts");
    expect(q).toMatch(/resolveEligibility/);
    // No second opinion about who is current, and no second product list.
    expect(q).not.toMatch(/looksLikeInternDesignation/);
    expect(q).toMatch(/outstandingProducts/);
  });

  it("the Function filter reads `departments`, not a second department list", () => {
    const q = codeOf("lib/queries/incentive-master.ts");
    expect(q).toMatch(/departments/);
    // `DEPARTMENTS` is the legacy 11-value constant in db/enums.ts, and the
    // near-empty `functions` table is not what Employee Master shows either.
    expect(q).not.toMatch(/\bDEPARTMENTS\b/);
    expect(q).not.toMatch(/from\(functions\)/);
  });

  it("the screen validates with the shared validator, not its own rules", () => {
    for (const f of [
      "components/admin/incentive-master/master-table.tsx",
      "components/admin/incentive-master/workspace.tsx",
    ]) {
      const c = codeOf(f);
      expect(c, f).toMatch(/incentiveMasterErrors|eligibilityChangeError/);
      // No hardcoded duration or type list in a component.
      expect(c, f).not.toMatch(/"Permanent"\s*,\s*"One-Time"/);
    }
  });

  it("the Master is `incentive_catalog` — no second incentive table was created", () => {
    const q = codeOf("lib/queries/incentive-master.ts");
    const a = codeOf("app/(admin)/admin/incentive-master/actions.ts");
    expect(q).toMatch(/incentiveCatalog/);
    expect(a).toMatch(/incentiveCatalog/);
    const migration = codeOf("db/migrations/0232_incentive_master.sql");
    expect(migration).toMatch(/alter table incentive_catalog/);
    expect(migration).not.toMatch(/create table if not exists incentives\b/);
  });
});
