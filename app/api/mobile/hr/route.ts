import { NextResponse } from "next/server";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { isHrHandler } from "@/lib/hr/access";
import { hrSupportEnabled } from "@/lib/hr/flag";
import { agreementsEnabled } from "@/lib/agreements/flag";
import { appraisalEnabled } from "@/lib/pms/appraisal-flag";
import { employeeDepartmentNames } from "@/lib/queries/departments";
import { canAccessWorkspace, matchesDepartment } from "@/lib/workspaces";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

/** Departments (word-matched) that may VIEW the Monthly Events module without
 *  being admins — mirrors EVENTS_VIEW_DEPARTMENTS in lib/monthly-events/access.
 *  Inlined here because that const is not exported. */
const EVENTS_VIEW_DEPARTMENTS = ["Founder"] as const;

interface HrTile {
  slug: string;
  title: string;
  blurb: string;
  /** Scaffolded section badged "Soon" — only truthful while support is OFF. */
  soon: boolean;
}

/**
 * GET /api/mobile/hr — the HR room's entry flags + the tiles the signed-in user
 * may open, for the native app's HR hub screen.
 *
 * Replicates app/(app)/hr/page.tsx exactly: the room is an OPEN workspace
 * (canAccessWorkspace("hr")), so a 403 is only returned in the (currently
 * impossible) case the shared guard denies entry. Every flag reuses the SAME
 * lib helper the web page/guards use — hrSupportEnabled / agreementsEnabled /
 * appraisalEnabled (the non-throwing variants of requireHrSupport /
 * requireAppraisal), isHrHandler, and the events-access rule from
 * lib/monthly-events/access — so the phone and the web room never diverge.
 */
export async function GET(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  }
  const me = auth.employee;

  // Every department the user belongs to (structured membership + legacy
  // free-text) — the exact input accessFor()/eventsAccess() feed their guards.
  const structured = await employeeDepartmentNames(me.id).catch(() => [] as string[]);
  const departments = me.department ? [...structured, me.department] : structured;
  const superAdmin = isSuperAdmin(me.email);

  // Room guard — mirror requireWorkspace("hr") without redirecting: HR is an
  // open room, so this is true for every enrolled user, but we replicate the
  // shared predicate rather than assume.
  const canEnter = canAccessWorkspace("hr", {
    departments,
    isAdmin: me.isAdmin,
    isSuperAdmin: superAdmin,
  });
  if (!canEnter) {
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers: MOBILE_CORS });
  }

  const isAdmin = me.isAdmin || superAdmin;
  const supportOn = hrSupportEnabled();
  const agreementsOn = agreementsEnabled();
  const appraisalOn = appraisalEnabled();
  const handler = supportOn ? await isHrHandler(me) : false;

  // Events-room access (requireEventsAccess-style, boolean): admins, or the
  // Founder Office department.
  const eventsAccess =
    isAdmin || EVENTS_VIEW_DEPARTMENTS.some((d) => matchesDepartment(departments, d));

  // The HR room's sections — same set + soon rule as the web hub. Agreements is
  // dropped when its module kill-switch is off (the page would 404), so the app
  // never renders a tile that can't open.
  const tiles: HrTile[] = [
    { slug: "/dossier", title: "Dossier", blurb: "Every person's complete document file — appointment, probation, CTC, increments, confidentiality & onboarding.", soon: false },
    { slug: "/agreements", title: "Agreements", blurb: "Issue, sign and archive employee agreements digitally.", soon: false },
    { slug: "/policies", title: "Policies", blurb: "The company handbook — every policy in one searchable place.", soon: false },
    { slug: "/holidays", title: "Holiday List", blurb: "The official holiday calendar for the year, at a glance.", soon: false },
    { slug: "/letters", title: "Letters", blurb: "HR letters — offer, confirmation, increment, experience & more.", soon: false },
    { slug: "/queries", title: "Queries & Notifications", blurb: "Raise an HR query and track company notices & announcements.", soon: !supportOn },
    { slug: "/support", title: "Support", blurb: "Get help from the HR desk — questions, requests & escalations.", soon: !supportOn },
  ].filter((t) => t.slug !== "/agreements" || agreementsOn);

  // HR-desk tools the page surfaces below the sections, gated the same way.
  const tools: HrTile[] = [];
  if (supportOn && isAdmin) {
    tools.push({ slug: "/hr/routing", title: "Ticket Routing", blurb: "Choose who owns each category of HR request so nothing lands unowned.", soon: false });
  }
  if (supportOn && handler) {
    tools.push({ slug: "/hr/metrics", title: "Support Metrics", blurb: "Open load, SLA breaches, response times and CSAT at a glance.", soon: false });
  }

  return NextResponse.json(
    {
      isAdmin,
      handler,
      supportOn,
      appraisalOn,
      agreementsOn,
      eventsAccess,
      tiles,
      tools,
    },
    { headers: MOBILE_CORS },
  );
}
