/**
 * WHICH ISSUING COMPANIES CHARGE GST.
 *
 * Only Altus Corp and Colour Graphics are GST-registered issuers. A document
 * raised by any other entity carries no GST details at all — no GST lines, no
 * reverse charge, no exempt flag — and the form does not offer them.
 *
 * Matched by id AND by name, so Colour Graphics qualifies the moment it is
 * added to the entity registry (lib/hr/entities.ts), whatever slug it gets.
 * Client-safe: the form and the server both ask this one function.
 */
const GST_ENTITY_IDS = new Set(["altus-corp", "colour-graphics"]);
const GST_ENTITY_NAMES = new Set(["altus corp", "colour graphics", "color graphics"]);

export function entityChargesGst(entityId: string | null | undefined, displayName?: string | null): boolean {
  if (entityId && GST_ENTITY_IDS.has(entityId)) return true;
  const name = displayName?.trim().toLowerCase();
  return Boolean(name && GST_ENTITY_NAMES.has(name));
}
