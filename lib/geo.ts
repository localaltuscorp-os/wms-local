/**
 * Great-circle distance between two WGS-84 points, in metres (haversine).
 * Plenty accurate at geofence scale (<1km error is centimetres).
 */
export function distanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6_371_000; // mean Earth radius, metres
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** Max GPS-drift slack we add to the fence radius (m). */
export const FENCE_ACCURACY_MARGIN_M = 150;
/** A fix worse than this (m) is too imprecise to trust at all. */
export const FENCE_MAX_ACCURACY_M = 250;

export type GeofenceResult =
  | { ok: true }
  | { ok: false; reason: "too_imprecise" | "outside"; effectiveDistanceM: number };

/**
 * Decide whether a GPS fix counts as "inside the fence". A person genuinely
 * inside can read a point well outside due to indoor GPS drift, so we accept
 * when their accuracy circle reaches the fence: distance minus (capped)
 * accuracy is within the radius. Fixes worse than FENCE_MAX_ACCURACY_M are
 * rejected outright as untrustworthy.
 */
export function evaluateGeofence(
  distanceM: number,
  accuracyM: number,
  radiusM: number,
): GeofenceResult {
  if (accuracyM > FENCE_MAX_ACCURACY_M) {
    return { ok: false, reason: "too_imprecise", effectiveDistanceM: distanceM };
  }
  const margin = Math.min(accuracyM, FENCE_ACCURACY_MARGIN_M);
  const effectiveDistanceM = distanceM - margin;
  if (effectiveDistanceM <= radiusM) return { ok: true };
  return { ok: false, reason: "outside", effectiveDistanceM };
}
