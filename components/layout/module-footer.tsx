"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ADMIN_PANEL_ENTRY,
  MODULE_ORDER,
  MODULE_THEME,
  moduleShortcutHint,
  moduleShortcutLabel,
} from "@/lib/module-theme";
import {
  canAccessWorkspace,
  workspaceForPath,
  type WorkspaceId,
  type WorkspaceAccessInput,
} from "@/lib/workspaces";

/**
 * Site-wide module switcher. It is named ModuleFooter for backwards-compatible
 * imports, but is rendered at the very top of ChromeShell as a scroll-aware bar.
 *
 * It is visible when a page opens and while the user scrolls upward. Scrolling
 * down hides it and gives the page that space back, rather than covering content.
 */
export interface ModuleFooterProps {
  access: WorkspaceAccessInput;
  modules: readonly WorkspaceId[];
}

export function ModuleFooter({ access, modules }: ModuleFooterProps) {
  const pathname = usePathname();
  const activeWs = workspaceForPath(pathname ?? "/");
  const [hidden, setHidden] = React.useState(false);

  React.useEffect(() => {
    let lastY = window.scrollY;
    let frame: number | null = null;
    let settleTimer: number | null = null;
    let isSettling = false;
    let currentlyHidden = false;

    const setNavigationHidden = (nextHidden: boolean) => {
      if (currentlyHidden === nextHidden) return;

      currentlyHidden = nextHidden;
      isSettling = true;
      setHidden(nextHidden);

      if (settleTimer !== null) window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => {
        // Changing the bar's in-flow height can adjust scrollY. Treat that
        // adjustment as part of the transition, not as a new user gesture.
        lastY = window.scrollY;
        isSettling = false;
        settleTimer = null;
      }, 240);
    };

    const update = () => {
      frame = null;
      const nextY = window.scrollY;
      const movement = nextY - lastY;
      if (isSettling) {
        lastY = nextY;
        return;
      }

      if (nextY <= 8) setNavigationHidden(false);
      else if (movement > 6) setNavigationHidden(true);
      else if (movement < -6) setNavigationHidden(false);
      lastY = nextY;
    };

    const onScroll = () => {
      if (frame === null) frame = window.requestAnimationFrame(update);
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (frame !== null) window.cancelAnimationFrame(frame);
      if (settleTimer !== null) window.clearTimeout(settleTimer);
    };
  }, []);

  return (
    <div
      className="module-footer module-top-nav print:hidden"
      data-hidden={hidden ? "true" : "false"}
    >
      <nav
        id="module-top-nav-links"
        aria-label="All modules"
        aria-hidden={hidden}
        className="module-top-nav-links"
      >
        {modules.map((id) => {
          const moduleConfig = MODULE_THEME[id];
          const index = MODULE_ORDER.indexOf(id);
          const allowed = canAccessWorkspace(id, access);
          const Icon = moduleConfig.Icon;
          const shortcut = moduleShortcutHint(index);
          const shortcutLabel = moduleShortcutLabel(index);
          const active = activeWs === id;

          const inner = (
            <>
              {shortcut && <span aria-hidden className="opacity-55">{shortcut}</span>}
              <Icon size={15} strokeWidth={2.3} aria-hidden />
              <span className="whitespace-nowrap">{moduleConfig.label}</span>
            </>
          );

          if (!allowed) {
            return (
              <span
                key={id}
                title={`${moduleConfig.label} — you don't have access to this module`}
                className="inline-flex cursor-not-allowed items-center gap-1.5 whitespace-nowrap rounded-xl px-2.5 py-1.5 text-[12.5px] font-semibold"
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
              href={moduleConfig.href}
              title={shortcutLabel ? `${moduleConfig.label} — ${shortcutLabel}` : moduleConfig.label}
              aria-current={active ? "page" : undefined}
              className="group inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl px-2.5 py-1.5 text-[12.5px] font-semibold outline-none transition-colors hover:!bg-[color-mix(in_srgb,var(--mod-accent)_12%,transparent)] hover:!text-[var(--mod-accent)] focus-visible:ring-2 focus-visible:ring-[var(--mod-accent)]/45"
              style={{
                ["--mod-accent" as string]: moduleConfig.accent,
                color: active ? moduleConfig.accent : "rgba(15,23,42,0.62)",
                ...(active
                  ? { background: `color-mix(in srgb, ${moduleConfig.accent} 10%, transparent)` }
                  : null),
              }}
            >
              {inner}
            </Link>
          );
        })}

        {access.isAdmin && (
          <Link
            href={ADMIN_PANEL_ENTRY.href}
            title={`${ADMIN_PANEL_ENTRY.label} — Alt+${ADMIN_PANEL_ENTRY.shortcut}`}
            className="group inline-flex items-center gap-1.5 whitespace-nowrap rounded-xl px-2.5 py-1.5 text-[12.5px] font-semibold outline-none transition-colors hover:!bg-[color-mix(in_srgb,var(--mod-accent)_12%,transparent)] hover:!text-[var(--mod-accent)] focus-visible:ring-2 focus-visible:ring-[var(--mod-accent)]/45"
            style={{
              ["--mod-accent" as string]: ADMIN_PANEL_ENTRY.accent,
              color: "rgba(15,23,42,0.62)",
            }}
          >
            <span aria-hidden className="opacity-55">{`Alt+${ADMIN_PANEL_ENTRY.shortcut}`}</span>
            <ADMIN_PANEL_ENTRY.Icon size={15} strokeWidth={2.3} aria-hidden />
            <span className="whitespace-nowrap">{ADMIN_PANEL_ENTRY.label}</span>
          </Link>
        )}
      </nav>
    </div>
  );
}
