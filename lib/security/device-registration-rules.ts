/**
 * Pure rules for first-login device registration (0222).
 *
 * No database, no `server-only`, no request scope — every function here is a
 * value in, a value out. That is deliberate: the validation an employee meets
 * at the registration modal is the part most worth testing exhaustively, and it
 * should not need a database mock to do it. `lib/db/destructive-sql.ts` is
 * separated from its script for the same reason.
 */
import type { DeviceKind } from "@/db/enums";

/**
 * The wording an employee agreed to. Bump this string to require re-consent:
 * anyone whose newest `device_consent_events` row still names an older version
 * has not accepted the current terms. No schema change, no backfill.
 */
export const DEVICE_CONSENT_VERSION = "device-registration-v1";

export const DEVICE_CONSENT_TYPE = "device-registration";

/**
 * Shortest and longest device name we will accept.
 *
 * A Windows NetBIOS name is capped at 15 characters ("DESKTOP-2874MGH" is
 * exactly 15), a Mac's friendly name is free text ("Om's MacBook Pro"), and a
 * Linux hostname is capped at 64. So 64 is the real ceiling, not headroom. The
 * floor is 2 because short hostnames are legitimate ("pc", "m1").
 */
const NAME_MIN = 2;
const NAME_MAX = 64;

/**
 * Device names that are not device names.
 *
 * THE KNOWN WEAKNESS OF THIS FIELD, handled at the door. A device name is not
 * guaranteed unique the way a BIOS serial is: a random consumer install
 * produces "DESKTOP-2874MGH" and collides with nobody, but an imaged or cloned
 * fleet hands out the same generic name to every machine in it. The first
 * person to register "LAPTOP" would then take the value, and everybody behind
 * them would be told their laptop belongs to somebody else.
 *
 * Refusing the generic ones up front turns that into an accurate sentence at
 * the point of typing, rather than a confusing collision for the second person
 * and every person after them. It cannot catch a fleet standardised on
 * something bespoke — no list can — which is what the collision message in
 * `completeDeviceRegistration` is for.
 *
 * Compared UPPER-CASED, so "laptop" and "Laptop" are both caught.
 */
const GENERIC_DEVICE_NAMES = new Set([
  "PC",
  "MY PC",
  "THIS PC",
  "DESKTOP",
  "DESKTOP-PC",
  "LAPTOP",
  "LAPTOP-PC",
  "COMPUTER",
  "MY COMPUTER",
  "USER-PC",
  "USER",
  "ADMIN",
  "ADMIN-PC",
  "WINDOWS",
  "WINDOWS-PC",
  "WIN-PC",
  "HOME",
  "HOME-PC",
  "OFFICE",
  "OFFICE-PC",
  "WORKSTATION",
  "LOCALHOST",
  "MACBOOK",
  "MACBOOK-PRO",
  "MACBOOK-AIR",
  "IMAC",
  "UNKNOWN",
  "NONE",
  "N/A",
  "NA",
  "TEST",
]);

/**
 * Trim and collapse internal runs of whitespace. Nothing else — a device name
 * is the machine's own identifier, and stripping characters out of it would
 * silently change which machine it names.
 *
 * CASE IS PRESERVED, unlike the BIOS serial this replaced.
 *
 * A serial is an opaque upper-case token and flattening it cost nothing. A
 * device name is something a person chose and reads back on an admin screen:
 * "Om's MacBook Pro" upper-cased to "OM'S MACBOOK PRO" looks like a mistake.
 *
 * Uniqueness is not weakened by keeping the case, because the guarantee is a
 * `lower(device_name)` index (migration 0224) and every comparison in the
 * registration path lower-cases both sides. Windows device names are
 * case-insensitive by definition, so this is also the more accurate model.
 */
export function normalizeDeviceName(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim().replace(/\s+/g, " ") ?? "";
  return trimmed || null;
}

export type DeviceNameCheck = { ok: true; value: string } | { ok: false; error: string };

/**
 * Validate a typed-in device name. Returns the normalised value, or the exact
 * sentence to print under the field.
 *
 * The character class is deliberately wider than the serial's was, because a
 * device name is not a manufacturer token: a Mac's is free text and commonly
 * carries spaces and an apostrophe ("Om's MacBook Pro"), while a Windows or
 * Linux hostname is letters, digits and hyphens. Rejecting an apostrophe would
 * refuse the default name on every Mac in the company.
 */
