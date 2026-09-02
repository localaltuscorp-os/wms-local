import { NextResponse } from "next/server";
import { type Employee } from "@/db/schema";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { accessFor } from "@/lib/auth/workspace-access";
import { canAccessWorkspace } from "@/lib/workspaces";
import { hrSupportEnabled } from "@/lib/hr/flag";
import { listHolidays } from "@/lib/queries/monthly-events";
import { personalisedHolidays } from "@/components/events/holidays/personalise";
import type { ReligionCode } from "@/lib/monthly-events/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

/** The financial years the web Holiday List exposes (matches page.tsx). */
const VALID_FY = new Set([2026, 2027]);

/** Current FY start-year (Indian FY starts in April = month index 3). */
function currentFyStart(): number {
  const now = new Date();
  const y = now.getFullYear();
  return now.getMonth() >= 3 ? y : y - 1;
}

async function inHrRoom(me: Employee): Promise<boolean> {
  return canAccessWorkspace("hr", await accessFor(me));
}

/**
 * GET /api/mobile/holidays[?fy=2026|2027] — the read-only, religion-personalised
 * company holiday list, the mobile twin of the web `/holidays` page. Reuses the
 * SAME data the Monthly Events Master owns (`listHolidays`) and the exact web
 * personalisation (`personalisedHolidays` against the signed-in user's religion)
 * so the two never diverge. Open to every HR-room user. `fy` defaults to the
 * current financial year (clamped to the exposed FY window).
 */
export async function GET(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  }
  const me = auth.employee;
  if (!hrSupportEnabled() || !(await inHrRoom(me))) {
    return NextResponse.json({ error: "forbidden" }, { status: 403, headers: MOBILE_CORS });
  }

  const requested = Number(new URL(req.url).searchParams.get("fy"));
  const fallback = VALID_FY.has(currentFyStart()) ? currentFyStart() : 2026;
  const fy = VALID_FY.has(requested) ? requested : fallback;

  const all = await listHolidays(fy);
  const religion = (me.religion as ReligionCode | null) ?? null;
  const holidays = personalisedHolidays(all, religion);

  return NextResponse.json(
    { fy, fyOptions: Array.from(VALID_FY), religion, holidays },
    { headers: MOBILE_CORS },
  );
}
