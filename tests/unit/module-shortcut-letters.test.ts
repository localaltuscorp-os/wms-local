import { describe, it, expect } from "vitest";
import {
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
  // Monthly Events Master ("A") and HandHolding ("S") LEFT the hub on
  // 2026-09-11 — both became areas inside Operations, which took the "A" slot by
  // being appended. Appending is what kept Q…P pointing at the same ten modules
  // they always have; slotting Operations in beside them would have re-lettered
  // everything after it.
  ["operations", "A"],
];

describe("module shortcuts — qwertyuiopas", () => {
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
    expect(moduleShortcutHint(last)).toBe("⌥A");
    expect(moduleShortcutLabel(0)).toBe("Alt+Q");
    expect(moduleShortcutLabel(last)).toBe("Alt+A");
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

  it("keeps a theme entry for every module on the hub", () => {
    for (const id of MODULE_ORDER) expect(MODULE_THEME[id]).toBeTruthy();
  });
});
