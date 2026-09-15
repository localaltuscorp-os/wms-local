import { describe, it, expect } from "vitest";

import {
  DEVICE_CONSENT_TYPE,
  DEVICE_CONSENT_VERSION,
  describePlatform,
  normalizeDeviceName,
  optionalText,
  requiresDeviceName,
  deviceNameHelp,
  validateDeviceName,
} from "@/lib/security/device-registration-rules";

/**
 * The validation an employee actually meets at the registration modal (0222).
 *
 * Pure in, pure out — no database mock, because none of this touches one. That
 * is the reason these rules live in their own module.
 */

describe("normalizeDeviceName", () => {
  it("trims but PRESERVES case — the index does the case folding", () => {
    // 0224 dropped the upper-casing the BIOS serial had. A device name is
    // something a person chose and an administrator reads back, and
    // "Om's MacBook Pro" shouted as "OM'S MACBOOK PRO" reads as a bug.
    // Uniqueness is unaffected: the guarantee is a `lower(device_name)` index.
    expect(normalizeDeviceName("  DESKTOP-2874MGH  ")).toBe("DESKTOP-2874MGH");
    expect(normalizeDeviceName("Om's MacBook Pro")).toBe("Om's MacBook Pro");
    expect(normalizeDeviceName("desktop-2874mgh")).toBe("desktop-2874mgh");
  });

  it("collapses internal whitespace rather than deleting it", () => {
    // Deleting characters would silently change WHICH machine the name refers to.
    expect(normalizeDeviceName("Om's   MacBook")).toBe("Om's MacBook");
  });

  it("treats blank and absent alike", () => {
    expect(normalizeDeviceName("   ")).toBeNull();
    expect(normalizeDeviceName("")).toBeNull();
    expect(normalizeDeviceName(null)).toBeNull();
    expect(normalizeDeviceName(undefined)).toBeNull();
  });
});

describe("validateDeviceName", () => {
  it("accepts a real Windows device name and returns it normalised", () => {
    const r = validateDeviceName(" DESKTOP-2874MGH ");
    expect(r).toEqual({ ok: true, value: "DESKTOP-2874MGH" });
  });

  it("accepts the shapes the three platforms actually produce", () => {
    for (const n of [
      "DESKTOP-2874MGH", // Windows, the random consumer default
      "LAPTOP-9F2K1QZ",
      "Om's MacBook Pro", // macOS: spaces and an apostrophe are the DEFAULT
      "Rutvisha-MacBook-Air",
      "altus-dev-01", // Linux
      "pc.altus.local",
      "Om_Work_PC",
    ]) {
      expect(validateDeviceName(n).ok, n).toBe(true);
    }
  });

  it("refuses an empty name", () => {
    const r = validateDeviceName("");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/enter your device name/i);
  });

  it("refuses something too short or too long", () => {
    expect(validateDeviceName("A").ok).toBe(false);
    // Two is legitimate — short hostnames exist.
    expect(validateDeviceName("PC").ok).toBe(false); // ...unless it is generic
    expect(validateDeviceName("m1").ok).toBe(true);
    expect(validateDeviceName("A".repeat(65)).ok).toBe(false);
    expect(validateDeviceName("A".repeat(64)).ok).toBe(true);
  });

  it("refuses characters a device name does not contain", () => {
    const r = validateDeviceName("ABC<script>");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/letters, numbers/i);
  });

  /**
   * THE KNOWN WEAKNESS OF THIS FIELD, and the reason it is worth a test.
   *
   * A device name is not guaranteed unique the way a BIOS serial was. A random
   * consumer install produces "DESKTOP-2874MGH" and collides with nobody, but an
   * imaged or cloned fleet hands the same generic name to every machine. The
   * first person to register "LAPTOP" would take the value and everyone behind
   * them would be told their laptop belongs to somebody else.
   *
   * Refusing the generic ones at the door turns that into an accurate sentence
   * at the point of typing, for the FIRST person, rather than a confusing
   * collision for the second and everyone after.
   */
  it("refuses generic names that a whole fleet would share", () => {
    for (const junk of [
      "PC",
      "Laptop",
      "DESKTOP",
      "My Computer",
      "USER-PC",
      "localhost",
      "MacBook",
      "Windows",
      "none",
    ]) {
      const r = validateDeviceName(junk);
      expect(r.ok, junk).toBe(false);
      if (!r.ok) expect(r.error, junk).toMatch(/too generic/i);
    }
    // "N/A" is refused too, but by the character class (the slash) before the
    // generic list is consulted. Asserted separately so the reason stays honest.
    expect(validateDeviceName("N/A").ok).toBe(false);
  });

  it("catches a generic name whatever its casing", () => {
    for (const v of ["laptop", "LAPTOP", "LaPtOp"]) {
      expect(validateDeviceName(v).ok, v).toBe(false);
    }
  });

  it("tells two casings of one machine apart from two machines", () => {
    // Both are accepted and both keep their case; the DATABASE index
    // (lower(device_name)) is what stops them being registered as two laptops.
    const a = validateDeviceName("DESKTOP-2874MGH");
    const b = validateDeviceName("desktop-2874mgh");
    expect(a.ok && b.ok).toBe(true);
    if (a.ok && b.ok) {
      expect(a.value).not.toBe(b.value);
      expect(a.value.toLowerCase()).toBe(b.value.toLowerCase());
    }
  });
});

