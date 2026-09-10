"use client";

import Link from "next/link";
import type { Route } from "next";

import type { HrConsoleModule } from "@/lib/hr/console-nav";

/**
 * QUICK-ACCESS NAV — the steps inside the current module, as one row of
 * buttons across the top of the content column.
 *
 * This replaces the 320px step-list SIDEBAR that used to be column 2. Same
 * destinations, same one-click behaviour: each button is a real link to the
 * surface that implements that step, so clicking one opens the page exactly as
 * the sidebar rows did. Nothing was merged into a single scrolling page.
 *
 * Deliberately stripped to the LABEL: no icon, no order number, no blurb. The
 * sidebar could afford three lines per row because it owned a whole column;
 * a horizontal bar cannot, and the name is the part people navigate by.
 *
 * Styling is lifted from components/dashboard/section-nav.tsx on purpose - the
 * two bars do the same job in the same app and should be indistinguishable.
 * Read that file before changing anything here, including its note on why the
 * active pill uses `var(--color-altus-red)` rather than a Tailwind red.
 */
export function HrStepNav({
  module,
  activeHref,
}: {
  module: HrConsoleModule | null;
  /** The step whose route is currently open. */
  activeHref: string | null;
}) {
  // A leaf module (Holiday List, Policies, ...) has nothing to choose between,
  // and the bare /hr front door has no module at all. Render no bar rather than
  // an empty strip, so those surfaces start at the top of the column.
  if (!module || module.subModules.length === 0) return null;

  return (
    // print:hidden - chrome, not content. Matches the title bar above it and
    // the sidebar this replaced, both of which were kept off paper.
    <nav
      aria-label={`${module.title} steps`}
      className="border-b border-hairline bg-white/90 px-6 py-2 backdrop-blur print:hidden max-md:px-4"
    >
      {/* overflow-x-auto + whitespace-nowrap: a narrow viewport scrolls the
          buttons sideways instead of wrapping them onto a second line, which
          would change the height of a sticky bar and shove the page under it.
          This is also why the bar works on mobile at all - the old sidebar was
          `max-lg:hidden`, so below 1024px there was no way to reach a step. */}
      <div className="no-scrollbar flex flex-row items-center gap-2 overflow-x-auto whitespace-nowrap">
        {module.subModules.map((sub) => {
          const active = sub.href === activeHref;
          return (
            <Link
              key={sub.id}
              href={sub.href as Route}
              aria-current={active ? "page" : undefined}
              title={sub.external ? `${sub.title} - opens outside HR` : sub.title}
              // NO `dark:` variants, and h-7 stated rather than derived from
              // padding - both for the reasons documented in section-nav.tsx.
              className={`inline-flex h-7 shrink-0 items-center rounded-lg px-2.5 text-xs ${
                active
                  ? "font-semibold text-white shadow-sm transition-all duration-200"
                  : "font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
              }`}
              style={active ? { background: "var(--color-altus-red)" } : undefined}
            >
              {sub.title}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
