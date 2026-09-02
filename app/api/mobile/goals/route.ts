import { NextResponse } from "next/server";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import { getYearBoard } from "@/lib/goals/queries";
import { listGoalLookups } from "@/lib/goals/lookups";
import { toGoalDTO } from "@/components/goals/cascade/util";
import { fyStartYearOf } from "@/lib/goals/types";
import type { GoalNode } from "@/lib/goals/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

/** Flatten a goal tree to every node. */
function collect(nodes: GoalNode[]): GoalNode[] {
  const out: GoalNode[] = [];
  const walk = (ns: GoalNode[]) => ns.forEach((n) => (out.push(n), walk(n.children)));
  walk(nodes);
  return out;
}

/**
 * GET /api/mobile/goals[?fy=2026&space=personal]
 *
 * The signed-in user's Goals cascade for a financial year — the SAME data the
 * web board renders (getYearBoard → toGoalDTO), scope-aware. `space=personal`
 * is honoured for admins only (mig 0150); everyone else gets professional. The
 * flat `goals` array carries every level (year/quarter/month + personal
 * week/day) with parentGoalId, so the app can build the Y→Q→M→W tree, filter by
 * level, and render the inline table (Area/Measure/Type, target/actual, %Done,
 * team + per-member weights, share-with-team). `lookups` feeds the dropdowns.
 */
export async function GET(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  }
  const me = auth.employee;

  const url = new URL(req.url);
  const fyRaw = url.searchParams.get("fy");
  const fy = fyRaw && /^\d{4}$/.test(fyRaw) ? Number(fyRaw) : fyStartYearOf(new Date());
  const space: "professional" | "personal" =
    me.isAdmin && url.searchParams.get("space") === "personal" ? "personal" : "professional";

  const [board, lookups] = await Promise.all([
    getYearBoard(me.id, fy, space),
    listGoalLookups(),
  ]);

  const goals = [...collect(board.years), ...collect(board.standalone)].map(toGoalDTO);

  return NextResponse.json(
    {
      fy,
      space,
      isAdmin: me.isAdmin,
      goals,
      lookups: {
        areas: lookups.areas,
        measures: lookups.measures,
        types: lookups.types,
      },
    },
    { headers: MOBILE_CORS },
  );
}
