import { formatInr } from "@/lib/format";
import {
  applicabilityOf,
  eligibilityLabel,
  incentiveApplicabilityLabel,
  incentiveDurationLabel,
  incentiveTypeLabel,
  isCurrentEmployee,
  modeOf,
  resolveIncentiveEligibility,
  type EligibilityWindow,
  type IncentiveApplicant,
  type IncentiveEligibilityShape,
} from "@/lib/incentive/master";
import type { IncentiveChangeLine } from "./kinds";

/**
 * WHO an Incentive Master change is about. Pure and client-safe.
 *
 * ── ELIGIBILITY: ONE RULE, IMPORTED ─────────────────────────────────────────
 * Whether somebody is eligible is decided by `resolveIncentiveEligibility` in
 * lib/incentive/master.ts — the same function the admin screen, the My
 * Incentives list and the request gate call. This module does NOT restate it; it
 * only decides who HEARS about a change.
 *
 * That matters most for the two facts a snapshot cannot carry on its own: an
 * intern is never eligible (their type lives on the employee row, which the
 * audience query now selects), and a FUNCTION-scoped scheme needs the function
 * ids, which ARE in the snapshot because they are configuration rather than
 * per-person data.
 *
 * Only CURRENT employees are ever an audience: `is_active` (can sign in) AND
 * `employment_status = 'active'` (still works here).
 *
 * ── WHY EVERY 0232/0244 FIELD IS OPTIONAL ──────────────────────────────────
 * A snapshot is read back out of `incentive_catalog_events.before/after`, and
 * every event written before the migration that added a key has none of them.
 * Optional means such an event still parses, still diffs, and still renders —
 * rather than the whole notification failing because a row from last month is
 * missing a column that did not exist when it was written. `applicabilityOf`
 * reconstructs the audience of a pre-0244 snapshot from the legacy group flags.
 */

export interface CatalogSnapshot {
  name: string;
  description: string | null;
  amount: number;
  /** LEGACY group flag (pre-0244). Read only by `applicabilityOf`, for events
   *  written before `applicability` existed. */
  salesEligible: boolean;
  /** LEGACY group flag (pre-0244). See `salesEligible`. */
  internsEligible: boolean;
  notes: string | null;
  active: boolean;

  // ── migration 0232 ──
  /** The request type this scheme prices, or null. */
  incentiveType?: string | null;
  /** The product's NAME, not its id: a notification has to read as words, and
   *  it must keep saying what it said even if the product is later renamed. */
  productName?: string | null;
  /** 'permanent' | 'one_time'. */
  duration?: string | null;
  validUntil?: string | null;
  /**
   * Named eligibility — the employee ids eligible at the moment of the
   * snapshot. Absent on a pre-0232 event, and on a scheme whose audience is not
   * decided by name.
   */
  eligibleEmployeeIds?: string[] | null;

  // ── migration 0244 ──
  /** ALL_EMPLOYEES | FUNCTION | SELECTED_EMPLOYEES. Absent on a pre-0244 event. */
  applicability?: string | null;
  /** The function ids a FUNCTION-scoped scheme covers. Absent when not scoped. */
  functionIds?: string[] | null;
}

export interface AudienceEmployee {
  id: string;
  isActive: boolean;
  employmentStatus: string;
  /** The EFFECTIVE employee type (see `resolveEmployeeType`). An intern is
   *  never in an incentive audience. */
  employeeType?: string | null;
  functionId?: string | null;
}

/** A person who can receive an incentive notification. */
export function isActiveEmployee(e: { isActive: boolean; employmentStatus: string }): boolean {
  return isCurrentEmployee({ id: "", isActive: e.isActive, employmentStatus: e.employmentStatus });
}

/** Does this incentive decide eligibility by naming people? */
export function isNamedEligibility(s: CatalogSnapshot | null | undefined): boolean {
  if (!s) return false;
  // A pre-0244 snapshot has no `applicability`, so the presence of an
  // eligibility list is what identifies it — and an EMPTY list is still a
  // statement ("nobody"), not an absence.
  if (s.applicability == null) return Array.isArray(s.eligibleEmployeeIds);
  return s.applicability === "SELECTED_EMPLOYEES";
}

