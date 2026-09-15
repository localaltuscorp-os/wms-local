"use client";

import Link from "next/link";
import type { Route } from "next";
import { usePathname } from "next/navigation";
import {
  OPERATIONS_AREAS,
  isOperationsItemActive,
  operationsAreaForPath,
} from "@/lib/operations/nav";

/**
 * QUICK-ACCESS NAV — the pages inside the current Operations area, as one row
 * of buttons across the top of the content column.
 *
 * The sidebar carries the four AREAS and does not swap; this row carries the
 * pages inside whichever one you are in. Two axes, both always one click away —
 * the arrangement the HR console uses, which this is modelled on. Read
 * components/hr/console/hr-step-nav.tsx before changing anything visual here:
 * the two bars do the same job in the same app and should be indistinguishable.
 *
 * Deliberately stripped to the LABEL — no icon, no blurb. The sidebar can
 * afford an icon per row because it owns a column; a horizontal bar cannot, and
 * the name is the part people navigate by.
 *
 * ── GATING IS RESOLVED ON THE SERVER ─────────────────────────────────────
 * `adminOnly` and `hhAccessOnly` are decided by the layout that mounts this and
 * handed down as two booleans. `hhAccessOnly` in particular reads HR tables
 * (lib/hh/access) that a client component cannot touch, and a nav that rendered
 * the link and let the page reject it would be advertising a door that does not
 * open.
 */
export function OperationsQuickNav({
  isAdmin,
  canSeeHhAccess,
}: {
  isAdmin: boolean;
  canSeeHhAccess: boolean;
}) {
  const pathname = usePathname() ?? "";
  const area = operationsAreaForPath(pathname);

  const items = (area?.items ?? []).filter(
    (it) => (!it.adminOnly || isAdmin) && (!it.hhAccessOnly || canSeeHhAccess),
  );

  /* Render NOTHING rather than an empty strip when there is nothing to choose
     between — an area with one page (Checklist, Guidelines), or a viewer whose
     gates filtered the row down to a single button. A bar with one button is a
     label, and it would push every such page down by 40px to say nothing. */
  if (items.length < 2) return null;

  return (
    // print:hidden — chrome, not content, like the HR bar it mirrors.
    <nav
      aria-label={`${area!.label} pages`}
      className="border-b border-hairline bg-white/90 px-6 py-2 backdrop-blur print:hidden max-md:px-4"
    >
      {/* overflow-x-auto + whitespace-nowrap: a narrow viewport scrolls the
          buttons sideways rather than wrapping to a second line, which would
          change the bar's height and shove the page under it. */}
      <div className="no-scrollbar flex flex-row items-center gap-2 overflow-x-auto whitespace-nowrap">
        {items.map((item) => {
          const active = isOperationsItemActive(item, pathname);
          return (
            <Link
              key={item.href}
              href={item.href as Route}
              aria-current={active ? "page" : undefined}
              // NO `dark:` variants, and h-7 stated rather than derived from
              // padding — both for the reasons documented in section-nav.tsx.
              className={`inline-flex h-7 shrink-0 items-center rounded-lg px-2.5 text-xs ${
                active
                  ? "font-semibold text-white shadow-sm transition-all duration-200"
                  : "font-medium text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
              }`}
              style={active ? { background: "var(--color-altus-red)" } : undefined}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

/** Every area, for callers that need the list without importing lib directly. */
export const OPERATIONS_AREA_COUNT = OPERATIONS_AREAS.length;
