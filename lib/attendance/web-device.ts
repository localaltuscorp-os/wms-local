import "server-only";

import { randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { mobileDevices } from "@/db/schema";
import type { DeviceRejectReason } from "./mobile-devices";

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
 * registered laptop yet. So the FIRST browser each person signs in from is
 * adopted as their approved device of that kind — exactly how the phone
 * allowlist rolled out (its migration grandfathered every existing device to
 * 'approved'). The window closes per-person the moment it is used: once someone
 * holds an approved laptop, a second browser lands 'pending' and is refused
 * until an attendance administrator approves it. Clearing cookies after that
 * point does NOT hand out a fresh laptop — it produces a pending registration,
 * which is the same answer a colleague's browser gets.
 *
 * ── TWO ENTRY POINTS ───────────────────────────────────────────────────────
 * `resolveWebDevice`         — the PUNCH gate. Returns a rejection the caller
 *                              must honour; a pending browser cannot punch.
 * `registerWebDeviceOnLogin` — the LOGIN stamp. Same classification and the
 *                              same one-per-kind slots, but it never gates:
 *                              signing in is not punching, so an unapproved
 *                              browser is recorded and allowed through.
 * Both go through {@link ensureWebDevice}, so the two paths can never drift on
 * what counts as a phone or on which slot a given browser fills.
 */

/** Long-lived, httpOnly. Names a device; never authenticates a person. */
const COOKIE = "att_device";
const TEN_YEARS_SECONDS = 10 * 365 * 24 * 60 * 60;

export type WebDeviceResult =
  | { ok: true; rowId: string; grandfathered: boolean }
  | { ok: false; reason: DeviceRejectReason; error: string };

type WebDeviceKind = "laptop" | "phone";

/**
 * Which WEB slot a browser fills, from its user-agent alone.
 *
 * A person may hold ONE approved desktop-web device AND ONE approved mobile-web
 * device — the schema's one-approved-per-kind rule, mapped desktop→laptop and
 * mobile/Android→phone — so a laptop browser and a phone browser never fight
 * over a single slot. The user-agent is the only signal a browser offers; it is
 * descriptive, never a credential, and spoofing one only ever moves a device
 * between that same person's two slots.
 */
function classifyWebDevice(userAgent: string): { kind: WebDeviceKind; label: string } {
  const isAndroid = /android/i.test(userAgent);
  const isMobileWeb =
    isAndroid || /iphone|ipad|ipod|mobile|webos|blackberry|windows phone/i.test(userAgent);
  return {
    kind: isMobileWeb ? "phone" : "laptop",
    label: isAndroid ? "Web (Android)" : isMobileWeb ? "Web (Mobile)" : "Web (Desktop)",
  };
}

type EnsureOutcome =
  | { outcome: "approved"; rowId: string; deviceId: string; grandfathered: boolean }
  | { outcome: "pending"; deviceId: string }
  | { outcome: "revoked"; deviceId: string }
  | { outcome: "other_employee" }
  | { outcome: "error"; message: string };

/**
 * Resolve — and, when the matching slot is free, adopt — the device row for this
 * browser. Pure database work: it reads no cookie and writes none, so the punch
 * gate and the login stamp can each decide what to do with the answer and when a
 * cookie is worth setting.
 */
async function ensureWebDevice(
  employeeId: string,
  userAgent: string,
  existingId: string | undefined,
): Promise<EnsureOutcome> {
  const { kind, label } = classifyWebDevice(userAgent);

  if (existingId) {
    const row = await db.query.mobileDevices.findFirst({
      where: eq(mobileDevices.deviceId, existingId),
    });

    if (row) {
      if (row.employeeId !== employeeId) return { outcome: "other_employee" };
      if (row.status === "revoked") return { outcome: "revoked", deviceId: existingId };
      if (row.status !== "approved") return { outcome: "pending", deviceId: existingId };
      await db
        .update(mobileDevices)
        .set({ lastUsedAt: new Date() })
        .where(eq(mobileDevices.id, row.id));
      return { outcome: "approved", rowId: row.id, deviceId: existingId, grandfathered: false };
    }
    // A cookie naming a device that no longer exists (revoked and purged, or a
    // restored database). Fall through and let it be adopted or refused on the
    // same terms as a browser with no cookie at all.
  }

  const deviceId = existingId || `web_${randomUUID()}`;

  // Does this employee already have their one approved device of THIS web slot
  // (desktop-web = laptop, mobile-web = phone)? If not, adopt this one.
  const approvedOfKind = await db.query.mobileDevices.findFirst({
    where: and(
      eq(mobileDevices.employeeId, employeeId),
      eq(mobileDevices.kind, kind),
      eq(mobileDevices.status, "approved"),
    ),
  });

  const grandfathered = !approvedOfKind;
  try {
    await db.insert(mobileDevices).values({
      employeeId,
      deviceId,
      kind,
      label: grandfathered ? `${label} (auto-registered)` : label,
      platform: "web",
      status: grandfathered ? "approved" : "pending",
      lastUsedAt: new Date(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Two requests racing from the same new browser: whoever lost the insert can
    // simply read the winner's row rather than reporting a failure.
    if (msg.includes("mobile_devices_device_id_uq")) {
      const row = await db.query.mobileDevices.findFirst({
        where: eq(mobileDevices.deviceId, deviceId),
      });
      if (row?.employeeId === employeeId && row.status === "approved") {
        return { outcome: "approved", rowId: row.id, deviceId, grandfathered: false };
      }
    }
    return { outcome: "error", message: msg };
  }

  if (!grandfathered) return { outcome: "pending", deviceId };

  const row = await db.query.mobileDevices.findFirst({
    where: eq(mobileDevices.deviceId, deviceId),
  });
  return row
    ? { outcome: "approved", rowId: row.id, deviceId, grandfathered: true }
    : { outcome: "error", message: "Could not register this device." };
}

/**
 * THE PUNCH GATE. Resolve (and, on a first visit, adopt) the browser this punch
 * came from, refusing anything not approved.
 *
 * MUST be called from a Server Action or Route Handler — it sets a cookie, which
 * Next only permits there. `punchAttendance` is the sole caller.
 */
export async function resolveWebDevice(employeeId: string): Promise<WebDeviceResult> {
  const jar = await cookies();
  const existingId = jar.get(COOKIE)?.value?.trim();
  const ua = (await headers()).get("user-agent") ?? "";

  const res = await ensureWebDevice(employeeId, ua, existingId || undefined);

  // Set the cookie whatever the verdict, bar the two that name someone else's or
  // a dead device. A pending device still needs a stable id, or the employee
  // generates a fresh pending row on every attempt and the approval queue fills
  // with duplicates of one laptop.
  if (res.outcome === "approved" || res.outcome === "pending") {
    await setCookie(res.deviceId);
  }

  switch (res.outcome) {
    case "approved":
      return { ok: true, rowId: res.rowId, grandfathered: res.grandfathered };
    case "other_employee":
      return {
        ok: false,
        reason: "other_employee",
        error: "This browser is registered to another employee — punch from your own device.",
      };
    case "revoked":
      return {
        ok: false,
        reason: "revoked",
        error: "This device was removed. Ask an attendance administrator to register it again.",
      };
    case "pending":
      return {
        ok: false,
        reason: "pending",
        error:
          "This browser isn't a registered device yet. It's been sent for approval — " +
          "punch from a registered device in the meantime.",
      };
    case "error":
      return { ok: false, reason: "other", error: `Could not register this device: ${res.message}` };
  }
}

/**
 * THE LOGIN STAMP. Record the browser someone just signed in from, so a phone
 * lands in their phone slot and a laptop in their laptop slot at sign-in rather
 * than waiting for a first punch.
 *
 * DELIBERATELY NEVER GATES. Signing in is not punching: an unapproved browser is
 * still recorded — as 'pending', for an administrator to approve — and the login
 * proceeds. Locking someone out of the whole site because they opened it on a
 * second phone would be a far worse failure than letting them read the app from
 * a device that cannot punch, which the punch gate above still refuses.
 *
 * Returns the Set-Cookie header to attach to the sign-in response, or null when
 * there is nothing to stamp (another employee's browser, a revoked device, or
 * any error — a login must never fail over device bookkeeping).
 */
export async function registerWebDeviceOnLogin(
  employeeId: string,
  userAgent: string,
  existingId: string | undefined,
): Promise<string | null> {
  try {
    const res = await ensureWebDevice(employeeId, userAgent, existingId?.trim() || undefined);
    return res.outcome === "approved" || res.outcome === "pending"
      ? serializeDeviceCookie(res.deviceId)
      : null;
  } catch (err) {
    // Sign-in is the one path that must survive a database wobble — see the note
    // on the session route. Swallow and carry on; the punch gate still registers
    // the device on first use, exactly as it did before login stamped anything.
    console.error("registerWebDeviceOnLogin failed", err);
    return null;
  }
}

/** The device cookie's attributes, in one place — both writers share them. */
function serializeDeviceCookie(deviceId: string): string {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${COOKIE}=${deviceId}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${TEN_YEARS_SECONDS}${secure}`;
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
