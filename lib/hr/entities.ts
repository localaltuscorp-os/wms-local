/**
 * Canonical paying-entity registry for the Altus HR module.
 *
 * Altus pays its people through FIVE legal entities. Every letter, agreement,
 * policy or payslip that carries a letterhead is branded from ONE of these.
 * This module is the single source of truth for the display name, legal name,
 * logo asset and letterhead contact/address block of each entity.
 *
 * PURE — no DB, no server-only imports. Safe to import from client OR server
 * components (the <Letterhead> wrapper, PDF routes, salary screens, …), so it
 * stays load-neutral.
 *
 * NOTE — the salary module stores the paying entity per employee as a DB row in
 * `paying_entities.name` (see db/schema.ts). The `displayName`s below are the
 * canonical spellings those rows are reconciled to (migration 0158). Keep the
 * two in sync: if you rename an entity here, add a data migration there.
 */

export type EntityId =
  | "altus-corp"
  | "unleashed"
  | "gainmakers"
  | "legacy-creators"
  | "perfect-blend";

export interface Entity {
  /** Stable slug — never rendered, used as the key / logo filename. */
  id: EntityId;
  /** Human name shown on the letterhead + in pickers (matches salary roster). */
  displayName: string;
  /** Full legal name printed in the caption / signature block. */
  legalName: string;
  /** Public path to the entity logo (already copied into /public/logos). */
  logo: string;
  /** Footer contact line (phone | email | website). */
  contactLine: string;
  /** Footer address bar (single line). */
  addressLine: string;
  /** Footer phone / email / website — fall back to the shared Altus values. */
  phone?: string;
  email?: string;
  website?: string;
}

/** The shared Altus office contact/address — the default footer for every
 *  entity (they all operate out of the same Mumbai office). Override per entity
 *  by setting `contactLine` / `addressLine` in the registry below. */
export const DEFAULT_PHONE = "+91 80970 10410";
export const DEFAULT_EMAIL = "manan@unleashed.in";
export const DEFAULT_WEBSITE = "www.mananvasa.com";
// Separator is the middle dot U+00B7 — it IS in pdfkit's WinAnsi (cp1252)
// encoding, unlike the old ▸ (U+25B8), which pdfkit rendered as a stray "%".
export const DEFAULT_CONTACT_LINE = `${DEFAULT_PHONE}  ·  ${DEFAULT_EMAIL}  ·  ${DEFAULT_WEBSITE}`;
export const DEFAULT_ADDRESS_LINE =
  "Sacred Space, C-6, Gambhir Estates, Kotkar Road, Goregaon (E), Mumbai 63";

/** The entity a letterhead falls back to when none is specified. */
export const DEFAULT_ENTITY_ID: EntityId = "altus-corp";

/**
 * The registry. `altus-corp` is first (the default). Contact/address default to
 * the shared Altus values above; pass explicit strings on an entity to override.
 */
export const ENTITIES: Record<EntityId, Entity> = {
  "altus-corp": {
    id: "altus-corp",
    displayName: "Altus Corp",
    legalName: "Altus Corp",
    logo: "/logos/altus-corp.jpg",
    contactLine: DEFAULT_CONTACT_LINE,
    addressLine: DEFAULT_ADDRESS_LINE,
  },
  unleashed: {
    id: "unleashed",
    displayName: "Unleashed",
    legalName: "Unleashed",
    logo: "/logos/unleashed.jpg",
    contactLine: DEFAULT_CONTACT_LINE,
    addressLine: DEFAULT_ADDRESS_LINE,
  },
  gainmakers: {
    id: "gainmakers",
    displayName: "The Gainmakers (MJV HUF)",
    legalName: "The Gainmakers — MJV HUF",
    logo: "/logos/gainmakers.jpg",
    contactLine: DEFAULT_CONTACT_LINE,
    addressLine: DEFAULT_ADDRESS_LINE,
  },
  "legacy-creators": {
    id: "legacy-creators",
    displayName: "Legacy Creators (JSV HUF)",
    legalName: "Legacy Creators — JSV HUF",
    logo: "/logos/legacy-creators.jpg",
    contactLine: DEFAULT_CONTACT_LINE,
    addressLine: DEFAULT_ADDRESS_LINE,
  },
  "perfect-blend": {
    id: "perfect-blend",
    displayName: "The Perfect Blend (Khushboo Shah)",
    legalName: "The Perfect Blend — Khushboo Shah",
    logo: "/logos/perfect-blend.jpg",
    contactLine: DEFAULT_CONTACT_LINE,
    addressLine: DEFAULT_ADDRESS_LINE,
  },
};

/** Ordered list (altus-corp first) for pickers / iteration. */
export const ENTITY_LIST: Entity[] = [
  ENTITIES["altus-corp"],
  ENTITIES.unleashed,
  ENTITIES.gainmakers,
  ENTITIES["legacy-creators"],
  ENTITIES["perfect-blend"],
];

/** Type guard for a raw string. */
export function isEntityId(v: unknown): v is EntityId {
  return typeof v === "string" && v in ENTITIES;
}

/**
 * Resolve an entity by id. Accepts an already-resolved Entity (returned as-is),
 * a known EntityId, the canonical displayName, or a loose legacy name (e.g. the
 * salary roster's "MJV HUF" / "JSV HUF"). Anything unknown / empty falls back
 * to the default entity, so callers never have to null-check.
 */
export function getEntity(ref: EntityId | Entity | string | null | undefined): Entity {
  if (ref && typeof ref === "object" && "id" in ref) return ref;
  if (isEntityId(ref)) return ENTITIES[ref];
  if (typeof ref === "string" && ref.trim()) {
    const n = ref.trim().toLowerCase().replace(/\s+/g, " ");
    const match = ENTITY_LIST.find(
      (e) =>
        e.displayName.toLowerCase() === n ||
        e.legalName.toLowerCase() === n ||
        e.id === n,
    );
    if (match) return match;
    // Legacy salary-roster spellings → canonical entity.
    if (n.includes("mjv") || n.includes("gainmaker")) return ENTITIES.gainmakers;
    if (n.includes("jsv") || n.includes("legacy")) return ENTITIES["legacy-creators"];
    if (n.includes("unleash")) return ENTITIES.unleashed;
    if (n.includes("perfect blend") || n.includes("khushboo")) return ENTITIES["perfect-blend"];
  }
  return ENTITIES[DEFAULT_ENTITY_ID];
}
