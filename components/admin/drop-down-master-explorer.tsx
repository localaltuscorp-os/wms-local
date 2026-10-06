"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronRight, FileText, Folder, FolderOpen } from "lucide-react";
import { DROP_DOWN_MASTER_MODULES } from "@/lib/admin/drop-down-master";

const WINDOW_TINTS = {
  people: "rgba(153, 27, 27, 0.20)",
  attendance: "rgba(30, 64, 175, 0.18)",
  masters: "rgba(146, 64, 14, 0.18)",
  billing: "rgba(91, 33, 182, 0.18)",
  hr: "rgba(21, 128, 61, 0.18)",
} as const;

/** The Dropdown tree belongs in the Admin Panel's primary navigation, not in the page body. */
export function DropDownMasterNavIndex() {
  const [expandedModules, setExpandedModules] = useState<ReadonlySet<string>>(() => new Set());
  const [collapsedActiveModules, setCollapsedActiveModules] = useState<ReadonlySet<string>>(() => new Set());
  const pathname = usePathname() ?? "";

  function toggleModule(id: string, containsActivePage: boolean) {
    if (containsActivePage) {
      setCollapsedActiveModules((current) => {
        const next = new Set(current);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return next;
      });
      return;
    }
    setExpandedModules((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function isActiveRoute(href: string) {
    return pathname === href || pathname.startsWith(`${href}/`);
  }

  return (
    <nav aria-label="Dropdown configuration" className="relative ml-5 mt-1 border-l border-hairline pl-2">
      {DROP_DOWN_MASTER_MODULES.map((category) => {
        const containsActivePage = category.entries.some((entry) => isActiveRoute(entry.href));
        const expanded = containsActivePage ? !collapsedActiveModules.has(category.id) : expandedModules.has(category.id);
        const FolderIcon = expanded ? FolderOpen : Folder;
        return (
          <div key={category.id} className="relative">
            <span aria-hidden="true" className="absolute -left-2 top-4 h-px w-2 bg-hairline" />
            <button
              type="button"
              onClick={() => toggleModule(category.id, containsActivePage)}
              aria-expanded={expanded}
              aria-controls={`admin-dropdown-module-${category.id}`}
              className="flex w-full items-center gap-1.5 rounded-lg px-1.5 py-1.5 text-left text-[12.5px] font-semibold text-ink-muted transition-colors hover:bg-surface-soft hover:text-ink-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-altus-red"
            >
              {expanded ? <ChevronDown size={13} strokeWidth={2.5} /> : <ChevronRight size={13} strokeWidth={2.5} />}
              <FolderIcon size={14} strokeWidth={2.1} className="shrink-0 text-ink-subtle" />
              <span className="min-w-0 truncate">{category.label}</span>
            </button>
            {expanded ? (
              <div id={`admin-dropdown-module-${category.id}`} className="relative ml-[11px] border-l border-hairline pl-2 pb-1">
                {category.entries.map((entry) => {
                  const active = isActiveRoute(entry.href);
                  return (
                    <Link
                      key={entry.href}
                      href={entry.href}
                      aria-current={active ? "page" : undefined}
                      className={`relative flex items-center gap-1.5 rounded-lg px-1.5 py-1.5 text-[12px] font-medium transition-colors before:absolute before:-left-2 before:top-1/2 before:h-px before:w-2 before:bg-hairline ${active ? "bg-altus-red text-white shadow-sm" : "text-ink-muted hover:bg-surface-soft hover:text-ink-strong"}`}
                    >
                      <FileText size={13} strokeWidth={2} className="shrink-0" />
                      <span className="min-w-0 truncate">{entry.label}</span>
                    </Link>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </nav>
  );
}

/** Existing Admin configuration routes, presented as a compact static launcher. */
export function DropDownMasterExplorer() {
  const [focusedId, setFocusedId] = useState<string | null>(null);

  return (
    <div className="grid grid-cols-3 gap-3 max-md:grid-cols-2 max-sm:grid-cols-1" aria-label="Dropdown configuration">
      {DROP_DOWN_MASTER_MODULES.map((category) => {
        const focused = focusedId === category.id;
        return (
          <section
            key={category.id}
            id={`dropdown-category-${category.id}`}
            onMouseEnter={() => setFocusedId(category.id)}
            onFocus={() => setFocusedId(category.id)}
            style={{ backgroundColor: WINDOW_TINTS[category.id] }}
            className={`group relative min-h-[132px] overflow-hidden rounded-[24px] border transition-colors ${focused ? "border-altus-red/45" : "border-hairline hover:border-altus-red/35"}`}
            aria-label={`${category.label} configuration`}
          >
            <h2 className="flex h-full items-center justify-center px-4 text-center text-[19px] font-black uppercase tracking-[0.1em] text-ink-strong group-hover:hidden group-focus-within:hidden">
              {category.label}
            </h2>
            <div
              className="pointer-events-none absolute inset-0 grid opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 group-focus-within:pointer-events-auto group-focus-within:opacity-100"
              style={{ gridTemplateRows: `repeat(${category.entries.length}, minmax(0, 1fr))` }}
            >
              {category.entries.map((entry) => (
                <Link
                  key={entry.href}
                  href={entry.href}
                  className="flex min-h-0 items-center justify-between gap-3 border-b border-hairline px-3 text-[12.5px] font-semibold text-ink-strong transition-colors last:border-b-0 hover:bg-surface-soft focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-altus-red"
                >
                  <span>{entry.label}</span>
                  <ChevronRight size={14} strokeWidth={2.3} className="shrink-0 text-ink-subtle" />
                </Link>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
