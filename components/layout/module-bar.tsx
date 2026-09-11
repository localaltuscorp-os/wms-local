"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { WorkspaceId } from "@/lib/workspaces";
import { canAccessWorkspace, workspaceForPath } from "@/lib/workspaces";
import {
  ADMIN_PANEL_ENTRY,
  MODULE_ORDER,
  MODULE_THEME,
  moduleShortcutHint,
  moduleShortcutLabel,
} from "@/lib/module-theme";

/**
 * The 10 modules as a horizontal shortcut row — the module FOOTER's logic and
 * link treatment, lifted into a top bar.
 *
 * Built for the shared surfaces (`/inbox` today) where `workspaceForPath`
 * returns null. Those routes fell back to whichever room's nav you last
 * visited, read from the `aw` cookie — so the Inbox showed, say, "Yearly
 * Goals / Quarterly Goals / Approve", none of which have anything to do with
 * the page you are on. Every module is the honest answer for a surface that
 * belongs to no single room.
 *
 * Identical rules to `module-footer.tsx`: the same `MODULE_ORDER`, the same
 * `canAccessWorkspace` gate (locked modules render greyed and unclickable
 * rather than vanishing, so the set is always the same ten), the same
 * accent-tinted hover/active treatment, and the same 1-9/0 shortcut digits that
 * `ModuleShortcuts` binds globally.
 *
 * SHORT labels: "Monthly Events Master" and "Team Productivity" are fine
 * stacked in a footer dock but blow out a single row at ten across. The full
 * label stays in `title`, so nothing is lost.
 */
const SHORT_LABEL: Partial<Record<WorkspaceId, string>> = {
  productivity: "Productivity",
  events: "Events",
  admin: "Accounts",
};

export function ModuleBar({
  access,
}: {
  access: { departments: string[]; isAdmin: boolean; isSuperAdmin: boolean };
}) {
  const pathname = usePathname();
  const activeWs = workspaceForPath(pathname ?? "/");

  return (
    <nav
      aria-label="All modules"
      className="flex min-w-0 flex-1 items-center gap-0.5 overflow-x-auto no-scrollbar"
    >
      {MODULE_ORDER.map((id, i) => {
        const m = MODULE_THEME[id];
        const allowed = canAccessWorkspace(id, access);
        const Icon = m.Icon;
        const shortcut = moduleShortcutHint(i);
        const shortcutLabel = moduleShortcutLabel(i);
        const active = activeWs === id;
        const label = SHORT_LABEL[id] ?? m.label;

        const inner = (
          <>
            <Icon size={14} strokeWidth={2.3} aria-hidden />
            {shortcut && (
              <span aria-hidden className="opacity-55 max-xl:hidden">
                {shortcut}
              </span>
            )}
            <span className="whitespace-nowrap">{label}</span>
          </>
        );

        if (!allowed) {
          return (
            <span
              key={id}
              title={`${m.label} — you don't have access to this module`}
              className="inline-flex cursor-not-allowed items-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1.5 text-[12.5px] font-semibold"
              style={{ color: "rgba(15,23,42,0.30)" }}
            >
              {inner}
              <span className="sr-only"> (no access)</span>
            </span>
          );
        }

        return (
          <Link
            key={id}
            href={m.href}
            title={shortcutLabel ? `${m.label} — ${shortcutLabel}` : m.label}
            aria-current={active ? "page" : undefined}
            className="group inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1.5 text-[12.5px] font-semibold outline-none transition-colors hover:!bg-[color-mix(in_srgb,var(--mod-accent)_12%,transparent)] hover:!text-[var(--mod-accent)] focus-visible:ring-2 focus-visible:ring-[var(--mod-accent)]/45"
            style={{
              ["--mod-accent" as string]: m.accent,
              color: active ? m.accent : "rgba(15,23,42,0.62)",
              ...(active
                ? { background: `color-mix(in srgb, ${m.accent} 10%, transparent)` }
                : null),
            }}
          >
            {inner}
          </Link>
        );
      })}

      {/* THE ADMIN PANEL — the standalone entry, admins only. After the modules
          and never `active`, because `/admin` belongs to no workspace by design
          (`workspaceForPath` returns null for it). One href, one guard, one
          panel — the user-menu link, the hub card and Alt+A all land here. */}
      {access.isAdmin && (
        <Link
          href={ADMIN_PANEL_ENTRY.href}
          title={`${ADMIN_PANEL_ENTRY.label} — Alt+${ADMIN_PANEL_ENTRY.shortcut}`}
          className="group inline-flex items-center gap-1.5 whitespace-nowrap rounded-lg px-2 py-1.5 text-[12.5px] font-semibold outline-none transition-colors hover:!bg-[color-mix(in_srgb,var(--mod-accent)_12%,transparent)] hover:!text-[var(--mod-accent)] focus-visible:ring-2 focus-visible:ring-[var(--mod-accent)]/45"
          style={{
            ["--mod-accent" as string]: ADMIN_PANEL_ENTRY.accent,
            color: "rgba(15,23,42,0.62)",
          }}
        >
          <ADMIN_PANEL_ENTRY.Icon size={14} strokeWidth={2.3} aria-hidden />
          <span aria-hidden className="opacity-55 max-xl:hidden">
            {`⌥${ADMIN_PANEL_ENTRY.shortcut}`}
          </span>
          <span className="whitespace-nowrap">{ADMIN_PANEL_ENTRY.label}</span>
        </Link>
      )}
    </nav>
  );
}
