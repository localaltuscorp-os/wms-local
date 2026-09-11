"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import {
  ADMIN_PANEL_ENTRY,
  isAdminPanelShortcut,
  MODULE_THEME,
  moduleForShortcut,
} from "@/lib/module-theme";
import type { WorkspaceId } from "@/lib/workspaces";

/**
 * BARE-LETTER module shortcuts, for the HUB ONLY: pressing Q opens WMS, W opens
 * Goals, E opens Project, and so on down MODULE_ORDER.
 *
 * WHY THIS EXISTS ALONGSIDE components/layout/module-shortcuts.tsx. That one is
 * mounted in the (app) layout and requires Alt, because inside a room a bare
 * letter is almost always typing — the account holder had bare DIGITS removed
 * for exactly that reason, and letters are worse. The hub is the one surface
 * where the opposite is true: it has no fields but global search, its cards
 * badge a bare "Q" in the corner, and someone looking at that badge presses Q.
 * A hub that answers only to Alt+Q is advertising a shortcut it does not have.
 *
 * So the two split by modifier and never both fire:
 *   • no modifier  → this listener (hub only)
 *   • Alt / Cmd    → the layout's listener (everywhere, hub included)
 * Ctrl is refused by both; the browser has already spent Ctrl+W/T/P/R.
 *
 * THE `g` SEQUENCE IS WHY `defaultPrevented` IS CHECKED. KeyboardShortcuts owns
 * Gmail-style leaders — G-T for Tasks, G-P for Projects, G-I for Inbox, G-W for
 * Weekly Goals, G-A for Attendance — and t, p, i, w and a are all letters in the
 * module alphabet too. That handler is bound to `document` and this one to
 * `window`, so for a bubbling keydown it always runs first and calls
 * preventDefault() before navigating; bailing out on an already-claimed event is
 * what stops "G then W" from being answered twice, with this one landing last
 * and winning. A bare `g` is not in the alphabet, so the leader itself is safe.
 *
 * `allowed` is resolved on the server and passed in, so a letter for a room you
 * cannot enter does nothing instead of bouncing you off the layout gate. That is
 * presentation parity with the hidden cards, not the security boundary.
 *
 * `adminAllowed` is the same arrangement for the standalone ADMIN PANEL entry
 * (A), which is not a workspace and so is not in `allowed` — see
 * ADMIN_PANEL_ENTRY in lib/module-theme.ts. A non-admin pressing A does nothing
 * rather than being bounced off `/admin`'s own guard, which is what actually
 * refuses them.
 */
export function ModuleShortcuts({
  allowed,
  adminAllowed = false,
}: {
  allowed: WorkspaceId[];
  adminAllowed?: boolean;
}) {
  const router = useRouter();

  React.useEffect(() => {
    const allow = new Set(allowed);

    function onKey(e: KeyboardEvent) {
      // BARE key only. Alt/Cmd belong to the layout's listener, which is mounted
      // here too — claiming them as well would fire two navigations for one
      // press. Ctrl and Shift are not this shortcut at all.
      if (e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return;

      // Someone else already answered this keystroke — see the `g` note above.
      if (e.defaultPrevented) return;

      // Never steal a keystroke that is part of typing. `isContentEditable`
      // covers rich-text surfaces; the role check covers custom comboboxes that
      // are divs rather than <input>. On the hub this is really about the
      // global-search field, which is exactly where someone types a "q".
      const el = e.target as HTMLElement | null;
      if (el) {
        const tag = el.tagName;
        if (
          tag === "INPUT" ||
          tag === "TEXTAREA" ||
          tag === "SELECT" ||
          el.isContentEditable ||
          el.closest('[contenteditable="true"],[role="textbox"],[role="combobox"],[role="searchbox"]')
        ) {
          return;
        }
      }

      // Never navigate out from under an open dialog — the search palette, the
      // "?" shortcut sheet, the New Task modal. A letter typed at one of those
      // is meant for it.
      if (
        document.querySelector(
          '[role="dialog"][data-state="open"],[role="alertdialog"][data-state="open"],[aria-modal="true"]',
        )
      ) {
        return;
      }

      // `e.code` ("KeyQ") ahead of `e.key`, so a non-Latin layout still matches
      // the physical key the badge names.
      const letter = /^Key[A-Z]$/.test(e.code) ? e.code.slice(3) : e.key;

      // THE ADMIN PANEL (A) — checked before the module alphabet, though the two
      // cannot both match: A was taken out of SHORTCUT_KEYS when this entry was
      // given the letter, so `moduleForShortcut("a")` is undefined. Ordered this
      // way anyway so a future re-lettering that put A back cannot silently
      // shadow the panel; it would fail loudly here instead.
      if (isAdminPanelShortcut(letter)) {
        if (!adminAllowed) return;
        e.preventDefault();
        router.push(ADMIN_PANEL_ENTRY.href);
        return;
      }

      const id = moduleForShortcut(letter);
      if (!id || !allow.has(id)) return;
      e.preventDefault();
      router.push(MODULE_THEME[id].href as Route);
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, allowed, adminAllowed]);

  return null;
}
