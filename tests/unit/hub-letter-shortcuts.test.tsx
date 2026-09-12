// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { ModuleShortcuts as HubLetterShortcuts } from "@/components/hub/module-shortcuts";
import { ModuleShortcuts as AppAltShortcuts } from "@/components/layout/module-shortcuts";
import {
  ADMIN_PANEL_ENTRY,
  MODULE_THEME,
  MODULE_ORDER,
  moduleShortcut,
} from "@/lib/module-theme";
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

  // DERIVED from `moduleShortcut`, not spelled out. It used to hardcode
  // "QWERTYUIOPAS", which is a second copy of the alphabet — and it went stale
  // the moment A was vacated for the Admin Panel, failing on two modules whose
  // behaviour had not changed at all. Reading the same function the component
  // reads means a re-lettering updates this table by itself and only a real
  // regression can fail it.
  it.each(
    MODULE_ORDER.filter((id) => id !== "sales").map(
      (id) => [id, moduleShortcut(MODULE_ORDER.indexOf(id))!] as const,
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

/* ══════════════════════════════════════════════════════════════════════════
   THE STANDALONE ADMIN PANEL ENTRY — bare A on the hub, Alt+A everywhere
   ══════════════════════════════════════════════════════════════════════════

   A is not a module letter (see module-shortcut-letters.test.ts, which pins
   that), so these cases exercise the branch the two listeners carry for the
   panel. What matters is that it behaves EXACTLY like a module key — same
   typing guard, same dialog guard, same allow-list discipline — because an
   admin surface that is easier to trigger by accident than a normal one is the
   wrong way round. */

describe("Admin Panel shortcut", () => {
  beforeEach(() => {
    push.mockReset();
    document.body.innerHTML = "";
  });
  afterEach(cleanup);

  it("opens the EXISTING /admin route on a bare A, for an admin", () => {
    render(<HubLetterShortcuts allowed={ALLOWED} adminAllowed />);
    key("KeyA");
    expect(push).toHaveBeenCalledWith("/admin");
    expect(push).toHaveBeenCalledWith(ADMIN_PANEL_ENTRY.href);
  });

  it("opens it on Alt+A from anywhere, through the app-wide listener", () => {
    render(<AppAltShortcuts allowed={ALLOWED} adminAllowed />);
    key("KeyA", { altKey: true });
    expect(push).toHaveBeenCalledWith(ADMIN_PANEL_ENTRY.href);
  });

  it("does NOTHING for a non-admin, on either listener", () => {
    // Presentation parity with the hidden hub card. The real refusal is
    // `app/(admin)/admin/layout.tsx`, which redirects a non-admin to /hub
    // whether or not this listener fired.
    render(
      <>
        <HubLetterShortcuts allowed={ALLOWED} />
        <AppAltShortcuts allowed={ALLOWED} />
      </>,
    );
    key("KeyA");
    key("KeyA", { altKey: true });
    expect(push).not.toHaveBeenCalled();
  });

  it("does not fire while typing — input, textarea, select, contenteditable", () => {
    render(<HubLetterShortcuts allowed={ALLOWED} adminAllowed />);
    const editable = document.createElement("div");
    editable.setAttribute("contenteditable", "true");
    for (const el of [
      document.createElement("input"),
      document.createElement("textarea"),
      document.createElement("select"),
      editable,
    ]) {
      document.body.appendChild(el);
      el.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyA", key: "a", bubbles: true }));
    }
    expect(push).not.toHaveBeenCalled();
  });

  it("does not fire inside a combobox, searchbox or editable table cell", () => {
    // The brief names dropdowns and editable table cells specifically. Each is
    // a div in this codebase, not an <input>, so the role/closest test is what
    // catches them rather than the tagName test above.
    render(<HubLetterShortcuts allowed={ALLOWED} adminAllowed />);
    for (const role of ["combobox", "searchbox", "textbox"]) {
      const host = document.createElement("div");
      host.setAttribute("role", role);
      const inner = document.createElement("span"); // the event target is a child
      host.appendChild(inner);
      document.body.appendChild(host);
      inner.dispatchEvent(new KeyboardEvent("keydown", { code: "KeyA", key: "a", bubbles: true }));
    }
    expect(push).not.toHaveBeenCalled();
  });

  it("does not fire while a dialog is open", () => {
    render(<HubLetterShortcuts allowed={ALLOWED} adminAllowed />);
    const modal = document.createElement("div");
    modal.setAttribute("aria-modal", "true");
    document.body.appendChild(modal);
    key("KeyA");
    expect(push).not.toHaveBeenCalled();
  });

  it("yields to the G-A sequence, which owns Attendance", () => {
    render(<HubLetterShortcuts allowed={ALLOWED} adminAllowed />);
    document.addEventListener("keydown", (e) => e.preventDefault(), { once: true });
    key("KeyA");
    expect(push).not.toHaveBeenCalled();
  });

  it("ignores Ctrl and Shift", () => {
    render(
      <>
        <HubLetterShortcuts allowed={ALLOWED} adminAllowed />
        <AppAltShortcuts allowed={ALLOWED} adminAllowed />
      </>,
    );
    key("KeyA", { ctrlKey: true });
    key("KeyA", { shiftKey: true });
    expect(push).not.toHaveBeenCalled();
  });

  it("mounted together, exactly one listener answers each A", () => {
    // Both are mounted on the hub. A bare A must be the hub listener's alone and
    // Alt+A the layout's alone, or one press navigates twice.
    render(
      <>
        <HubLetterShortcuts allowed={ALLOWED} adminAllowed />
        <AppAltShortcuts allowed={ALLOWED} adminAllowed />
      </>,
    );
    key("KeyA");
    expect(push).toHaveBeenCalledTimes(1);
    push.mockReset();
    key("KeyA", { altKey: true });
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("does not disturb the module letter that shares the row", () => {
    // D belongs to OPERATIONS, not Events. Events and HandHolding left
    // MODULE_ORDER on 2026-09-11 — both became areas inside Operations — and
    // Operations was appended, landing on the eleventh key. A and S stay vacated
    // so the Admin Panel can hold A; the alphabet is "qwertyuiopdf".
    //
    // This test previously asserted D→Events and F→HandHolding. Those modules
    // are gone from the order, so the assertion outlived the thing it described.
    render(<HubLetterShortcuts allowed={ALLOWED} adminAllowed />);
    key("KeyD");
    expect(push).toHaveBeenCalledWith(MODULE_THEME["operations"].href);
    push.mockReset();
    // F is the twelfth key and there is no twelfth module, so it must do
    // nothing — not fall through to some other room.
    key("KeyF");
    expect(push).not.toHaveBeenCalled();
  });
});
