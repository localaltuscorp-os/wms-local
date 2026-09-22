import {
  EMPLOYEE_TYPE_LABELS,
  EMPLOYEE_TYPES,
  INCENTIVE_APPLICABILITY_LABELS,
  INCENTIVE_APPLICABILITIES,
  INCENTIVE_DURATION_LABELS,
  INCENTIVE_DURATIONS,
  INCENTIVE_TYPE_LABELS,
  INCENTIVE_TYPES,
  type EmployeeTypeCode,
  type IncentiveApplicability,
  type IncentiveDuration,
  type IncentiveType,
} from "@/db/enums";
import {
  isIntern,
  isEmployeeTypeCode,
  resolveEmployeeType,
  EMPLOYEE_KIND_OPTIONS,
} from "@/lib/employees/employee-type";

/**
 * THE INCENTIVE MASTER — every rule about it, in one pure module.
 *
 * No I/O, no `server-only`: the admin table, the Aura workspace, the server
 * actions and the notification service all import from here, so none of them
 * can hold a different opinion about who is eligible or what a valid row looks
 * like. Client components import it to render and to disable controls; every
 * write path re-applies the same predicates on the server.
 *
 * ── THE ELIGIBILITY RULE, WRITTEN DOWN ONCE ────────────────────────────────
 * A scheme stores HOW its audience is decided — `applicability`:
 *
 *   · ALL_EMPLOYEES      — company-wide. What a new scheme defaults to.
 *   · FUNCTION           — the functions in `incentive_function_scope`.
 *   · SELECTED_EMPLOYEES — the people in `incentive_eligibility`, each with an
 *                          effective date, so "who was eligible on 3 Jun" is
 *                          answerable and a removal is recorded, not overwritten.
 *
 * Three gates sit in front of that switch, in this order, and every caller gets
 * them for free because they are inside this module:
 *
 *   1. the scheme must be ON OFFER (active, and not past Valid Until);
 *   2. the person must be a CURRENT EMPLOYEE (active, employed, real account);
 *   3. the person must NOT BE AN INTERN. Interns cannot earn an incentive in any
 *      mode — which is why `resolveEmployeeType` exists: intern status comes from
 *      the DESIGNATION master (`designations.employee_type`), overridable per
 *      person (`employees.employee_type`), and never from matching a designation's
 *      text at runtime. The one place that text was ever matched is migration
 *      0244, which materialised it into the column.
 *
 * `resolveEligibility` folds a roster through `resolveIncentiveEligibility`, so
 * the count on the admin screen, the audience for a notification and the list an
 * employee sees cannot disagree. The old `salesEligible` / `internsEligible`
 * flags are LEGACY inputs to snapshots written before 0244 (`modeOf` still reads
 * them for those) — nothing new should read them for a decision.
 */

export { INCENTIVE_DURATIONS, INCENTIVE_DURATION_LABELS };
export type { IncentiveDuration };

export const INCENTIVE_TYPE_OPTIONS: readonly { value: IncentiveType; label: string }[] =
  INCENTIVE_TYPES.map((t) => ({ value: t, label: INCENTIVE_TYPE_LABELS[t] }));

export function isIncentiveType(v: unknown): v is IncentiveType {
  return typeof v === "string" && (INCENTIVE_TYPES as readonly string[]).includes(v);
}

export function isIncentiveDuration(v: unknown): v is IncentiveDuration {
  return typeof v === "string" && (INCENTIVE_DURATIONS as readonly string[]).includes(v);
}

export function incentiveTypeLabel(t: string | null | undefined): string | null {
  return isIncentiveType(t) ? INCENTIVE_TYPE_LABELS[t] : null;
}

export function incentiveDurationLabel(d: string | null | undefined): string {
  return isIncentiveDuration(d) ? INCENTIVE_DURATION_LABELS[d] : INCENTIVE_DURATION_LABELS.permanent;
}

