import "server-only";
import { asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { clientLocations } from "@/db/schema";
import { canEditClientLocations } from "@/lib/auth/attendance-permissions";
import { parseMapsLink } from "./maps-link";

/**
 * CLIENT SITES — the places a "Client Site" attendance day can point at.
 *
 * ── WHO MAY WRITE ──────────────────────────────────────────────────────────
 * Manan, Rutvisha and Ruchita only. Everyone else reads and uses them, which is
 * what makes a saved pin worth anything as a check: if the person claiming to be
 * at a client site could also move where that site is, the coordinate would only
 * ever confirm itself.
 *
 * The permission is enforced HERE, in the same function that writes, rather than
 * in the page that renders the form. Hiding a button is presentation.
 */

export interface ClientLocationRow {
  id: string;
  name: string;
  address: string | null;
  lat: number | null;
  lng: number | null;
  radiusM: number;
  mapsUrl: string | null;
  isActive: boolean;
}

/** Active sites, alphabetical — the picker and the Admin list read this. */
export async function listClientLocations(
  opts: { includeInactive?: boolean } = {},
): Promise<ClientLocationRow[]> {
  const rows = await db
    .select({
      id: clientLocations.id,
      name: clientLocations.name,
      address: clientLocations.address,
      lat: clientLocations.lat,
      lng: clientLocations.lng,
      radiusM: clientLocations.radiusM,
      mapsUrl: clientLocations.mapsUrl,
      isActive: clientLocations.isActive,
    })
    .from(clientLocations)
    .orderBy(asc(clientLocations.name));

  return opts.includeInactive ? rows : rows.filter((r) => r.isActive);
}

export type SaveResult = { ok: true; id: string } | { ok: false; error: string };

export interface SaveClientLocationInput {
  /** Omit to create. */
  id?: string;
  name: string;
  address?: string | null;
  /** A pasted Google Maps link, or bare "lat, lng". Coordinates are derived. */
  mapsUrl?: string | null;
  /** Metres. Defaults to the column default when omitted. */
  radiusM?: number | null;
  isActive?: boolean;
  actor: { id: string; email: string };
}

/**
 * Create or update a client site.
 *
 * COORDINATES ARE DERIVED, NEVER TYPED. `parseMapsLink` reads the pin out of the
 * pasted link; a link it cannot read is reported rather than saved with a null
 * pin and no explanation, because a site with no coordinates silently stops
 * being checkable and nothing on screen would say so.
 *
 * The one exception is clearing: an empty link removes the pin deliberately.
 */
export async function saveClientLocation(input: SaveClientLocationInput): Promise<SaveResult> {
  if (!canEditClientLocations(input.actor.email)) {
    return { ok: false, error: "Only Manan, Rutvisha or Ruchita can change client locations." };
  }

  const name = input.name.trim();
  if (!name) return { ok: false, error: "Give the client site a name." };
  if (name.length > 200) return { ok: false, error: "That name is too long." };

  const link = (input.mapsUrl ?? "").trim();
  let lat: number | null = null;
  let lng: number | null = null;
  if (link) {
    const pin = parseMapsLink(link);
    if (!pin) {
      return {
        ok: false,
        error:
          "Couldn't read coordinates from that link. Paste the full Google Maps URL (a maps.app.goo.gl short link doesn't carry them), or type \"lat, lng\".",
      };
    }
    lat = pin.lat;
    lng = pin.lng;
  }

  const radius = input.radiusM ?? null;
  if (radius !== null && (!Number.isFinite(radius) || radius < 10 || radius > 20000)) {
    return { ok: false, error: "Radius must be between 10 m and 20 km." };
  }

  const values = {
    name,
    address: input.address?.trim() || null,
    lat,
    lng,
    mapsUrl: link || null,
    ...(radius !== null ? { radiusM: Math.round(radius) } : {}),
    ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    updatedAt: new Date(),
  };

  try {
    if (input.id) {
      const [row] = await db
        .update(clientLocations)
        .set(values)
        .where(eq(clientLocations.id, input.id))
        .returning({ id: clientLocations.id });
      if (!row) return { ok: false, error: "That client site no longer exists." };
      return { ok: true, id: row.id };
    }
    const [row] = await db
      .insert(clientLocations)
      .values({ ...values, createdById: input.actor.id })
      .returning({ id: clientLocations.id });
    if (!row) return { ok: false, error: "Could not save the client site." };
    return { ok: true, id: row.id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // The 0205 unique index is case-insensitive and scoped to ACTIVE rows.
    if (msg.includes("client_locations_name_uq")) {
      return { ok: false, error: `There is already an active client site called "${name}".` };
    }
    return { ok: false, error: msg };
  }
}

/**
 * Retire a site. NEVER deleted: punches and approved requests point at it, and
 * a deleted row would take the answer to "where was this person?" with it. The
 * partial unique index is scoped to active rows, so the name frees up for reuse.
 */
export async function retireClientLocation(input: {
  id: string;
  actor: { id: string; email: string };
}): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!canEditClientLocations(input.actor.email)) {
    return { ok: false, error: "Only Manan, Rutvisha or Ruchita can change client locations." };
  }
  try {
    await db
      .update(clientLocations)
      .set({ isActive: false, updatedAt: new Date() })
      .where(eq(clientLocations.id, input.id));
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not retire that site." };
  }
}
