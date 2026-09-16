import { describe, it, expect } from "vitest";
import {
  ADMIN_PANEL_ENTRY,
  ADMIN_PANEL_SHORTCUT,
  isAdminPanelShortcut,
  MODULE_ORDER,
  MODULE_THEME,
  moduleShortcut,
  moduleShortcutHint,
  moduleShortcutLabel,
  moduleForShortcut,
} from "@/lib/module-theme";

/**
 * The account holder dictated BOTH the hub order and the letter row on
 * 2026-09-10, and the two are one thing: the letters are handed out by position,
 * so re-ordering MODULE_ORDER silently re-letters every module after the change.
 * This table is the spec — if it fails, either the order moved or the alphabet
 * did, and both are decisions someone has to make on purpose.
 */
const EXPECTED: [string, string][] = [
  ["wms", "Q"],
  ["goals", "W"],
  ["project-plan", "E"],
  ["productivity", "R"],
  ["billing", "T"],
  ["hr", "Y"],
  ["sales", "U"],
  ["admin", "I"],
  ["training", "O"],
  ["employees", "P"],
  // OPERATIONS, appended 2026-09-11, is the eleventh module and so takes the
  // eleventh key. Monthly Events Master and HandHolding left the hub the same
  // day — both became areas inside Operations rather than hub cards.
  //
  // THE KEY IS "D", NOT "A". A and S were vacated earlier that same day so the
  // standalone Admin Panel entry could hold A without colliding with a module
  // (both are admin-only, so it would have collided for exactly the people who
  // press it). The alphabet is therefore "qwertyuiopdf" and index 10 is D.
  // Two branches each wrote a different answer here; this is what the merged
  // MODULE_ORDER and SHORTCUT_KEYS actually produce.
  ["operations", "D"],
];

describe("module shortcuts — qwertyuiopdf", () => {
  it("orders the hub exactly as specified", () => {
    expect(MODULE_ORDER).toEqual(EXPECTED.map(([id]) => id));
  });

  it.each(EXPECTED)("gives %s the letter %s", (id, letter) => {
    expect(moduleShortcut(MODULE_ORDER.indexOf(id as never))).toBe(letter);
  });

  it.each(EXPECTED)("maps a pressed %s key back to %s", (id, letter) => {
    expect(moduleForShortcut(letter)).toBe(id);
    // The handler passes `e.code.slice(3)` ("Q") on some paths and a raw
    // `e.key` ("q") on others, so both cases must resolve.
    expect(moduleForShortcut(letter.toLowerCase())).toBe(id);
  });

  it("leaves EVERY module with a shortcut", () => {
    // The old 1-9/0 row ran out at ten and left HandHolding and Project with
    // none; a letter for every module is the point of the change, and the
    // alphabet has room to spare now the hub holds eleven.
    const missing = MODULE_ORDER.filter((_, i) => moduleShortcut(i) === null);
    expect(missing).toEqual([]);
  });

  it("hands out no letter twice", () => {
    const letters = MODULE_ORDER.map((_, i) => moduleShortcut(i));
    expect(new Set(letters).size).toBe(letters.length);
  });

  it("teaches the modifier alongside the letter", () => {
    // A bare letter does not navigate, so a surface that printed one alone
    // would be advertising a shortcut that does nothing.
    //
    // Two forms, and the width difference is the whole reason both exist: the
    // footer dock and the module bar put every module on one scrolling line,
    // where "⌥Q" costs the same two characters the old "⌃1" did and "Alt+Q"
    // costs five. The long form is for tooltips and the cheatsheet.
    //
    // Indexed off the LAST module rather than a hardcoded 11, so adding a
    // twelfth does not fail this on a number that was never the point.
    const last = MODULE_ORDER.length - 1;
    expect(moduleShortcutHint(0)).toBe("⌥Q");
    expect(moduleShortcutHint(last)).toBe("⌥D");
    expect(moduleShortcutLabel(0)).toBe("Alt+Q");
    expect(moduleShortcutLabel(last)).toBe("Alt+D");
    for (let i = 0; i < MODULE_ORDER.length; i++) {
      expect(moduleShortcutHint(i)).toHaveLength(2);
    }
  });

  it("ignores keys outside the alphabet", () => {
    // "s" is in the alphabet but past the end of an eleven-module hub, so it
    // resolves to nothing — exactly like a letter that was never in it.
    for (const k of ["z", "n", "s", "1", "0", "", "Enter", "ArrowLeft"]) {
      expect(moduleForShortcut(k)).toBeUndefined();
    }
  });

  /**
   * THE ADMIN PANEL'S LETTER MUST NOT BE IN THE MODULE ALPHABET.
   *
   * This is the invariant the whole arrangement rests on. Both key listeners
   * test `isAdminPanelShortcut` first and then fall through to
   * `moduleForShortcut`; if A were ever handed back to a module, the panel
   * would silently shadow it and the module's own badge would be a lie. Put
   * A back into SHORTCUT_KEYS and this fails immediately, which is the point.
   */
  it("keeps A out of the module alphabet, for the Admin Panel", () => {
    expect(moduleForShortcut("A")).toBeUndefined();
    expect(moduleForShortcut("a")).toBeUndefined();
    expect(MODULE_ORDER.map((_, i) => moduleShortcut(i))).not.toContain(
      ADMIN_PANEL_SHORTCUT,
    );
  });

  it("recognises the Admin Panel key in either case", () => {
    expect(isAdminPanelShortcut("A")).toBe(true);
    expect(isAdminPanelShortcut("a")).toBe(true);
    // And nothing else — a near miss must not open the control room.
    for (const k of ["b", "q", "s", "", "Alt", "ArrowLeft"]) {
      expect(isAdminPanelShortcut(k)).toBe(false);
    }
  });

  it("points the Admin Panel at the EXISTING route, not a new one", () => {
    // The single fact that makes this a second door rather than a second
    // implementation. `/admin` is the path the user-menu entry has always used
    // and the one `app/(admin)/admin/layout.tsx` guards.
    expect(ADMIN_PANEL_ENTRY.href).toBe("/admin");
    expect(ADMIN_PANEL_ENTRY.shortcut).toBe("A");
  });

  it("does not make the Admin Panel a workspace", () => {
    // It has no id, and it is not in the hub order — so it consumes no letter
    // by position and cannot re-letter anything.
    expect(MODULE_ORDER).not.toContain("admin-panel" as never);
    expect("id" in ADMIN_PANEL_ENTRY).toBe(false);
  });

  it("keeps a theme entry for every module on the hub", () => {
    for (const id of MODULE_ORDER) expect(MODULE_THEME[id]).toBeTruthy();
  });
});
