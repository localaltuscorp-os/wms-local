"use client";

import Link from "next/link";
import type { Route } from "next";
import { FlaskConical } from "lucide-react";
import { usePathname, useSearchParams } from "next/navigation";

import { DCC_DOORS, activeDccDoor } from "@/lib/dcc/nav";
import { DCC_DEMO_PARAM } from "@/lib/dcc/demo-data";

/**
 * The DCC doors as one row across the top of every DCC page.
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
 *
 * ── THE SAMPLE-DATA SWITCH LIVES HERE ──────────────────────────────────────
 * It was on the dashboard only, which meant somebody landing on My Day — the
 * module's front door, and the first thing an empty DCC shows you — saw a blank
 * screen with no hint that a populated preview existed at all. The switch now
 * sits in the bar that every DCC page carries, and **every door link keeps the
 * flag**, so you can walk the whole module in sample mode instead of falling
 * back to real (empty) data on the first click.
 */
export function DccQuickNav() {
  const pathname = usePathname() ?? "";
  const params = useSearchParams();
  const active = activeDccDoor(pathname);
  const demo = params?.get(DCC_DEMO_PARAM) === "1";

  /** A door's href, carrying the flag but none of the page-specific filters. */
  const doorHref = (href: string) => (demo ? `${href}?${DCC_DEMO_PARAM}=1` : href) as Route;

  /** The switch flips the flag and drops every other param with it: a `?person=`
   *  from one side is meaningless on the other, where the ids are different. */
  const toggleHref = (demo ? pathname : `${pathname}?${DCC_DEMO_PARAM}=1`) as Route;

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
              href={doorHref(d.href)}
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

        <Link
          href={toggleHref}
          aria-pressed={demo}
          title={
            demo
              ? "Go back to the real data in this database"
              : "Fill every DCC screen with invented people, so the layout can be seen before anyone has filled a real day"
          }
          className={`ml-auto inline-flex h-7 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-xs font-semibold transition-colors ${
            demo
              ? "bg-amber-100 text-amber-800 hover:bg-amber-200"
              : "text-slate-500 hover:bg-slate-100 hover:text-slate-800"
          }`}
        >
          <FlaskConical className="h-3.5 w-3.5" aria-hidden />
          {demo ? "Sample data — show real" : "Sample data"}
        </Link>
      </div>
    </nav>
  );
}