export function validateDeviceName(raw: string | null | undefined): DeviceNameCheck {
  const value = normalizeDeviceName(raw);
  if (!value) return { ok: false, error: "Enter your device name." };
  if (value.length < NAME_MIN) {
    return { ok: false, error: `That looks too short — a device name is at least ${NAME_MIN} characters.` };
  }
  if (value.length > NAME_MAX) {
    return { ok: false, error: `That is longer than ${NAME_MAX} characters. Copy only the device name.` };
  }
  if (!/^[A-Za-z0-9][A-Za-z0-9 '._-]*$/.test(value)) {
    return { ok: false, error: "Use only letters, numbers, spaces and - _ . ' characters." };
  }
  if (GENERIC_DEVICE_NAMES.has(value.toUpperCase())) {
    return {
      ok: false,
      error:
        `"${value}" is too generic — several laptops share it, so it cannot identify yours. ` +
        "Rename your PC in Settings › System › About › Rename this PC, then register again.",
    };
  }
  return { ok: true, value };
}

export type DevicePlatform = {
  /** 'Windows' | 'macOS' | 'iOS' | 'Android' | 'Linux' | 'Unknown' */
  os: string;
  /** 'Safari' | 'Chrome' | 'Edge' | 'Firefox' | 'Browser' */
  browser: string;
  /** iPhone / iPad / Mac / a bare OS name — what the modal shows back. */
  hardware: string;
  isIOS: boolean;
  isWindows: boolean;
};

/**
 * Name the platform for DISPLAY and for deciding whether a name is asked for.
 *
 * Note what this is NOT: a fingerprint. It reads the user-agent string the
 * browser volunteers and nothing else — no canvas, no fonts, no screen metrics,
 * no CPU or memory probe. The result is shown back to the employee ("iPhone ·
 * Safari · iOS") and never used as a security identifier. The identifier stays
 * the server-minted `device_id`.
 */
export function describePlatform(userAgent: string | null | undefined): DevicePlatform {
  const ua = userAgent ?? "";
  const isIPad = /ipad/i.test(ua) || (/macintosh/i.test(ua) && /mobile/i.test(ua));
  const isIPhone = /iphone|ipod/i.test(ua);
  const isIOS = isIPad || isIPhone;
  const isAndroid = /android/i.test(ua);
  const isWindows = /windows nt/i.test(ua);
  const isMac = !isIOS && /macintosh|mac os x/i.test(ua);

  const os = isIOS ? "iOS" : isAndroid ? "Android" : isWindows ? "Windows" : isMac ? "macOS" : /linux/i.test(ua) ? "Linux" : "Unknown";

  // Order matters: Edge and Chrome both claim "Safari" in their UA, and Edge
  // also claims "Chrome". Test the most specific first or every browser is Safari.
  const browser = /edg\//i.test(ua)
    ? "Edge"
    : /opr\/|opera/i.test(ua)
      ? "Opera"
      : /firefox|fxios/i.test(ua)
        ? "Firefox"
        : /chrome|crios/i.test(ua)
          ? "Chrome"
          : /safari/i.test(ua)
            ? "Safari"
            : "Browser";

  const hardware = isIPhone ? "iPhone" : isIPad ? "iPad" : isAndroid ? "Android device" : isMac ? "Mac" : isWindows ? "Windows PC" : os;

  return { os, browser, hardware, isIOS, isWindows };
}

/**
 * Does this registration need a device name?
 *
 * Tied to the SLOT, not the operating system: a laptop occupies the laptop slot
 * and is the thing we are trying to stop being registered twice. Phones — which
 * is where iOS and Android land — are identified by the mechanisms they already
 * have (the web device id, the Android keystore id) and are never asked.
 */
export function requiresDeviceName(kind: DeviceKind): boolean {
  return kind === "laptop";
}

/**
 * Where to find the device name, per operating system.
 *
 * ── THE CLICK PATH COMES FIRST, AND THE COMMAND SECOND ─────────────────────
 * This is the whole reason the field changed. Most of this roster is
 * non-technical, and the previous version of this function led with
 * `wmic bios get serialnumber` — a command that does not merely inconvenience
 * them, it DOES NOT EXIST any more. Microsoft removed `wmic.exe` in Windows 11
 * 24H2; on build 26200 the binary is simply absent and the prompt answers
 * "'wmic' is not recognized". Anyone who stopped at the first instruction —
 * which is most people — was stuck at a modal they could not dismiss.
 *
 * So `primary` is now a place to look, not something to run. A device name is
 * on screen in Settings in two clicks, or one keystroke via Win+Pause, and
 * `secondary` keeps a one-word command for anyone who would rather type.
 *
 * `hostname` is that command on all three platforms, and it is chosen over the
 * PowerShell equivalent on purpose: it works in Command Prompt AND PowerShell,
 * it is one word, and there is nothing in it to mistype.
 */
export function deviceNameHelp(platform: DevicePlatform): { label: string; primary: string; secondary?: string } {
  if (platform.os === "macOS") {
    return {
      label: "Apple menu → System Settings → General → About → Name",
      primary: "Apple  → System Settings → General → About",
      secondary: "hostname",
    };
  }
  if (platform.os === "Linux") {
    return {
      label: "Linux → Terminal",
      primary: "hostname",
    };
  }
  // Windows, and the fallback for an unrecognised user-agent. Windows is the
  // overwhelming majority of this roster, so an unknown platform being sent to
  // the Windows instructions is the useful guess rather than a lazy one.
  return {
    label: "Windows → Settings → System → About → Device name",
    primary: "Press Win + Pause  ·  Device name is the first row",
    secondary: "hostname",
  };
}

/** Trim an optional free-text field to something a column and a table cell can
 *  both hold. Empty becomes null so the admin screen shows a blank, not "". */
export function optionalText(raw: string | null | undefined, max = 80): string | null {
  const v = raw?.trim().replace(/\s+/g, " ") ?? "";
  return v ? v.slice(0, max) : null;
}
