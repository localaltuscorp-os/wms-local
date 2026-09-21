/**
 * Which device ids may be shared by several people (migration 0243).
 *
 * A BROWSER id — the `web_…` value lib/security/device-access.ts mints into the
 * `att_device` cookie — names a machine, and several colleagues on one shared
 * office PC each hold their own row for it. A NATIVE (phone) id is the punch
 * device and stays single-owner: one phone presenting for two people is the
 * proxy-punching case, refused in code and by a partial unique index.
 *
 * Pure and dependency-free, so both the access gate and the phone allowlist can
 * import the one rule without importing each other.
 */
export function isShareableDeviceId(deviceId: string): boolean {
  return deviceId.startsWith("web_");
}
