import type { LucideIcon } from "lucide-react";
import {
  UserSearch,
  ClipboardCheck,
  Briefcase,
  UserCheck,
  DoorOpen,
  LogOut,
  CalendarDays,
  ScrollText,
  LifeBuoy,
  FolderOpen,
  Target,
  Megaphone,
  Files,
  Receipt,
  ClipboardList,
} from "lucide-react";

import { HR_STAGES, hrItemHref } from "@/lib/hr/lifecycle";

/**
 * The HR console's navigation model — the module rail (left) and the step list
 * (middle) of the three-column HR workspace.
 *
 * This is a VIEW over lib/hr/lifecycle.ts, never a second source of truth: the
 * six lifecycle stages and every step inside them are read straight from
 * HR_STAGES, so a change there flows into the console with no edit here. What
 * this file adds is the console's own taxonomy — the eight standalone HR
 * surfaces (Holiday List, Policies, Help Desk, …) that sit alongside the
 * lifecycle in the rail but aren't part of the employee journey.
 */

export type HrConsoleSubModule = {
  id: string;
  title: string;
  blurb: string;
  Icon: LucideIcon;
  href: string;
  /** Lives outside /hr — opening it leaves the console shell behind. */
  external: boolean;
};

export type HrConsoleModule = {
  id: string;
  title: string;
  Icon: LucideIcon;
  /** Set when the module IS the destination (it has no inner steps). */
  href?: string;
  external: boolean;
  subModules: HrConsoleSubModule[];
};

/**
 * The console layout wraps /hr/* only. Anything else — /support, /policies,
 * /communications — is a real HR surface that simply lives at its own top-level
 * route, so selecting it navigates out of the three-column shell. The list marks
 * those so the UI can badge them rather than pretending they open inline.
 */
export function isOutsideConsole(href: string): boolean {
  return !href.startsWith("/hr");
}

/**
 * The old /hr landing opened the all-policies sheet from a `?policies=1` query
 * param. The console replaces that landing, so the param has nothing to open —
 * point the step at the real policies route instead. Remapped HERE rather than
 * in lifecycle.ts so the stage pages and letter rail keep their existing links.
 */
const HREF_OVERRIDES: Record<string, string> = {
  "/hr?policies=1": "/policies",
};

/** The design's rail icons for the six lifecycle stages. */
const STAGE_ICONS: Record<string, LucideIcon> = {
  "pre-interview": UserSearch,
  "post-interview": ClipboardCheck,
  "pre-joining": Briefcase,
  "post-joining": UserCheck,
  during: DoorOpen,
  exit: LogOut,
};

const lifecycleModules: HrConsoleModule[] = HR_STAGES.map((stage) => ({
  id: stage.slug,
  title: stage.title,
  Icon: STAGE_ICONS[stage.slug] ?? stage.Icon,
  external: false,
  subModules: stage.items.map((item) => {
    const raw = hrItemHref(stage.slug, item);
    const href = HREF_OVERRIDES[raw] ?? raw;
    return {
      id: `${stage.slug}/${item.slug}`,
      title: item.label,
      blurb: item.blurb,
      Icon: item.Icon,
      href,
      external: isOutsideConsole(href),
    };
  }),
}));

/** The standalone HR surfaces — no inner steps, the rail row IS the link. */
const standalone: Array<{ id: string; title: string; Icon: LucideIcon; href: string }> = [
  // Job Description (0222) — a STANDALONE module, not a lifecycle stage: the
  // stages describe an employee's journey, and a JD outlives every employee who
  // ever holds it. Placed first because it is the register the other HR
  // surfaces refer back to.
  { id: "job-description", title: "Job Description", Icon: ClipboardList, href: "/hr/job-description" },
  { id: "holiday-list", title: "Holiday List", Icon: CalendarDays, href: "/hr/holidays" },
  { id: "policies", title: "Policies", Icon: ScrollText, href: "/policies" },
  { id: "help-desk", title: "Help Desk", Icon: LifeBuoy, href: "/support" },
  { id: "hr-record", title: "HR Record", Icon: FolderOpen, href: "/hr/record" },
  { id: "kpi-management", title: "KPI Management", Icon: Target, href: "/hr/kpi" },
  { id: "enterprise-communications", title: "Broadcasts", Icon: Megaphone, href: "/communications" },
  { id: "all-filled-forms", title: "All Filled Forms", Icon: Files, href: "/hr/all-forms" },
  { id: "salary-slip", title: "Salary Slip", Icon: Receipt, href: "/hr/salary-slip" },
];

export const HR_CONSOLE_MODULES: HrConsoleModule[] = [
  ...lifecycleModules,
  ...standalone.map((m) => ({
    id: m.id,
    title: m.title,
    Icon: m.Icon,
    href: m.href,
    external: isOutsideConsole(m.href),
    subModules: [] as HrConsoleSubModule[],
  })),
];

/** Compare a pathname against an href, ignoring any query string on the href. */
function matches(pathname: string, href: string): boolean {
  const path = href.split("?")[0] ?? href;
  return pathname === path || pathname.startsWith(path + "/");
}

/**
 * Which module + step the current route sits in. Steps are checked before
 * module hrefs so a step always wins over its module's own landing route, and
 * the LONGEST matching step wins so /hr/letters/<key> can't be shadowed by a
 * shorter prefix.
 */
export function locateHrRoute(pathname: string): {
  module: HrConsoleModule | null;
  subModule: HrConsoleSubModule | null;
} {
  // A standalone module whose href is EXACTLY this route wins outright — that
  // rail row is the destination, so the rail should light it up. Checked ahead
  // of the step scan below because one lifecycle step (Pre-Joining → "Policy
  // Signatures") points at the same /policies route: without this, standing on
  // the standalone Policies module would highlight Pre-Joining instead.
  // Exact-match only, so prefix cases still fall through to the ordinary
  // module scan further down and nothing else changes.
  for (const mod of HR_CONSOLE_MODULES) {
    const href = mod.href ? (mod.href.split("?")[0] ?? mod.href) : null;
    if (href && href === pathname) return { module: mod, subModule: null };
  }

  let best: { module: HrConsoleModule; subModule: HrConsoleSubModule } | null = null;
  for (const mod of HR_CONSOLE_MODULES) {
    for (const sub of mod.subModules) {
      if (!matches(pathname, sub.href)) continue;
      const len = (sub.href.split("?")[0] ?? sub.href).length;
      const bestLen = best ? (best.subModule.href.split("?")[0] ?? "").length : -1;
      if (len > bestLen) best = { module: mod, subModule: sub };
    }
  }
  if (best) return best;

  for (const mod of HR_CONSOLE_MODULES) {
    if (mod.href && matches(pathname, mod.href)) return { module: mod, subModule: null };
  }
  // The stage sub-hub itself (/hr/<stage>) has no step of its own.
  for (const mod of HR_CONSOLE_MODULES) {
    if (mod.subModules.length > 0 && matches(pathname, `/hr/${mod.id}`)) {
      return { module: mod, subModule: null };
    }
  }
  return { module: null, subModule: null };
}
