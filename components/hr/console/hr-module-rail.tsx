"use client";

import type { CSSProperties } from "react";
import Image from "next/image";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import {
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  PanelLeft,
  PanelLeftOpen,
  Plus,
} from "lucide-react";

import { HrMark } from "./hr-mark";
import { HR_CONSOLE_MODULES } from "@/lib/hr/console-nav";
import { cn } from "@/lib/utils";

/**
 * Column 1 of the HR console — the module rail. Mirrors the three-box design:
 * navigation controls + brand up top, the scrolling module list in the middle,
 * the signed-in employee at the bottom.
 *
 * Modules WITH steps only select (column 2 then lists their steps); modules
 * without steps ARE the destination, so those rows navigate straight there.
 *
 * COLLAPSED (`collapsed` true) → a 64px icon-only strip, same pattern as the
 * app's global left sidebar: labels hide, icons centre, and — critically —
 * the collapse/expand toggle stays visible so collapsing is never a trap.
 */
export function HrModuleRail({
  collapsed,
  selectedModuleId,
  activeModuleId,
  onSelect,
  onToggleRail,
  user,
}: {
  /** Icon-strip mode — see the block comment above. */
  collapsed: boolean;
  /** The module whose steps column 2 is showing. */
  selectedModuleId: string | null;
  /** The module the CURRENT ROUTE lives in — drives the red active row. */
  activeModuleId: string | null;
  onSelect: (id: string) => void;
  /** Collapses THIS column only (the module rail) — column 2 is untouched. */
  onToggleRail: () => void;
  user: { name: string; role: string };
}) {
  const router = useRouter();

  const initials =
    user.name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?";

  return (
    <aside
      // `w-full`, NOT a width of its own: HrConsoleShell's wrapper already
      // sizes this column (and animates it between the collapsed icon strip
      // and the full rail). This used to repeat those same two widths, so the
      // two could disagree — widening only the wrapper left the rail at its
      // old width, truncating labels while an empty gap opened beside it.
      // One source of truth avoids that entirely.
      className="flex h-full w-full shrink-0 flex-col border-r border-hairline bg-surface-card"
    >
      {/* Box 1 — navigation controls + brand */}
      <div className="border-b border-hairline px-3 pb-4 pt-3">
        <div className={cn("flex items-center gap-1.5", collapsed && "justify-center")}>
          {/* Back/Forward hide when collapsed — only the toggle (the one
              control that must always be reachable) stays. */}
          {!collapsed && (
            <>
              <RailControl label="Back" onClick={() => router.back()}>
                <ChevronLeft className="h-3.5 w-3.5" />
              </RailControl>
              <RailControl label="Forward" onClick={() => router.forward()}>
                <ChevronRight className="h-3.5 w-3.5" />
              </RailControl>
            </>
          )}
          <RailControl
            label={collapsed ? "Expand module list" : "Collapse module list"}
            onClick={onToggleRail}
          >
            {collapsed ? <PanelLeftOpen className="h-3.5 w-3.5" /> : <PanelLeft className="h-3.5 w-3.5" />}
          </RailControl>
        </div>

        <Link
          href={"/hub" as Route}
          className="mt-4 flex flex-col items-center gap-2 rounded-xl py-1 transition-colors hover:bg-surface-soft"
          title="Back to Hub"
        >
          <Image
            src="/altus-corp-logo.png"
            alt="Altus Corp"
            width={56}
            height={56}
            className={cn("object-contain", collapsed ? "h-9 w-9" : "h-14 w-14")}
          />
          {/* Hidden when collapsed: the 64px strip has room for the Altus mark
              alone, and this lockup would wrap to nothing legible there. */}
          {!collapsed && (
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
            <span className="module-wordmark inline-flex items-center gap-2.5 px-1">
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
              <span
                className="module-wordmark-text whitespace-nowrap leading-none"
                style={
                  {
                    "--mw-a": "var(--color-altus-red, #E10600)",
                    "--mw-b": "var(--color-altus-red-deep, #A80400)",
                    fontSize: "clamp(14px, 1.15vw, 17px)",
                  } as CSSProperties
                }
              >
                Human Resources
              </span>
            </span>
          )}
        </Link>
      </div>

      {/* Box 2 — the module list */}
      <nav aria-label="HR modules" className={cn("min-h-0 flex-1 overflow-y-auto py-3", collapsed ? "px-2" : "px-2")}>
        {!collapsed && (
          <p className="px-2 pb-2 text-[10px] font-bold uppercase tracking-[0.18em] text-ink-muted">
            Modules
          </p>
        )}
        <ul className="space-y-0.5">
          {HR_CONSOLE_MODULES.map((mod) => {
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

            const inner = (
              <>
                <mod.Icon
                  className={cn("h-4 w-4 shrink-0", selected ? "text-altus-red" : "text-ink-muted")}
                />
                {/* min-w-0 so `truncate` can still shrink it: a flex item's
                    default min-width:auto would otherwise refuse to go below
                    its text width and overflow the rail instead of ellipsing. */}
                {!collapsed && <span className="min-w-0 truncate">{mod.title}</span>}
                {/* ml-auto parks it against the row's right edge, absorbing
                    whatever space the label doesn't use. */}
                {!collapsed && mod.external && (
                  <ArrowUpRight className="ml-auto h-3 w-3 shrink-0 text-ink-subtle" aria-hidden />
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
              "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[13px] font-semibold transition-colors",
              collapsed && "justify-center",
              selected
                ? "bg-[color-mix(in_srgb,var(--color-altus-red-soft)_35%,var(--color-altus-red-wash))] text-altus-red"
                : "text-ink-soft hover:bg-surface-soft",
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
                  <button
                    type="button"
                    onClick={() => onSelect(mod.id)}
                    aria-expanded={selected}
                    title={mod.title}
                    className={className}
                  >
                    {inner}
                  </button>
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

      {/* Box 3 — the signed-in employee */}
      <div className="border-t border-hairline p-3">
        <Link
          href={"/profile" as Route}
          title={user.name}
          className={cn(
            "grid w-full items-center gap-2.5 rounded-xl px-2 py-2 text-left transition-colors hover:bg-surface-soft",
            collapsed ? "grid-cols-[auto] justify-center" : "grid-cols-[auto_minmax(0,1fr)_auto]",
          )}
        >
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-altus-red text-xs font-bold text-white">
            {initials}
          </span>
          {!collapsed && (
            <>
              <span className="min-w-0">
                <span className="block truncate text-[13px] font-bold text-ink">{user.name}</span>
                <span className="block truncate text-[11px] text-ink-muted">{user.role}</span>
              </span>
              <ChevronUp className="h-4 w-4 shrink-0 text-ink-muted" />
            </>
          )}
        </Link>
      </div>
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
      className="grid h-8 w-8 place-items-center rounded-full border border-hairline text-ink-muted transition-colors hover:bg-surface-soft hover:text-ink"
    >
      {children}
    </button>
  );
}
