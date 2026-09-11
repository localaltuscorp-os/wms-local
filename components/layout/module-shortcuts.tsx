"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { MODULE_THEME, moduleForShortcut } from "@/lib/module-theme";
import type { WorkspaceId } from "@/lib/workspaces";

/**
 * LETTER MODULE SHORTCUTS — Alt+Q … Alt+S open the twelve modules in
 * MODULE_ORDER, from ANYWHERE in the app.
 *
 * Mounted once in `(app)/layout.tsx`, beside the module footer that displays the
 * same letters. That pairing is the point: the footer teaches the key and this
 * makes it work on the page you are already on, so moving from WMS to
 * Productivity is one keystroke rather than Hub → card → module. It used to be
 * mounted only on the hub, where the keys were visible but useless the moment
 * you entered a room.
 *
 * Renders nothing — it exists only to own the key listener, so the pages that
 * mount it can stay server components. The destination is `MODULE_THEME[id].href`,
 * the same value the hub card and the footer link to, so a room whose entry route
 * changes (Billing goes straight to /billing; everything else via /ws/<id>) keeps
 * working here without a second mapping to maintain.
 *
 * `allowed` is resolved on the server and passed in, so a letter for a room you
 * cannot enter does nothing instead of bouncing you off the layout gate. That is
 * presentation parity with the locked cards and the footer's plain-text entries,
 * not the security boundary.
 *
 * NOTE it is mounted BELOW the daily-ritual gates in the layout, which return
 * early. A shortcut therefore cannot be used to walk out of a gate — the
 * listener does not exist while one is on screen.
 */
export function ModuleShortcuts({ allowed }: { allowed: WorkspaceId[] }) {
  const router = useRouter();

  React.useEffect(() => {
    const allow = new Set(allowed);

    function onKey(e: KeyboardEvent) {
      // MODIFIER REQUIRED (Sir): a bare key no longer navigates.
      //
      // A plain "2" was ambiguous with typing — most visibly in the Tasks table's
      // due-date editor, where digits meant for the date landed as module jumps
      // the moment focus left the field. A modifier removes the ambiguity
      // entirely rather than adding another exception to the guard below. With
      // LETTERS as the keys (2026-09-10) that reasoning only got stronger: a
      // bare "e" is typing far more often than a digit ever was.
      //
      // ALT ONLY — and this is a change from the digit era, which also accepted
      // Ctrl. Ctrl+letter is almost entirely spoken for by the browser itself,
      // and destructively so: Ctrl+W CLOSES THE TAB, Ctrl+T opens one, Ctrl+P
      // prints, Ctrl+R reloads, Ctrl+O and Ctrl+U and Ctrl+I all do something
      // else. Those fire at a level a page's preventDefault() cannot reach, so
      // honouring Ctrl here would not win the keystroke — it would merely start
      // a navigation on the way out the door. Alt+letter is free in
      // Chrome/Edge on Windows and reaches us; Meta covers Cmd on macOS.
      if (e.ctrlKey || e.shiftKey) return;
      if (!e.altKey && !e.metaKey) return;

      // The "don't steal typing" guard that used to sit here is GONE, and its
      // removal is the point: Ctrl+1 inside the global search box or a due-date
      // field is not someone typing a 1, so the shortcut should still fire.
      // Requiring a modifier is what makes that safe — it is the same guarantee
      // the guard was standing in for, enforced at the top instead.

      // Never navigate out from under an open modal. A dialog whose focus sits
      // on a button would otherwise let one keystroke throw away half-finished
      // work without so much as a confirm.
      if (document.querySelector('[role="dialog"][data-state="open"],[role="alertdialog"][data-state="open"],[aria-modal="true"]')) {
        return;
      }

      // `e.code` ("KeyQ") ahead of `e.key`, because Alt+letter on macOS emits a
      // symbol ("œ" for Alt+Q) rather than the letter, and a non-Latin layout
      // can do the same to `e.key`. The physical key is what the footer labels.
      const letter = /^Key[A-Z]$/.test(e.code) ? e.code.slice(3) : e.key;
      const id = moduleForShortcut(letter);
      if (!id || !allow.has(id)) return;
      e.preventDefault();
      router.push(MODULE_THEME[id].href as Route);
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, allowed]);

  return null;
}
