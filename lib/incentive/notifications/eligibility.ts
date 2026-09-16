import { formatInr } from "@/lib/format";
import { looksLikeInternDesignation } from "@/lib/employees/employee-code";
import type { IncentiveChangeLine } from "./kinds";

/**
 * WHO an Incentive Master change is about. Pure and client-safe.
 *
 * ── ELIGIBILITY ─────────────────────────────────────────────────────────────
 * The Incentive Table (`incentive_catalog`) records eligibility per GROUP, not
 * per person: "Sales Eligible" and "Interns Eligible". The WMS has no separate
 * "sales" flag on an employee, so the two groups are read off the employee's
 * designation, with the same rule the employee-code allocator already uses to
 * recognise an intern (`looksLikeInternDesignation`):
 *
 *   · an employee whose designation reads Intern / Trainee / Apprentice → Interns
 *   · every other employee                                              → Sales
 *
 * Only ACTIVE employees are ever an audience: `is_active` (can sign in) AND
 * `employment_status = 'active'` (still works here). Everything about the rule
 * lives in `audienceGroupOf` / `isEligibleFor`, so changing it is one place.
 */

export interface CatalogSnapshot {
  name: string;
  description: string | null;
  amount: number;
  salesEligible: boolean;
  internsEligible: boolean;
  notes: string | null;
  active: boolean;
}

export type IncentiveAudienceGroup = "sales" | "interns";

export interface AudienceEmployee {
  id: string;
  isActive: boolean;
  employmentStatus: string;
  designation: string | null;
}

export function isActiveEmployee(e: { isActive: boolean; employmentStatus: string }): boolean {
  return e.isActive === true && e.employmentStatus === "active";
}

export function audienceGroupOf(designation: string | null | undefined): IncentiveAudienceGroup {
  return looksLikeInternDesignation(designation) ? "interns" : "sales";
}

export function isEligibleFor(snapshot: CatalogSnapshot | null, e: AudienceEmployee): boolean {
  if (!snapshot || !snapshot.active || !isActiveEmployee(e)) return false;
  return audienceGroupOf(e.designation) === "interns" ? snapshot.internsEligible : snapshot.salesEligible;
}

export function eligibleGroupsLabel(s: CatalogSnapshot): string {
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
  return {
    name: o.name,
    description: typeof o.description === "string" && o.description.trim() ? o.description : null,
    amount: Number.isFinite(amount) ? amount : 0,
    salesEligible: o.salesEligible === true,
    internsEligible: o.internsEligible === true,
    notes: typeof o.notes === "string" && o.notes.trim() ? o.notes : null,
    active: o.active !== false,
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
  salesEligible: "Sales eligible",
  internsEligible: "Interns eligible",
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
  "salesEligible",
  "internsEligible",
  "active",
  "description",
  "notes",
];

/** Fields that change WHO is eligible — reported through removed / newly
 *  eligible notices, not as an "updated" notice to people it did not affect. */
const AUDIENCE_FIELDS = new Set<CatalogField>(["salesEligible", "internsEligible", "active"]);

function display(field: CatalogField, v: CatalogSnapshot[CatalogField]): string {
  if (field === "amount") return formatInr(Number(v));
  if (typeof v === "boolean") return v ? "Yes" : "No";
  const s = (v ?? "").toString().trim();
  return s || "—";
}

function same(field: CatalogField, a: CatalogSnapshot, b: CatalogSnapshot): boolean {
  if (field === "amount") return Math.round(a.amount * 100) === Math.round(b.amount * 100);
  if (field === "description" || field === "notes") return (a[field] ?? "").trim() === (b[field] ?? "").trim();
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
