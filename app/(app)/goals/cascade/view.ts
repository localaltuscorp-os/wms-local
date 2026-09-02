import "server-only";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees } from "@/db/schema";
import { goalScopeFor } from "@/lib/goals/scope";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import type { RosterMember } from "@/components/goals/cascade/util";

export interface ResolvedView {
  /** People the viewer may see/manage (self + downline, or everyone for admin). */
  roster: RosterMember[];
  /** The employee whose cascade is in view. */
  viewedEmployeeId: string;
  viewedName: string;
  /** Whether the viewer may write the viewed person's goals. */
  canWrite: boolean;
  /** admin / manager over the viewed person (can review-accept). */
  canReview: boolean;
  /** Phase 2 (Option A policy) — the viewer MANAGES the viewed person (they sit
   *  in the viewer's scope and are not the viewer). Feeds `goalPolicy`'s
   *  isManagerOfOwner; admins get their structure rights via isAdmin instead. */
  managesViewed: boolean;
}

/**
 * Resolve the visible roster + which employee's cascade to show, honouring the
 * weekly-goals org-chart scope. `empParam` (from `?emp=`) switches to a downline
 * member; ignored when outside scope.
 */
export async function resolveGoalsView(
  me: { id: string; name: string; isAdmin: boolean },
  isAdmin: boolean,
  empParam?: string,
): Promise<ResolvedView> {
  const scope = await goalScopeFor({ id: me.id, isAdmin });

  const rows = scope.all
    ? await db
        .select({ id: employees.id, name: employees.name })
        .from(employees)
        .where(eq(employees.isActive, true))
        .orderBy(asc(employees.name))
    : await db
        .select({ id: employees.id, name: employees.name })
        .from(employees)
        .where(and(inArray(employees.id, scope.ids), eq(employees.isActive, true)))
        .orderBy(asc(employees.name));

  const roster: RosterMember[] = rows;

  let viewedEmployeeId = me.id;
  if (empParam && (scope.all || scope.ids.includes(empParam))) viewedEmployeeId = empParam;

  const viewedName = roster.find((r) => r.id === viewedEmployeeId)?.name ?? me.name;
  const canWrite = scope.all || viewedEmployeeId === me.id || scope.ids.includes(viewedEmployeeId);
  const canReview = isAdmin || (viewedEmployeeId !== me.id && (scope.all || scope.ids.includes(viewedEmployeeId)));
  const managesViewed =
    viewedEmployeeId !== me.id && (scope.all || scope.ids.includes(viewedEmployeeId));

  return { roster, viewedEmployeeId, viewedName, canWrite, canReview, managesViewed };
}

/**
 * Resolve an `evidence_url` into a clickable href: `bucket:<path>` → a
 * short-lived signed URL from the private documents bucket; a plain http(s)
 * URL passes through. Returns null when it can't be signed.
 */
export async function signEvidence(evidenceUrl: string | null): Promise<string | null> {
  if (!evidenceUrl) return null;
  if (/^https?:\/\//i.test(evidenceUrl)) return evidenceUrl;
  if (evidenceUrl.startsWith("bucket:")) {
    const path = evidenceUrl.slice("bucket:".length);
    try {
      const { data } = await getSupabaseAdmin()
        .storage.from(DOCUMENTS_BUCKET)
        .createSignedUrl(path, 60 * 30);
      return data?.signedUrl ?? null;
    } catch {
      return null;
    }
  }
  return null;
}
