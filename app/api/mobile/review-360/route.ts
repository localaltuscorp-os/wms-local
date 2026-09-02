import { NextResponse } from "next/server";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import {
  reviewablePeople,
  getMyReview,
  listMyAuthoredReviews,
  listMyPersonalGoals,
  REVIEW_CHANGE_TAGS,
  type ReviewRelation,
} from "@/lib/queries/pms-review";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

/**
 * Current IST review cycle as `{ period: 'YYYY-MM', label: 'July 2026' }`.
 * Mirrors `istPeriod()` in app/(app)/pms/review/page.tsx exactly (UTC clock
 * shifted +5:30 == IST wall clock) so the app and the web page always agree on
 * which month is open. Wrapped in a real Date to avoid string/date drift.
 */
function istPeriod(): { period: string; label: string } {
  const ist = new Date(Date.now() + 5.5 * 3_600_000);
  const y = ist.getUTCFullYear();
  const m = ist.getUTCMonth();
  const period = `${y}-${String(m + 1).padStart(2, "0")}`;
  const label = ist.toLocaleDateString("en-US", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });
  return { period, label };
}

/**
 * GET /api/mobile/review-360 — the signed-in user's Monthly 360 read surface.
 *
 * Owner-scoped: everyone the user may review this cycle (downline → `manager`,
 * own manager → `subordinate`, same-manager peers → `peer`), each flagged done
 * with its prior ratings pre-loaded, plus the user's own Personal Goals and the
 * "what needs to change" tag vocabulary. Read-only — the actual rating write
 * stays on the web form; this feeds a faithful mobile display of the same data.
 *
 * Reuses the exact web query layer (reviewablePeople / listMyAuthoredReviews /
 * getMyReview / listMyPersonalGoals) so the two never diverge; every one of
 * those is fail-safe (empty on error), so a DB hiccup degrades to an empty
 * roster rather than a 500.
 */
export async function GET(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) {
    return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  }
  const me = auth.employee;
  const { period, label } = istPeriod();

  const [scope, authored, myGoals] = await Promise.all([
    reviewablePeople({ id: me.id, managerId: me.managerId }),
    listMyAuthoredReviews(me.id, period),
    listMyPersonalGoals(me.id, period),
  ]);

  const doneKey = new Set(authored.map((a) => `${a.subjectId}:${a.relation}`));
  const flat = [...scope.manager, ...scope.subordinate, ...scope.peer];

  // Batched prior-review fetch for the subjects already reviewed, so each done
  // card can show the ratings the user left (bounded to the roster).
  const priorEntries = await Promise.all(
    flat
      .filter((p) => doneKey.has(`${p.id}:${p.relation}`))
      .map(async (p) => {
        const r = await getMyReview(me.id, p.id, p.relation, period);
        return [p.id, r] as const;
      }),
  );
  const priorById = new Map(priorEntries);

  const people = flat.map((p) => {
    const prior = priorById.get(p.id) ?? null;
    return {
      id: p.id,
      name: p.name,
      avatarUrl: p.avatarUrl,
      department: p.department,
      relation: p.relation as ReviewRelation,
      done: doneKey.has(`${p.id}:${p.relation}`),
      prior: prior
        ? {
            attitude: prior.attitude,
            behaviour: prior.behaviour,
            skill: prior.skill,
            changeTags: prior.changeTags ?? [],
            explanation: prior.explanation,
            scope: (prior.scope as "internal" | "external") ?? "internal",
          }
        : null,
    };
  });

  const reviewedCount = people.filter((p) => p.done).length;

  return NextResponse.json(
    {
      period,
      periodLabel: label,
      changeTags: [...REVIEW_CHANGE_TAGS],
      reviewedCount,
      totalCount: people.length,
      people,
      personalGoals: myGoals.map((g) => ({
        title: g.title,
        detail: g.detail ?? "",
        status: (g.status as string) ?? "active",
      })),
    },
    { headers: MOBILE_CORS },
  );
}
