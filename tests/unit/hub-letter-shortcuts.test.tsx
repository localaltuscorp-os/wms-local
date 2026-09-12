// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));

import { ModuleShortcuts as HubLetterShortcuts } from "@/components/hub/module-shortcuts";
import { ModuleShortcuts as AppAltShortcuts } from "@/components/layout/module-shortcuts";
import {
  ADMIN_PANEL_ENTRY,
  ADMIN_PANEL_SHORTCUT,
  MODULE_THEME,
  MODULE_ORDER,
  moduleShortcut,
} from "@/lib/module-theme";

/* The letter a module answers to, by id. Read from the source rather than
   spelled out: the letters became MNEMONIC on 2026-09-12 (W for WMS, G for
   Goals) and a second copy here would be one more thing to re-edit the next
   time one changes — which is precisely how the "QWERTYUIOPAS" table below
   went stale. */
const letterFor = (id: WorkspaceId) => moduleShortcut(MODULE_ORDER.indexOf(id))!;
const keyFor = (id: WorkspaceId) => `Key${letterFor(id)}`;
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
    key(keyFor("project-plan"));
    expect(push).toHaveBeenCalledWith(MODULE_THEME["project-plan"].href);
  });

  // DERIVED from `moduleShortcut`, not spelled out. It used to hardcode
  // "QWERTYUIOPAS", which is a second copy of the alphabet — and it went stale
  // the moment A was vacated for the Admin Panel, failing on two modules whose
  // behaviour had not changed at all. Reading the same function the component
  // reads means a re-lettering updates this table by itself and only a real
  // regression can fail it. That paid for itself again on 2026-09-12, when
  // every letter changed at once and this case needed no edit.
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
    key(keyFor("project-plan"), { altKey: true });
    expect(push).not.toHaveBeenCalled();
  });

  it("mounted together, exactly one of the two answers each press", () => {
    render(
      <>
        <HubLetterShortcuts allowed={ALLOWED} />
        <AppAltShortcuts allowed={ALLOWED} />
      </>,
    );
    key(keyFor("project-plan"));
    expect(push).toHaveBeenCalledTimes(1);
    push.mockReset();
    key(keyFor("project-plan"), { altKey: true });
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("yields to a G-sequence that already claimed the key", () => {
    // KeyboardShortcuts owns G-T / G-P / G-I / G-W / G-A, and w/p/a are module
    // letters too (WMS, Project, Accounts) — more of them than under the old
    // positional scheme, since mnemonic letters land on the same common
    // initials the page sequences chose. It is bound to `document` and
    // preventDefaults before navigating, so by the time this window-level
    // listener sees the event it is already spoken for.
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
    input.dispatchEvent(
      new KeyboardEvent("keydown", { code: keyFor("wms"), key: "w", bubbles: true }),
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("does not fire while a dialog is open", () => {
    render(<HubLetterShortcuts allowed={ALLOWED} />);
    const modal = document.createElement("div");
    modal.setAttribute("aria-modal", "true");
    document.body.appendChild(modal);
    key(keyFor("wms"));
    expect(push).not.toHaveBeenCalled();
  });

  it("does nothing for a module the user cannot enter", () => {
    render(<HubLetterShortcuts allowed={ALLOWED} />);
    key(keyFor("sales"));
    expect(push).not.toHaveBeenCalled();
  });

  it("ignores Ctrl, and letters no module claims", () => {
    render(<HubLetterShortcuts allowed={ALLOWED} />);
    key(keyFor("wms"), { ctrlKey: true });
    key("KeyZ");
    key("KeyN"); // the new-task key
    // NOT KeyG any more: G is the sequence leader AND, since the letters became
    // mnemonic, the Goals module's own key. The two coexist because the
    // sequence handler preventDefaults first (covered above); it is no longer
    // an example of a letter nobody claims.
    key("KeyQ"); // was WMS under the positional alphabet; claimed by nothing now
    expect(push).not.toHaveBeenCalled();
  });
});

/* ══════════════════════════════════════════════════════════════════════════
   THE STANDALONE ADMIN PANEL ENTRY — bare D on the hub, Alt+D everywhere
   ══════════════════════════════════════════════════════════════════════════

   D since 2026-09-12. It was A until the letters became mnemonic and Accounts
   claimed its own first letter; D was free, and it is the D in "aDmin".

   The panel's letter is not a module letter (see module-shortcut-letters.test.ts,
   which pins that), so these cases exercise the branch the two listeners carry
   for it. What matters is that it behaves EXACTLY like a module key — same
   typing guard, same dialog guard, same allow-list discipline — because an
   admin surface that is easier to trigger by accident than a normal one is the
   wrong way round.

   Written through ADMIN_PANEL_SHORTCUT rather than the literal: this block was
   spelled "A" throughout and every case here needed editing when the letter
   moved. Once was enough. */
const PANEL_KEY = `Key${ADMIN_PANEL_SHORTCUT}`;

describe("Admin Panel shortcut", () => {
  beforeEach(() => {
    push.mockReset();
    document.body.innerHTML = "";
  });
  afterEach(cleanup);

  it("opens the EXISTING /admin route on its bare letter, for an admin", () => {
    render(<HubLetterShortcuts allowed={ALLOWED} adminAllowed />);
    key(PANEL_KEY);
    expect(push).toHaveBeenCalledWith("/admin");
    expect(push).toHaveBeenCalledWith(ADMIN_PANEL_ENTRY.href);
  });

  it("opens it on Alt+<letter> from anywhere, through the app-wide listener", () => {
    render(<AppAltShortcuts allowed={ALLOWED} adminAllowed />);
    key(PANEL_KEY, { altKey: true });
    expect(push).toHaveBeenCalledWith(ADMIN_PANEL_ENTRY.href);
  });

  it("no longer answers to A — that letter belongs to Accounts now", () => {
    /* The regression this rename could most plausibly cause. A was the panel's
       key for two days and is muscle memory for the admins who used it; if the
       branch had been left matching A as well, pressing it would open the
       control room while the Accounts card's own badge said A. */
    render(<HubLetterShortcuts allowed={ALLOWED} adminAllowed />);
    key("KeyA");
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith(MODULE_THEME["admin"].href);
    expect(push).not.toHaveBeenCalledWith(ADMIN_PANEL_ENTRY.href);
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
    key(PANEL_KEY);
    key(PANEL_KEY, { altKey: true });
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
      el.dispatchEvent(
        new KeyboardEvent("keydown", {
          code: PANEL_KEY,
          key: ADMIN_PANEL_SHORTCUT.toLowerCase(),
          bubbles: true,
        }),
      );
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
      inner.dispatchEvent(
        new KeyboardEvent("keydown", {
          code: PANEL_KEY,
          key: ADMIN_PANEL_SHORTCUT.toLowerCase(),
          bubbles: true,
        }),
      );
    }
    expect(push).not.toHaveBeenCalled();
  });

  it("does not fire while a dialog is open", () => {
    render(<HubLetterShortcuts allowed={ALLOWED} adminAllowed />);
    const modal = document.createElement("div");
    modal.setAttribute("aria-modal", "true");
    document.body.appendChild(modal);
    key(PANEL_KEY);
    expect(push).not.toHaveBeenCalled();
  });

  it("yields to the G-A sequence, which owns Attendance", () => {
    render(<HubLetterShortcuts allowed={ALLOWED} adminAllowed />);
    document.addEventListener("keydown", (e) => e.preventDefault(), { once: true });
    key(PANEL_KEY);
    expect(push).not.toHaveBeenCalled();
  });

  it("ignores Ctrl and Shift", () => {
    render(
      <>
        <HubLetterShortcuts allowed={ALLOWED} adminAllowed />
        <AppAltShortcuts allowed={ALLOWED} adminAllowed />
      </>,
    );
    key(PANEL_KEY, { ctrlKey: true });
    key(PANEL_KEY, { shiftKey: true });
    expect(push).not.toHaveBeenCalled();
  });

  it("mounted together, exactly one listener answers each press", () => {
    // Both are mounted on the hub. A bare A must be the hub listener's alone and
    // Alt+A the layout's alone, or one press navigates twice.
    render(
      <>
        <HubLetterShortcuts allowed={ALLOWED} adminAllowed />
        <AppAltShortcuts allowed={ALLOWED} adminAllowed />
      </>,
    );
    key(PANEL_KEY);
    expect(push).toHaveBeenCalledTimes(1);
    push.mockReset();
    key(PANEL_KEY, { altKey: true });
    expect(push).toHaveBeenCalledTimes(1);
  });

  it("gives the Admin Panel a letter no module answers to", () => {
    /* This test has now outlived its own description three times — it asserted
       D→Events, then F→HandHolding, then P→Operations, each time because the
       POSITIONAL alphabet re-lettered everything behind a module that moved.
       That scheme is gone (2026-09-12): letters are mnemonic and owned per
       module, so a hub re-order no longer touches any of them.

       Stated as the durable claim this time. The panel holds D and Accounts
       holds A — the panel's own letter until that day — so the two assertions
       below are the ones that matter: the panel's key opens the panel, and the
       key it used to own now opens the module that took it, rather than both
       listeners firing on one press. */
    render(<HubLetterShortcuts allowed={ALLOWED} adminAllowed />);

    key(PANEL_KEY);
    expect(push).toHaveBeenCalledWith(ADMIN_PANEL_ENTRY.href);
    push.mockReset();

    key("KeyA");
    expect(push).toHaveBeenCalledTimes(1);
    expect(push).toHaveBeenCalledWith(MODULE_THEME["admin"].href);
    push.mockReset();

    // A letter no module and no panel claims must do nothing at all, rather
    // than falling through to whichever room happens to be first.
    key("KeyZ");
    expect(push).not.toHaveBeenCalled();
  });
});
