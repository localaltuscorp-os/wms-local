"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";

import { DCC_DOORS, activeDccDoor } from "@/lib/dcc/nav";

/**
 * The five DCC doors as one row across the top of every DCC page.
 *
 * Styling is lifted from components/hr/console/hr-step-nav.tsx on purpose — the
 * two bars do the same job in the same app and should be indistinguishable. Read
 * that file, and components/dashboard/section-nav.tsx before it, before changing
 * anything here (including why the active pill uses `var(--color-altus-red)`
 * rather than a Tailwind red).
 *
 * `overflow-x-auto` + `whitespace-nowrap`: a narrow viewport scrolls the row
 * sideways instead of wrapping it onto a second line, which would change the
 * height of the bar and shove the page under it.
 */
export function DccQuickNav() {
  const pathname = usePathname() ?? "";
  const active = activeDccDoor(pathname);

  return (
    <nav
      aria-label="Daily Compliance sections"
      className="border-b border-hairline bg-white/90 px-6 py-2 backdrop-blur print:hidden max-md:px-4"
    >
      <div className="no-scrollbar flex flex-row items-center gap-2 overflow-x-auto whitespace-nowrap">
        {DCC_DOORS.map((d) => {
          const on = active?.href === d.href;
          return (
            <Link
              key={d.href}
              href={d.href as Route}
              aria-current={on ? "page" : undefined}
              title={d.blurb}
              className={`inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs ${
                on
                  ? "font-semibold text-white shadow-sm transition-all duration-200"
                  : "font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
              }`}
              style={on ? { background: "var(--color-altus-red)" } : undefined}
            >
              <d.Icon className="h-3.5 w-3.5" aria-hidden />
              {d.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
