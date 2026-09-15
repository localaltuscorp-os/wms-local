"use server";

import { revalidatePath } from "next/cache";
import { requireUser, getSignedInEmployee } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import {
  completeDeviceRegistration,
  type RegisterDeviceResult,
} from "@/lib/security/device-registration";

/**
 * Register the device this request came from (0222).
 *
 * ── WHOSE DEVICE ───────────────────────────────────────────────────────────
 * The REAL signed-in employee, not the delegated one. `requireUser()` may
 * return the person being impersonated under a temporary access grant, and a
 * grant must never be able to register a device against somebody else's name —
 * the same reasoning `enforceWmsDeviceAccess` uses at current.ts:224.
 */
export async function registerThisDeviceAction(input: {
  deviceName?: string | null;
  manufacturer?: string | null;
  model?: string | null;
  consent: boolean;
}): Promise<RegisterDeviceResult> {
  // Passes the device gate first. A device that cannot reach the application
  // cannot register itself out of that — registration is for an approved but
  // never-registered device, not a way around a revocation.
  const acting = await requireUser();
  const me = (await getSignedInEmployee()) ?? acting;

  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, field: "form", error: limited.error };

  const result = await completeDeviceRegistration(me, {
    deviceName: input.deviceName ?? null,
    manufacturer: input.manufacturer ?? null,
    model: input.model ?? null,
    consent: input.consent === true,
  });

  if (result.ok) revalidatePath("/", "layout");
  return result;
}
