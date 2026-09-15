import "server-only";
import { asc, eq, ilike, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, employeeDepartments, departments, formConfigs, productOptions } from "@/db/schema";
import { type FormFieldDef } from "./field-types";
import { MODULES, SALESPERSON_FIELD_KEY, type ModuleKey } from "./modules";
import { listActiveProductNames } from "@/lib/queries/products";

/** form_key helpers — keep request/admin keys consistent everywhere. */
export const requestKey = (m: ModuleKey) => `module:${m}`;
export const adminKey = (m: ModuleKey) => `module:${m}:admin`;

/**
 * Resolve a form's effective field list: a saved admin override if one exists,
 * otherwise the code default. Errors (e.g. table missing pre-migration) fall
 * back to the default so the page still renders.
 */
export async function resolveFields(formKey: string, fallback: FormFieldDef[]): Promise<FormFieldDef[]> {
  try {
    const [row] = await db
      .select({ fields: formConfigs.fields })
      .from(formConfigs)
      .where(eq(formConfigs.formKey, formKey))
      .limit(1);
    if (row && Array.isArray(row.fields) && row.fields.length > 0) return row.fields;
  } catch {
    /* table not migrated yet — use default */
  }
  return fallback;
}

/**
 * Live global Product Name options for the `product` form-field MCQ.
 *
 * ── THE PRODUCT MASTER IS ONE OF THE TWO SOURCES, AND THE HARDCODED ARRAY
 *    IS GONE ───────────────────────────────────────────────────────────────
 * This used to fall back to `DEFAULT_PRODUCT_OPTIONS`, a hardcoded array in
 * lib/forms/field-types.ts — exactly the hardcoded dropdown the brief objects
 * to. That constant has been deleted. The list is now:
 *
 *   1. THE PRODUCT MASTER (`outstanding_products`, via lib/queries/products) —
 *      so a product an admin adds on /admin/products appears on these forms
 *      without anybody editing code.
 *   2. `product_options` — the extras this MCQ needs that are not products on
 *      the revenue master: "Don't Know", "Key Note", "Being Arjun". Migration
 *      0217 seeded them from the deleted constant, so no form lost a choice.
 *
 * ── WHY TWO SOURCES AND NOT ONE ────────────────────────────────────────────
 * They answer different questions. The master answers "what do we sell"; this
 * MCQ answers "what was this enquiry about", whose valid answers include "Don't
 * Know". Folding the extras INTO the product master would put "Don't Know" on
 * Billing's product picker and in the Outstanding contract form, which is worse
 * than keeping a short list of form-specific options.
 *
 * Merged case-insensitively, master and extras interleaved by sort order so a
 * pinned option (0217 gives "Don't Know" sortOrder 10) still leads the list and
 * the supplementary ones (110) still trail it, with the real products between.
 *
 * Historical submissions are unaffected by any of this: `module_submissions`
 * stores the chosen label as text, so a past answer reads back whether or not
 * the option is still offered.
 */
const MASTER_PRODUCT_SORT_KEY = 100;

export async function getProductOptions(): Promise<string[]> {
  const candidates: { label: string; sort: number; seq: number }[] = [];
  let seq = 0;

  try {
    for (const name of await listActiveProductNames()) {
      candidates.push({ label: name, sort: MASTER_PRODUCT_SORT_KEY, seq: seq++ });
    }
  } catch (err) {
    // The master being unreadable must not empty the dropdown — the extras
    // below are still a usable list, and an empty MCQ blocks a submission.
    console.error("forms: product master unavailable for the product MCQ", err);
  }

  try {
    const rows = await db
      .select({ label: productOptions.label, sortOrder: productOptions.sortOrder })
      .from(productOptions)
      .orderBy(asc(productOptions.sortOrder), asc(productOptions.label));
    for (const r of rows) candidates.push({ label: r.label, sort: r.sortOrder, seq: seq++ });
  } catch {
    /* table not migrated yet — the master alone is still a valid list */
  }

  candidates.sort((a, b) => a.sort - b.sort || a.seq - b.seq);

  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of candidates) {
    const key = c.label.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(c.label.trim());
  }
  return out;
}

/** Active employees whose department mentions "Sales" — for Assign Salesperson. */
export async function getSalespeople(): Promise<string[]> {
  try {
    const rows = await db
      .selectDistinct({ name: employees.name })
      .from(employees)
      .leftJoin(employeeDepartments, eq(employeeDepartments.employeeId, employees.id))
      .leftJoin(departments, eq(departments.id, employeeDepartments.departmentId))
      .where(
        or(
          ilike(employees.department, "%sales%"),
          ilike(departments.name, "%sales%"),
        ),
      );
    return rows.map((r) => r.name).filter(Boolean).sort();
  } catch {
    return [];
  }
}

/**
 * Resolve the admin field list for a module, injecting dynamic options
 * (Assign Salesperson → live Sales roster) so the editor/default both work.
 */
export async function resolveAdminFields(module: ModuleKey): Promise<FormFieldDef[]> {
  const fields = await resolveFields(adminKey(module), MODULES[module].adminFields);
  const sales = fields.some((f) => f.key === SALESPERSON_FIELD_KEY) ? await getSalespeople() : [];
  return fields.map((f) =>
    f.key === SALESPERSON_FIELD_KEY ? { ...f, type: "select", options: sales } : f,
  );
}

export async function resolveRequestFields(module: ModuleKey): Promise<FormFieldDef[]> {
  return resolveFields(requestKey(module), MODULES[module].requestFields);
}
