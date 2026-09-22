import { formatInr } from "@/lib/format";
import {
  audienceGroupOf,
  incentiveDurationLabel,
  incentiveTypeLabel,
  isCurrentEmployee,
  type IncentiveAudienceGroup,
} from "@/lib/incentive/master";
import type { IncentiveChangeLine } from "./kinds";

/**
 * WHO an Incentive Master change is about. Pure and client-safe.
 *
 * ── ELIGIBILITY: TWO MECHANISMS, ONE RULE ───────────────────────────────────
 * `eligibleEmployeeIds` — the named eligibility of the Incentive Chart
 * (`incentive_eligibility`, migration 0232) — GOVERNS WHEN IT IS PRESENT.
 * When it is absent the original group flags apply: "Sales Eligible" and
 * "Interns Eligible", resolved off the employee's designation, because the WMS
 * has no "sales" flag on a person.
 *
 * That rule is not restated here — `audienceGroupOf` and `isCurrentEmployee`
 * are imported from lib/incentive/master.ts, which is where the Incentive
 * Master's rules live and what the admin screen and the queries also read. This
 * module only decides who HEARS about a change.
 *
 * Only CURRENT employees are ever an audience: `is_active` (can sign in) AND
 * `employment_status = 'active'` (still works here).
 *
 * ── WHY EVERY 0232 FIELD IS OPTIONAL ───────────────────────────────────────
 * A snapshot is read back out of `incentive_catalog_events.before/after`, and
 * every event written before 0232 has none of these keys. Optional means such
 * an event still parses, still diffs, and still renders — rather than the whole
 * notification failing because a row from last month is missing a column that
 * did not exist when it was written.
 */

export interface CatalogSnapshot {
  name: string;
  description: string | null;
  amount: number;
  salesEligible: boolean;
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
   * snapshot. `null`/absent means this incentive has no named eligibility and
   * the group flags govern.
   */
  eligibleEmployeeIds?: string[] | null;
}

export type { IncentiveAudienceGroup };
export { audienceGroupOf };

export interface AudienceEmployee {
  id: string;
  isActive: boolean;
  employmentStatus: string;
  designation?: string | null;
}

/** A person who can receive an incentive notification. */
export function isActiveEmployee(e: { isActive: boolean; employmentStatus: string }): boolean {
  return isCurrentEmployee({ id: "", isActive: e.isActive, employmentStatus: e.employmentStatus });
}

/** Does this incentive decide eligibility by name rather than by group? */
export function isNamedEligibility(s: CatalogSnapshot | null | undefined): boolean {
  return Array.isArray(s?.eligibleEmployeeIds);
}

export function isEligibleFor(snapshot: CatalogSnapshot | null, e: AudienceEmployee): boolean {
  if (!snapshot || !snapshot.active || !isActiveEmployee(e)) return false;
  // Named eligibility wins. An empty named list means nobody — NOT "fall back
  // to the groups", which would hand the incentive to everyone the moment the
  // last named person was removed.
  if (Array.isArray(snapshot.eligibleEmployeeIds)) {
    return snapshot.eligibleEmployeeIds.includes(e.id);
  }
  return audienceGroupOf(e.designation) === "interns"
    ? snapshot.internsEligible
    : snapshot.salesEligible;
}

export function eligibleGroupsLabel(s: CatalogSnapshot): string {
  if (Array.isArray(s.eligibleEmployeeIds)) {
    const n = s.eligibleEmployeeIds.length;
    return n === 0 ? "No one" : `${n} named employee${n === 1 ? "" : "s"}`;
  }
  if (s.salesEligible && s.internsEligible) return "Sales and Interns";
  if (s.salesEligible) return "Sales";
  if (s.internsEligible) return "Interns";
  return "No one";
}

/** Read a snapshot back from jsonb, defensively. */
export function normalizeSnapshot(raw: unknown): CatalogSnapshot | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (typeof o.name !== "string") return null;
  const amount = Number(o.amount);
  const text = (v: unknown): string | null =>
    typeof v === "string" && v.trim() ? v.trim() : null;
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
    // Absent stays absent — `undefined` means "the group flags govern", which
    // is a different statement from an empty list ("nobody is eligible").
    eligibleEmployeeIds: Array.isArray(o.eligibleEmployeeIds)
      ? (o.eligibleEmployeeIds as unknown[]).filter((x): x is string => typeof x === "string")
      : undefined,
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
  "salesEligible",
  "internsEligible",
  "eligibleEmployeeIds",
  "active",
  "description",
  "notes",
];

/** Fields that change WHO is eligible — reported through removed / newly
 *  eligible notices, not as an "updated" notice to people it did not affect. */
const AUDIENCE_FIELDS = new Set<CatalogField>([
  "salesEligible",
  "internsEligible",
  "eligibleEmployeeIds",
  "active",
]);

function display(field: CatalogField, v: CatalogSnapshot[CatalogField]): string {
  if (field === "amount") return formatInr(Number(v));
  if (field === "incentiveType") return incentiveTypeLabel(v as string | null) ?? "—";
  if (field === "duration") return incentiveDurationLabel(v as string | null);
  if (Array.isArray(v)) {
    // Never a list of uuids: a notification reads as words, and the people who
    // gained or lost eligibility are told individually anyway.
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
    const x = a.eligibleEmployeeIds;
    const y = b.eligibleEmployeeIds;
    // Absent vs absent is the same; absent vs a list is a real change (the
    // incentive moved from group eligibility to named eligibility).
    if (!Array.isArray(x) || !Array.isArray(y)) return Array.isArray(x) === Array.isArray(y);
    if (x.length !== y.length) return false;
    // Order is not meaning — the same people in a different order is no change.
    const sx = [...x].sort();
    const sy = [...y].sort();
    return sx.every((v, i) => v === sy[i]);
  }
  if (field === "incentiveType" || field === "productName" || field === "duration" || field === "validUntil") {
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
    salesEligible: boolean | null;
    internsEligible: boolean | null;
    notes: string | null;
    active: boolean;
    incentiveType?: string | null;
    duration?: string | null;
    validUntil?: string | Date | null;
  },
  extra: {
    productName?: string | null;
    /** Omit entirely when the incentive has no named eligibility — `undefined`
     *  means "the group flags govern", which an empty array does not. */
    eligibleEmployeeIds?: string[];
  } = {},
): CatalogSnapshot {
  return {
    name: row.name,
    description: row.description?.trim() || null,
    amount: Number(row.amount) || 0,
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
  };
}
