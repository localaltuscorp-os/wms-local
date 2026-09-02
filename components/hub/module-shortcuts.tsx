"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { MODULE_THEME, moduleForShortcut } from "@/lib/module-theme";
import type { WorkspaceId } from "@/lib/workspaces";

/**
 * Number-row shortcuts for the hub: 1–9 and 0 open the modules in MODULE_ORDER.
 *
 * Renders nothing — it exists only to own the key listener, so the hub page can
 * stay a server component. The destination is `MODULE_THEME[id].href`, the same
 * value the card and the footer link to, so a room whose entry route changes
 * (Billing goes straight to /billing; everything else via /ws/<id>) keeps
 * working here without a second mapping to maintain.
 *
 * `allowed` is resolved on the server and passed in, so a digit for a room you
 * cannot enter does nothing instead of bouncing you off the layout gate. That is
 * presentation parity with the locked cards, not the security boundary.
 */
export function ModuleShortcuts({ allowed }: { allowed: WorkspaceId[] }) {
  const router = useRouter();

  React.useEffect(() => {
    const allow = new Set(allowed);

    function onKey(e: KeyboardEvent) {
      // Never steal a keystroke that is part of typing. `isContentEditable`
      // covers rich-text surfaces; the role check covers custom comboboxes that
      // are divs rather than <input>.
      if (e.metaKey || e.ctrlKey || e.altKey) return;
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

      const id = moduleForShortcut(e.key);
      if (!id || !allow.has(id)) return;
      e.preventDefault();
      router.push(MODULE_THEME[id].href as Route);
    }

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router, allowed]);

  return null;
}
