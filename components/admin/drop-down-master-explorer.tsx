"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRight, Folder, FolderOpen } from "lucide-react";
import { DROP_DOWN_MASTER_MODULES } from "@/lib/admin/drop-down-master";

/** Existing Admin configuration routes, presented as a compact explorer. */
export function DropDownMasterExplorer() {
  const [focusedId, setFocusedId] = useState<string | null>(null);

  function focusCategory(id: string) {
    setFocusedId(id);
    document.getElementById(`dropdown-category-${id}`)?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }

  return (
    <section className="grid gap-4 lg:grid-cols-[176px_minmax(0,1fr)]" aria-label="Dropdown configuration">
      <aside className="h-fit rounded-xl border border-hairline bg-surface-card p-2.5 lg:sticky lg:top-6" aria-label="Dropdown categories">
        <div className="mb-1.5 flex items-center gap-1.5 px-2 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-ink-subtle">
          <FolderOpen size={13} strokeWidth={2.4} /> Dropdown
        </div>
        <div className="flex flex-col gap-0.5 border-l border-hairline pl-1.5">
          {DROP_DOWN_MASTER_MODULES.map((category) => {
            const active = focusedId === category.id;
            return (
              <button
                key={category.id}
                type="button"
                onClick={() => focusCategory(category.id)}
                className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left text-[12.5px] font-semibold transition-colors ${
                  active ? "bg-surface-soft text-ink-strong" : "text-ink-muted hover:bg-surface-soft hover:text-ink-strong"
                }`}
                aria-controls={`dropdown-category-${category.id}`}
              >
                <Folder size={14} strokeWidth={2.15} className="shrink-0 text-ink-subtle" />
                {category.label}
              </button>
            );
          })}
        </div>
      </aside>

      <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
        {DROP_DOWN_MASTER_MODULES.map((category) => {
          const focused = focusedId === category.id;
          return (
            <section
              key={category.id}
              id={`dropdown-category-${category.id}`}
              onMouseEnter={() => setFocusedId(category.id)}
              onFocus={() => setFocusedId(category.id)}
              className={`group relative min-h-[152px] overflow-hidden rounded-xl border bg-surface-card transition-colors ${
                focused ? "border-altus-red/45" : "border-hairline hover:border-altus-red/35"
              }`}
              aria-label={`${category.label} configuration`}
            >
              <h2 className="flex h-full items-center justify-center px-4 text-center text-[14px] font-black uppercase tracking-[0.1em] text-ink-strong group-hover:hidden group-focus-within:hidden">
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
                    className="flex min-h-0 items-center justify-between gap-3 border-b border-hairline px-4 text-[13px] font-semibold text-ink-strong transition-colors last:border-b-0 hover:bg-surface-soft focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-altus-red"
                  >
                    <span>{entry.label}</span>
                    <ChevronRight size={15} strokeWidth={2.3} className="shrink-0 text-ink-subtle" />
                  </Link>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}