describe("describePlatform", () => {
  const IPHONE =
    "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
  const WINDOWS_CHROME =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36";
  const WINDOWS_EDGE =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36 Edg/126.0.0.0";
  const ANDROID =
    "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Mobile Safari/537.36";

  // SCENARIO 7 — the line the iOS modal shows back: "iPhone · Safari · iOS".
  it("names an iPhone on Safari", () => {
    const p = describePlatform(IPHONE);
    expect(p).toMatchObject({ os: "iOS", browser: "Safari", hardware: "iPhone", isIOS: true, isWindows: false });
  });

  it("tells Edge and Chrome apart, though both claim Safari in their UA", () => {
    expect(describePlatform(WINDOWS_CHROME).browser).toBe("Chrome");
    expect(describePlatform(WINDOWS_EDGE).browser).toBe("Edge");
  });

  it("names a Windows PC", () => {
    const p = describePlatform(WINDOWS_CHROME);
    expect(p.os).toBe("Windows");
    expect(p.isWindows).toBe(true);
    expect(p.hardware).toBe("Windows PC");
  });

  it("names Android without claiming it is iOS", () => {
    const p = describePlatform(ANDROID);
    expect(p.os).toBe("Android");
    expect(p.isIOS).toBe(false);
  });

  it("degrades to Unknown rather than throwing on a missing UA", () => {
    expect(describePlatform("").os).toBe("Unknown");
    expect(describePlatform(null).os).toBe("Unknown");
  });

  it("reads nothing beyond the user agent — there is no fingerprint to read", () => {
    // Guards the Phase 1 scope limit: if somebody later adds a canvas hash or a
    // screen probe, the shape of this result changes and this fails.
    expect(Object.keys(describePlatform(IPHONE)).sort()).toEqual(
      ["browser", "hardware", "isIOS", "isWindows", "os"].sort(),
    );
  });
});

describe("requiresDeviceName", () => {
  // SCENARIO 8 — iOS lands in the phone slot and is never asked for a serial.
  it("asks a laptop and never a phone", () => {
    expect(requiresDeviceName("laptop")).toBe(true);
    expect(requiresDeviceName("phone")).toBe(false);
  });
});

describe("deviceNameHelp", () => {
  const WINDOWS = describePlatform("Mozilla/5.0 (Windows NT 10.0; Win64; x64)");
  const MAC = describePlatform("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)");

  /**
   * THE REGRESSION THIS FILE EXISTS TO PREVENT, now that it has happened once.
   *
   * The Windows instructions used to lead with `wmic bios get serialnumber`.
   * Microsoft REMOVED `wmic.exe` in Windows 11 24H2 — verified absent on build
   * 26200 — so the first thing the modal told a Windows employee to do printed
   * "'wmic' is not recognized", and the modal cannot be dismissed. Anyone who
   * stopped at the first instruction was stuck.
   *
   * Naming the dead command here means re-introducing it fails loudly.
   */
  it("never tells anyone to run wmic — it no longer exists on Windows 11", () => {
    for (const p of [WINDOWS, MAC, describePlatform("Mozilla/5.0 (X11; Linux x86_64)"), describePlatform("")]) {
      const h = deviceNameHelp(p);
      expect(`${h.label} ${h.primary} ${h.secondary ?? ""}`.toLowerCase()).not.toContain("wmic");
    }
  });

  it("leads Windows users to a place to LOOK, not a command to run", () => {
    // The whole point of 0224: most of this roster is non-technical, and a
    // device name is on screen in Settings with no terminal at all.
    const h = deviceNameHelp(WINDOWS);
    expect(h.label).toMatch(/settings/i);
    expect(h.label).toMatch(/device name/i);
    expect(h.primary).toMatch(/win \+ pause/i);
    // A one-word command is still offered second, for anyone who prefers it.
    expect(h.secondary).toBe("hostname");
  });

  it("sends a Mac user to System Settings, not to a BIOS it does not have", () => {
    const h = deviceNameHelp(MAC);
    expect(h.label).toMatch(/system settings/i);
    expect(h.primary).not.toMatch(/bios/i);
    expect(h.secondary).toBe("hostname");
  });

  it("falls back to the Windows route for an unknown platform", () => {
    // Windows is the overwhelming majority of this roster, so an unrecognised
    // user-agent getting the Windows instructions is the useful guess.
    expect(deviceNameHelp(describePlatform("")).label).toMatch(/settings/i);
  });
});

describe("consent version", () => {
  /**
   * SCENARIO 15, in part. The version string is the mechanism for a future
   * terms change: bump it and anyone whose newest row names an older value is
   * due to re-consent. Pinned here so a change is deliberate rather than a typo.
   */
  it("is the v1 wording", () => {
    expect(DEVICE_CONSENT_VERSION).toBe("device-registration-v1");
    expect(DEVICE_CONSENT_TYPE).toBe("device-registration");
  });
});

describe("optionalText", () => {
  it("blank becomes null, so the admin screen shows a gap and not an empty box", () => {
    expect(optionalText("  ")).toBeNull();
    expect(optionalText(null)).toBeNull();
  });

  it("trims, collapses and caps length", () => {
    expect(optionalText("  Dell   Inc.  ")).toBe("Dell Inc.");
    expect(optionalText("x".repeat(200))?.length).toBe(80);
  });
});
