/**
 * THE FULL NAMES OF THE PRODUCTS, by code.
 *
 * The product master (Admin Panel › Billing Products, `outstanding_products`)
 * stores the short codes as names — BSS, PS, … — and the Outstanding module
 * reads the same rows, so they are not renamed there. Billing shows and prints
 * the full name instead (Manan, 2026-09-19): the New Document picker lists
 * "BSS · Business Scale Up Shastra", and picking it puts the full name on the
 * line, which is what the invoice prints.
 *
 * Client-safe. Add a code here and it is picked up everywhere billing names a
 * product; a code not listed keeps the master's own name.
 */
export const PRODUCT_FULL_NAMES: Record<string, string> = {
  BSS: "Business Scale Up Shastra",
  PS: "Productivity Shastra",
  BSSO: "Business Scale Up Shastra Orientation",
  PSO: "Productivity Shastra Orientation",
  OS: "Operation System",
};

/** The full name for a product, from its code (or a name that is a code). */
export function productFullName(p: { code?: string | null; name: string }): string {
  const key = (p.code ?? p.name).trim().toUpperCase();
  return PRODUCT_FULL_NAMES[key] ?? PRODUCT_FULL_NAMES[p.name.trim().toUpperCase()] ?? p.name;
}