/**
 * A snapshot as the shared rule reads it, including its legacy form.
 *
 * `validUntil` is deliberately NOT passed: a change notice is about what
 * happened to a scheme, and the audience of a change has always been decided by
 * `active` alone. Passing the date would silently drop the audience of every
 * scheme that expired, so the people who were eligible when it was withdrawn
 * would never hear that it was. The offer gate still applies to REQUESTS
 * (`isIncentiveOnOffer` in the request path), which is where a date matters.
 */
function snapshotAsIncentive(s: CatalogSnapshot): IncentiveEligibilityShape {
  return {
    active: s.active,
    validUntil: null,
    applicability: s.applicability ?? null,
    functionIds: s.functionIds ?? null,
    salesEligible: s.salesEligible,
    internsEligible: s.internsEligible,
  };
}

/** The named grants a snapshot carries, as the window shape the rule wants. */
function snapshotWindows(s: CatalogSnapshot): EligibilityWindow[] {
  if (!Array.isArray(s.eligibleEmployeeIds)) return [];
  // The snapshot records the people eligible AT THAT MOMENT, so each grant is
  // treated as open-ended from the beginning of time: the question being asked
  // of a snapshot is "who was in this list", not "who is eligible today".
  return s.eligibleEmployeeIds.map((employeeId) => ({
    employeeId,
    effectiveFrom: "0001-01-01",
    removedEffectiveFrom: null,
  }));
}

export function isEligibleFor(snapshot: CatalogSnapshot | null, e: AudienceEmployee): boolean {
  if (!snapshot) return false;
  const applicant: IncentiveApplicant = {
    id: e.id,
    isActive: e.isActive,
    employmentStatus: e.employmentStatus,
    employeeType: e.employeeType ?? null,
    functionId: e.functionId ?? null,
  };
  return resolveIncentiveEligibility({
    incentive: snapshotAsIncentive(snapshot),
    windows: snapshotWindows(snapshot),
    employee: applicant,
  }).eligible;
}

export function eligibleGroupsLabel(s: CatalogSnapshot): string {
  const applicability = applicabilityOf(snapshotAsIncentive(s), snapshotWindows(s));
  return eligibilityLabel({
    mode: modeOf(applicability),
    count: s.eligibleEmployeeIds?.length ?? 0,
    functionNames: null,
  });
}

/** Read a snapshot back from jsonb, defensively. */
export function normalizeSnapshot(raw: unknown): CatalogSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.name !== "string") return null;
  const amount = Number(o.amount);
  const text = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v.trim() : null;
  const strings = (v: unknown): string[] | undefined =>
    Array.isArray(v) ? (v as unknown[]).filter((x): x is string => typeof x === "string") : undefined;
  return {
    name: o.name,
    description: text(o.description),
    amount: Number.isFinite(amount) ? amount : 0,
    salesEligible: o.salesEligible === true,
    internsEligible: o.internsEligible === true,
    notes: text(o.notes),
    active: o.active !== false,
    incentiveType: text(o.incentiveType),
    productName: text(o.productName),
    duration: text(o.duration),
    validUntil: text(o.validUntil),
    // Absent stays absent — `undefined` means "the group flags governed", which
    // is a different statement from an empty list ("nobody is eligible").
    eligibleEmployeeIds: strings(o.eligibleEmployeeIds),
    // Same rule for 0244: absent means "written before applicability existed",
    // which `applicabilityOf` reconstructs rather than assuming a default.
    applicability: text(o.applicability),
    functionIds: strings(o.functionIds),
  };
}

// ── What changed ─────────────────────────────────────────────────────────────

export type CatalogField = keyof CatalogSnapshot;

export interface CatalogChange extends IncentiveChangeLine {
  field: CatalogField;
}

const FIELD_LABELS: Record<CatalogField, string> = {
  name: "Name",
  amount: "Amount",
  incentiveType: "Incentive type",
  productName: "Product",
  duration: "Duration",
  validUntil: "Valid until",
  salesEligible: "Sales eligible",
  internsEligible: "Interns eligible",
  eligibleEmployeeIds: "Eligible employees",
  applicability: "Applies to",
  functionIds: "Functions",
  active: "Available",
  description: "Description",
  notes: "Notes",
};

/** Display order, and the complete list of MATERIAL fields. Display order in
 *  the table (`sort_order`) and timestamps are not here on purpose: moving a row
 *  or re-saving it unchanged is not a change anyone needs to hear about. */
const MATERIAL_FIELDS: CatalogField[] = [
  "name",
  "amount",
  "incentiveType",
  "productName",
  "duration",
  "validUntil",
  "applicability",
  "functionIds",
  "eligibleEmployeeIds",
  "active",
  "description",
  "notes",
];

