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
