"use client";

import * as React from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import {
  ADMIN_PANEL_ENTRY,
  MODULE_ORDER,
  MODULE_THEME,
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
 * imports, but is rendered at the very top of ChromeShell as a compact handle.
 * Hovering or focusing the centre chevron opens the complete modules bar.
 */
export interface ModuleFooterProps {
  access: WorkspaceAccessInput;
  modules: readonly WorkspaceId[];
}

export function ModuleFooter({ access, modules }: ModuleFooterProps) {
  const pathname = usePathname();
  const activeWs = workspaceForPath(pathname ?? "/");
  const [expanded, setExpanded] = React.useState(false);
  const closeTimer = React.useRef<number | null>(null);

  const openNav = React.useCallback(() => {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    setExpanded(true);
  }, []);

  const closeNav = React.useCallback(() => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    // The short delay makes moving from the small centre handle into the row
    // feel reliable instead of closing the menu under the cursor.
    closeTimer.current = window.setTimeout(() => {
      setExpanded(false);
      closeTimer.current = null;
    }, 160);
  }, []);

  React.useEffect(() => () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
  }, []);

  return (
    <div
      className="module-footer module-top-nav print:hidden"
      data-expanded={expanded ? "true" : "false"}
      onMouseEnter={openNav}
      onMouseLeave={closeNav}
      onFocusCapture={openNav}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) closeNav();
      }}
    >
      <div className="module-top-nav-hover-zone" aria-hidden="true" />
      <button
        type="button"
        className="module-top-nav-handle"
        aria-label="Show all modules navigation"
        aria-expanded={expanded}
        aria-controls="module-top-nav-links"
        title="Show all modules"
        onMouseEnter={openNav}
        onClick={openNav}
      >
        <ChevronDown size={9} strokeWidth={2.5} />
      </button>
      <nav
        id="module-top-nav-links"
        aria-label="All modules"
        aria-hidden={!expanded}
        className="module-top-nav-links"
      >
        <Link href="/hub" aria-label="Altus Hub" className="module-top-nav-logo">
          <Image src="/logo.png" alt="" width={26} height={26} priority className="h-6 w-6 object-contain" />
        </Link>
        {modules.map((id) => {
          const moduleConfig = MODULE_THEME[id];
          const index = MODULE_ORDER.indexOf(id);
          const allowed = canAccessWorkspace(id, access);
          const Icon = moduleConfig.Icon;
          const shortcutLabel = moduleShortcutLabel(index);
          const active = activeWs === id;

          const inner = (
            <>
              <Icon size={14} strokeWidth={2.3} aria-hidden />
              <span className="whitespace-nowrap">{moduleConfig.label}</span>
            </>
          );

          if (!allowed) {
            return (
              <span
                key={id}
                title={`${moduleConfig.label} — you don't have access to this module`}
                className="inline-flex cursor-not-allowed items-center gap-1 whitespace-nowrap rounded-lg px-1.5 py-1.5 text-[13px] font-semibold"
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
              className="group inline-flex items-center gap-1 whitespace-nowrap rounded-lg px-1.5 py-1.5 text-[13px] font-semibold outline-none transition-colors hover:!bg-[color-mix(in_srgb,var(--mod-accent)_12%,transparent)] hover:!text-[var(--mod-accent)] focus-visible:ring-2 focus-visible:ring-[var(--mod-accent)]/45"
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
            className="group inline-flex items-center gap-1 whitespace-nowrap rounded-lg px-1.5 py-1.5 text-[13px] font-semibold outline-none transition-colors hover:!bg-[color-mix(in_srgb,var(--mod-accent)_12%,transparent)] hover:!text-[var(--mod-accent)] focus-visible:ring-2 focus-visible:ring-[var(--mod-accent)]/45"
            style={{
              ["--mod-accent" as string]: ADMIN_PANEL_ENTRY.accent,
              color: "rgba(15,23,42,0.62)",
            }}
          >
            <ADMIN_PANEL_ENTRY.Icon size={14} strokeWidth={2.3} aria-hidden />
            <span className="whitespace-nowrap">{ADMIN_PANEL_ENTRY.label}</span>
          </Link>
        )}
      </nav>
    </div>
  );
}
