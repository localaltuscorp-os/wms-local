import "server-only";

import { randomUUID } from "node:crypto";
import { cookies, headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { mobileDevices, type Employee, type MobileDevice } from "@/db/schema";
import type { DeviceKind } from "@/db/enums";
import { deviceRestrictionRequired } from "@/lib/security/capabilities";

/**
 * DEVICE-BASED WMS ACCESS — the server-side gate.
 *
 * A normal employee reaches the WMS from exactly two devices: one registered
 * desktop/laptop and one registered phone. Any other device is refused — not
 * shown a reduced UI, refused. This module is where that is decided; nothing
 * else in the application is allowed to have an opinion about it.
 *
 * ── THIS GATES THE APPLICATION, NOT ATTENDANCE ─────────────────────────────
 * The pre-existing allowlist (lib/attendance/mobile-devices.ts,
 * lib/attendance/web-device.ts) gated PUNCHING only: an unregistered laptop
 * could sign in, read tasks, edit documents and see salary — it simply could
 * not punch. The requirement is broader, so the check moved up to
 * `requireUser()` (every page and every server action) and
 * `authenticateMobileRequest()` (every native endpoint). The device tables,
 * lifecycle and admin screen are REUSED as-is; only the reach changed.
 *
 * ── THE WEB IDENTIFIER IS A COOKIE, AND THAT IS A REAL LIMITATION ──────────
 * A browser cannot offer a non-extractable hardware id, so a laptop is named by
 * a long-lived httpOnly cookie this module mints. Weaker than the phone's
 * keystore id: cookies can be cleared, and a determined person could copy one
 * out of their own profile. It is NOT a credential and is never treated as one
 * — it names a device, it does not authenticate a person. Authentication is the
 * session, checked before any of this runs. What the cookie does buy is the
 * property actually asked for: you cannot use the WMS from a colleague's
 * laptop, because their browser carries their cookie and a cookie already bound
 * to another employee is refused outright.
 *
 * ── READ-ONLY HERE, WRITES AT THE EDGES ────────────────────────────────────
 * Next only permits setting a cookie in a Route Handler or Server Action, and
 * the gate has to run inside Server Components too. So resolution is split:
 * {@link resolveDeviceContext} is pure-read and safe anywhere, while
 * {@link adoptDeviceOnLogin} — the one function that mints a cookie and enrolls
 * a row — is called from exactly one place, the sign-in route.
 */

/** Long-lived, httpOnly. Names a device; never authenticates a person.
 *  DELIBERATELY the same cookie the punch allowlist has always used, so a
 *  laptop already registered for attendance is the same device row here — the
 *  rollout does not ask anyone to enroll a second time. */
export const DEVICE_COOKIE = "att_device";

/** Exported so the sign-in route can set the same cookie on its own response. */
export const DEVICE_COOKIE_MAX_AGE_SECONDS = 10 * 365 * 24 * 60 * 60;

/** Header the native app sends its keystore device id on. */
export const DEVICE_ID_HEADER = "x-altus-device-id";

/** Why a device may not use the WMS. The UI maps these to distinct screens. */
export type DeviceDenyReason =
  | "unidentified" // no device id presented at all
  | "unregistered" // an id we have never seen
  | "pending" //     registered, waiting for approval
  | "revoked" //     was approved, an administrator withdrew it
  | "other_employee"; // registered to somebody else

export type DeviceContext =
  | {
      allowed: true;
      /** The approved device row, or null for a device-exempt actor working
       *  from a device that was never registered. */
      device: MobileDevice | null;
      /** True when the actor holds `device.exempt_from_restriction`. */
      exempt: boolean;
      /** 'laptop' | 'phone', or null when exempt with no registered row. This
       *  is what the "manage others' attendance from a laptop only" rule reads. */
      kind: DeviceKind | null;
    }
  | {
      allowed: false;
      reason: DeviceDenyReason;
      error: string;
      /** Present for `pending` — the row exists and is awaiting approval, which
       *  the blocked screen shows so the person knows they need not re-register. */
      device: MobileDevice | null;
    };

const DENY_MESSAGES: Record<DeviceDenyReason, string> = {
  unidentified:
    "This device could not be identified. Sign out and sign in again from a registered device.",
  unregistered:
    "This device is not registered for WMS access. You can only use Altus from your registered laptop and phone — ask a device administrator to register this one.",
  pending:
    "This device is registered but is still waiting for approval. A device administrator has to approve it before you can use Altus from it.",
  revoked:
    "This device's access was withdrawn by a device administrator. Use your registered laptop or phone, or ask for it to be re-approved.",
  other_employee:
    "This device is registered to another employee. Use your own registered laptop or phone.",
};

/* ── Enforcement switches ─────────────────────────────────────────────────── */

/**
 * The master switch. ENFORCING BY DEFAULT — the whole point of this work is
 * that the rule holds without anyone having to remember to switch it on, and a
 * security control that defaults off ships as documentation.
 *
 * `DEVICE_ACCESS_ENFORCEMENT=off` is a deliberate operator escape hatch for one
 * situation: the native Android app sends its device id on a header
 * ({@link DEVICE_ID_HEADER}) that only builds after this change include, so
 * every phone still running an older build presents no id and is refused.
 * Turning enforcement off for the length of that app rollout is a considered
 * trade, not a bypass — and it is the ONLY way to disable this, so its use is
 * visible in one environment variable rather than spread across the code.
 */
export function deviceAccessEnforced(): boolean {
  return process.env.DEVICE_ACCESS_ENFORCEMENT !== "off";
}

/**
 * FIRST-DEVICE ADOPTION, and why it exists.
 *
 * On the day this ships nobody has a registered laptop, so enforcing strictly
 * would lock out the entire company at once — including the three device
 * administrators, who would then have no way in to approve anything. So the
 * FIRST device of each kind a person signs in from is adopted into their free
 * slot as approved. The window closes per-person the moment the slot fills: once
 * someone holds an approved laptop, a second browser lands `pending` and is
 * refused until an administrator approves it. Clearing cookies after that point
 * does NOT hand out a fresh device — it produces a pending registration, the
 * same answer a colleague's browser gets.
 *
 * THIS IS THE ONE REAL WEAKNESS IN THE ROLLOUT and it should be closed
 * deliberately: someone who has an employee's password and signs in before the
 * employee does takes the slot. Set `DEVICE_AUTO_ADOPT=off` once the roster has
 * enrolled, after which every new device requires an administrator. The
 * Registered Devices screen shows which state this is in, so it is visible
 * rather than forgotten in an environment variable.
 */
export function deviceAutoAdoptEnabled(): boolean {
  return process.env.DEVICE_AUTO_ADOPT !== "off";
}

/**
 * THE NATIVE-APP ROLLOUT GRACE, AND WHY IT IS A DATE AND NOT A FLAG.
 *
 * The Android app only started sending {@link DEVICE_ID_HEADER} in the build
 * that shipped with this work. Every phone still running an older build sends
 * no device id at all, so the gate cannot identify it and refuses it — which
 * means the day this deploys, every un-updated phone loses the app entirely.
 * An app store rollout takes days and cannot be made instant.
 *
 * The blunt instrument for that is `DEVICE_ACCESS_ENFORCEMENT=off`, but it
 * disables the gate for the WEB too, and — the real problem — a boolean has no
 * reason to ever become true again. "Turn it back on once the app is out" is
 * the kind of task that is genuinely forgotten, and the failure is silent: the
 * control is simply off, forever, and nothing says so.
 *
 * So the grace is a DEADLINE. `DEVICE_ACCESS_MOBILE_GRACE_UNTIL=2026-10-01`
 * closes itself on that date whether or not anyone remembers. It cannot decay
 * into a permanent hole.
 *
 * ── WHAT IT DOES AND DOES NOT COVER ────────────────────────────────────────
 * It applies to exactly ONE case: a native request presenting NO device id.
 * That is the old-build signature. It does NOT relax anything else — a request
 * that DOES name a device gets the full check, so a revoked phone stays
 * revoked, a pending phone stays pending, and another employee's phone is still
 * refused, throughout the grace. The hole is "unidentified", not "unchecked",
 * and it is the narrowest one that lets the old build keep working.
 *
 * Unset (the default) means NO grace: an unidentified native request is
 * refused. That keeps the safe behaviour the default and makes the exception
 * something an operator opts into, with an end date, on purpose.
 */
export function mobileHeaderGraceActive(now: Date = new Date()): boolean {
  const raw = process.env.DEVICE_ACCESS_MOBILE_GRACE_UNTIL?.trim();
  if (!raw) return false;
  const until = new Date(raw);
  // An unparseable date is NOT treated as "grace forever" — it is treated as no
  // grace at all. A typo in this variable should fail closed and be noticed,
  // not quietly disable the gate for the native surface indefinitely.
  if (Number.isNaN(until.getTime())) {
    console.warn(
      `[device-access] DEVICE_ACCESS_MOBILE_GRACE_UNTIL is not a valid date ("${raw}") — grace treated as OFF.`,
    );
    return false;
  }
  return now.getTime() < until.getTime();
}

/* ── Read-only resolution (safe in Server Components) ─────────────────────── */

/**
 * What device is this request coming from, and may it use the WMS?
 *
 * NO WRITES, NO COOKIE SET — safe to call from a layout, a page, a server
 * action or a route handler. `deviceIdOverride` is how the native app's id
 * reaches this: on the web the id comes from the cookie, on mobile from the
 * request header, and the rest of the decision is identical for both.
 */
export async function resolveDeviceContext(
  employee: Employee,
  deviceIdOverride?: string | null,
): Promise<DeviceContext> {
  const exempt = !deviceRestrictionRequired(employee.email);

  const rawId = deviceIdOverride ?? (await readDeviceCookie());
  const deviceId = cleanDeviceId(rawId);

  // A device-exempt actor (the super-admin exception) is allowed regardless.
  // The lookup still runs, because when they ARE on a registered device we want
  // the row: the audit log records which device a privileged change came from,
  // and the laptop-only rule for managing others reads `kind`.
  if (!deviceId) {
    if (exempt) return { allowed: true, device: null, exempt: true, kind: null };
    if (!deviceAccessEnforced()) return unenforced(null);
    return { allowed: false, reason: "unidentified", error: DENY_MESSAGES.unidentified, device: null };
  }

  const row = await db.query.mobileDevices.findFirst({
    where: eq(mobileDevices.deviceId, deviceId),
  });

  if (!row) {
    if (exempt) return { allowed: true, device: null, exempt: true, kind: null };
    if (!deviceAccessEnforced()) return unenforced(null);
    return { allowed: false, reason: "unregistered", error: DENY_MESSAGES.unregistered, device: null };
  }

  // A row belonging to somebody else is refused even for an exempt actor: the
  // exemption is "you need not register your devices", not "you may present
  // another employee's device identity". Letting it through would also file the
  // audit trail under the wrong device.
  if (row.employeeId !== employee.id) {
    if (exempt) return { allowed: true, device: null, exempt: true, kind: null };
    if (!deviceAccessEnforced()) return unenforced(null);
    return {
      allowed: false,
      reason: "other_employee",
      error: DENY_MESSAGES.other_employee,
      device: null,
    };
  }

  if (row.status === "approved") {
    return { allowed: true, device: row, exempt, kind: row.kind };
  }

  if (exempt) return { allowed: true, device: null, exempt: true, kind: null };
  if (!deviceAccessEnforced()) return unenforced(row);

  const reason: DeviceDenyReason = row.status === "revoked" ? "revoked" : "pending";
  return { allowed: false, reason, error: DENY_MESSAGES[reason], device: row };
}

/**
 * The shape returned while `DEVICE_ACCESS_ENFORCEMENT=off`.
 *
 * Allowed, but `exempt: false` and `kind` taken from the row when there is one.
 * Deliberately NOT reported as an exemption: the audit context would then claim
 * the actor holds a capability they do not, and a log that misstates why
 * something was permitted is worse than one that says nothing.
 */
function unenforced(row: MobileDevice | null): DeviceContext {
  return { allowed: true, device: row, exempt: false, kind: row?.kind ?? null };
}

/* ── Adoption + cookie minting (Route Handlers / Server Actions only) ─────── */

export type AdoptResult =
  | {
      ok: true;
      /**
       * The registered device row, when there is one.
       *
       * NULLABLE because an exempt super-admin may legitimately sign in from a
       * machine that has no row at all — both their slots are full and they are
       * not subject to the cap. Typed honestly rather than cast, so a caller
       * that wants to name the device has to handle its absence.
       */
      device: MobileDevice | null;
      adopted: boolean;
      /**
       * The device id the cookie should carry.
       *
       * Returned as well as set, because the sign-in route hands its response
       * back from `setAuthCookies`, which builds its own `NextResponse`. Relying
       * on Next to merge a `cookies().set()` into a response object a library
       * constructed is the kind of assumption that works until it silently does
       * not — and if the device cookie is dropped, the very next request is
       * "unidentified" and the person is locked out one redirect after signing
       * in. The route sets it on the response it actually returns.
       */
      deviceId: string;
    }
  | { ok: false; reason: DeviceDenyReason; error: string };

/**
 * Resolve the browser this request came from and, on a first visit, adopt it
 * into a free device slot. Called from the sign-in route and nowhere else.
 *
 * MUST run in a Route Handler or Server Action — it sets a cookie, which Next
 * permits only there. Everything else in the app calls
 * {@link resolveDeviceContext}, which reads and never writes.
 */
export async function adoptDeviceOnLogin(employee: Employee): Promise<AdoptResult> {
  const existingId = cleanDeviceId(await readDeviceCookie());
  const { kind, label } = await describeRequestDevice();

  // ── THE EXEMPTION APPLIES AT LOGIN, NOT ONLY AFTER IT ────────────────────
  //
  // `resolveDeviceContext` honours `device.exempt_from_restriction` on every
  // request AFTER sign-in, but this function guards the sign-in itself — and it
  // used to refuse on device status alone. The effect was that an exempt
  // super-admin whose laptop slot was already filled got "waiting for approval"
  // at the login form and never reached the application at all, which is the
  // precise opposite of the exemption's purpose. The exemption has to be read
  // HERE too, or it only exempts someone who could already get in.
  //
  // Same for the master enforcement switch: with `DEVICE_ACCESS_ENFORCEMENT=off`
  // nothing downstream refuses a device, so refusing one at the door would make
  // the switch a half-measure that still locks people out.
  const unrestricted =
    !deviceRestrictionRequired(employee.email) || !deviceAccessEnforced();

  if (unrestricted) {
    return await resolveWithoutRefusing(employee, existingId, kind, label);
  }

  if (existingId) {
    const row = await db.query.mobileDevices.findFirst({
      where: eq(mobileDevices.deviceId, existingId),
    });
    if (row) {
      if (row.employeeId !== employee.id) {
        // Two people sharing one browser profile. The SECOND person must not
        // inherit the first person's device row, and must not silently take a
        // fresh slot under the first person's cookie either — so the cookie is
        // replaced with a new identity below rather than reused.
        return await enroll(employee, `web_${randomUUID()}`, kind, label);
      }
      await touchLastSeen(row.id);
      // SIGN-IN NO LONGER REFUSES ON DEVICE STATUS (0222).
      //
      // It used to return `pending` or `revoked` here, which stopped the person
      // AT THE LOGIN FORM — before any session existed and therefore before any
      // screen could explain why or offer a way forward. First-login device
      // registration made that untenable: the modal that collects the serial
      // lives INSIDE the application, so refusing at the door meant a new
      // employee could never reach the form that would have registered them.
      //
      // The restriction is not lost, it has MOVED one step later. Every request
      // after this still passes `resolveDeviceContext` via `requireUser()`, so a
      // pending or revoked device gets the same refusal it always did — except
      // now as /device-blocked, a page that names the reason and the remedy,
      // instead of a dead end on the sign-in screen.
      return { ok: true, device: row, adopted: false, deviceId: existingId };
    }
    // A cookie naming a device that no longer exists (revoked and purged, or a
    // restored database). Fall through and let it be enrolled or refused on the
    // same terms as a browser with no cookie at all.
  }

  return await enroll(employee, existingId || `web_${randomUUID()}`, kind, label);
}

/**
 * Sign in an actor the device restriction does not apply to.
 *
 * NEVER REFUSES. That is the entire contract: an exempt super-admin signs in
 * from a hotel laptop, a borrowed phone, a new browser or a network nobody has
 * seen before, and none of those is a reason to stop them.
 *
 * It still does the bookkeeping, because the exemption is "you need not
 * register your devices", not "we stop recording which device you used":
 *
 *  · A device already registered to THEM is reused and stamped, so the audit
 *    trail can name the actual laptop instead of shrugging at "exempt".
 *  · An unrecognised device gets a cookie so the SAME machine is recognisable
 *    next time. It is enrolled only when a slot happens to be free — an exempt
 *    person must not silently consume, or be blocked by, a cap they are not
 *    subject to. When no slot is free the cookie is set and no row is written.
 *  · A device belonging to SOMEBODY ELSE is not adopted and not reused: a fresh
 *    identity is minted instead, so an exempt actor on a colleague's browser is
 *    never recorded as that colleague's device.
 */
async function resolveWithoutRefusing(
  employee: Employee,
  existingId: string | null,
  kind: DeviceKind,
  label: string,
): Promise<AdoptResult> {
  if (existingId) {
    const row = await db.query.mobileDevices.findFirst({
      where: eq(mobileDevices.deviceId, existingId),
    });
    if (row && row.employeeId === employee.id && row.status === "approved") {
      await touchLastSeen(row.id);
      return { ok: true, device: row, adopted: false, deviceId: existingId };
    }
  }

  const deviceId =
    existingId && !(await deviceBelongsToAnotherEmployee(existingId, employee.id))
      ? existingId
      : `web_${randomUUID()}`;

  // Take a free slot when there is one; otherwise just carry a stable cookie.
  // Either way the answer is "signed in".
  if (!(await hasApprovedDeviceOfKind(employee.id, kind))) {
    try {
      await db.insert(mobileDevices).values({
        employeeId: employee.id,
        deviceId,
        kind,
        label,
        platform: "web",
        status: "approved",
        approvedAt: new Date(),
        lastSeenAt: new Date(),
      });
    } catch {
      // A race for the slot, or an id that turned out to exist. Neither is a
      // reason to refuse an exempt actor — fall through to the cookie.
    }
  }

  await setDeviceCookie(deviceId);

  const row = await db.query.mobileDevices.findFirst({
    where: eq(mobileDevices.deviceId, deviceId),
  });
  return row && row.employeeId === employee.id
    ? { ok: true, device: row, adopted: true, deviceId }
    : // No row, and that is fine: both slots are full and this actor is not
      // subject to the cap. `resolveDeviceContext` reports them as exempt on
      // every subsequent request regardless.
      { ok: true, device: null, adopted: false, deviceId };
}

/** Is this device id already somebody else's? Used only to decide whether an
 *  exempt actor may keep the cookie in front of them or needs a fresh one. */
async function deviceBelongsToAnotherEmployee(
  deviceId: string,
  employeeId: string,
): Promise<boolean> {
  const row = await db.query.mobileDevices.findFirst({
    where: eq(mobileDevices.deviceId, deviceId),
  });
  return !!row && row.employeeId !== employeeId;
}

/**
 * Enroll a device id for an employee, adopting it as approved when their slot
 * for that KIND is free and auto-adoption is still open, and as pending
 * otherwise.
 *
 * The cookie is set EITHER WAY. A pending device still needs a stable id, or
 * the person mints a fresh pending row on every sign-in attempt and the
 * approval queue fills with duplicates of one laptop.
 */
async function enroll(
  employee: Employee,
  deviceId: string,
  kind: DeviceKind,
  label: string,
): Promise<AdoptResult> {
  const slotFree =
    deviceAutoAdoptEnabled() && !(await hasApprovedDeviceOfKind(employee.id, kind));

  try {
    await db.insert(mobileDevices).values({
      employeeId: employee.id,
      deviceId,
      kind,
      label: slotFree ? `${label} (auto-registered)` : label,
      platform: "web",
      status: slotFree ? "approved" : "pending",
      approvedAt: slotFree ? new Date() : null,
      lastSeenAt: new Date(),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    // Two sign-ins racing from the same new browser: whoever lost the insert can
    // read the winner's row rather than reporting a failure. Same for a race on
    // the approved-per-kind unique index — the other transaction took the slot,
    // so this one is pending, which is the correct answer, not an error.
    const existing = await db.query.mobileDevices.findFirst({
      where: eq(mobileDevices.deviceId, deviceId),
    });
    if (existing && existing.employeeId === employee.id) {
      await setDeviceCookie(deviceId);
      // Whatever its status, the person signs in — see the note in
      // adoptDeviceOnLogin. `resolveDeviceContext` refuses afterwards if it must.
      return { ok: true, device: existing, adopted: false, deviceId };
    }
    if (msg.includes("mobile_devices_employee_kind_approved_uq")) {
      // Another transaction took the free slot between the check and the insert.
      // `pending` is the correct answer, so write the row as pending rather than
      // turning a lost race into a refused sign-in.
      try {
        await db.insert(mobileDevices).values({
          employeeId: employee.id,
          deviceId,
          kind,
          label,
          platform: "web",
          status: "pending",
          lastSeenAt: new Date(),
        });
      } catch {
        /* still could not write a row — sign-in proceeds without one, and the
           gate decides on the next request. */
      }
      await setDeviceCookie(deviceId);
      const written = await db.query.mobileDevices.findFirst({
        where: eq(mobileDevices.deviceId, deviceId),
      });
      return { ok: true, device: written ?? null, adopted: false, deviceId };
    }
    throw err;
  }

  await setDeviceCookie(deviceId);

  const row = await db.query.mobileDevices.findFirst({
    where: eq(mobileDevices.deviceId, deviceId),
  });
  // Sign-in proceeds either way (0222). The admin alert still fires for a
  // pending device — administrators keep the visibility they had — but the
  // person is no longer held at the login form waiting for it to be actioned.
  if (row && row.status !== "approved") {
    await alertManagersPending(employee, label, kind);
  }
  return { ok: true, device: row ?? null, adopted: Boolean(row), deviceId };
}

/**
 * Tell the device managers somebody is waiting, WITHOUT pulling the
 * notification stack into this module's import graph.
 *
 * `device-access` is imported by `requireUser()`, so it is on the module graph
 * of literally every request. `punch-notify` reaches email, Slack and web-push
 * from its own imports; a static import here would drag all of that into every
 * page render to serve a path that runs at most once per new device. The
 * dynamic import keeps it out until the moment it is genuinely needed.
 *
 * Deliberately awaited rather than fired-and-forgotten: this runs inside the
 * sign-in route, and on a serverless platform an un-awaited promise can be
 * killed when the response is returned — which is exactly the case where the
 * person is locked out and the alert is the thing that unlocks them. It is
 * wrapped so a notification failure can never turn a refusal into a crash.
 */
async function alertManagersPending(
  employee: Employee,
  label: string,
  kind: DeviceKind,
): Promise<void> {
  try {
    const { alertDeviceManagersPendingDevice } = await import(
      "@/lib/attendance/punch-notify"
    );
    await alertDeviceManagersPendingDevice({
      employeeId: employee.id,
      employeeName: employee.name,
      deviceLabel: label,
      deviceKind: kind,
    });
  } catch (err) {
    console.warn("[device-access] could not alert device managers", err);
  }
}

/** Does this employee already hold an approved device of this kind? The
 *  one-laptop-one-phone cap, read side. The DATABASE is the enforcer (a partial
 *  unique index plus a trigger, migration 0215); this read exists so the common
 *  case produces a sentence instead of a constraint violation. */
export async function hasApprovedDeviceOfKind(
  employeeId: string,
  kind: DeviceKind,
): Promise<boolean> {
  const row = await db.query.mobileDevices.findFirst({
    where: and(
      eq(mobileDevices.employeeId, employeeId),
      eq(mobileDevices.kind, kind),
      eq(mobileDevices.status, "approved"),
    ),
  });
  return !!row;
}

/* ── Small helpers ────────────────────────────────────────────────────────── */

async function readDeviceCookie(): Promise<string | null> {
  try {
    return (await cookies()).get(DEVICE_COOKIE)?.value ?? null;
  } catch {
    // `cookies()` throws outside a request scope (a script, a build-time
    // render). No cookie is the honest answer there, not a crash.
    return null;
  }
}

async function setDeviceCookie(deviceId: string): Promise<void> {
  const jar = await cookies();
  jar.set(DEVICE_COOKIE, deviceId, {
    httpOnly: true,
    sameSite: "lax",
    secure:
      process.env.NODE_ENV === "production" && process.env.ALLOW_INSECURE_COOKIES !== "true",
    path: "/",
    maxAge: DEVICE_COOKIE_MAX_AGE_SECONDS,
  });
}

/**
 * What KIND of device this browser is, and a human label for the approval
 * screen. The user-agent is the only signal a browser offers; it is descriptive
 * and is never treated as a credential — it decides which of the person's two
 * slots the device occupies, not whether it is allowed.
 *
 * Only the derived kind and a short label are kept. The raw user-agent string
 * is deliberately NOT stored: it is a lasting record of what someone runs, and
 * it answers no question this feature asks.
 */
/**
 * Classify the browser this request came from.
 *
 * EXPORTED (0222) so first-login registration asks the SAME question the gate
 * asks. `lib/attendance/web-device.ts` is a retired stub precisely because a
 * second device classifier drifts from the first; registration deciding "phone"
 * where the gate decides "laptop" would put a device in one slot and check it
 * against the other.
 */
export async function describeRequestDevice(): Promise<{ kind: DeviceKind; label: string }> {
  let ua = "";
  try {
    ua = (await headers()).get("user-agent") ?? "";
  } catch {
    /* outside a request scope — fall through to the desktop default */
  }
  const isAndroid = /android/i.test(ua);
  const isMobile = isAndroid || /iphone|ipad|ipod|mobile|webos|blackberry|windows phone/i.test(ua);
  return {
    kind: isMobile ? "phone" : "laptop",
    label: isAndroid ? "Web (Android)" : isMobile ? "Web (Mobile)" : "Web (Desktop)",
  };
}

function cleanDeviceId(raw: string | null | undefined): string | null {
  const id = raw?.trim();
  if (!id || id.length > 200) return null;
  return id;
}

/**
 * Stamp `last_seen_at`. Best-effort and deliberately un-awaited by the gate: a
 * write on every page load must never be able to fail a page, and the column
 * feeds a "still in use?" column on an admin screen, not a decision.
 */
export async function touchLastSeen(deviceRowId: string): Promise<void> {
  try {
    await db
      .update(mobileDevices)
      .set({ lastSeenAt: new Date() })
      .where(eq(mobileDevices.id, deviceRowId));
  } catch {
    /* never let a bookkeeping write break a request */
  }
}

/** The native app's device id, read off the request header. */
export function deviceIdFromRequest(req: Request): string | null {
  return cleanDeviceId(req.headers.get(DEVICE_ID_HEADER));
}
