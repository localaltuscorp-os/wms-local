import type { HrConsoleModule } from "@/lib/hr/console-nav";
import { nodeKeyForPath } from "@/lib/permissions/catalog";

/**
 * HIDE WHAT THE PERMISSION MATRIX HAS TAKEN AWAY.
 *
 * ── THE GAP THIS CLOSES ────────────────────────────────────────────────────
 * The matrix itself has been ENFORCED for a long time: `app/(app)/layout.tsx`
 * runs `requirePathView(pathname)` on every request, deliberately, so a denied
 * module cannot be reached by typing its URL. What was missing is that the HR
 * console never asked. Its module rail and step list are built from
 * `HR_CONSOLE_MODULES`, which knows nothing about permissions, so switching
 * "HR → CTC" off for somebody left the "CTC Breakup" step sitting there looking
 * exactly as available as everything else — and clicking it bounced them to the
 * hub. A control that hides nothing and a link that refuses you are each worse
 * than the other thing they could do.
 *
 * `hiddenModuleKeys()` already existed for exactly this and was wired into the
 * app's left rail alone. This applies the same answer to the HR console.
 *
 * ── PURE, AND CLIENT-SAFE ──────────────────────────────────────────────────
 * The console is a client component and the catalogue is a hand-written constant
 * with no I/O, so the decision can be made here and unit-tested without a
 * database. The HIDDEN SET is computed on the server and passed down — never
 * recomputed in the browser.
 */

/** Does this href belong to a node the user has been denied? */
function isHiddenHref(href: string, hidden: ReadonlySet<string>): boolean {
  const key = nodeKeyForPath(href);
  return key != null && hidden.has(key);
}

/**
 * The console's modules with anything denied removed.
 *
 * `hidden === null` means "not governed" — a master admin, or a row the matrix
 * does not cover — and returns the list untouched. That is the resolver's own
 * convention (`hiddenModuleKeys()` returns null rather than an empty set for
 * precisely this distinction, since an empty set would mean "deny everything").
 */
export function visibleConsoleModules(
  modules: readonly HrConsoleModule[],
  hidden: ReadonlySet<string> | null,
): HrConsoleModule[] {
  if (!hidden || hidden.size === 0) return [...modules];

  const out: HrConsoleModule[] = [];
  for (const mod of modules) {
    // A module that IS the destination: keep it unless its own page is denied.
    if (mod.href && !mod.subModules.length) {
      if (!isHiddenHref(mod.href, hidden)) out.push(mod);
      continue;
    }

    const subModules = mod.subModules.filter((s) => !isHiddenHref(s.href, hidden));

    // Every step denied ⇒ the module itself is denied. Stages (Pre-Interview,
    // Post-Interview…) have no page of their own, so a stage whose steps have all
    // gone has nothing left to open and must not be drawn as an empty rail row.
    if (subModules.length === 0) continue;

    out.push({ ...mod, subModules });
  }
  return out;
}