/* ════════════════════════════════════════════════════════════════════════════
   DATES

   Eligibility and validity are plain calendar days ("YYYY-MM-DD"), never
   timestamps. A grant effective on 1 Oct is effective for the whole of 1 Oct in
   IST, and comparing ISO date strings lexicographically gives exactly that with
   no timezone arithmetic to get wrong. `todayIst()` is the only clock here, and
   every caller can pass its own `today` so tests and the server agree.
   ════════════════════════════════════════════════════════════════════════════ */

const ISO_DATE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export function isIsoDate(v: unknown): v is string {
  if (typeof v !== "string" || !ISO_DATE.test(v)) return false;
  // Rejects 31 Feb and friends, which the regex alone allows.
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

/** Today in IST as YYYY-MM-DD — the app's timezone convention. */
export function todayIst(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** DD-MMM-YYYY, the Incentive module's display format. */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export function formatIncentiveDate(iso: string | null | undefined): string {
  if (!isIsoDate(iso)) return "—";
  const [y, m, d] = iso.split("-");
  return `${d}-${MONTHS[Number(m) - 1]}-${y}`;
}

/* ════════════════════════════════════════════════════════════════════════════
   WHAT AN INCENTIVE IS
   ════════════════════════════════════════════════════════════════════════════ */

export interface IncentiveMasterFields {
  name: string;
  description: string | null;
  amount: number;
  incentiveType: IncentiveType | null;
  productId: string | null;
  duration: IncentiveDuration;
  validUntil: string | null;
  salesEligible: boolean;
  internsEligible: boolean;
  notes: string | null;
  sortOrder: number;
  active: boolean;
}

export const MAX_INCENTIVE_AMOUNT = 10_000_000;

/**
 * Validate the Master's fields. Returns a map of field → message so the form
 * can put each message beside its own input, and the server action can refuse
 * with the first one. Both call this; there is no second set of rules.
 */
export function incentiveMasterErrors(
  input: Partial<IncentiveMasterFields>,
): Partial<Record<keyof IncentiveMasterFields, string>> {
  const errors: Partial<Record<keyof IncentiveMasterFields, string>> = {};

  const name = (input.name ?? "").trim();
  if (name.length < 2) errors.name = "Give the incentive a name.";
  else if (name.length > 160) errors.name = "Keep the name under 160 characters.";

  const amount = input.amount;
  if (typeof amount !== "number" || !Number.isFinite(amount)) errors.amount = "Enter an amount.";
  else if (amount < 0) errors.amount = "An amount cannot be negative.";
  else if (amount > MAX_INCENTIVE_AMOUNT) errors.amount = "That amount is too large.";

  if (input.incentiveType != null && !isIncentiveType(input.incentiveType)) {
    errors.incentiveType = "Choose a valid incentive type.";
  }
  if (input.duration != null && !isIncentiveDuration(input.duration)) {
    errors.duration = "Choose Permanent or One-Time.";
  }

  // Only the FORM of the date is checked, not whether it has passed. A date in
  // the past is a legitimate statement — a campaign that ended in June really
  // did end in June, and recording that is the point of the field. The screen
  // marks such a row Expired and `isIncentiveOnOffer` stops it paying; refusing
  // the save would mean the only way to record a finished scheme was to leave
  // the field empty and lose the fact.
  if (input.validUntil != null && input.validUntil !== "" && !isIsoDate(input.validUntil)) {
    errors.validUntil = "Enter a valid date.";
  }

  if ((input.description ?? "").length > 500) errors.description = "Keep the description under 500 characters.";
  if ((input.notes ?? "").length > 1000) errors.notes = "Keep the notes under 1000 characters.";

  return errors;
}

export function firstIncentiveMasterError(
  input: Partial<IncentiveMasterFields>,
): string | null {
  const errors = incentiveMasterErrors(input);
  const order: (keyof IncentiveMasterFields)[] = [
    "name",
    "amount",
    "incentiveType",
    "duration",
    "validUntil",
    "description",
    "notes",
  ];
  for (const k of order) if (errors[k]) return errors[k]!;
  return null;
}

/**
 * Is the incentive itself on offer on this date?
 *
 * `active` is the switch; `validUntil` is the end date, INCLUSIVE — an
 * incentive valid until 30 Sep still pays on 30 Sep. A scheme that has expired
 * is not deactivated in the database (that would rewrite a decision nobody
 * made), so both have to be checked and both are checked here.
 */
export function isIncentiveOnOffer(
  incentive: { active: boolean; validUntil: string | null },
  today: string = todayIst(),
): boolean {
  if (!incentive.active) return false;
  if (incentive.validUntil && incentive.validUntil < today) return false;
  return true;
}

export function hasExpired(
  incentive: { validUntil: string | null },
  today: string = todayIst(),
): boolean {
  return incentive.validUntil != null && incentive.validUntil < today;
}

/* ════════════════════════════════════════════════════════════════════════════
   WHO IS ELIGIBLE
   ════════════════════════════════════════════════════════════════════════════ */

/** The facts that decide whether a person can be eligible at all. */
export interface EligibleCandidate {
  id: string;
  isActive: boolean;
  employmentStatus: string;
  accountType?: string | null;
  /**
   * The EFFECTIVE employee type — already folded through `resolveEmployeeType`
   * by whoever loaded the row (`employees.employee_type` ?? their designation's
   * flag). Passing the raw override here would silently ignore the designation
   * master, so the query layer resolves it, not this module.
   */
  employeeType?: string | null;
  /** `employees.department_id` — the Function, for FUNCTION-scoped schemes. */
  functionId?: string | null;
}

/** A candidate the per-person rule can decide (adds nothing today, but names
 *  the contract so callers and tests read the same type). */
export type IncentiveApplicant = EligibleCandidate;

/**
 * A CURRENT employee — the only kind that may be given new eligibility.
 *
 * `is_active` (can sign in) AND `employment_status = 'active'` (still works
 * here) AND an employee account, matching `isEligible` in
 * lib/queries/incentive-analytics.ts. `employment_status` is checked as well as
 * `is_active` so somebody who has left stays left even if their login is
 * re-enabled by mistake, and `account_type` keeps candidates and system
 * accounts out of a list of people who can earn money.
 *
 * `accountType` is optional because the notification service's audience query
 * does not select it; when it is absent the other two gates still apply.
 */
export function isCurrentEmployee(e: EligibleCandidate): boolean {
  if (!e.isActive || e.employmentStatus !== "active") return false;
  return e.accountType == null || e.accountType === "employee";
}

/* ── EMPLOYEE TYPE: THE INTERN RULE ────────────────────────────────────────
   Interns cannot earn incentives. That single fact needs one source, or the
   answer depends on which screen you ask: the designation master carries the
   company rule, and an individual employee may override it. Both are ROWS, not
   strings — no code here reads a designation's name, because a rename would
   then silently change who is paid. */

export { EMPLOYEE_TYPES, EMPLOYEE_TYPE_LABELS };
export type { EmployeeTypeCode };

/**
 * The effective employee type and the intern predicate are defined in
 * `lib/employees/employee-type.ts` — it is a fact about an employee that this
 * module happens to be the first consumer of — and RE-EXPORTED here so every
 * caller of the eligibility rule still imports one module. See that file for
 * why intern status is a master flag and never a designation's name.
 */
export { resolveEmployeeType, isIntern, isEmployeeTypeCode, EMPLOYEE_KIND_OPTIONS };

/* ── APPLICABILITY ─────────────────────────────────────────────────────────
   The stored vocabulary lives in db/enums.ts; re-exported here so every caller
   of the rule imports its vocabulary from the same place as the rule. */

export { INCENTIVE_APPLICABILITIES, INCENTIVE_APPLICABILITY_LABELS };
export type { IncentiveApplicability };

export function isIncentiveApplicability(v: unknown): v is IncentiveApplicability {
  return typeof v === "string" && (INCENTIVE_APPLICABILITIES as readonly string[]).includes(v);
}

export function incentiveApplicabilityLabel(v: string | null | undefined): string {
  return isIncentiveApplicability(v)
    ? INCENTIVE_APPLICABILITY_LABELS[v]
    : INCENTIVE_APPLICABILITY_LABELS.ALL_EMPLOYEES;
}

/** One row of `incentive_eligibility`, as the rules need it. */
export interface EligibilityWindow {
  employeeId: string;
  effectiveFrom: string;
  removedEffectiveFrom: string | null;
}

/**
 * Was this grant live on `date`?
 *
 * Inclusive of `effectiveFrom`, EXCLUSIVE of `removedEffectiveFrom` — removal
 * "with effect from 1 Oct" means the last eligible day is 30 Sep. Recording the
 * two dates the same way round is what makes a removal and a re-grant on the
 * same day unambiguous.
 */
export function windowCoversDate(w: EligibilityWindow, date: string): boolean {
  if (date < w.effectiveFrom) return false;
  if (w.removedEffectiveFrom != null && date >= w.removedEffectiveFrom) return false;
  return true;
}

/** A grant that has not been removed — what the Eligible list shows. */
export function isCurrentGrant(w: EligibilityWindow): boolean {
  return w.removedEffectiveFrom == null;
}

/** The incentive facts the rule reads. `applicability` is optional ONLY so a
 *  `incentive_catalog_events` snapshot written before 0244 still resolves — see
 *  `applicabilityOf` for how those are read. */
export interface IncentiveEligibilityShape {
  active: boolean;
  validUntil: string | null;
  applicability?: string | null;
  /** The functions a FUNCTION-scoped scheme covers. Read only in that mode. */
  functionIds?: readonly string[] | null;
  /** LEGACY (pre-0244 snapshots). See `applicabilityOf`. */
  salesEligible?: boolean;
  internsEligible?: boolean;
}

/**
 * Which rule this scheme uses, INCLUDING for rows written before 0244.
 *
 * A legacy snapshot has no `applicability`, so its audience is reconstructed
 * from the facts 0244 itself used to translate:
 *
 *   · any eligibility row ever  → SELECTED_EMPLOYEES (named rows governed, and
 *     removing the last one did NOT fall back to the group flags);
 *   · `salesEligible` true      → ALL_EMPLOYEES. The old groups are binary and
 *     read off the designation, so that flag already meant "every non-intern";
 *   · otherwise                 → SELECTED_EMPLOYEES, i.e. nobody. This is the
 *     honest reading of an interns-only or no-flag scheme now that interns
 *     cannot earn at all.
 */
export function applicabilityOf(
  incentive: IncentiveEligibilityShape,
  windows: EligibilityWindow[],
): IncentiveApplicability {
  if (isIncentiveApplicability(incentive.applicability)) return incentive.applicability;
  if (windows.length > 0) return "SELECTED_EMPLOYEES";
  return incentive.salesEligible === true ? "ALL_EMPLOYEES" : "SELECTED_EMPLOYEES";
}

/**
 * WHY somebody is or is not eligible — the single answer every screen shows.
 *
 * The reason is part of the return value rather than something a caller derives
 * from the mode, so "Not eligible" is never printed where the true reason is
 * "you are an intern" or "the scheme has expired".
 */
export type EligibilityReason =
  | "all"
  | "function"
  | "selected"
  | "intern"
  | "inactive"
  | "not_on_offer"
  | "not_your_function"
  | "not_selected";

/**
 * IS THIS ONE PERSON ELIGIBLE FOR THIS ONE INCENTIVE TODAY? The rule.
 *
 * Order matters and is not arbitrary: the gates run most-general-first so the
 * reason returned is the most specific TRUE one. An intern at a company whose
 * scheme has expired is told the scheme expired, not that they are an intern —
 * and an intern under a live scheme is told they are an intern, which is the
 * fact an administrator can act on.
 */
export function resolveIncentiveEligibility(input: {
  incentive: IncentiveEligibilityShape;
  /** Every eligibility row for this incentive, removed ones included. */
  windows: EligibilityWindow[];
  employee: IncentiveApplicant;
  today?: string;
}): { eligible: boolean; reason: EligibilityReason } {
  const today = input.today ?? todayIst();

  if (!isIncentiveOnOffer(input.incentive, today)) {
    return { eligible: false, reason: "not_on_offer" };
  }
  if (!isCurrentEmployee(input.employee)) {
    return { eligible: false, reason: "inactive" };
  }
  // INTERNS CANNOT EARN AN INCENTIVE, IN ANY MODE — including a mode that names
  // them. A grant row survives (history is never deleted), it just stops being
  // an offer, which is why this check sits INSIDE the rule rather than in the
  // picker that creates grants.
  if (isIntern(input.employee)) {
    return { eligible: false, reason: "intern" };
  }

  switch (applicabilityOf(input.incentive, input.windows)) {
    case "ALL_EMPLOYEES":
      return { eligible: true, reason: "all" };
    case "FUNCTION": {
      const fns = input.incentive.functionIds ?? [];
      const mine = input.employee.functionId ?? null;
      // No function on either side is NOT a match: a scheme scoped to Sales must
      // not silently cover somebody whose Function is unset.
      if (mine != null && fns.includes(mine)) return { eligible: true, reason: "function" };
      return { eligible: false, reason: "not_your_function" };
    }
    case "SELECTED_EMPLOYEES": {
      const live = input.windows.some(
        (w) => w.employeeId === input.employee.id && windowCoversDate(w, today),
      );
      return live ? { eligible: true, reason: "selected" } : { eligible: false, reason: "not_selected" };
    }
  }
}

/**
 * WHO IS ELIGIBLE FOR THIS INCENTIVE ON THIS DATE.
 *
 * Folds the roster through the per-person rule above, so this can never answer
 * differently from the My Incentives list. Returns the employee ids and the mode
 * that decided them, so the caller can label the row without re-deriving it.
 */
export function resolveEligibility(input: {
  incentive: IncentiveEligibilityShape;
  /** Every eligibility row for this incentive, removed ones included. */
  windows: EligibilityWindow[];
  employees: IncentiveApplicant[];
  today?: string;
}): { employeeIds: string[]; mode: "all" | "functions" | "selected"; onOffer: boolean } {
  const today = input.today ?? todayIst();
  const onOffer = isIncentiveOnOffer(input.incentive, today);
  const applied = applicabilityOf(input.incentive, input.windows);
  const mode = modeOf(applied);

  if (!onOffer) return { employeeIds: [], mode, onOffer };

  const employeeIds = input.employees
    .filter(
      (e) => resolveIncentiveEligibility({ incentive: input.incentive, windows: input.windows, employee: e, today }).eligible,
    )
    .map((e) => e.id);
  return { employeeIds, mode, onOffer };
}

/** The applicability as the three UI modes. Named so the mapping lives here. */
export function modeOf(a: IncentiveApplicability): "all" | "functions" | "selected" {
  if (a === "ALL_EMPLOYEES") return "all";
  if (a === "FUNCTION") return "functions";
  return "selected";
}

/**
 * WHY, in words, for the employee-facing table. `functionNames` is passed by the
 * caller that has them (the query layer joins the function master); without them
 * the label degrades to the generic form rather than printing an id.
 */
export function eligibilityReasonLabel(reason: EligibilityReason): string {
  switch (reason) {
    case "all":               return "Company-wide";
    case "function":          return "In your function";
    case "selected":          return "Selected employee";
    case "intern":            return "Interns are not eligible";
    case "inactive":          return "Not a current employee";
    case "not_on_offer":      return "Not on offer";
    case "not_your_function": return "Not your function";
    case "not_selected":      return "Not selected";
  }
}

/**
 * How the Eligible column describes an incentive's audience.
 *
 * The FUNCTION form names the functions ("Function: Sales, Marketing") because
 * "Function" alone would make two differently-scoped schemes look identical on
 * the list. It falls back to the count when the caller has not joined the
 * function master, rather than printing ids.
 */
export function eligibilityLabel(input: {
  mode: "all" | "functions" | "selected";
  count: number;
  functionNames?: readonly string[] | null;
}): string {
  if (input.mode === "all") return "All employees";
  if (input.mode === "functions") {
    const names = (input.functionNames ?? []).filter(Boolean);
    if (names.length === 0) return "Function: none selected";
    return `Function: ${names.join(", ")}`;
  }
  return input.count === 0 ? "No one" : `${input.count} employee${input.count === 1 ? "" : "s"}`;
}

/* ════════════════════════════════════════════════════════════════════════════
   THE ELIGIBILITY SCREEN'S SEARCH AND FILTER

   Pure, and shared by the workspace and its tests. "Search and Function filter
   must work together" is a single `filterCandidates` that ANDs them, rather
   than two independent passes that could each be applied somewhere the other
   is not.
   ════════════════════════════════════════════════════════════════════════════ */

export interface CandidateRow {
  id: string;
  name: string;
  employeeCode: string | null;
  email: string;
  /** The department record, which Employee Master shows as "Function". */
  departmentId: string | null;
  departmentName: string | null;
  designationName: string | null;
  isActive: boolean;
  employmentStatus: string;
  accountType: string;
  /** The live grant, when there is one. */
  eligibleFrom: string | null;
}

/** Name, code or email — the three things somebody would type. */
export function candidateHaystack(r: CandidateRow): string {
  return [r.name, r.employeeCode, r.email].filter(Boolean).join(" ").toLowerCase();
}

export type CandidateScope = "all" | "eligible" | "not_eligible";

export function filterCandidates(
  rows: CandidateRow[],
  filters: { search?: string; departmentId?: string | null; scope?: CandidateScope },
): CandidateRow[] {
  const q = (filters.search ?? "").trim().toLowerCase();
  const dept = filters.departmentId ?? null;
  const scope = filters.scope ?? "all";

  return rows.filter((r) => {
    // Both conditions, always. Function: Sales + Search: Rahul shows only
    // Rahul from Sales, which is the brief's own worked example.
    if (dept && r.departmentId !== dept) return false;
    if (q && !candidateHaystack(r).includes(q)) return false;
    if (scope === "eligible" && r.eligibleFrom == null) return false;
    if (scope === "not_eligible" && r.eligibleFrom != null) return false;
    return true;
  });
}

/**
 * May this person be GIVEN eligibility?
 *
 * "Inactive/left employees must not be available for new eligibility." Someone
 * who has left keeps any historical grant — that is a record of what was true —
 * but cannot be added, which is why this is a separate question from
 * `isCurrentGrant`.
 */
export function mayBecomeEligible(r: CandidateRow): boolean {
  return isCurrentEmployee({
    id: r.id,
    isActive: r.isActive,
    employmentStatus: r.employmentStatus,
    accountType: r.accountType,
  });
}

/* ════════════════════════════════════════════════════════════════════════════
   VALIDATING AN ELIGIBILITY CHANGE
   ════════════════════════════════════════════════════════════════════════════ */

export const MAX_ELIGIBILITY_BATCH = 200;

/**
 * Check a batch add or remove before it touches the database.
 *
 * Applied in the server action, so a crafted request gets the same answer as
 * the dialog. The date bound exists because an effective date is an assertion
 * about the real world: a grant starting in 2031, or a removal backdated past
 * the grant it ends, is a typo rather than an intention.
 */
export function eligibilityChangeError(input: {
  employeeIds: string[];
  effectiveFrom: string;
  today?: string;
}): string | null {
  const today = input.today ?? todayIst();
  if (input.employeeIds.length === 0) return "Pick at least one employee.";
  if (input.employeeIds.length > MAX_ELIGIBILITY_BATCH) {
    return `Change at most ${MAX_ELIGIBILITY_BATCH} employees at a time.`;
  }
  if (new Set(input.employeeIds).size !== input.employeeIds.length) {
    return "The same employee appears twice.";
  }
  if (!isIsoDate(input.effectiveFrom)) return "Enter a valid effective date.";
  const y = Number(input.effectiveFrom.slice(0, 4));
  const thisYear = Number(today.slice(0, 4));
  if (y < thisYear - 5 || y > thisYear + 5) {
    return "The effective date is too far from today — check the year.";
  }
  return null;
}
