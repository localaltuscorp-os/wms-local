/**
 * Pull coordinates out of a pasted Google Maps link.
 *
 * WHY: asking an admin to type a latitude is asking for a transposed digit that
 * puts a client site in the sea. Everyone already knows how to drop a pin and
 * copy the link, so the link is the input and the numbers are derived.
 *
 * PURE — no I/O, no network. The link is never fetched: a short link
 * (maps.app.goo.gl/…) carries no coordinates and resolving it would mean an
 * outbound request from a server action to a third party on every save. Those
 * are reported honestly as "no coordinates in this link" so the person can paste
 * the full one, rather than being silently accepted with no pin.
 *
 * Recognised shapes, in the order they are tried:
 *   .../@19.0760,72.8777,17z            the map centre — what "copy link" gives
 *   ...!3d19.0760!4d72.8777             the PLACE pin inside a place URL
 *   ...?q=19.0760,72.8777               an explicit query pin
 *   ...?ll=19.0760,72.8777              the older centre parameter
 *   19.0760, 72.8777                    bare coordinates, pasted directly
 *
 * `!3d/!4d` is checked BEFORE `@` deliberately: a place URL contains both, and
 * the `@` there is the viewport centre, which is near the pin but is not it.
 */

export interface ParsedMapsPin {
  lat: number;
  lng: number;
}

/** Latitude must be within ±90, longitude ±180 — anything else is a misread. */
function valid(lat: number, lng: number): boolean {
  return (
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    Math.abs(lat) <= 90 &&
    Math.abs(lng) <= 180 &&
    // 0,0 is in the Gulf of Guinea. It is never a real client site, and it is
    // the classic result of a failed parse being written to the database.
    !(lat === 0 && lng === 0)
  );
}

export function parseMapsLink(input: string | null | undefined): ParsedMapsPin | null {
  const raw = (input ?? "").trim();
  if (!raw) return null;

  const patterns: RegExp[] = [
    /!3d(-?\d+(?:\.\d+)?)!4d(-?\d+(?:\.\d+)?)/,
    /@(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/,
    // `query` is listed BEFORE `q` so the longer name is tried first — and it
    // is not hypothetical: `mapsLinkFor` below emits `?api=1&query=…`, so
    // omitting it meant this module could not read its own output.
    /[?&](?:query|q|ll|daddr|center)=(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)/,
    /^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/,
  ];

  for (const re of patterns) {
    const m = raw.match(re);
    if (!m) continue;
    const lat = Number(m[1]);
    const lng = Number(m[2]);
    if (valid(lat, lng)) return { lat, lng };
  }
  return null;
}

/** A link that opens the pin, built from stored coordinates. */
export function mapsLinkFor(lat: number, lng: number): string {
  return `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
}
