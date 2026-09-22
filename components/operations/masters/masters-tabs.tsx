"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import { OPERATIONS_MASTERS, isOperationsItemActive } from "@/lib/operations/nav";

/**
 * The strip across the top of every Masters page — the same list as the rail's
 * Masters section, grouped by topic so Checklist, Events and Job Description
 * read as separate. On a phone the rail is a drawer, so this strip is how you
 * move between masters without opening it.
 */
export function MastersTabs() {
  const pathname = usePathname() ?? "";

  return (
    <nav
      aria-label="Masters"
      className="no-scrollbar mb-5 flex items-center gap-1.5 overflow-x-auto whitespace-nowrap border-b border-slate-200 pb-3 print:hidden"
    >
      {OPERATIONS_MASTERS.map((m, i) => {
        const active = isOperationsItemActive(m, pathname);
        const newTopic = m.topic !== "Overview" && OPERATIONS_MASTERS[i - 1]?.topic !== m.topic;
        return (
          <React.Fragment key={m.href}>
            {newTopic && (
              <span className="ml-2 flex shrink-0 items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-slate-400">
                <span aria-hidden className="h-5 w-px bg-slate-200" />
                {m.topic}
              </span>
            )}
            <Link
              href={m.href as Route}
              aria-current={active ? "page" : undefined}
              className={`inline-flex h-8 shrink-0 items-center gap-1.5 rounded-lg px-3 text-[12.5px] ${
                active
                  ? "font-semibold text-white shadow-sm"
                  : "font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
              }`}
              style={active ? { background: "var(--color-altus-red)" } : undefined}
            >
              <m.Icon className="h-3.5 w-3.5" />
              {m.label}
            </Link>
          </React.Fragment>
        );
      })}
    </nav>
  );
}