/** Fields that change WHO is eligible — reported through removed / newly
 *  eligible notices, not as an "updated" notice to people it did not affect.
 *
 *  `applicability` and `functionIds` belong here: switching a scheme from All
 *  Employees to Function: Sales takes it away from everybody else, which is an
 *  audience change even though the amount never moved. */
const AUDIENCE_FIELDS = new Set<CatalogField>([
  "applicability",
  "functionIds",
  "eligibleEmployeeIds",
  "active",
]);

/** Two lists of ids, same members regardless of order — `undefined` and `[]` are
 *  NOT the same for `eligibleEmployeeIds` (absent = no named eligibility, empty
 *  = nobody), which is what `absentMatches` decides. */
function sameIds(x: unknown, y: unknown, absentMatches: boolean): boolean {
  const ax = Array.isArray(x);
  const ay = Array.isArray(y);
  if (!ax || !ay) return absentMatches ? ax === ay : false;
  const sx = [...(x as string[])].sort();
  const sy = [...(y as string[])].sort();
  return sx.length === sy.length && sx.every((v, i) => v === sy[i]);
}

function display(field: CatalogField, v: CatalogSnapshot[CatalogField]): string {
  if (field === "amount") return formatInr(Number(v));
  if (field === "incentiveType") return incentiveTypeLabel(v as string | null) ?? "—";
  if (field === "duration") return incentiveDurationLabel(v as string | null);
  if (field === "applicability") return incentiveApplicabilityLabel(v as string | null);
  if (field === "functionIds") {
    const n = Array.isArray(v) ? v.length : 0;
    return n === 0 ? "None" : `${n} function${n === 1 ? "" : "s"}`;
  }
  if (Array.isArray(v)) {
    // Never a list of uuids: a notification reads as words, and the people who
    // gained or lost eligibility are told individually anyway. A function list
    // reads as its count here for the same reason — the notice says "Functions:
    // 2", and the admin screen is where the names live.
    return v.length === 0 ? "No one" : `${v.length} employee${v.length === 1 ? "" : "s"}`;
  }
  if (typeof v === "boolean") return v ? "Yes" : "No";
  const s = (v ?? "").toString().trim();
  return s || "—";
}

/** Two snapshots agree on this field. */
function same(field: CatalogField, a: CatalogSnapshot, b: CatalogSnapshot): boolean {
  if (field === "amount") return Math.round(a.amount * 100) === Math.round(b.amount * 100);
  if (field === "description" || field === "notes") {
    return (a[field] ?? "").trim() === (b[field] ?? "").trim();
  }
  if (field === "eligibleEmployeeIds") {
    // Absent vs a list IS a real change (the scheme moved from group
    // eligibility to named eligibility); the two lists are compared as sets,
    // because the same people in a different order is no change.
    return sameIds(a.eligibleEmployeeIds, b.eligibleEmployeeIds, true);
  }
  if (field === "functionIds") {
    // Both absent (an unscoped scheme, or a pre-0244 snapshot) is the same; a
    // change of membership is not, whatever the order.
    const x = a.functionIds;
    const y = b.functionIds;
    if (!Array.isArray(x) && !Array.isArray(y)) return true;
    return sameIds(x, y, false);
  }
  if (
    field === "incentiveType" ||
    field === "productName" ||
    field === "duration" ||
    field === "validUntil" ||
    field === "applicability"
  ) {
    return (a[field] ?? null) === (b[field] ?? null);
  }
  return a[field] === b[field];
}

export function diffCatalog(before: CatalogSnapshot, after: CatalogSnapshot): CatalogChange[] {
  return MATERIAL_FIELDS.filter((f) => !same(f, before, after)).map((f) => ({
    field: f,
    label: FIELD_LABELS[f],
    from: display(f, before[f]),
    to: display(f, after[f]),
  }));
}

// ── Who hears about it ───────────────────────────────────────────────────────

export interface CatalogNotificationPlan {
  /** A new incentive → everyone eligible for it. */
  created: string[];
  /** An edit made someone eligible who was not before. */
  newlyEligible: string[];
  /** An edit changed the incentive for people who stay eligible. */
  updated: string[];
  /** An edit removed someone's eligibility (or took the incentive off offer). */
  removed: string[];
  /** The incentive was deleted → everyone who was eligible for it. */
  deleted: string[];
}

