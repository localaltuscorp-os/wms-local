import { eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { mobileDevices } from "@/db/schema";

export type ResolveDeviceResult =
  | { ok: true; rowId: string; isNewDevice: boolean; deviceCount: number }
  | { ok: false; error: string };

/**
 * Resolve (or enroll) the phone a native punch is coming from — the device-
 * binding anti-proxy. `deviceId` is the opaque id the app keeps in the OS
 * keystore. It's globally unique, so:
 *   - already bound to THIS employee → touch lastUsedAt, proceed (not new).
 *   - bound to ANOTHER employee → reject (a phone can't be shared).
 *   - unknown → enroll it to this employee (caller alerts admins on isNewDevice).
 */
export async function resolveMobileDevice(
  employeeId: string,
  input: { deviceId: string; label?: string | null; platform?: string | null },
): Promise<ResolveDeviceResult> {
  const deviceId = input.deviceId.trim();
  if (!deviceId || deviceId.length > 200) {
    return { ok: false, error: "Invalid device id." };
  }

  const existing = await db.query.mobileDevices.findFirst({
    where: eq(mobileDevices.deviceId, deviceId),
  });
  if (existing) {
    if (existing.employeeId !== employeeId) {
      return { ok: false, error: "This phone is already registered to another employee." };
    }
    await db
      .update(mobileDevices)
      .set({ lastUsedAt: new Date() })
      .where(eq(mobileDevices.id, existing.id));
    return { ok: true, rowId: existing.id, isNewDevice: false, deviceCount: await countDevices(employeeId) };
  }

  try {
    const [row] = await db
      .insert(mobileDevices)
      .values({
        employeeId,
        deviceId,
        label: input.label?.slice(0, 120) ?? null,
        platform: input.platform?.slice(0, 20) ?? null,
        lastUsedAt: new Date(),
      })
      .returning({ id: mobileDevices.id });
    return { ok: true, rowId: row!.id, isNewDevice: true, deviceCount: await countDevices(employeeId) };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    // Lost an enrollment race on the same deviceId — re-resolve.
    if (msg.includes("mobile_devices_device_id_uq")) {
      return resolveMobileDevice(employeeId, input);
    }
    return { ok: false, error: `DB: ${msg}` };
  }
}

async function countDevices(employeeId: string): Promise<number> {
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(mobileDevices)
    .where(eq(mobileDevices.employeeId, employeeId));
  return r?.n ?? 0;
}

/** How many phones this employee has enrolled (for the app's "first punch will
 *  register this device" hint). */
export async function countMobileDevices(employeeId: string): Promise<number> {
  return countDevices(employeeId);
}
