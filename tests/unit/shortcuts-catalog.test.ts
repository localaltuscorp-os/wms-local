import { describe, it, expect } from "vitest";
import { SHORTCUT_GROUPS } from "@/lib/shortcuts-catalog";
import { MODULE_ORDER, MODULE_THEME, moduleShortcut } from "@/lib/module-theme";

/**
 * The catalogue is a hand-written COPY of what the key handlers bind, kept
 * import-free on purpose (see the file header). This is what stops the copy
 * drifting — it advertised the retired 1-9/0 digits long after the module keys
 * became Alt+letters, because nothing checked.
 */
const moduleGroup = SHORTCUT_GROUPS.find((g) => g.title === "Jump to a module")!;

describe("the jump-to-a-module group", () => {
  it("exists", () => {
    expect(moduleGroup).toBeTruthy();
  });

  it("lists one row per module, in MODULE_ORDER", () => {
    expect(moduleGroup.items).toHaveLength(MODULE_ORDER.length);
  });

  it("gives each module the letter the handler actually binds", () => {
    MODULE_ORDER.forEach((id, i) => {
      const letter = moduleShortcut(i);
      expect(letter, `module ${id} has no shortcut letter`).toBeTruthy();
      expect(moduleGroup.items[i]!.keys).toBe(`Alt + ${letter}`);
    });
  });

  it("names each module exactly as the hub card does", () => {
    MODULE_ORDER.forEach((id, i) => {
      expect(moduleGroup.items[i]!.does).toBe(MODULE_THEME[id].label);
    });
  });

  it("advertises Alt, the only modifier the handler accepts", () => {
    // components/layout/module-shortcuts.tsx returns early on ctrlKey/shiftKey.
    for (const item of moduleGroup.items) {
      expect(item.keys).toMatch(/^Alt \+ [A-Z]$/);
      expect(item.keys).not.toMatch(/Ctrl|Shift/);
    }
  });

  it("no longer mentions the retired digit shortcuts", () => {
    const text = JSON.stringify(moduleGroup);
    expect(text).not.toMatch(/1 … 9|1-9|\b0\b/);
  });
});