/**
 * Recipients for one Incentive Master event. The person who made the change is
 * never notified about their own change (the same rule the task notifications
 * follow).
 *
 * ── AN ELIGIBILITY CHANGE IS JUST AN "UPDATED" EVENT ───────────────────────
 * Adding or removing named employees changes `eligibleEmployeeIds` between the
 * before and after snapshots, so the before/after sets below already differ and
 * this function already produces exactly the right notices: `newlyEligible` for
 * the people added and `removed` for the people taken off. There is no separate
 * eligibility notification path, which is why the brief's four cases are four
 * outcomes of one function rather than four code paths that could disagree.
 */
export function planCatalogNotifications(input: {
  eventType: "created" | "updated" | "deleted";
  before: CatalogSnapshot | null;
  after: CatalogSnapshot | null;
  employees: AudienceEmployee[];
  actorId: string | null;
}): CatalogNotificationPlan {
  const plan: CatalogNotificationPlan = { created: [], newlyEligible: [], updated: [], removed: [], deleted: [] };
  const people = input.employees.filter((e) => e.id !== input.actorId);
  const eligible = (s: CatalogSnapshot | null) => new Set(people.filter((e) => isEligibleFor(s, e)).map((e) => e.id));

  if (input.eventType === "created") {
    plan.created = [...eligible(input.after)];
    return plan;
  }
  if (input.eventType === "deleted") {
    plan.deleted = [...eligible(input.before)];
    return plan;
  }

  const before = eligible(input.before);
  const after = eligible(input.after);
  const contentChanged =
    !!input.before &&
    !!input.after &&
    diffCatalog(input.before, input.after).some((c) => !AUDIENCE_FIELDS.has(c.field));

  for (const id of before) {
    if (!after.has(id)) plan.removed.push(id);
    else if (contentChanged) plan.updated.push(id);
  }
  for (const id of after) {
    if (!before.has(id)) plan.newlyEligible.push(id);
  }
  return plan;
}

// ── Building a snapshot from a database row ──────────────────────────────────

/**
 * A catalog row as the snapshot stored on its change record.
 *
 * ── THE SNAPSHOT IS THE NOTIFICATION'S ONLY SOURCE ─────────────────────────
 * Everything a notification and its email will say is captured here, at the
 * moment of the change, and nothing is looked up again later. So a product
 * renamed next week does not rewrite what last week's email said, and a retried
 * email (lib/notifications/retry.ts) renders exactly what the first attempt
 * would have.
 *
 * That is why the PRODUCT NAME is stored rather than its id, and why the named
 * eligibility is stored as the ids eligible at that moment. `extra` is a
 * separate argument because neither the product name nor the eligibility list
 * is a column on `incentive_catalog` — the caller resolves them in the same
 * transaction as the change.
 */
export function catalogSnapshot(
  row: {
    name: string;
    description: string | null;
    amount: string | number;
    salesEligible?: boolean | null;
    internsEligible?: boolean | null;
    notes: string | null;
    active: boolean;
    incentiveType?: string | null;
    duration?: string | null;
    validUntil?: string | Date | null;
    applicability?: string | null;
  },
  extra: {
    productName?: string | null;
    /** Omit entirely when the incentive has no named eligibility — `undefined`
     *  means "eligibility is not decided by name", which an empty array does
     *  not (an empty list means NOBODY). */
    eligibleEmployeeIds?: string[];
    /** The functions a FUNCTION-scoped scheme covers. Omit when not scoped. */
    functionIds?: string[];
  } = {},
): CatalogSnapshot {
  return {
    name: row.name,
    description: row.description?.trim() || null,
    amount: Number(row.amount) || 0,
    // Kept so the snapshot stays readable, and so `applicabilityOf` can rebuild
    // the audience of the pre-0244 events that carry nothing else.
    salesEligible: row.salesEligible === true,
    internsEligible: row.internsEligible === true,
    notes: row.notes?.trim() || null,
    active: row.active,
    incentiveType: row.incentiveType ?? null,
    productName: extra.productName ?? null,
    duration: row.duration ?? null,
    validUntil: row.validUntil == null ? null : String(row.validUntil).slice(0, 10),
    eligibleEmployeeIds: extra.eligibleEmployeeIds
      ? [...extra.eligibleEmployeeIds].sort()
      : undefined,
    applicability: row.applicability ?? null,
    functionIds: extra.functionIds ? [...extra.functionIds].sort() : undefined,
  };
}
