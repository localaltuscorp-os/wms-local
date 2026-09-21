import "server-only";

import { asc } from "drizzle-orm";
import { db } from "@/lib/db";
import { billingEntityProfiles } from "@/db/schema";
import { ENTITIES, ENTITY_LIST, isEntityId } from "@/lib/hr/entities";

/**
 * THE COMPANIES BILLING CAN ISSUE FROM — the five in code, plus any added here.
 *
 * ── WHY THERE ARE TWO SOURCES ───────────────────────────────────────────────
 * `lib/hr/entities.ts` is a PURE, typed registry of the five legal entities
 * Altus pays its people through. It is imported by client components, letterhead
 * renderers and the salary module, its ids are a TypeScript union, and every
 * entry has a logo committed under /public/logos. That is exactly right for the
 * five, and exactly wrong as a place to add a sixth company at 9pm: it needs a
 * deploy, and it drags HR and salary along with it.
 *
 * So a company added from Admin › Billing Profiles is a row in
 * `billing_entity_profiles` whose `entity_id` is not one of the five. That
 * column is free text and carries no foreign key, which is what makes this
 * possible without a migration:
 *
 *   entity_id  "meridian-holdings"   ← a slug of the name typed on the screen
 *   legal_name "Meridian Holdings LLP" ← the name itself, and its display name
 *
 * A custom company therefore has no separate display name of its own: its legal
 * name IS its name. That is a deliberate limit, not an oversight — one name
 * cannot disagree with the other, and the alternative was a column.
 *
 * ── WHAT STILL COMES FROM CODE ──────────────────────────────────────────────
 * The five keep their committed logos and their fallback contact/address lines.
 * A custom company has neither, so it prints the logo and address entered on
 * its own profile. `buildSellerSnapshot` handles that split.
 */

export interface BillingEntityOption {
  id: string;
  displayName: string;
  /** Committed asset path for one of the five; null for a custom company. */
  logo: string | null;
  isCustom: boolean;
}

/** A slug for a typed company name — the `entity_id` a custom company gets. */
export function entitySlug(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
}

/** The shape this needs off a profile row — so a caller that has already read
 *  the table can reuse its rows instead of reading it a second time. */
export interface EntityProfileRow {
  entityId: string;
  legalName?: string | null;
  logoUrl?: string | null;
}

/** PURE — the custom companies among a set of profile rows, sorted by name. */
export function customEntitiesFrom(rows: EntityProfileRow[]): BillingEntityOption[] {
  return rows
    .filter((r) => !isEntityId(r.entityId))
    .map((r) => ({
      id: r.entityId,
      // A row with no legal name yet still has to be pickable, or a company
      // created and not finished would vanish from the screen that created it.
      displayName: r.legalName?.trim() || r.entityId,
      logo: r.logoUrl?.trim() || null,
      isCustom: true,
    }))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

/**
 * Companies added from Admin › Billing Profiles — profile rows whose entity id
 * is not one of the five in code.
 */
export async function listCustomBillingEntities(): Promise<BillingEntityOption[]> {
  const rows = await db
    .select({
      entityId: billingEntityProfiles.entityId,
      legalName: billingEntityProfiles.legalName,
      logoUrl: billingEntityProfiles.logoUrl,
    })
    .from(billingEntityProfiles)
    .orderBy(asc(billingEntityProfiles.entityId));
  return customEntitiesFrom(rows);
}

/** The five, then the custom ones, off rows the caller already has. */
export function billingEntitiesFrom(rows: EntityProfileRow[]): BillingEntityOption[] {
  return [
    ...ENTITY_LIST.map((e) => ({
      id: e.id as string,
      displayName: e.displayName,
      logo: e.logo,
      isCustom: false,
    })),
    ...customEntitiesFrom(rows),
  ];
}

/** The five, then the custom ones — every company billing can issue from. */
export async function listBillingEntities(): Promise<BillingEntityOption[]> {
  return billingEntitiesFrom(
    await db
      .select({
        entityId: billingEntityProfiles.entityId,
        legalName: billingEntityProfiles.legalName,
        logoUrl: billingEntityProfiles.logoUrl,
      })
      .from(billingEntityProfiles)
      .orderBy(asc(billingEntityProfiles.entityId)),
  );
}

/** Every id a document may be issued from — the five plus the custom ones. */
export async function billingEntityIds(): Promise<string[]> {
  return (await listBillingEntities()).map((e) => e.id);
}

/**
 * Can a profile be saved against this id? True for the five, and for a custom
 * company that already has a row. False for anything else, which is what stops
 * a typo creating an orphan profile no document could ever resolve.
 */
export async function isKnownBillingEntity(entityId: string): Promise<boolean> {
  if (entityId in ENTITIES) return true;
  const custom = await listCustomBillingEntities();
  return custom.some((c) => c.id === entityId);
}
