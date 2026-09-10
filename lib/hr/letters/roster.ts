import "server-only";
import { eq, sql, desc } from "drizzle-orm";
import { db } from "@/lib/db";
import { formatDateHr } from "@/lib/format";
import {
  employees,
  designations,
  payingEntities,
  candidateIntake,
  onboardingSubmissions,
} from "@/db/schema";
import { getEntity, type EntityId } from "@/lib/hr/entities";

/** A recipient the letter editor can optionally attach a letter to (for filing +
 *  e-sign). Employee letters resolve their signer from this; candidate letters
 *  need none (the recipient name is a red field on the letter). */
export interface LetterRosterEmployee {
  id: string;
  name: string;
  email: string;
  department: string;
  designation: string;
  /** The employee's paying entity (from their salary profile) resolved to a
   *  letter EntityId, so picking them auto-selects the letterhead. Null when no
   *  paying entity is set → the letter keeps its default entity. */
  payingEntity: EntityId | null;
  /** The number to CALL (employees.phone), falling back to the WhatsApp number.
   *  Empty when neither is recorded. */
  phone: string;
  /** The employee's postal address, pre-formatted as the multi-line block a
   *  letter's "To," section expects. Built from their ONBOARDING submission
   *  (current address, falling back to permanent) — the only place an
   *  employee's home address is stored; `employees` has no address column.
   *  EMPTY when they have not submitted the form, which is normal and must
   *  leave the letter's Address field blank rather than filled with rubbish. */
  addressBlock: string;
  /** Joining date in the canonical letter format ("25 Jul 2026"), or empty. */
  joiningDate: string;
}

/**
 * Compose the multi-line address block from an onboarding `fields` blob.
 *
 * Keys come from lib/dossier/onboarding-schema.ts (`currAddr1..3`, `currCity`,
 * `currState`, `currPincode`, and the `perm*` equivalents) — they are defined in
 * CODE, not inferred from any one database, so this reads the same everywhere.
 * Current address wins; permanent is the fallback for someone who only filled
 * that half. Returns "" when nothing usable is present.
 */
function addressBlockFrom(fields: unknown): string {
  const f = (fields ?? {}) as Record<string, unknown>;
  const get = (k: string): string => String(f[k] ?? "").trim();
  /** Prefer the current-address key, fall back to the permanent one. */
  const pick = (curr: string, perm: string): string => get(curr) || get(perm);

  const lines = [
    pick("currAddr1", "permAddr1"),
    pick("currAddr2", "permAddr2"),
    pick("currAddr3", "permAddr3"),
  ].filter(Boolean);

  // "Mumbai - 400097" / "Mumbai, Maharashtra - 400097" — the city line carries
  // the pincode the way the letter placeholders show it.
  const city = pick("currCity", "permCity");
  const state = pick("currState", "permState");
  const pin = pick("currPincode", "permPincode");
  const cityLine = [[city, state].filter(Boolean).join(", "), pin]
    .filter(Boolean)
    .join(" - ");
  if (cityLine) lines.push(cityLine);

  return lines.join("\n");
}

/**
 * Active roster (name, email, department, designation + paying entity) for the
 * optional "attach to employee" picker on the letter page. Query-light +
 * read-only — never touches the dashboard load path.
 */
export async function loadLetterRoster(): Promise<LetterRosterEmployee[]> {
  const rows = await db
    .select({
      id: employees.id,
      name: employees.name,
      email: employees.email,
      department: employees.department,
      designation: designations.name,
      payingEntityName: payingEntities.name,
      phone: employees.phone,
      whatsappPhone: employees.whatsappPhone,
      joinedAt: employees.joinedAt,
      // LEFT join: an employee who has not filled their onboarding form still
      // belongs in the picker — they simply arrive with no address.
      onboardingFields: onboardingSubmissions.fields,
    })
    .from(employees)
    .leftJoin(designations, eq(designations.id, employees.designationId))
    .leftJoin(payingEntities, eq(payingEntities.id, employees.payingEntityId))
    .leftJoin(onboardingSubmissions, eq(onboardingSubmissions.employeeId, employees.id))
    .where(eq(employees.isActive, true))
    .orderBy(sql`lower(${employees.name})`);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email ?? "",
    department: r.department ?? "",
    designation: r.designation ?? "",
    // Resolve the paying-entity name (incl. legacy spellings like "JSV HUF") to
    // a canonical EntityId; only when one is actually set on the employee.
    payingEntity: r.payingEntityName ? getEntity(r.payingEntityName).id : null,
    phone: (r.phone ?? "").trim() || (r.whatsappPhone ?? "").trim(),
    addressBlock: addressBlockFrom(r.onboardingFields),
    joiningDate: r.joinedAt ? formatDateHr(r.joinedAt) : "",
  }));
}

/** A submitted candidate the letter editor can quick-pick to seed the recipient
 *  name AND resolve gendered pronouns (his/her, Mr./Ms., …) from their intake. */
export interface LetterCandidateOption {
  id: string;
  name: string;
  /** Raw stored gender ("Male" | "Female" | "Prefer not to say" | ""). */
  gender: string;
}

/**
 * Submitted candidate intakes (name + stored gender) for the "Candidate" quick-
 * pick on the letter page. Picking one seeds the recipient-name field and sets
 * the pronoun gender via normalizeGender. Read-only, query-light — never touches
 * the dashboard load path. Reads name/gender from the intake `data` JSON
 * (personal.fullName / personal.gender).
 */
export async function loadLetterCandidates(): Promise<LetterCandidateOption[]> {
  // Every entered candidate (not just submitted ones) so the "Candidate" quick-
  // pick is available whenever there's someone to send a letter to — picking one
  // auto-fills the recipient name + gender (→ Mr./Ms.) from their intake form.
  const rows = await db
    .select({ id: candidateIntake.id, data: candidateIntake.data })
    .from(candidateIntake)
    .orderBy(desc(candidateIntake.updatedAt))
    .limit(300);

  return rows
    .map((r) => {
      const d = (r.data ?? {}) as Record<string, string>;
      return {
        id: r.id,
        name: (d["personal.fullName"] ?? "").trim(),
        gender: (d["personal.gender"] ?? "").trim(),
      };
    })
    .filter((c) => c.name.length > 0);
}

/** Canonical Altus date for letters — "25 Jul 2026" (dd MMM yyyy, title-case). */
export function letterDate(d: Date = new Date()): string {
  return formatDateHr(d);
}
