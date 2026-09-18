import { describe, it, expect } from "vitest";
import {
  ADMIN_PANEL_ENTRY,
  ADMIN_PANEL_SHORTCUT,
  MODULE_SHORTCUT_COLLISIONS,
  isAdminPanelShortcut,
  MODULE_ORDER,
  MODULE_THEME,
  moduleShortcut,
  moduleShortcutHint,
  moduleShortcutLabel,
  moduleForShortcut,
} from "@/lib/module-theme";

/**
 * The letters are MNEMONIC as of 2026-09-12 (account holder): each comes from
 * the module's own name and is stored on MODULE_THEME[id].shortcut.
 *
 * THE ORDER AND THE LETTERS ARE NOW INDEPENDENT — which is the point of the
 * change. Under the old positional scheme this table was one spec covering
 * both, and every hub re-order or removal re-lettered everything behind it;
 * three modules moved into Operations in two days and did exactly that. Today
 * MODULE_ORDER decides layout only, so the first assertion below pins the order
 * and the rest pin the letters, and a change to one need not touch the other.
 *
 * This table is still the spec: if it fails, someone changed a letter or the
 * hub order, and both are decisions to make on purpose.
 */
const EXPECTED: [string, string][] = [
  ["wms", "W"],
  ["goals", "G"],
  ["project-plan", "P"],
  // R, not P — Project has that. R is in "peRformance", AND it is the key this
  // module already carried under the positional scheme, so the people using it
  // relearned nothing.
  ["productivity", "R"],
  ["billing", "B"],
  ["hr", "H"],
  ["sales", "S"],
  // The card is labelled "Accounts"; the workspace id is `admin`. A is the
  // label's letter, which is what the user sees on the card and presses.
  ["admin", "A"],
  ["employees", "E"],
  ["operations", "O"],
];


describe("module shortcuts — mnemonic, one per module", () => {
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
    // none. A letter for every module was the point of that change and is still
    // the rule; a module added with no `shortcut` renders unlettered, which is
    // silent, so it is caught here instead.
    const missing = MODULE_ORDER.filter((_, i) => moduleShortcut(i) === null);
    expect(missing).toEqual([]);
  });

  it("hands out no letter twice — the Admin Panel's included", () => {
    /* THE INVARIANT THE WHOLE ARRANGEMENT RESTS ON, and the one the mnemonic
       scheme made easy to break: under the positional alphabet a duplicate was
       impossible by construction, but a letter taken from a NAME can collide
       the moment somebody adds a module — Marketing would want M, Projects
       would want P.

       A duplicate does not throw and does not fail typecheck. Two listeners
       answer one keystroke, whichever runs first wins, and the losing module's
       own badge promises a key that opens something else. Invisible until
       pressed, so it is computed in lib/module-theme.ts and asserted here. */
    expect(MODULE_SHORTCUT_COLLISIONS).toEqual([]);

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
    expect(moduleShortcutHint(0)).toBe("⌥W");
    expect(moduleShortcutHint(last)).toBe("⌥O");
    expect(moduleShortcutLabel(0)).toBe("Alt+W");
    expect(moduleShortcutLabel(last)).toBe("Alt+O");
    for (let i = 0; i < MODULE_ORDER.length; i++) {
      expect(moduleShortcutHint(i)).toHaveLength(2);
    }
  });

  it("ignores letters no module claims", () => {
    /* The empty string is in here deliberately. Four themed rooms have no hub
       card and carry `shortcut: ""` — empty is falsy, not a letter, and a naive
       comparison would match ALL of them and open whichever came first. */
    for (const k of ["z", "n", "q", "1", "0", "", "  ", "Enter", "ArrowLeft"]) {
      expect(moduleForShortcut(k), k + " must open nothing").toBeUndefined();
    }
  });

  /**
   * NO MODULE MAY CLAIM THE ADMIN PANEL'S LETTER.
   *
   * Both key listeners test `isAdminPanelShortcut` first and then fall through
   * to `moduleForShortcut`, so a module holding the panel's letter would be
   * silently shadowed and its own badge would be a lie.
   *
   * The letter is D since 2026-09-12 — it was A until Accounts took its own
   * first letter. Asserted through ADMIN_PANEL_SHORTCUT rather than the literal,
   * so moving it again is one edit rather than a hunt through the tests.
   */
  it("keeps the Admin Panel's letter out of the modules", () => {
    expect(moduleForShortcut(ADMIN_PANEL_SHORTCUT)).toBeUndefined();
    expect(moduleForShortcut(ADMIN_PANEL_SHORTCUT.toLowerCase())).toBeUndefined();
    expect(MODULE_ORDER.map((_, i) => moduleShortcut(i))).not.toContain(
      ADMIN_PANEL_SHORTCUT,
    );
  });

  it("recognises the Admin Panel key in either case", () => {
    expect(isAdminPanelShortcut(ADMIN_PANEL_SHORTCUT)).toBe(true);
    expect(isAdminPanelShortcut(ADMIN_PANEL_SHORTCUT.toLowerCase())).toBe(true);
    // And nothing else — a near miss must not open the control room. "a" and
    // "A" are in this list ON PURPOSE: the panel answered to them until
    // 2026-09-12, and A now belongs to Accounts, so the old habit must open
    // Accounts rather than quietly still reaching the control room.
    for (const k of ["a", "A", "b", "q", "s", "", "Alt", "ArrowLeft"]) {
      expect(isAdminPanelShortcut(k), k).toBe(false);
    }
  });

  it("points the Admin Panel at the EXISTING route, not a new one", () => {
    // The single fact that makes this a second door rather than a second
    // implementation. `/admin` is the path the user-menu entry has always used
    // and the one `app/(admin)/admin/layout.tsx` guards.
    expect(ADMIN_PANEL_ENTRY.href).toBe("/admin");
    expect(ADMIN_PANEL_ENTRY.shortcut).toBe(ADMIN_PANEL_SHORTCUT);
  });

  it("does not make the Admin Panel a workspace", () => {
    // It has no id and is not in the hub order, so `moduleForShortcut` can
    // never resolve its letter and the two listeners cannot both fire.
    expect(MODULE_ORDER).not.toContain("admin-panel" as never);
    expect("id" in ADMIN_PANEL_ENTRY).toBe(false);
  });

  it("keeps a theme entry for every module on the hub", () => {
    for (const id of MODULE_ORDER) expect(MODULE_THEME[id]).toBeTruthy();
  });
});
