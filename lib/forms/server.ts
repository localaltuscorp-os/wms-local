import "server-only";
import { asc, eq, ilike, or } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, employeeDepartments, departments, formConfigs, productOptions } from "@/db/schema";
import { DEFAULT_PRODUCT_OPTIONS, type FormFieldDef } from "./field-types";
import { MODULES, SALESPERSON_FIELD_KEY, type ModuleKey } from "./modules";

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

/** Live global Product Name options (admin-extensible), defaults if unseeded. */
export async function getProductOptions(): Promise<string[]> {
  try {
    const rows = await db
      .select({ label: productOptions.label })
      .from(productOptions)
      .orderBy(asc(productOptions.sortOrder), asc(productOptions.label));
    if (rows.length > 0) return rows.map((r) => r.label);
  } catch {
    /* not migrated */
  }
  return [...DEFAULT_PRODUCT_OPTIONS];
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
