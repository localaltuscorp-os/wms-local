// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { ModuleShortcuts } from "@/components/layout/module-shortcuts";
import { MODULE_THEME } from "@/lib/module-theme";
import type { WorkspaceId } from "@/lib/workspaces";

/** Everything except Sales, so the "no access" branch has something to refuse. */
const ALLOWED: WorkspaceId[] = [
  "wms", "goals", "project-plan", "productivity", "billing", "hr",
  "admin", "training", "employees", "events", "people-allocation",
];

function key(code: string, init: KeyboardEventInit = {}) {
  window.dispatchEvent(
    new KeyboardEvent("keydown", { code, key: code.slice(3).toLowerCase(), bubbles: true, ...init }),
  );
}

describe("ModuleShortcuts — Alt+letter", () => {
  beforeEach(() => {
    push.mockReset();
    render(<ModuleShortcuts allowed={ALLOWED} />);
  });
  afterEach(cleanup);

  it("opens the module for its letter", () => {
    key("KeyE", { altKey: true });
    expect(push).toHaveBeenCalledWith(MODULE_THEME["project-plan"].href);
  });

  it("accepts Cmd on macOS", () => {
    key("KeyY", { metaKey: true });
    expect(push).toHaveBeenCalledWith(MODULE_THEME.hr.href);
  });

  it("IGNORES Ctrl — the browser owns Ctrl+W/T/P and we must not race it", () => {
    // Ctrl+W closes the tab at a level preventDefault() cannot reach. Firing a
    // navigation on the way out would be strictly worse than doing nothing.
    key("KeyW", { ctrlKey: true });
    key("KeyT", { ctrlKey: true });
    key("KeyE", { ctrlKey: true });
    expect(push).not.toHaveBeenCalled();
  });

  it("ignores a bare letter, so typing is never stolen", () => {
    key("KeyE");
    expect(push).not.toHaveBeenCalled();
  });

  it("ignores the shortcut with Shift held", () => {
    key("KeyE", { altKey: true, shiftKey: true });
    expect(push).not.toHaveBeenCalled();
  });

  it("does nothing for a letter outside the alphabet", () => {
    key("KeyZ", { altKey: true });
    key("KeyN", { altKey: true }); // N is the new-task key — must stay untouched
    expect(push).not.toHaveBeenCalled();
  });

  it("does nothing for a module the user cannot enter", () => {
    key("KeyU", { altKey: true }); // Sales, absent from ALLOWED
    expect(push).not.toHaveBeenCalled();
  });

  it("does nothing for the retired number-row shortcuts", () => {
    for (const code of ["Digit1", "Digit3", "Digit0"]) {
      key(code, { altKey: true });
      key(code, { ctrlKey: true });
    }
    expect(push).not.toHaveBeenCalled();
  });

  it("never navigates out from under an open dialog", () => {
    const modal = document.createElement("div");
    modal.setAttribute("role", "dialog");
    modal.setAttribute("data-state", "open");
    document.body.appendChild(modal);
    key("KeyE", { altKey: true });
    expect(push).not.toHaveBeenCalled();
    modal.remove();
  });
});
