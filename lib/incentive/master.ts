import {
  INCENTIVE_DURATION_LABELS,
  INCENTIVE_DURATIONS,
  INCENTIVE_TYPE_LABELS,
  INCENTIVE_TYPES,
  type IncentiveDuration,
  type IncentiveType,
} from "@/db/enums";
import { looksLikeInternDesignation } from "@/lib/employees/employee-code";

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
 * There are two mechanisms, for a reason that is historical and deliberate:
 *
 *   · GROUP FLAGS (`salesEligible` / `internsEligible`) — the original model.
 *     Every employee falls in one group, read off their designation, because the
 *     WMS has no "sales" flag on a person.
 *   · NAMED EMPLOYEES (`incentive_eligibility`, migration 0232) — what the
 *     Incentive Chart brief asks for: add and remove specific people, each with
 *     an effective date.
 *
 * `resolveEligibility` below is the whole rule: WHERE NAMED ROWS EXIST THEY
 * GOVERN; where an incentive has none, the group flags still apply exactly as
 * they did before. That is what lets per-employee eligibility be introduced
 * without a backfill that would have to guess which of eighteen people the
 * "Sales Eligible" tick meant, and without silently changing who is eligible
 * for anything on the day it ships.
 *
 * An incentive is only ever an offer to somebody if it is ALSO on offer at all
 * — active, and not past its Valid Until — and the person is a current
 * employee. Those gates are inside `resolveEligibility`, so no caller can apply
 * an eligibility list without them.
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

/** The three facts that decide whether a person can be eligible at all. */
export interface EligibleCandidate {
  id: string;
  isActive: boolean;
  employmentStatus: string;
  accountType?: string | null;
  designation?: string | null;
}

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

export type IncentiveAudienceGroup = "sales" | "interns";

/** Which group flag applies to a person, read off their designation. */
export function audienceGroupOf(designation: string | null | undefined): IncentiveAudienceGroup {
  return looksLikeInternDesignation(designation) ? "interns" : "sales";
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

/**
 * WHO IS ELIGIBLE FOR THIS INCENTIVE ON THIS DATE. The rule, in one function.
 *
 * Returns the employee ids, and says which mechanism decided them so a caller
 * can explain itself in the UI without re-deriving the rule.
 */
export function resolveEligibility(input: {
  incentive: {
    active: boolean;
    validUntil: string | null;
    salesEligible: boolean;
    internsEligible: boolean;
  };
  /** Every eligibility row for this incentive, removed ones included. */
  windows: EligibilityWindow[];
  employees: EligibleCandidate[];
  today?: string;
}): { employeeIds: string[]; mode: "named" | "groups"; onOffer: boolean } {
  const today = input.today ?? todayIst();
  const onOffer = isIncentiveOnOffer(input.incentive, today);
  // NAMED ROWS GOVERN WHERE THEY EXIST — and "exist" means the incentive has
  // ever had one, not that one is live today. Otherwise removing the last
  // eligible person would fall back to the group flags and hand the incentive
  // to everybody, which is the opposite of what the removal meant.
  const mode: "named" | "groups" = input.windows.length > 0 ? "named" : "groups";
  if (!onOffer) return { employeeIds: [], mode, onOffer };

  const current = input.employees.filter(isCurrentEmployee);
  if (mode === "named") {
    const live = new Set(
      input.windows.filter((w) => windowCoversDate(w, today)).map((w) => w.employeeId),
    );
    return { employeeIds: current.filter((e) => live.has(e.id)).map((e) => e.id), mode, onOffer };
  }

  const ids = current
    .filter((e) =>
      audienceGroupOf(e.designation) === "interns"
        ? input.incentive.internsEligible
        : input.incentive.salesEligible,
    )
    .map((e) => e.id);
  return { employeeIds: ids, mode, onOffer };
}

/** How the Eligible column describes an incentive's audience. */
export function eligibilityLabel(input: {
  mode: "named" | "groups";
  count: number;
  salesEligible: boolean;
  internsEligible: boolean;
}): string {
  if (input.mode === "named") {
    return input.count === 0 ? "No one" : `${input.count} employee${input.count === 1 ? "" : "s"}`;
  }
  if (input.salesEligible && input.internsEligible) return "Sales and Interns";
  if (input.salesEligible) return "Sales";
  if (input.internsEligible) return "Interns";
  return "No one";
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
