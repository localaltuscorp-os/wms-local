"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { ChevronLeft, ChevronRight } from "lucide-react";

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
  // The row scrolls sideways with its scrollbar hidden, so at narrower widths
  // the step you are ON could sit past the right edge with nothing to say the
  // row went on ("Employee Onboarding Form" cut at the edge, 2026-09-18). Bring
  // the active pill into view whenever the page changes. `nearest` scrolls only
  // as far as needed, and only this row — never the page.
  const rowRef = React.useRef<HTMLDivElement>(null);
  React.useEffect(() => {
    const row = rowRef.current;
    const active = row?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!row || !active) return;
    const left = active.offsetLeft - row.offsetLeft;
    const right = left + active.offsetWidth;
    if (left < row.scrollLeft) row.scrollLeft = Math.max(0, left - 16);
    else if (right > row.scrollLeft + row.clientWidth) row.scrollLeft = right - row.clientWidth + 16;
  }, [activeHref]);

  // Scrolling to the active pill still left the OTHER end cut mid-word with no
  // sign the row went on ("Rejec…" at 1120px, 2026-09-19). Track which ends have
  // more, and show a fade plus a ‹ › button on exactly those ends. The row keeps
  // one line, so the bar's height never changes.
  const [more, setMore] = React.useState({ left: false, right: false });
  const measure = React.useCallback(() => {
    const row = rowRef.current;
    if (!row) return;
    const left = row.scrollLeft > 1;
    const right = row.scrollLeft + row.clientWidth < row.scrollWidth - 1;
    setMore((m) => (m.left === left && m.right === right ? m : { left, right }));
  }, []);
  React.useEffect(() => {
    const row = rowRef.current;
    if (!row) return;
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(row);
    row.addEventListener("scroll", measure, { passive: true });
    return () => {
      ro.disconnect();
      row.removeEventListener("scroll", measure);
    };
  }, [measure, module]);
  const nudge = (dir: -1 | 1) => {
    const row = rowRef.current;
    if (row) row.scrollBy({ left: dir * Math.max(160, row.clientWidth * 0.6), behavior: "smooth" });
  };

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
      <div className="relative">
      <div ref={rowRef} className="no-scrollbar flex flex-row items-center gap-2 overflow-x-auto whitespace-nowrap">
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
      {more.left && <EdgeButton side="left" onClick={() => nudge(-1)} />}
      {more.right && <EdgeButton side="right" onClick={() => nudge(1)} />}
      </div>
    </nav>
  );
}

/** A ‹ or › over a white fade at one end of the step row, shown only while
 *  that end has more steps hidden behind it. */
function EdgeButton({ side, onClick }: { side: "left" | "right"; onClick: () => void }) {
  const Icon = side === "left" ? ChevronLeft : ChevronRight;
  return (
    <div
      className={`pointer-events-none absolute inset-y-0 flex w-16 items-center ${
        side === "left"
          ? "left-0 justify-start bg-gradient-to-r from-white via-white/90 to-transparent"
          : "right-0 justify-end bg-gradient-to-l from-white via-white/90 to-transparent"
      }`}
    >
      <button
        type="button"
        onClick={onClick}
        aria-label={side === "left" ? "Show earlier steps" : "Show more steps"}
        className="pointer-events-auto grid h-7 w-7 shrink-0 place-items-center rounded-full border border-hairline bg-white text-slate-600 shadow-sm transition-colors hover:text-slate-900"
      >
        <Icon size={15} strokeWidth={2.4} aria-hidden />
      </button>
    </div>
  );
}
