// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { ModuleShortcuts as HubLetterShortcuts } from "@/components/hub/module-shortcuts";
import { ModuleShortcuts as AppAltShortcuts } from "@/components/layout/module-shortcuts";
import { MODULE_THEME, MODULE_ORDER } from "@/lib/module-theme";
import type { WorkspaceId } from "@/lib/workspaces";

/** Everything but Sales, so the "no access" branch has something to refuse. */
const ALLOWED = MODULE_ORDER.filter((id) => id !== "sales") as WorkspaceId[];

function key(code: string, init: KeyboardEventInit = {}) {
  const ev = new KeyboardEvent("keydown", {
    code,
    key: code.startsWith("Key") ? code.slice(3).toLowerCase() : code,
    bubbles: true,
    cancelable: true,
    ...init,
  });
  document.body.dispatchEvent(ev);
  return ev;
}

describe("hub bare-letter shortcuts", () => {
  beforeEach(() => {
    push.mockReset();
    document.body.innerHTML = "";
  });
  afterEach(cleanup);

  it("opens a module on the unmodified key the card badge shows", () => {
    render(<HubLetterShortcuts allowed={ALLOWED} />);
    key("KeyE");
    expect(push).toHaveBeenCalledWith(MODULE_THEME["project-plan"].href);
  });

  it.each(
    MODULE_ORDER.filter((id) => id !== "sales").map(
      (id, _i) => [id, "QWERTYUIOPAS"[MODULE_ORDER.indexOf(id)]] as const,
    ),
  )("bare %s letter opens it", (id, letter) => {
    render(<HubLetterShortcuts allowed={ALLOWED} />);
    key(`Key${letter}`);
    expect(push).toHaveBeenCalledWith(MODULE_THEME[id].href);
  });

  it("leaves Alt to the app-wide listener, so one press is not two navigations", () => {
    // Both listeners are mounted on the hub. If this one also claimed Alt, an
    // Alt+E there would push twice.
    render(<HubLetterShortcuts allowed={ALLOWED} />);
    key("KeyE", { altKey: true });
    expect(push).not.toHaveBeenCalled();
  });

  it("mounted together, exactly one of the two answers each press", () => {
    render(
      <>
        <HubLetterShortcuts allowed={ALLOWED} />
        <AppAltShortcuts allowed={ALLOWED} />
      </>,
    );
    key("KeyE");
    expect(push).toHaveBeenCalledTimes(1);
    push.mockReset();
    key("KeyE", { altKey: true });
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("yields to a G-sequence that already claimed the key", () => {
    // KeyboardShortcuts owns G-T / G-P / G-I / G-W / G-A, and t/p/i/w/a are all
    // module letters too. It is bound to `document` and preventDefaults before
    // navigating, so by the time this window-level listener sees the event it is
    // already spoken for.
    render(<HubLetterShortcuts allowed={ALLOWED} />);
    for (const code of ["KeyW", "KeyT", "KeyI", "KeyP", "KeyA"]) {
      document.addEventListener("keydown", (e) => e.preventDefault(), { once: true });
      key(code);
    }
    expect(push).not.toHaveBeenCalled();
  });

  it("does not fire while typing in a field", () => {
    render(<HubLetterShortcuts allowed={ALLOWED} />);
    const input = document.createElement("input");
    document.body.appendChild(input);
    input.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyQ", key: "q", bubbles: true }));
    expect(push).not.toHaveBeenCalled();
  });

  it("does not fire while a dialog is open", () => {
    render(<HubLetterShortcuts allowed={ALLOWED} />);
    const modal = document.createElement("div");
    modal.setAttribute("aria-modal", "true");
    document.body.appendChild(modal);
    key("KeyQ");
    expect(push).not.toHaveBeenCalled();
  });

  it("does nothing for a module the user cannot enter", () => {
    render(<HubLetterShortcuts allowed={ALLOWED} />);
    key("KeyU"); // Sales
    expect(push).not.toHaveBeenCalled();
  });

  it("ignores Ctrl and letters outside the alphabet", () => {
    render(<HubLetterShortcuts allowed={ALLOWED} />);
    key("KeyW", { ctrlKey: true });
    key("KeyZ");
    key("KeyN"); // the new-task key
    key("KeyG"); // the sequence leader
    expect(push).not.toHaveBeenCalled();
  });
});
