/**
 * PMS — Monthly 360 review + Personal goals read layer (server-only).
 *
 * The human-input surface that feeds the Attitude/Mindset and Team-Work pillars
 * of the PMS score (see docs/PMS_FULL_SPEC.md §4). Three review relations are
 * supported toward a subject:
 *   - 'manager'     — the signed-in user rates someone in their downline.
 *   - 'subordinate' — the signed-in user rates UPWARD (their own manager).
 *   - 'peer'        — the signed-in user rates a colleague (same manager).
 *
 * `reviewablePeople(me)` enumerates exactly who the user may review and with
 * which relation; the matching server action re-checks the same rule so the UI
 * can never widen the scope. All selects are wrapped in withRetry so a stale
 * pooled connection self-heals — this is an analytics/HR surface, not the hot
 * dashboard path.
 */
import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import {
  db,
  employees,
  pmsMonthlyReview,
  pmsPersonalGoal,
  type PmsMonthlyReview,
  type PmsPersonalGoal,
} from "@/lib/db";
import { withRetry } from "@/lib/db/with-timeout";
import { getDownlineIds } from "@/lib/weekly-goals/hierarchy";

const RETRY = { attempts: 3, timeoutMs: [6000, 10000, 14000] as number[] };

/**
 * The "what needs to change" vocabulary (§4) — a fixed dropdown of behaviours,
 * plus free-text explanation for anything outside it. Single source of truth,
 * reused by the save action (to sanitise) and surfaced to the client form via a
 * page prop (this module is server-only, so the client can't import it directly).
 */
export const REVIEW_CHANGE_TAGS = [
  "Punctuality",
  "Ownership",
  "Communication",
  "Collaboration",
  "Initiative",
  "Quality",
  "Discipline",
  "Learning",
] as const;

export type ReviewChangeTag = (typeof REVIEW_CHANGE_TAGS)[number];

export type ReviewRelation = "manager" | "subordinate" | "peer";

export interface ReviewablePerson {
  id: string;
  name: string;
  avatarUrl: string | null;
  department: string | null;
  /** Which relation the signed-in user holds toward this person. */
  relation: ReviewRelation;
}

export interface ReviewableScope {
  /** People the user can review, grouped by relation (stable, name-sorted). */
  manager: ReviewablePerson[];
  subordinate: ReviewablePerson[];
  peer: ReviewablePerson[];
}

/**
 * Everyone the signed-in user is allowed to review this cycle:
 *  - their full downline (transitive) → reviewed as 'manager'
 *  - their own direct manager        → reviewed as 'subordinate' (rate upward)
 *  - their peers (share a manager)   → reviewed as 'peer'
 * Self-review is intentionally excluded here (the user rates their own Personal
 * Goals card separately). Fail-safe: returns empty buckets on any error.
 */
export async function reviewablePeople(me: {
  id: string;
  managerId: string | null;
}): Promise<ReviewableScope> {
  const empty: ReviewableScope = { manager: [], subordinate: [], peer: [] };
  try {
    const downline = await getDownlineIds(me.id);

    // Peers share the same manager_id (only meaningful if the user HAS a manager).
    const peerIds: string[] = me.managerId
      ? (
          await withRetry(
            () =>
              db
                .select({ id: employees.id })
                .from(employees)
                .where(
                  and(
                    eq(employees.managerId, me.managerId as string),
                    eq(employees.isActive, true),
                  ),
                ),
            { ...RETRY, label: "pms-review-peers" },
          )
        )
          .map((r) => r.id)
          .filter((id) => id !== me.id)
      : [];

    const wanted = new Set<string>([...downline, ...peerIds]);
    if (me.managerId) wanted.add(me.managerId);
    if (wanted.size === 0) return empty;

    const rows = await withRetry(
      () =>
        db
          .select({
            id: employees.id,
            name: employees.name,
            avatarUrl: employees.avatarUrl,
            department: employees.department,
            isActive: employees.isActive,
          })
          .from(employees)
          .where(inArray(employees.id, [...wanted]))
          .orderBy(asc(employees.name)),
      { ...RETRY, label: "pms-review-people" },
    );

    const downlineSet = new Set(downline);
    const peerSet = new Set(peerIds);
    const out: ReviewableScope = { manager: [], subordinate: [], peer: [] };
    for (const r of rows) {
      if (!r.isActive) continue;
      const base = { id: r.id, name: r.name, avatarUrl: r.avatarUrl, department: r.department };
      // Precedence: a person reachable both as report and manager is rare, but
      // resolve to the strongest scope (manager > subordinate > peer).
      if (downlineSet.has(r.id)) out.manager.push({ ...base, relation: "manager" });
      else if (r.id === me.managerId) out.subordinate.push({ ...base, relation: "subordinate" });
      else if (peerSet.has(r.id)) out.peer.push({ ...base, relation: "peer" });
    }
    return out;
  } catch {
    return empty;
  }
}

/** Flatten the scope to a single allow-list of (subjectId, relation) pairs. */
export function flattenReviewable(scope: ReviewableScope): Map<string, ReviewRelation> {
  const m = new Map<string, ReviewRelation>();
  for (const p of [...scope.manager, ...scope.subordinate, ...scope.peer]) m.set(p.id, p.relation);
  return m;
}

/**
 * The signed-in user's existing review of one subject/relation/period, if any.
 * Used to pre-fill the form so a re-open edits rather than duplicates.
 */
export async function getMyReview(
  reviewerId: string,
  subjectId: string,
  relation: ReviewRelation,
  period: string,
): Promise<PmsMonthlyReview | null> {
  const rows = await withRetry(
    () =>
      db
        .select()
        .from(pmsMonthlyReview)
        .where(
          and(
            eq(pmsMonthlyReview.reviewerId, reviewerId),
            eq(pmsMonthlyReview.subjectId, subjectId),
            eq(pmsMonthlyReview.relation, relation),
            eq(pmsMonthlyReview.period, period),
          ),
        )
        .limit(1),
    { ...RETRY, label: "pms-my-review" },
  );
  return rows[0] ?? null;
}

/** Every review the signed-in user has authored this period (for "done" badges). */
export async function listMyAuthoredReviews(
  reviewerId: string,
  period: string,
): Promise<{ subjectId: string; relation: string }[]> {
  return withRetry(
    () =>
      db
        .select({ subjectId: pmsMonthlyReview.subjectId, relation: pmsMonthlyReview.relation })
        .from(pmsMonthlyReview)
        .where(and(eq(pmsMonthlyReview.reviewerId, reviewerId), eq(pmsMonthlyReview.period, period))),
    { ...RETRY, label: "pms-authored-reviews" },
  );
}

/** The user's own Personal (non-work) goals for a period, position-ordered. */
export async function listMyPersonalGoals(
  employeeId: string,
  period: string,
): Promise<PmsPersonalGoal[]> {
  return withRetry(
    () =>
      db
        .select()
        .from(pmsPersonalGoal)
        .where(and(eq(pmsPersonalGoal.employeeId, employeeId), eq(pmsPersonalGoal.period, period)))
        .orderBy(asc(pmsPersonalGoal.position)),
    { ...RETRY, label: "pms-personal-goals" },
  );
}
