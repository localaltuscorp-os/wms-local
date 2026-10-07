import { templateDef } from "./registry";

/** Saved fields replace defaults only for this exact template variant. */
export async function configuredRequiredFields(
  key: string,
  variant: string,
  defaults: readonly string[],
): Promise<readonly string[]> {
  // Keep database initialization inside the server-only execution path. Several
  // workbook/parser tests import the template registry without a runtime DB.
  const [{ and, eq }, { db }, { templateFieldConfigs }] = await Promise.all([
    import("drizzle-orm"),
    import("@/lib/db"),
    import("@/db/schema"),
  ]);
  const [row] = await db
    .select({ requiredFields: templateFieldConfigs.requiredFields })
    .from(templateFieldConfigs)
    .where(and(eq(templateFieldConfigs.key, key), eq(templateFieldConfigs.variant, variant)))
    .limit(1);
  return row ? row.requiredFields : defaults;
}

/**
 * Resolve one exact template context.  A missing row deliberately means
 * "continue using the built-in contract", while an empty saved array means the
 * administrator explicitly made every supported field optional.
 */
export async function requiredFieldsForTemplate(
  key: string,
  variant: string,
): Promise<readonly string[]> {
  const shape = templateDef(key)?.variants?.find((item) => item.id === variant);
  if (!shape) return [];
  return configuredRequiredFields(key, variant, shape.defaultRequired);
}

/** The WMS workbook convention: a trailing star marks a required column. */
export function requiredHeader(label: string, field: string, required: ReadonlySet<string>): string {
  return required.has(field) ? `${label} *` : label;
}

export async function enforceRequiredRows(
  key: string,
  variant: string,
  rows: readonly Record<string, unknown>[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const required = await requiredFieldsForTemplate(key, variant);
  const aliases: Record<string, string[]> = {
    employee: ["employeeId", "ownerEmployeeId", "employee"],
    compliance: ["title", "compliance"],
    frequency: ["mccFrequency", "wccMode"],
    day1: ["mccDays", "monthDay"],
    task: ["title", "task"],
    subject: ["subject", "category"],
  };
  const hasValue = (value: unknown): boolean => {
    if (Array.isArray(value)) return value.length > 0;
    return value !== undefined && value !== null && String(value).trim() !== "";
  };
  for (const [index, row] of rows.entries()) {
    for (const field of required) {
      const value = [field, ...(aliases[field] ?? [])].map((name) => row[name]).find(hasValue);
      if (!hasValue(value)) {
        return { ok: false, error: `Row ${index + 1}: ${field} is required.` };
      }
    }
  }
  return { ok: true };
}
