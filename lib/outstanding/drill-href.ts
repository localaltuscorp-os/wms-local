import type { Route } from "next";

/**
 * Build a drill-down href to the Outstanding dashboard's All-Entries section,
 * merging an override (status / pdc / emp / entity …) onto the currently active
 * filters so other selections are preserved.
 *
 * Pass the page's current `searchParams` object. Keys set in `override` replace
 * the matching param; a `null`/empty value clears it. Always anchors `#entries`.
 *
 * `base` is where the dashboard lives — `/billing/outstanding` since the module
 * moved out of Sales (2026-09-21). Kept as a parameter rather than inlined so
 * a drill-down can never quietly point at a room the module has left; the
 * default is the one door there is.
 */
export function buildDrillHref(
  current: Record<string, string | string[] | undefined>,
  override: Record<string, string | null> = {},
  base: string = "/billing/outstanding",
): Route {
  const sp = new URLSearchParams();

  // Seed from current params (first value wins for array params).
  for (const [k, v] of Object.entries(current)) {
    if (v == null) continue;
    const val = Array.isArray(v) ? v[0] : v;
    if (val) sp.set(k, val);
  }

  for (const [k, v] of Object.entries(override)) {
    if (v == null || v === "") sp.delete(k);
    else sp.set(k, v);
  }

  const qs = sp.toString();
  return (`${base}${qs ? `?${qs}` : ""}#entries`) as Route;
}
