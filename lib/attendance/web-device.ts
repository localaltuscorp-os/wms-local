import "server-only";

import { randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { mobileDevices } from "@/db/schema";
import { MAX_DEVICES_PER_EMPLOYEE, type DeviceRejectReason } from "./mobile-devices";

/**
 * THE LAPTOP HALF of the device allowlist.
 *
 * The phone side has been enforced since the anti-proxy work: a punch from the
 * mobile app must come from a registered, approved keystore id. The WEB punch
 * had no device gate at all, which left the whole guarantee open — anyone could
 * sign in on a colleague's browser and punch. This closes it with the same
 * allowlist, the same approval lifecycle and the same admin screen; only the
 * identifier differs, because a browser has no keystore to ask.
 *
 * ── THE IDENTIFIER IS A COOKIE, AND THAT IS A REAL LIMITATION ──────────────
 * A browser cannot offer a non-extractable hardware id, so the laptop is
 * identified by a long-lived httpOnly cookie this module mints. That is weaker
 * than the phone's keystore id: cookies can be cleared, and a determined person
 * could copy one. It is NOT a credential and is never treated as one — it names
 * a device, it does not authenticate a person. Authentication is the session,
 * which is checked before this ever runs.
 *
 * What the cookie DOES buy is the property actually asked for: you cannot punch
 * from a colleague's laptop, because their browser carries their cookie, and a
 * cookie already bound to another employee is refused outright.
 *
 * ── GRANDFATHERING, AND WHY IT CLOSES ──────────────────────────────────────
 * Enforcing on day one would lock out every employee at once, since nobody has a
 * registered laptop yet. So the FIRST browser each person punches from is
 * adopted as their approved laptop — exactly how the phone allowlist rolled out
 * (its migration grandfathered every existing device to 'approved'). The window
 * closes per-person the moment the slots fill: once someone holds their two
 * approved devices, a further browser lands 'pending' and is refused until an
 * attendance administrator approves it. Clearing cookies after that point does
 * NOT hand out a fresh device — it produces a pending registration, which is the
 * same answer a colleague's browser gets.
 */

/** Long-lived, httpOnly. Names a device; never authenticates a person. */
const COOKIE = "att_device";
const TEN_YEARS_SECONDS = 10 * 365 * 24 * 60 * 60;

export type WebDeviceResult =
  | { ok: true; rowId: string; grandfathered: boolean }
  | { ok: false; reason: DeviceRejectReason; error: string };

/**
 * Resolve (and, on a first visit, adopt) the browser this punch came from.
 *
 * MUST be called from a Server Action or Route Handler — it sets a cookie, which
 * Next only permits there. `punchAttendance` is the sole caller.
 */
export async function resolveWebDevice(employeeId: string): Promise<WebDeviceResult> {
  const jar = await cookies();
  const existingId = jar.get(COOKIE)?.value?.trim();

  // What KIND of device this browser is, mapped desktop→laptop and
  // mobile/Android→phone. Since 0214 this is DESCRIPTIVE ONLY: a person holds two
  // device slots and either kind may fill either one, so this decides the label,
  // not whether the registration is allowed. The user-agent is the only signal a
  // browser offers; it is descriptive, never a credential.
  const ua = (await headers()).get("user-agent") ?? "";
  const isAndroid = /android/i.test(ua);
  const isMobileWeb =
    isAndroid || /iphone|ipad|ipod|mobile|webos|blackberry|windows phone/i.test(ua);
  const kind: "laptop" | "phone" = isMobileWeb ? "phone" : "laptop";
  const kindLabel = isAndroid ? "Web (Android)" : isMobileWeb ? "Web (Mobile)" : "Web (Desktop)";

  if (existingId) {
    const row = await db.query.mobileDevices.findFirst({
      where: eq(mobileDevices.deviceId, existingId),
    });

    if (row) {
      if (row.employeeId !== employeeId) {
        return {
          ok: false,
          reason: "other_employee",
          error: "This browser is registered to another employee — punch from your own device.",
        };
      }
      if (row.status === "revoked") {
        return {
          ok: false,
          reason: "revoked",
          error: "This device was removed. Ask an attendance administrator to register it again.",
        };
      }
      if (row.status !== "approved") {
        return {
          ok: false,
          reason: "pending",
          error: "This device is waiting for approval before you can punch from it.",
        };
      }
      await db
        .update(mobileDevices)
        .set({ lastUsedAt: new Date() })
        .where(eq(mobileDevices.id, row.id));
      return { ok: true, rowId: row.id, grandfathered: false };
    }
    // A cookie naming a device that no longer exists (revoked and purged, or a
    // restored database). Fall through and let it be adopted or refused on the
    // same terms as a browser with no cookie at all.
  }

  const deviceId = existingId || `web_${randomUUID()}`;

  // Has this employee filled both device slots yet? If not, adopt this browser
  // into a free one. Counted as a TOTAL across kinds (0214) — the slots are no
  // longer one-laptop-one-phone, so a second desktop browser is as legitimate a
  // second device as a phone is, and asking "do they have an approved laptop"
  // would refuse it for the wrong reason.
  const [approvedNow] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(mobileDevices)
    .where(
      and(eq(mobileDevices.employeeId, employeeId), eq(mobileDevices.status, "approved")),
    );

  const grandfathered = (approvedNow?.n ?? 0) < MAX_DEVICES_PER_EMPLOYEE;
  try {
    await db.insert(mobileDevices).values({
      employeeId,
      deviceId,
      kind,
      label: grandfathered ? `${kindLabel} (auto-registered)` : kindLabel,
      platform: "web",
      status: grandfathered ? "approved" : "pending",
      lastUsedAt: new Date(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Two punches racing from the same new browser: whoever lost the insert can
    // simply read the winner's row rather than reporting a failure.
    if (msg.includes("mobile_devices_device_id_uq")) {
      const row = await db.query.mobileDevices.findFirst({
        where: eq(mobileDevices.deviceId, deviceId),
      });
      if (row?.employeeId === employeeId && row.status === "approved") {
        await setCookie(deviceId);
        return { ok: true, rowId: row.id, grandfathered: false };
      }
    }
    return { ok: false, reason: "other", error: `Could not register this device: ${msg}` };
  }

  // Set the cookie EITHER WAY. A pending device still needs a stable id, or the
  // employee generates a fresh pending row on every attempt and the approval
  // queue fills with duplicates of one laptop.
  await setCookie(deviceId);

  if (!grandfathered) {
    return {
      ok: false,
      reason: "pending",
      error:
        "This browser isn't a registered device yet. It's been sent for approval — " +
        "punch from a registered device in the meantime.",
    };
  }

  const row = await db.query.mobileDevices.findFirst({
    where: eq(mobileDevices.deviceId, deviceId),
  });
  return row
    ? { ok: true, rowId: row.id, grandfathered: true }
    : { ok: false, reason: "other", error: "Could not register this device." };
}

async function setCookie(deviceId: string): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE, deviceId, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: TEN_YEARS_SECONDS,
  });
}
