import { describe, it, expect } from "vitest";
import {
  INCENTIVE_APPLICABILITIES,
  INCENTIVE_DURATIONS,
  INCENTIVE_TYPE_OPTIONS,
  MAX_ELIGIBILITY_BATCH,
  applicabilityOf,
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
  isIntern,
  isIsoDate,
  mayBecomeEligible,
  modeOf,
  resolveEligibility,
  resolveEmployeeType,
  resolveIncentiveEligibility,
  todayIst,
  windowCoversDate,
  type CandidateRow,
  type EligibilityReason,
  type EligibilityWindow,
  type EligibleCandidate,
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
    // Reusing INCENTIVE_TYPES rather than inventing a parallel vocabulary, and
    // APPEND-ONLY: 0244 added the last two on the end.
    expect(INCENTIVE_TYPE_OPTIONS.map((o) => o.value)).toEqual([
      "bss_conversion",
      "sales_pitch",
      "client_happiness",
      "group_intro",
      "leads_referrals",
      "breakthrough_idea",
      "employment_referral",
    ]);
    expect(incentiveTypeLabel("bss_conversion")).toBe("Conversion");
    expect(incentiveTypeLabel("leads_referrals")).toBe("Leads / Referrals");
    expect(incentiveTypeLabel("breakthrough_idea")).toBe("Breakthrough Idea");
    expect(incentiveTypeLabel("employment_referral")).toBe("Employment Referral");
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
   §2 · THE RULE — APPLICABILITY DECIDES, THE GATES COME FIRST
   ════════════════════════════════════════════════════════════════════════════ */

/** The EFFECTIVE employee type and the Function the rule reads — `designation`
 *  is gone (0244): intern status is resolved from the designation MASTER's flag,
 *  never from matching a designation's text at runtime. */
const PEOPLE: EligibleCandidate[] = [
  { id: "sales1", isActive: true, employmentStatus: "active", accountType: "employee", employeeType: "employee", functionId: "dept-sales" },
  { id: "sales2", isActive: true, employmentStatus: "active", accountType: "employee", employeeType: "employee", functionId: "dept-marketing" },
  { id: "intern1", isActive: true, employmentStatus: "active", accountType: "employee", employeeType: "intern", functionId: "dept-sales" },
  { id: "gone", isActive: false, employmentStatus: "former", accountType: "employee", employeeType: "employee", functionId: "dept-sales" },
  { id: "cand", isActive: true, employmentStatus: "active", accountType: "candidate", employeeType: "employee", functionId: "dept-sales" },
];

/** A LEGACY shape: no `applicability`, so the audience is reconstructed from the
 *  flags by `applicabilityOf`. See the dedicated describe below. */
const ON = { active: true, validUntil: null, salesEligible: true, internsEligible: false };

describe("resolveEligibility", () => {
  it("reads ALL_EMPLOYEES out of a legacy scheme with no named rows", () => {
    const r = resolveEligibility({ incentive: ON, windows: [], employees: PEOPLE, today: TODAY });
    expect(r.mode).toBe("all");
    // sales1 and sales2, and only those: `cand` is not an employee account,
    // `gone` has left, and `intern1` is an intern — none of the three can earn.
    expect(r.employeeIds.sort()).toEqual(["sales1", "sales2"]);
  });

  it("reads an intern from the resolved employee type, and an interns-only scheme now covers nobody", () => {
    // The old `audienceGroupOf` matched a designation's TEXT; 0244 moved that
    // fact into `designations.employee_type`, so the same cases are asserted on
    // the two functions that replaced it.
    expect(isIntern({ employeeType: resolveEmployeeType({ designationType: "intern" }) })).toBe(true);
    expect(isIntern({ employeeType: resolveEmployeeType({ override: "intern", designationType: "employee" }) })).toBe(true);
    expect(isIntern({ employeeType: resolveEmployeeType({ override: "employee", designationType: "intern" }) })).toBe(false);
    expect(isIntern({ employeeType: resolveEmployeeType({ designationType: null }) })).toBe(false);
    // An interns-only scheme has no named rows and no sales group, so the legacy
    // reconstruction lands on SELECTED_EMPLOYEES with nobody in it — the honest
    // reading, now that interns cannot earn in ANY mode.
    const r = resolveEligibility({
      incentive: { ...ON, salesEligible: false, internsEligible: true },
      windows: [],
      employees: PEOPLE,
      today: TODAY,
    });
    expect(r.mode).toBe("selected");
    expect(r.employeeIds).toEqual([]);
  });

  it("lets SELECTED_EMPLOYEES override the legacy flags entirely", () => {
    const r = resolveEligibility({
      incentive: ON, // salesEligible = true, which must now be ignored
      windows: [{ employeeId: "sales1", effectiveFrom: "2026-01-01", removedEffectiveFrom: null }],
      employees: PEOPLE,
      today: TODAY,
    });
    expect(r.mode).toBe("selected");
    // sales2 would have been eligible on the flag alone and is not.
    expect(r.employeeIds).toEqual(["sales1"]);
  });

  it("stays in SELECTED_EMPLOYEES when the LAST named person is removed", () => {
    // The dangerous case: falling back to the flags here would hand the
    // incentive to everybody the moment the last person was taken off, which is
    // the opposite of what the removal meant.
    const r = resolveEligibility({
      incentive: ON,
      windows: [{ employeeId: "sales1", effectiveFrom: "2026-01-01", removedEffectiveFrom: "2026-02-01" }],
      employees: PEOPLE,
      today: TODAY,
    });
    expect(r.mode).toBe("selected");
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
      // needs to say "selected" even for a deactivated incentive.
      expect(r.mode).toBe("selected");
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
    expect(r.mode).toBe("all");
    expect(Number.isFinite(r.employeeIds.length)).toBe(true);
  });

  /* ── THE PER-PERSON RULE AND THE THREE MODES ─────────────────────────────── */

  it("excludes an intern in ALL THREE modes, with reason `intern`", () => {
    const intern = PEOPLE[2]!; // intern1: a real intern whose function IS the one scoped
    for (const applicability of INCENTIVE_APPLICABILITIES) {
      const windows =
        applicability === "SELECTED_EMPLOYEES"
          ? [{ employeeId: intern.id, effectiveFrom: "2026-01-01", removedEffectiveFrom: null }]
          : [];
      const r = resolveIncentiveEligibility({
        incentive: { ...ON, applicability, functionIds: [intern.functionId!] },
        windows,
        employee: intern,
        today: TODAY,
      });
      // Named, covered by the function, and company-wide — still not eligible.
      expect(r, applicability).toEqual({ eligible: false, reason: "intern" });
    }
  });

  it("matches a FUNCTION scheme on the employee's Function, and refuses anyone else's", () => {
    const fn = { ...ON, applicability: "FUNCTION", functionIds: ["dept-sales"] };
    expect(
      resolveIncentiveEligibility({ incentive: fn, windows: [], employee: PEOPLE[0]!, today: TODAY }),
    ).toEqual({ eligible: true, reason: "function" });
    expect(
      resolveIncentiveEligibility({ incentive: fn, windows: [], employee: PEOPLE[1]!, today: TODAY }),
    ).toEqual({ eligible: false, reason: "not_your_function" });
    // No Function on EITHER side is not a match: a Sales-scoped scheme must not
    // silently cover somebody whose Function is unset.
    const noFunction = { ...PEOPLE[0]!, id: "nofunc", functionId: null };
    expect(
      resolveIncentiveEligibility({ incentive: fn, windows: [], employee: noFunction, today: TODAY }),
    ).toEqual({ eligible: false, reason: "not_your_function" });
    expect(
      resolveIncentiveEligibility({ incentive: { ...fn, functionIds: [] }, windows: [], employee: PEOPLE[0]!, today: TODAY }),
    ).toEqual({ eligible: false, reason: "not_your_function" });
  });

  it("honours a SELECTED_EMPLOYEES window, and the removal date itself is NOT eligible", () => {
    const incentive = { ...ON, applicability: "SELECTED_EMPLOYEES" };
    const windows = [{ employeeId: "sales1", effectiveFrom: "2026-09-01", removedEffectiveFrom: "2026-10-01" }];
    const ask = (today: string) =>
      resolveIncentiveEligibility({ incentive, windows, employee: PEOPLE[0]!, today });
    expect(ask("2026-08-31")).toEqual({ eligible: false, reason: "not_selected" });
    expect(ask("2026-09-01")).toEqual({ eligible: true, reason: "selected" });
    expect(ask("2026-09-30")).toEqual({ eligible: true, reason: "selected" });
    // "Removed with effect from 1 Oct" — the first day NOT covered.
    expect(ask("2026-10-01")).toEqual({ eligible: false, reason: "not_selected" });
  });

  it("returns the most specific TRUE reason — the gates, in order, before the mode", () => {
    const intern = PEOPLE[2]!;
    const all = { ...ON, applicability: "ALL_EMPLOYEES" };
    // Not on offer outranks everything, including being an intern.
    expect(
      resolveIncentiveEligibility({ incentive: { ...all, active: false }, windows: [], employee: intern, today: TODAY }),
    ).toEqual({ eligible: false, reason: "not_on_offer" });
    // Not a current employee outranks being an intern.
    expect(
      resolveIncentiveEligibility({ incentive: all, windows: [], employee: { ...intern, isActive: false }, today: TODAY }),
    ).toEqual({ eligible: false, reason: "inactive" });
    // Being an intern outranks a mode that would otherwise name them eligible.
    expect(
      resolveIncentiveEligibility({
        incentive: { ...ON, applicability: "SELECTED_EMPLOYEES" },
        windows: [{ employeeId: intern.id, effectiveFrom: "2026-01-01", removedEffectiveFrom: null }],
        employee: intern,
        today: TODAY,
      }),
    ).toEqual({ eligible: false, reason: "intern" });
  });

  it("can produce every EligibilityReason, and only those", () => {
    const all = { ...ON, applicability: "ALL_EMPLOYEES" };
    const fn = { ...ON, applicability: "FUNCTION", functionIds: ["dept-sales"] };
    const selected = { ...ON, applicability: "SELECTED_EMPLOYEES" };
    const reasonFor = (input: Parameters<typeof resolveIncentiveEligibility>[0]): EligibilityReason =>
      resolveIncentiveEligibility(input).reason;

    const seen = new Set<EligibilityReason>([
      reasonFor({ incentive: { ...all, active: false }, windows: [], employee: PEOPLE[0]!, today: TODAY }),
      reasonFor({ incentive: all, windows: [], employee: { ...PEOPLE[0]!, isActive: false }, today: TODAY }),
      reasonFor({ incentive: all, windows: [], employee: PEOPLE[2]!, today: TODAY }),
      reasonFor({ incentive: all, windows: [], employee: PEOPLE[0]!, today: TODAY }),
      reasonFor({ incentive: fn, windows: [], employee: PEOPLE[0]!, today: TODAY }),
      reasonFor({ incentive: fn, windows: [], employee: PEOPLE[1]!, today: TODAY }),
      reasonFor({
        incentive: selected,
        windows: [{ employeeId: "sales1", effectiveFrom: "2026-01-01", removedEffectiveFrom: null }],
        employee: PEOPLE[0]!,
        today: TODAY,
      }),
      reasonFor({ incentive: selected, windows: [], employee: PEOPLE[0]!, today: TODAY }),
    ]);

    // The reason union has exactly eight members and the rule can reach them all.
    expect([...seen].sort()).toEqual([
      "all",
      "function",
      "inactive",
      "intern",
      "not_on_offer",
      "not_selected",
      "not_your_function",
      "selected",
    ]);
  });
});

describe("applicabilityOf, including for a snapshot written before 0244", () => {
  const legacy = { active: true, validUntil: null };

  it("maps the three applicabilities to the three UI modes", () => {
    expect(modeOf("ALL_EMPLOYEES")).toBe("all");
    expect(modeOf("FUNCTION")).toBe("functions");
    expect(modeOf("SELECTED_EMPLOYEES")).toBe("selected");
  });

  it("prefers a stored applicability over the legacy flags", () => {
    expect(applicabilityOf({ ...legacy, applicability: "FUNCTION" }, [])).toBe("FUNCTION");
    // Even where the flags would reconstruct something else.
    expect(applicabilityOf({ ...legacy, applicability: "SELECTED_EMPLOYEES", salesEligible: true }, [])).toBe(
      "SELECTED_EMPLOYEES",
    );
  });

  it("reconstructs SELECTED_EMPLOYEES from any eligibility row — removed ones included", () => {
    // Removing the last grant did NOT fall back to the flags before 0244, so a
    // removed row still proves named rows governed.
    expect(
      applicabilityOf({ ...legacy, salesEligible: true }, [
        { employeeId: "e1", effectiveFrom: "2026-01-01", removedEffectiveFrom: "2026-02-01" },
      ]),
    ).toBe("SELECTED_EMPLOYEES");
  });

  it("reconstructs ALL_EMPLOYEES from the sales flag when no row exists", () => {
    expect(applicabilityOf({ ...legacy, salesEligible: true }, [])).toBe("ALL_EMPLOYEES");
    expect(applicabilityOf({ ...legacy, internsEligible: true, salesEligible: true }, [])).toBe("ALL_EMPLOYEES");
  });

  it("reconstructs SELECTED_EMPLOYEES — nobody — for an interns-only or no-flag scheme", () => {
    expect(applicabilityOf({ ...legacy, salesEligible: false, internsEligible: true }, [])).toBe(
      "SELECTED_EMPLOYEES",
    );
    expect(applicabilityOf({ ...legacy, salesEligible: false, internsEligible: false }, [])).toBe(
      "SELECTED_EMPLOYEES",
    );
    // An absent key, an explicit null and an unknown string all mean "legacy".
    expect(applicabilityOf({ ...legacy, applicability: null, salesEligible: true }, [])).toBe("ALL_EMPLOYEES");
    expect(applicabilityOf({ ...legacy, applicability: "NOPE", salesEligible: true }, [])).toBe("ALL_EMPLOYEES");
  });
});

describe("the Eligible column's wording", () => {
  it("says which of the three audiences it is, and counts only the selected", () => {
    expect(eligibilityLabel({ mode: "all", count: 0 })).toBe("All employees");
    expect(eligibilityLabel({ mode: "all", count: 9 })).toBe("All employees");
    // Naming the functions is what tells two Function-scoped schemes apart.
    expect(eligibilityLabel({ mode: "functions", count: 0, functionNames: ["Sales", "Marketing"] })).toBe(
      "Function: Sales, Marketing",
    );
    expect(eligibilityLabel({ mode: "functions", count: 9, functionNames: [] })).toBe("Function: none selected");
    expect(eligibilityLabel({ mode: "functions", count: 9 })).toBe("Function: none selected");
    expect(eligibilityLabel({ mode: "selected", count: 3 })).toBe("3 employees");
    expect(eligibilityLabel({ mode: "selected", count: 1 })).toBe("1 employee");
    expect(eligibilityLabel({ mode: "selected", count: 0 })).toBe("No one");
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
  { id: "sales1", isActive: true, employmentStatus: "active", employeeType: "employee" },
  { id: "sales2", isActive: true, employmentStatus: "active", employeeType: "employee" },
  { id: "intern1", isActive: true, employmentStatus: "active", employeeType: "intern" },
  { id: "gone", isActive: false, employmentStatus: "former", employeeType: "employee" },
];

describe("the notification audience follows the same eligibility rule", () => {
  it("SELECTED_EMPLOYEES decides the audience, overriding the flags", () => {
    const s = snap({ eligibleEmployeeIds: ["sales1"] });
    expect(isNamedEligibility(s)).toBe(true);
    expect(isEligibleFor(s, AUDIENCE[0]!)).toBe(true); // sales1, named
    expect(isEligibleFor(s, AUDIENCE[1]!)).toBe(false); // sales2, flagged but not named
  });

  it("an EMPTY SELECTED_EMPLOYEES list means nobody, not 'use the flags'", () => {
    const s = snap({ applicability: "SELECTED_EMPLOYEES", eligibleEmployeeIds: [] });
    expect(isEligibleFor(s, AUDIENCE[0]!)).toBe(false);
    expect(eligibleGroupsLabel(s)).toBe("No one");
  });

  it("resolves a LEGACY snapshot from its flags when there is no stored applicability", () => {
    // `snap()` has no `applicability`, which is what a pre-0244 event looks
    // like; salesEligible = true reconstructs ALL_EMPLOYEES.
    expect(isEligibleFor(snap(), AUDIENCE[0]!)).toBe(true);
    // intern1 is an intern, so even company-wide they are not in the audience.
    expect(isEligibleFor(snap(), AUDIENCE[2]!)).toBe(false);
    expect(eligibleGroupsLabel(snap())).toBe("All employees");
  });

  it("never notifies someone inactive, or an inactive incentive's audience", () => {
    expect(isEligibleFor(snap({ eligibleEmployeeIds: ["gone"] }), AUDIENCE[3]!)).toBe(false);
    expect(isEligibleFor(snap({ active: false, eligibleEmployeeIds: ["sales1"] }), AUDIENCE[0]!)).toBe(false);
  });

  it("describes a selected audience by its size", () => {
    expect(eligibleGroupsLabel(snap({ eligibleEmployeeIds: ["a"] }))).toBe("1 employee");
    expect(eligibleGroupsLabel(snap({ eligibleEmployeeIds: ["a", "b"] }))).toBe("2 employees");
  });
});

describe("adding and removing named employees produces the right notices", () => {
  it("tells the people ADDED that they are now eligible, and nobody else", () => {
    const plan = planCatalogNotifications({
      eventType: "updated",
      before: snap({ eligibleEmployeeIds: ["sales1"] }),
      after: snap({ eligibleEmployeeIds: ["sales1", "sales2"] }),
      employees: AUDIENCE,
      actorId: null,
    });
    expect(plan.newlyEligible).toEqual(["sales2"]);
    expect(plan.removed).toEqual([]);
    // sales1 stays eligible and nothing about the incentive itself changed, so
    // they are not told anything.
    expect(plan.updated).toEqual([]);
  });

  it("tells the people REMOVED, and nobody else", () => {
    const plan = planCatalogNotifications({
      eventType: "updated",
      before: snap({ eligibleEmployeeIds: ["sales1", "sales2"] }),
      after: snap({ eligibleEmployeeIds: ["sales1"] }),
      employees: AUDIENCE,
      actorId: null,
    });
    expect(plan.removed).toEqual(["sales2"]);
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
      before: snap({ applicability: "SELECTED_EMPLOYEES", eligibleEmployeeIds: [] }),
      after: snap({ applicability: "SELECTED_EMPLOYEES", eligibleEmployeeIds: ["sales1", "sales2"] }),
      employees: AUDIENCE,
      actorId: "sales1",
    });
    expect(plan.newlyEligible).toEqual(["sales2"]);
  });

  it("treats deactivating as a removal for everyone who was eligible", () => {
    const plan = planCatalogNotifications({
      eventType: "updated",
      before: snap({ eligibleEmployeeIds: ["sales1", "sales2"] }),
      after: snap({ eligibleEmployeeIds: ["sales1", "sales2"], active: false }),
      employees: AUDIENCE,
      actorId: null,
    });
    expect(plan.removed.sort()).toEqual(["sales1", "sales2"]);
  });

  it("tells everyone eligible when the incentive is deleted", () => {
    const plan = planCatalogNotifications({
      eventType: "deleted",
      before: snap({ eligibleEmployeeIds: ["sales1", "sales2"] }),
      after: null,
      employees: AUDIENCE,
      actorId: null,
    });
    expect(plan.deleted.sort()).toEqual(["sales1", "sales2"]);
  });

  it("tells the newly-eligible when a NEW incentive names them", () => {
    const plan = planCatalogNotifications({
      eventType: "created",
      before: null,
      after: snap({ eligibleEmployeeIds: ["sales1"] }),
      employees: AUDIENCE,
      actorId: null,
    });
    expect(plan.created).toEqual(["sales1"]);
  });

  it("reports moving from All Employees to a selected list as a real change", () => {
    const plan = planCatalogNotifications({
      eventType: "updated",
      before: snap({ applicability: "ALL_EMPLOYEES", salesEligible: false }),
      after: snap({ applicability: "SELECTED_EMPLOYEES", eligibleEmployeeIds: ["sales2"] }),
      employees: AUDIENCE,
      actorId: null,
    });
    // Narrowing to one name takes it away from everybody else, and adds nobody.
    expect(plan.newlyEligible).toEqual([]);
    expect(plan.removed).toEqual(["sales1"]);
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

  it("treats a SCOPE change as material — and the legacy flags as no longer material", () => {
    // Who the scheme covers is now `applicability` + `functionIds`; a change to
    // either is a change worth telling the audience about.
    expect(diffCatalog(snap(), snap({ applicability: "FUNCTION" }))).toEqual([
      { field: "applicability", label: "Applies to", from: "All Employees", to: "Function" },
    ]);
    expect(diffCatalog(snap(), snap({ functionIds: ["d1"] }))).toEqual([
      { field: "functionIds", label: "Functions", from: "None", to: "1 function" },
    ]);
    expect(diffCatalog(snap(), snap({ functionIds: ["d1"] }))).toHaveLength(1);
    // `salesEligible` / `internsEligible` are legacy columns nothing edits any
    // more — flipping one is not a change and must not produce a notice.
    expect(diffCatalog(snap(), snap({ salesEligible: false }))).toEqual([]);
    expect(diffCatalog(snap(), snap({ internsEligible: true }))).toEqual([]);
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
  it("reads the 0232 and 0244 fields back", () => {
    const s = snap({
      incentiveType: "group_intro",
      productName: "PS",
      duration: "one_time",
      validUntil: "2026-12-31",
      eligibleEmployeeIds: ["a", "b"],
      applicability: "FUNCTION",
      functionIds: ["d1", "d2"],
    });
    expect(normalizeSnapshot(JSON.parse(JSON.stringify(s)))).toEqual(s);
  });

  it("keeps ABSENT distinct from an empty list", () => {
    // `undefined` means "the flags govern"; `[]` means "nobody". Reading one
    // back as the other would silently change who is eligible.
    expect(normalizeSnapshot({ name: "x", amount: 1 })?.eligibleEmployeeIds).toBeUndefined();
    expect(normalizeSnapshot({ name: "x", amount: 1, eligibleEmployeeIds: [] })?.eligibleEmployeeIds).toEqual([]);
  });

  it("keeps an ABSENT applicability and function list absent, so a pre-0244 event still resolves", () => {
    // A legacy event must not read back as a stored scope: `applicabilityOf`
    // reconstructs the audience from the flags instead.
    const legacy = normalizeSnapshot({ name: "x", amount: 1, salesEligible: true })!;
    expect(legacy.applicability).toBeNull();
    expect(legacy.functionIds).toBeUndefined();
    const asIncentive = {
      active: legacy.active,
      validUntil: null,
      applicability: legacy.applicability,
      salesEligible: legacy.salesEligible,
    };
    expect(applicabilityOf(asIncentive, [])).toBe("ALL_EMPLOYEES");
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

  it("records the scope the scheme was built with", () => {
    const scoped = catalogSnapshot({ ...dbRow, applicability: "FUNCTION" }, { functionIds: ["d2", "d1"] });
    expect(scoped.applicability).toBe("FUNCTION");
    expect(scoped.functionIds).toEqual(["d1", "d2"]);
    expect(catalogSnapshot(dbRow).applicability).toBeNull();
    expect(catalogSnapshot(dbRow).functionIds).toBeUndefined();
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
  it("the notification audience imports the applicability rule instead of repeating it", () => {
    const el = codeOf("lib/incentive/notifications/eligibility.ts");
    expect(el).toMatch(/from "@\/lib\/incentive\/master"/);
    // The per-person rule is `resolveIncentiveEligibility`, and the intern test
    // is `isIntern`: both must be reached through master.ts, never restated here.
    expect(el).toMatch(/resolveIncentiveEligibility/);
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
