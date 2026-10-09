"use client";

import { useState, type CSSProperties } from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  PanelLeft,
  PanelLeftOpen,
  Plus,
} from "lucide-react";

import { HrMark } from "./hr-mark";
import type { HrConsoleModule } from "@/lib/hr/console-nav";
import { AuraRailLens } from "@/components/layout/aura-rail-lens";
import { cn } from "@/lib/utils";

/**
 * Column 1 of the HR console — the module rail. Mirrors the three-box design:
 * navigation controls + brand up top and the scrolling module list below.
 *
 * Modules WITH steps only select (column 2 then lists their steps); modules
 * without steps ARE the destination, so those rows navigate straight there.
 *
 * COLLAPSED (`collapsed` true) → a 64px icon-only strip, same pattern as the
 * app's global left sidebar: labels hide, icons centre, and — critically —
 * the collapse/expand toggle stays visible so collapsing is never a trap.
 */
export function HrModuleRail({
  modules,
  collapsed,
  selectedModuleId,
  activeModuleId,
  activeHref,
  onSelect,
  onToggleRail,
}: {
  /** The modules to draw — ALREADY FILTERED by the permission matrix.
   *  Passed in rather than read from `HR_CONSOLE_MODULES` so this component
   *  cannot accidentally draw something the current person has been denied;
   *  see lib/hr/console-visibility.ts. */
  modules: readonly HrConsoleModule[];
  /** Icon-strip mode — see the block comment above. */
  collapsed: boolean;
  /** The module whose steps column 2 is showing. */
  selectedModuleId: string | null;
  /** The module the CURRENT ROUTE lives in — drives the red active row. */
  activeModuleId: string | null;
  /** The nested item on the current route, if there is one. */
  activeHref: string | null;
  onSelect: (id: string) => void;
  /** Collapses THIS column only (the module rail) — column 2 is untouched. */
  onToggleRail: () => void;
}) {
  const router = useRouter();
  const [expandedModuleIds, setExpandedModuleIds] = useState<Set<string>>(
    () => new Set(activeModuleId ? [activeModuleId] : []),
  );

  return (
    <aside
      // `w-full`, NOT a width of its own: HrConsoleShell's wrapper already
      // sizes this column (and animates it between the collapsed icon strip
      // and the full rail). This used to repeat those same two widths, so the
      // two could disagree — widening only the wrapper left the rail at its
      // old width, truncating labels while an empty gap opened beside it.
      // One source of truth avoids that entirely.
      data-collapsed={collapsed ? "true" : "false"}
      className="sidebar-rail aura-rail-skin header-light flex h-full min-h-full w-full shrink-0 flex-col"
    >
      {/* Box 1 — navigation controls + brand */}
      {/* Matches components/layout/dashboard-sidebar.tsx box for box: the same
          padding, the same control row, the same brand block. HR draws its own
          rail (it has three columns) and had drifted into a look of its own -
          round buttons, a smaller logo, a "MODULES" caption and denser rows -
          so moving between HR and any other module read as two applications. */}
      {/* px-2 when collapsed, the way the nav below already does it: at 74px the
          brand block's px-4 left only 42px of content width, and /logo.png is a
          wide wordmark. The nav had this right; the brand block did not. */}
      <div className={cn("flex flex-col gap-3 pb-3 pt-4", collapsed ? "px-2" : "px-4")}>
        {/* History on the left, divider, collapse toggle pinned right - the
            WMS / Operations row. Collapsed, only the toggle remains, because it
            is the one control that must always be reachable. */}
        <div className={cn("flex items-center gap-2", collapsed && "justify-center")}>
          {!collapsed && (
            <div className="flex min-w-0 flex-1 items-center gap-1">
              <RailControl label="Back" onClick={() => router.back()}>
                <ChevronLeft size={18} strokeWidth={2.3} />
              </RailControl>
              <RailControl label="Forward" onClick={() => router.forward()}>
                <ChevronRight size={18} strokeWidth={2.3} />
              </RailControl>
              <span aria-hidden className="ml-2 mr-1 inline-block h-6 w-px bg-hairline" />
            </div>
          )}
          <button
            type="button"
            onClick={onToggleRail}
            aria-label={collapsed ? "Expand module list" : "Collapse module list"}
            title={collapsed ? "Expand module list" : "Collapse module list"}
            aria-pressed={collapsed}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-hairline bg-surface-card text-ink-soft transition-colors hover:border-hairline-strong hover:text-ink-strong"
          >
            {collapsed ? <PanelLeftOpen size={15} strokeWidth={2.3} /> : <PanelLeft size={15} strokeWidth={2.3} />}
          </button>
        </div>

        <Link
          href={"/hub" as Route}
          className="flex flex-col items-center gap-3 rounded-xl py-1 text-center transition-opacity hover:opacity-80"
          title="Back to Hub"
        >
          {/* Collapsed, the gradient TILE stays and only the WORDMARK TEXT goes —
              exactly what the global rail does, where the hiding is done in CSS
              (`.sidebar-rail[data-collapsed="true"] .module-wordmark-text`).
              Until 2026-09-21 this hid the whole lockup, tile included, which is
              why a collapsed /hr/* rail showed no module badge while every other
              collapsed rail did. The text is dropped here rather than by that
              CSS rule because this rail is not `.sidebar-rail` and never picks
              the rule up. */}
          {(
            /* The SAME lockup every other workspace rail renders, class for
               class, rather than a hand-rolled lookalike: `.module-wordmark`
               and friends come from components/layout/sidebar-brand.tsx, which
               is what draws the Goals / Tasks / Accounts wordmarks. Reusing the
               classes means HR picks up the gradient tile, its pop-in, and the
               wordmark's sheen automatically, and cannot drift from the others
               again the way a copy would.

               The one deliberate difference is font-size. The shared brand runs
               clamp(18px, 1.5vw, 22px), which suits a short label like "GOALS";
               "HUMAN RESOURCES" is nearly three times the characters and
               overflows this rail at that size, so it is stepped down a notch.
               Everything that carries the brand - face, weight, tracking,
               gradient, animation - is identical. */
            <span className={cn("module-wordmark inline-flex items-center px-1", collapsed ? "gap-0" : "gap-2")}>
              <span
                className="module-wordmark-icon inline-grid shrink-0 place-items-center rounded-2xl text-white"
                style={{
                  background:
                    "linear-gradient(135deg, var(--color-altus-red, #E10600), var(--color-altus-red-deep, #A80400))",
                  boxShadow: "0 8px 20px -8px var(--color-altus-red-deep, #A80400)",
                  width: 40,
                  height: 40,
                }}
              >
                <HrMark size={22} strokeWidth={2.1} />
              </span>
              {!collapsed && (
              <span
                className="module-wordmark-text whitespace-nowrap leading-none"
                style={
                  {
                    "--mw-a": "var(--color-altus-red, #E10600)",
                    "--mw-b": "var(--color-altus-red-deep, #A80400)",
                    fontSize: "14px",
                  } as CSSProperties
                }
              >
                Human Resources
              </span>
              )}
            </span>
          )}
        </Link>
      </div>

      {/* Box 2 — the module list */}
      <div aria-hidden className="mx-4 border-t border-hairline" />
      <nav
        aria-label="HR modules"
        className={cn(
          "sidebar-nav nav-scroll min-h-0 flex-1 overflow-y-auto py-2",
          collapsed ? "px-2" : "px-3",
        )}
      >
        <AuraRailLens itemSelector=".nav-pill" activeSelector=".nav-pill-active" />
        <ul className="space-y-1">
          {modules.map((mod) => {
            // `onRoute` is real navigation (drives aria-current, for a11y —
            // not paint). `selected` is what's actually highlighted: the
            // module previewed in column 2, which is `activeModuleId` at
            // rest (synced on every real navigation) and swaps the instant
            // you click a different module in the rail — so the highlight
            // always matches whatever column 2 is showing, never the stale
            // routed page once you've clicked elsewhere to look around.
            const onRoute = mod.id === activeModuleId;
            const selected = mod.id === selectedModuleId;
            const leaf = mod.subModules.length === 0 && mod.href;
            const hasActiveChild = onRoute && activeHref !== null;
            const expanded = expandedModuleIds.has(mod.id);

            const inner = (
              <>
                <mod.Icon
                  className="h-[18px] w-[18px] shrink-0 text-current"
                />
                {/* min-w-0 so `truncate` can still shrink it: a flex item's
                    default min-width:auto would otherwise refuse to go below
                    its text width and overflow the rail instead of ellipsing. */}
                {!collapsed && <span className="min-w-0 truncate">{mod.title}</span>}
                {/* ml-auto parks it against the row's right edge, absorbing
                    whatever space the label doesn't use. */}
                {!collapsed && mod.external && (
                  <ArrowUpRight className="ml-auto h-3 w-3 shrink-0 text-current opacity-70" aria-hidden />
                )}
              </>
            );

            // Selected row keeps its original rounded-rectangle shape (never a
            // pill). The only change from the old look is the fill: a shade
            // deeper than the near-white --color-altus-red-wash so the row
            // actually reads as selected — nudged just 35% toward
            // --color-altus-red-soft, not all the way to it — plus red ink and
            // no outline, matching the app's chip treatment.
            // Flex, not grid: the old `grid-cols-[auto_minmax(0,1fr)_auto]`
            // gave the label a stretched 1fr column, which fought with sizing
            // the rail to its content. Flex lets the label size to its own
            // text; the external-link arrow right-aligns itself via ml-auto.
            const className = cn(
              "nav-pill flex w-full items-center gap-2.5 text-left text-[14px] font-semibold transition-colors",
              collapsed && "justify-center",
              selected && !hasActiveChild && "nav-pill-active",
            );

            return (
              <li key={mod.id}>
                {leaf ? (
                  <Link
                    href={mod.href as Route}
                    aria-current={onRoute ? "page" : undefined}
                    className={className}
                    title={mod.external ? `${mod.title} - opens outside HR` : mod.title}
                  >
                    {inner}
                  </Link>
                ) : (
                  /* A LIFECYCLE MODULE NAVIGATES TO ITS STAGE HUB.
                     This was a <button> that only "previewed": it swapped
                     column 2 and replaced the page with the ghost pane while
                     leaving the URL on the page you came from. The result was a
                     screen and an address bar that disagreed - standing on
                     /hr/holidays and clicking Post-Interview showed the whole
                     Post-Interview console under the holidays URL, and a
                     refresh or a shared link then went somewhere else entirely.

                     `/hr/<module.id>` IS the stage hub (module.id is the stage
                     slug) and it renders exactly what the preview rendered - the
                     step list plus the "choose a step" pane - so nothing about
                     the view changes. Only the URL now tells the truth.

                     onSelect still runs, so column 2 expands on click as before
                     rather than waiting for the navigation to land. */
                  <div>
                    <div className="flex items-center gap-1">
                      <Link
                        href={`/hr/${mod.id}` as Route}
                        onClick={() => {
                          onSelect(mod.id);
                          setExpandedModuleIds((current) => new Set(current).add(mod.id));
                        }}
                        aria-current={onRoute ? "page" : undefined}
                        aria-expanded={expanded}
                        title={mod.title}
                        className={className}
                      >
                        {inner}
                      </Link>
                      {!collapsed && (
                        <button
                          type="button"
                          aria-label={`${expanded ? "Collapse" : "Expand"} ${mod.title}`}
                          aria-expanded={expanded}
                          onClick={() => setExpandedModuleIds((current) => {
                            const next = new Set(current);
                            if (next.has(mod.id)) next.delete(mod.id);
                            else next.add(mod.id);
                            return next;
                          })}
                          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface-soft hover:text-ink"
                        >
                          <ChevronDown className={cn("h-4 w-4 transition-transform", expanded && "rotate-180")} />
                        </button>
                      )}
                    </div>
                    {!collapsed && expanded && (
                      <ul className="ml-3 mt-1 space-y-0.5 border-l border-hairline pl-2">
                        {mod.subModules.map((sub) => {
                          const subActive = sub.href === activeHref;
                          return (
                            <li key={sub.id}>
                              <Link
                                href={sub.href as Route}
                                aria-current={subActive ? "page" : undefined}
                                title={sub.external ? `${sub.title} - opens outside HR` : sub.title}
                                className={cn(
                                  "nav-pill flex min-h-8 w-full items-center gap-2 px-2 text-[12px] font-semibold text-ink-subtle transition-colors hover:text-ink",
                                  subActive && "nav-pill-active",
                                )}
                              >
                                {sub.code && <span className="shrink-0 text-[10px] font-bold text-altus-red">{sub.code}</span>}
                                <span className="min-w-0 truncate">{sub.title}</span>
                                {sub.external && <ArrowUpRight className="ml-auto h-3 w-3 shrink-0 opacity-70" aria-hidden />}
                              </Link>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>

        <Link
          href={"/support/new" as Route}
          title="New Request"
          className={cn(
            "mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-altus-red text-[13px] font-bold text-white shadow-sm transition-opacity hover:opacity-90",
            collapsed ? "px-0 py-2.5" : "px-3 py-2.5",
          )}
        >
          <Plus className="h-4 w-4" />
          {!collapsed && "New Request"}
        </Link>
      </nav>

    </aside>
  );
}

function RailControl({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className="inline-grid h-9 w-9 shrink-0 place-items-center rounded-xl border border-hairline bg-surface-soft text-ink-subtle transition-colors hover:border-hairline-strong hover:bg-surface-card hover:text-ink-strong"
    >
      {children}
    </button>
  );
}
