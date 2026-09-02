"use server";

/**
 * Goals canvas Phase 7 — the LAZY DETAIL layer (design §3.3 + §4.4).
 *
 * ONE batched `goalDetailBundle(node)` server action loads everything the LEFT
 * panel's rich sections need — links · comments · attachments · dependencies ·
 * activity · review history — in a single `Promise.all` under the goals READ
 * budget. It is called ON PEEK/EXPAND only (never eager-joined into the spine
 * query) and cached client-side behind the app QueryClientProvider with
 * per-goalId keys (components/goals/canvas/collab-panel.tsx), so drilling back
 * to a goal does NOT refetch.
 *
 * UNAPPLIED-MIGRATION SAFETY: goal_links / goal_comments / goal_dependencies
 * and the documents.goal_id/weekly_goal_id columns arrive with migration 0142,
 * which may not be applied yet. Every read of those relations is individually
 * guarded (try/catch → empty fallback + `collabReady:false`), and every write
 * catches the missing-relation error with an honest message. Nothing here can
 * 500 a production surface — and none of it renders unless GOALS_CANVAS_ON.
 *
 * Mutations follow the house pipeline: requireGoalsAccess → rateLimitOrError →
 * zod → load+authorize the node row → write → return the row. Activity events
 * go to the event_log outbox best-effort via logGoalActivity (§4.4 item 6).
 */

import { and, desc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  calendarEvents,
  dccKpiItems,
  departments,
  documents,
  employees,
  eventLog,
  goalComments,
  goalDependencies,
  goalLinks,
  goalReviews,
  goals,
  incentiveCatalog,
  projectNodes,
  tasks,
  weeklyGoals,
} from "@/db/schema";
import { withRetry } from "@/lib/db/with-timeout";
import { requireGoalsAccess } from "@/lib/goals/access";
import { rateLimitOrError } from "@/lib/rate-limit";
import { loadWritableGoalRow, goalScopeFor, canManageGoalFor } from "@/lib/goals/scope";
import { logGoalActivity } from "@/lib/goals/activity";
import { GoalEventTypes } from "@/lib/events/types";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import { signEvidence } from "./view";

/* ------------------------------------------------------------------ */
/* Result + DTO shapes (client imports these with `import type`)       */
/* ------------------------------------------------------------------ */

type ActionOk<T> = T extends undefined ? { ok: true } : { ok: true } & T;
type ActionResult<T = undefined> = ActionOk<T> | { ok: false; error: string };

export type NodeKind = "cascade" | "weekly";

export type LinkKind = "task" | "project" | "kpi" | "incentive" | "calendar" | "department";

export interface DetailLink {
  id: string;
  kind: LinkKind;
  refTable: string | null;
  refId: string | null;
  label: string;
  url: string | null;
  createdByName: string | null;
  createdAt: string;
}

export interface DetailComment {
  id: string;
  parentId: string | null;
  authorId: string | null;
  authorName: string | null;
  body: string;
  editedAt: string | null;
  createdAt: string;
}

export interface DetailDependency {
  id: string;
  kind: "depends_on" | "blocked_by";
  label: string;
  onGoalId: string | null;
  onWeeklyGoalId: string | null;
  resolvedAt: string | null;
  createdAt: string;
}

export interface DetailAttachment {
  id: string;
  title: string;
  mimeType: string | null;
  sizeBytes: number | null;
  /** 30-min signed URL (signEvidence semantics) — null when signing failed. */
  url: string | null;
  uploadedById: string | null;
  uploadedByName: string | null;
  createdAt: string;
}

export interface DetailActivity {
  seq: number;
  eventType: string;
  payload: Record<string, unknown>;
  actorName: string | null;
  occurredAt: string;
}

export interface DetailReview {
  id: string;
  selfPct: number | null;
  managerPct: number | null;
  note: string | null;
  reviewerName: string | null;
  createdAt: string;
}

export interface GoalDetailBundle {
  /** False when the 0142 relations are missing (migration not applied yet). */
  collabReady: boolean;
  /** The CALLER (not the viewed person) — gates comment edit/delete affordances
   *  client-side; the actions re-enforce server-side regardless. */
  viewer: { id: string; isAdmin: boolean };
  links: DetailLink[];
  comments: DetailComment[];
  attachments: DetailAttachment[];
  dependencies: DetailDependency[];
  activity: DetailActivity[];
  reviews: DetailReview[];
  /** The legacy single evidence slot, already signed (kept alongside the gallery). */
  legacyEvidenceUrl: string | null;
}

/* ------------------------------------------------------------------ */
/* Shared helpers                                                      */
/* ------------------------------------------------------------------ */

/** Per-attempt read budget (matches lib/goals/queries.ts): short first try,
 *  longer second, on a fresh pooled connection. */
const READ_BUDGET = [6000, 12000] as const;

const NodeRefSchema = z.object({
  id: z.string().uuid(),
  kind: z.enum(["cascade", "weekly"]),
});
type NodeRef = z.infer<typeof NodeRefSchema>;

function firstError(err: z.ZodError): string {
  return err.issues[0]?.message ?? "Invalid input";
}

const iso = (d: Date | null | undefined): string | null => (d ? d.toISOString() : null);

const MIGRATION_HINT =
  "Collaboration isn't provisioned yet (migration 0142 pending) — ask an admin to apply it.";

interface NodeCore {
  id: string;
  employeeId: string;
  evidenceUrl: string | null;
  teamInvolved: Array<{ employeeId?: string; name?: string }> | null;
}

/** Load the node (cascade `goals` row or weekly leaf) with EXPLICIT columns. */
async function loadNodeCore(ref: NodeRef): Promise<NodeCore | null> {
  if (ref.kind === "cascade") {
    const [row] = await db
      .select({
        id: goals.id,
        employeeId: goals.employeeId,
        evidenceUrl: goals.evidenceUrl,
        teamInvolved: goals.teamInvolved,
      })
      .from(goals)
      .where(eq(goals.id, ref.id))
      .limit(1);
    return row ?? null;
  }
  const [row] = await db
    .select({
      id: weeklyGoals.id,
      employeeId: weeklyGoals.employeeId,
      evidenceUrl: weeklyGoals.evidenceUrl,
      teamInvolved: weeklyGoals.teamInvolved,
    })
    .from(weeklyGoals)
    .where(eq(weeklyGoals.id, ref.id))
    .limit(1);
  return row ?? null;
}

/**
 * READ authority: owner · admin · manager over the owner (org-chart scope) ·
 * or named in team_involved (the same audience getAssignedGoals shows the goal
 * to). Mirrors resolveGoalsView — never trusts a client-passed owner id.
 */
async function authorizeRead(
  node: NodeCore,
  me: { id: string; isAdmin: boolean },
): Promise<boolean> {
  if (me.isAdmin || node.employeeId === me.id) return true;
  if ((node.teamInvolved ?? []).some((t) => t.employeeId === me.id)) return true;
  const scope = await goalScopeFor(me);
  return scope.all || scope.ids.includes(node.employeeId);
}

/** WRITE authority — cascade reuses loadWritableGoalRow; weekly mirrors the
 *  moveWeeklyToWeek owner/manager check (ritual stamps stay on weekly_goals). */
async function authorizeWrite(
  ref: NodeRef,
  me: { id: string; isAdmin: boolean },
): Promise<{ ok: true; node: NodeCore } | { ok: false; error: string }> {
  if (ref.kind === "cascade") {
    const loaded = await loadWritableGoalRow(ref.id, me);
    if (!loaded.ok) return loaded;
    return {
      ok: true,
      node: {
        id: loaded.row.id,
        employeeId: loaded.row.employeeId,
        evidenceUrl: loaded.row.evidenceUrl,
        teamInvolved: loaded.row.teamInvolved,
      },
    };
  }
  const node = await loadNodeCore(ref);
  if (!node) return { ok: false, error: "Goal not found" };
  if (node.employeeId !== me.id && !me.isAdmin) {
    const scope = await goalScopeFor(me);
    if (!canManageGoalFor(scope, node.employeeId)) {
      return { ok: false, error: "That goal isn't yours to change." };
    }
  }
  return { ok: true, node };
}

/* ------------------------------------------------------------------ */
/* Attachments-only — lighter than the full bundle (§3.3) for surfaces  */
/* that just need the file gallery (e.g. an inline Notes-column preview) */
/* and would otherwise pull links/comments/deps/activity/reviews for    */
/* nothing. Same query + same signed-URL batching as goalDetailBundle.  */
/* ------------------------------------------------------------------ */

export async function listGoalAttachments(
  input: NodeRef,
): Promise<ActionResult<{ attachments: DetailAttachment[] }>> {
  const { me, isAdmin } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "read");
  if (limited) return limited;
  const parsed = NodeRefSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const ref = parsed.data;

  const node = await loadNodeCore(ref);
  if (!node) return { ok: false, error: "Goal not found" };
  if (!(await authorizeRead(node, { id: me.id, isAdmin }))) {
    return { ok: false, error: "You can't view that goal." };
  }

  let attRows: {
    id: string;
    title: string;
    mimeType: string | null;
    sizeBytes: number | null;
    storagePath: string;
    uploadedById: string | null;
    uploadedByName: string | null;
    createdAt: Date;
  }[];
  try {
    attRows = await withRetry(
      () =>
        db
          .select({
            id: documents.id,
            title: documents.title,
            mimeType: documents.mimeType,
            sizeBytes: documents.sizeBytes,
            storagePath: documents.storagePath,
            uploadedById: documents.uploadedById,
            uploadedByName: employees.name,
            createdAt: documents.createdAt,
          })
          .from(documents)
          .leftJoin(employees, eq(employees.id, documents.uploadedById))
          .where(ref.kind === "cascade" ? eq(documents.goalId, ref.id) : eq(documents.weeklyGoalId, ref.id))
          .orderBy(desc(documents.createdAt))
          .limit(60),
      { timeoutMs: [...READ_BUDGET], label: "goals.detail.attachments-only" },
    );
  } catch {
    return { ok: true, attachments: [] }; // 0142 unapplied — same graceful fallback as the bundle
  }

  const signedByPath = new Map<string, string>();
  if (attRows.length > 0) {
    try {
      const { data } = await getSupabaseAdmin()
        .storage.from(DOCUMENTS_BUCKET)
        .createSignedUrls(
          attRows.map((a) => a.storagePath),
          60 * 30,
        );
      for (const entry of data ?? []) {
        if (entry.signedUrl && entry.path) signedByPath.set(entry.path, entry.signedUrl);
      }
    } catch {
      // Unsigned entries render with a "couldn't sign" state.
    }
  }

  return {
    ok: true,
    attachments: attRows.map((a) => ({
      id: a.id,
      title: a.title,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
      url: signedByPath.get(a.storagePath) ?? null,
      uploadedById: a.uploadedById,
      uploadedByName: a.uploadedByName,
      createdAt: a.createdAt.toISOString(),
    })),
  };
}

/* ------------------------------------------------------------------ */
/* THE batched lazy bundle (design §3.3)                               */
/* ------------------------------------------------------------------ */

export async function goalDetailBundle(
  input: NodeRef,
): Promise<ActionResult<{ bundle: GoalDetailBundle }>> {
  const { me, isAdmin } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "read");
  if (limited) return limited;
  const parsed = NodeRefSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const ref = parsed.data;

  const node = await loadNodeCore(ref);
  if (!node) return { ok: false, error: "Goal not found" };
  if (!(await authorizeRead(node, { id: me.id, isAdmin }))) {
    return { ok: false, error: "You can't view that goal." };
  }

  // Guarded-read tracker: any missing-relation error flips collabReady false
  // (the 0142-unapplied case) without failing the whole bundle.
  const ready = { ok: true };
  const guarded = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn();
    } catch {
      ready.ok = false;
      return fallback;
    }
  };
  // Existing relations (event_log, goal_reviews) — a transient failure there
  // shouldn't kill the bundle either, but it must not flip collabReady.
  const soft = async <T>(fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn();
    } catch {
      return fallback;
    }
  };

  // ONE parallel batch — never a query-per-link (design §3.3). Each leg runs
  // under withRetry + the goals READ budget; guarded legs additionally absorb
  // the missing-relation (0142-unapplied) case.
  const [links, comments, deps, attRows, activity, reviews, legacyEvidenceUrl] =
    await Promise.all([
      guarded(
        () =>
          withRetry(
            () =>
              db
                .select({
                  id: goalLinks.id,
                  kind: goalLinks.kind,
                  refTable: goalLinks.refTable,
                  refId: goalLinks.refId,
                  label: goalLinks.label,
                  meta: goalLinks.meta,
                  createdAt: goalLinks.createdAt,
                  createdByName: employees.name,
                })
                .from(goalLinks)
                .leftJoin(employees, eq(employees.id, goalLinks.createdById))
                .where(
                  ref.kind === "cascade"
                    ? eq(goalLinks.goalId, ref.id)
                    : eq(goalLinks.weeklyGoalId, ref.id),
                )
                .orderBy(desc(goalLinks.createdAt))
                .limit(60),
            { timeoutMs: [...READ_BUDGET], label: "goals.detail.links" },
          ),
        [],
      ),
      guarded(
        () =>
          withRetry(
            () =>
              db
                .select({
                  id: goalComments.id,
                  parentId: goalComments.parentId,
                  authorId: goalComments.authorId,
                  authorName: employees.name,
                  body: goalComments.body,
                  editedAt: goalComments.editedAt,
                  createdAt: goalComments.createdAt,
                })
                .from(goalComments)
                .leftJoin(employees, eq(employees.id, goalComments.authorId))
                .where(
                  ref.kind === "cascade"
                    ? eq(goalComments.goalId, ref.id)
                    : eq(goalComments.weeklyGoalId, ref.id),
                )
                .orderBy(goalComments.createdAt)
                .limit(200),
            { timeoutMs: [...READ_BUDGET], label: "goals.detail.comments" },
          ),
        [],
      ),
      guarded(
        () =>
          withRetry(
            () =>
              db
                .select({
                  id: goalDependencies.id,
                  kind: goalDependencies.kind,
                  label: goalDependencies.label,
                  onGoalId: goalDependencies.onGoalId,
                  onWeeklyGoalId: goalDependencies.onWeeklyGoalId,
                  resolvedAt: goalDependencies.resolvedAt,
                  createdAt: goalDependencies.createdAt,
                })
                .from(goalDependencies)
                .where(
                  ref.kind === "cascade"
                    ? eq(goalDependencies.goalId, ref.id)
                    : eq(goalDependencies.weeklyGoalId, ref.id),
                )
                .orderBy(desc(goalDependencies.createdAt))
                .limit(60),
            { timeoutMs: [...READ_BUDGET], label: "goals.detail.deps" },
          ),
        [],
      ),
      guarded(
        () =>
          withRetry(
            () =>
              db
                .select({
                  id: documents.id,
                  title: documents.title,
                  mimeType: documents.mimeType,
                  sizeBytes: documents.sizeBytes,
                  storagePath: documents.storagePath,
                  uploadedById: documents.uploadedById,
                  uploadedByName: employees.name,
                  createdAt: documents.createdAt,
                })
                .from(documents)
                .leftJoin(employees, eq(employees.id, documents.uploadedById))
                .where(
                  ref.kind === "cascade"
                    ? eq(documents.goalId, ref.id)
                    : eq(documents.weeklyGoalId, ref.id),
                )
                .orderBy(desc(documents.createdAt))
                .limit(60),
            { timeoutMs: [...READ_BUDGET], label: "goals.detail.attachments" },
          ),
        [],
      ),
      soft(
        () =>
          withRetry(
            () =>
              db
                .select({
                  seq: eventLog.seq,
                  eventType: eventLog.eventType,
                  payload: eventLog.payload,
                  actorName: employees.name,
                  occurredAt: eventLog.occurredAt,
                })
                .from(eventLog)
                .leftJoin(employees, eq(employees.id, eventLog.actorId))
                .where(and(eq(eventLog.aggregateType, "goal"), eq(eventLog.aggregateId, ref.id)))
                .orderBy(desc(eventLog.seq))
                .limit(40),
            { timeoutMs: [...READ_BUDGET], label: "goals.detail.activity" },
          ),
        [],
      ),
      soft(
        () =>
          withRetry(
            () =>
              db
                .select({
                  id: goalReviews.id,
                  selfPct: goalReviews.selfPct,
                  managerPct: goalReviews.managerPct,
                  note: goalReviews.note,
                  reviewerName: employees.name,
                  createdAt: goalReviews.createdAt,
                })
                .from(goalReviews)
                .leftJoin(employees, eq(employees.id, goalReviews.reviewerId))
                .where(
                  ref.kind === "cascade"
                    ? eq(goalReviews.goalId, ref.id)
                    : eq(goalReviews.weeklyGoalId, ref.id),
                )
                .orderBy(desc(goalReviews.createdAt))
                .limit(20),
            { timeoutMs: [...READ_BUDGET], label: "goals.detail.reviews" },
          ),
        [],
      ),
      soft(() => signEvidence(node.evidenceUrl), null),
    ]);

  // Sign the gallery in ONE storage call (createSignedUrls, not per-file).
  const signedByPath = new Map<string, string>();
  if (attRows.length > 0) {
    try {
      const { data } = await getSupabaseAdmin()
        .storage.from(DOCUMENTS_BUCKET)
        .createSignedUrls(
          attRows.map((a) => a.storagePath),
          60 * 30,
        );
      for (const entry of data ?? []) {
        if (entry.signedUrl && entry.path) signedByPath.set(entry.path, entry.signedUrl);
      }
    } catch {
      // Unsigned gallery entries render with a "couldn't sign" state.
    }
  }

  const bundle: GoalDetailBundle = {
    collabReady: ready.ok,
    viewer: { id: me.id, isAdmin },
    links: links.map((l) => ({
      id: l.id,
      kind: l.kind,
      refTable: l.refTable,
      refId: l.refId,
      label: l.label,
      url: l.meta?.url ?? null,
      createdByName: l.createdByName,
      createdAt: l.createdAt.toISOString(),
    })),
    comments: comments.map((c) => ({
      id: c.id,
      parentId: c.parentId,
      authorId: c.authorId,
      authorName: c.authorName,
      body: c.body,
      editedAt: iso(c.editedAt),
      createdAt: c.createdAt.toISOString(),
    })),
    attachments: attRows.map((a) => ({
      id: a.id,
      title: a.title,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
      url: signedByPath.get(a.storagePath) ?? null,
      uploadedById: a.uploadedById,
      uploadedByName: a.uploadedByName,
      createdAt: a.createdAt.toISOString(),
    })),
    dependencies: deps.map((d) => ({
      id: d.id,
      kind: d.kind,
      label: d.label,
      onGoalId: d.onGoalId,
      onWeeklyGoalId: d.onWeeklyGoalId,
      resolvedAt: iso(d.resolvedAt),
      createdAt: d.createdAt.toISOString(),
    })),
    activity: activity.map((a) => ({
      seq: a.seq,
      eventType: a.eventType,
      payload: (a.payload ?? {}) as Record<string, unknown>,
      actorName: a.actorName,
      occurredAt: a.occurredAt.toISOString(),
    })),
    reviews: reviews.map((r) => ({
      id: r.id,
      selfPct: r.selfPct,
      managerPct: r.managerPct,
      note: r.note,
      reviewerName: r.reviewerName,
      createdAt: r.createdAt.toISOString(),
    })),
    legacyEvidenceUrl,
  };

  return { ok: true, bundle };
}

/* ------------------------------------------------------------------ */
/* Links                                                               */
/* ------------------------------------------------------------------ */

const LINK_KINDS = ["task", "project", "kpi", "incentive", "calendar", "department"] as const;

const AddLinkSchema = z.object({
  node: NodeRefSchema,
  kind: z.enum(LINK_KINDS),
  refId: z.string().uuid().nullish(),
  label: z.string().max(200).nullish(),
  url: z.string().max(600).nullish(),
});

/** Snapshot the display label for a linked row so the bundle never joins six
 *  ref tables (design §3.3 read-budget rule). One bounded lookup per ADD. */
async function snapshotLabel(kind: LinkKind, refId: string): Promise<{ table: string; label: string } | null> {
  try {
    switch (kind) {
      case "task": {
        const [r] = await db.select({ v: tasks.title }).from(tasks).where(eq(tasks.id, refId)).limit(1);
        return r ? { table: "tasks", label: r.v } : null;
      }
      case "project": {
        const [r] = await db.select({ v: projectNodes.name }).from(projectNodes).where(eq(projectNodes.id, refId)).limit(1);
        return r ? { table: "project_nodes", label: r.v } : null;
      }
      case "kpi": {
        const [r] = await db.select({ v: dccKpiItems.title }).from(dccKpiItems).where(eq(dccKpiItems.id, refId)).limit(1);
        return r ? { table: "dcc_kpi_items", label: r.v } : null;
      }
      case "incentive": {
        const [r] = await db.select({ v: incentiveCatalog.name }).from(incentiveCatalog).where(eq(incentiveCatalog.id, refId)).limit(1);
        return r ? { table: "incentive_catalog", label: r.v } : null;
      }
      case "calendar": {
        const [r] = await db.select({ v: calendarEvents.title }).from(calendarEvents).where(eq(calendarEvents.id, refId)).limit(1);
        return r ? { table: "calendar_events", label: r.v } : null;
      }
      case "department": {
        const [r] = await db.select({ v: departments.name }).from(departments).where(eq(departments.id, refId)).limit(1);
        return r ? { table: "departments", label: r.v } : null;
      }
    }
  } catch {
    return null;
  }
  return null;
}

export async function addGoalLink(
  input: z.infer<typeof AddLinkSchema>,
): Promise<ActionResult<{ link: DetailLink }>> {
  const { me, isAdmin } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = AddLinkSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const d = parsed.data;

  const auth = await authorizeWrite(d.node, { id: me.id, isAdmin });
  if (!auth.ok) return auth;

  let refTable: string | null = null;
  let label = (d.label ?? "").trim();
  if (d.refId) {
    const snap = await snapshotLabel(d.kind, d.refId);
    if (!snap) return { ok: false, error: "That linked item doesn't exist." };
    refTable = snap.table;
    if (!label) label = snap.label;
  }
  if (!label) return { ok: false, error: "Give the link a label." };

  const url = d.url?.trim()
    ? /^https?:\/\//i.test(d.url.trim())
      ? d.url.trim()
      : `https://${d.url.trim()}`
    : null;

  try {
    const [row] = await db
      .insert(goalLinks)
      .values({
        goalId: d.node.kind === "cascade" ? d.node.id : null,
        weeklyGoalId: d.node.kind === "weekly" ? d.node.id : null,
        kind: d.kind,
        refTable,
        refId: d.refId ?? null,
        label,
        meta: url ? { url } : {},
        createdById: me.id,
      })
      .returning();
    if (!row) return { ok: false, error: "Insert returned no row" };

    void logGoalActivity(d.node.id, GoalEventTypes.Linked, {
      employeeId: auth.node.employeeId,
      goalKind: d.node.kind,
      detail: `${d.kind}: ${label}`,
    }, me.id);

    return {
      ok: true,
      link: {
        id: row.id,
        kind: row.kind,
        refTable: row.refTable,
        refId: row.refId,
        label: row.label,
        url: row.meta?.url ?? null,
        createdByName: me.name,
        createdAt: row.createdAt.toISOString(),
      },
    };
  } catch {
    return { ok: false, error: MIGRATION_HINT };
  }
}

export async function removeGoalLink(input: { id: string }): Promise<ActionResult> {
  const { me, isAdmin } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  try {
    const [row] = await db
      .select({ id: goalLinks.id, goalId: goalLinks.goalId, weeklyGoalId: goalLinks.weeklyGoalId, kind: goalLinks.kind, label: goalLinks.label })
      .from(goalLinks)
      .where(eq(goalLinks.id, parsed.data.id))
      .limit(1);
    if (!row) return { ok: true }; // already gone — idempotent
    const ref: NodeRef = row.goalId
      ? { id: row.goalId, kind: "cascade" }
      : { id: row.weeklyGoalId!, kind: "weekly" };
    const auth = await authorizeWrite(ref, { id: me.id, isAdmin });
    if (!auth.ok) return auth;

    await db.delete(goalLinks).where(eq(goalLinks.id, parsed.data.id));
    void logGoalActivity(ref.id, GoalEventTypes.Unlinked, {
      employeeId: auth.node.employeeId,
      goalKind: ref.kind,
      detail: `${row.kind}: ${row.label}`,
    }, me.id);
    return { ok: true };
  } catch {
    return { ok: false, error: MIGRATION_HINT };
  }
}

/* ------------------------------------------------------------------ */
/* Comments (threaded, 15-min author edit window — task pattern)       */
/* ------------------------------------------------------------------ */

const COMMENT_EDIT_WINDOW_MS = 15 * 60 * 1000;

const AddCommentSchema = z.object({
  node: NodeRefSchema,
  parentId: z.string().uuid().nullish(),
  body: z.string().min(1, "Say something first.").max(4000),
});

export async function addGoalComment(
  input: z.infer<typeof AddCommentSchema>,
): Promise<ActionResult<{ comment: DetailComment }>> {
  const { me, isAdmin } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = AddCommentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const d = parsed.data;

  // Comments need READ authority only — a manager/teammate discusses a goal
  // they can see, even where they can't edit its fields.
  const node = await loadNodeCore(d.node);
  if (!node) return { ok: false, error: "Goal not found" };
  if (!(await authorizeRead(node, { id: me.id, isAdmin }))) {
    return { ok: false, error: "You can't comment on that goal." };
  }

  try {
    const [row] = await db
      .insert(goalComments)
      .values({
        goalId: d.node.kind === "cascade" ? d.node.id : null,
        weeklyGoalId: d.node.kind === "weekly" ? d.node.id : null,
        parentId: d.parentId ?? null,
        authorId: me.id,
        body: d.body.trim(),
      })
      .returning();
    if (!row) return { ok: false, error: "Insert returned no row" };

    void logGoalActivity(d.node.id, GoalEventTypes.Commented, {
      employeeId: node.employeeId,
      goalKind: d.node.kind,
      detail: d.body.trim().slice(0, 140),
    }, me.id);

    return {
      ok: true,
      comment: {
        id: row.id,
        parentId: row.parentId,
        authorId: row.authorId,
        authorName: me.name,
        body: row.body,
        editedAt: null,
        createdAt: row.createdAt.toISOString(),
      },
    };
  } catch {
    return { ok: false, error: MIGRATION_HINT };
  }
}

const EditCommentSchema = z.object({
  id: z.string().uuid(),
  body: z.string().min(1).max(4000),
});

export async function editGoalComment(
  input: z.infer<typeof EditCommentSchema>,
): Promise<ActionResult<{ comment: DetailComment }>> {
  const { me, isAdmin } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = EditCommentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  try {
    const [row] = await db
      .select()
      .from(goalComments)
      .where(eq(goalComments.id, parsed.data.id))
      .limit(1);
    if (!row) return { ok: false, error: "Comment not found" };
    const inWindow = Date.now() - row.createdAt.getTime() <= COMMENT_EDIT_WINDOW_MS;
    if (!(isAdmin || (row.authorId === me.id && inWindow))) {
      return { ok: false, error: "The 15-minute edit window has passed." };
    }
    const [updated] = await db
      .update(goalComments)
      .set({ body: parsed.data.body.trim(), editedAt: new Date() })
      .where(eq(goalComments.id, parsed.data.id))
      .returning();
    if (!updated) return { ok: false, error: "Comment not found" };
    return {
      ok: true,
      comment: {
        id: updated.id,
        parentId: updated.parentId,
        authorId: updated.authorId,
        authorName: me.name,
        body: updated.body,
        editedAt: iso(updated.editedAt),
        createdAt: updated.createdAt.toISOString(),
      },
    };
  } catch {
    return { ok: false, error: MIGRATION_HINT };
  }
}

export async function deleteGoalComment(input: { id: string }): Promise<ActionResult> {
  const { me, isAdmin } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  try {
    const [row] = await db
      .select({ id: goalComments.id, authorId: goalComments.authorId, createdAt: goalComments.createdAt })
      .from(goalComments)
      .where(eq(goalComments.id, parsed.data.id))
      .limit(1);
    if (!row) return { ok: true };
    const inWindow = Date.now() - row.createdAt.getTime() <= COMMENT_EDIT_WINDOW_MS;
    if (!(isAdmin || (row.authorId === me.id && inWindow))) {
      return { ok: false, error: "Only the author (within 15 min) or an admin can delete." };
    }
    await db.delete(goalComments).where(eq(goalComments.id, parsed.data.id));
    return { ok: true };
  } catch {
    return { ok: false, error: MIGRATION_HINT };
  }
}

/* ------------------------------------------------------------------ */
/* Dependencies + blockers                                             */
/* ------------------------------------------------------------------ */

const AddDependencySchema = z.object({
  node: NodeRefSchema,
  kind: z.enum(["depends_on", "blocked_by"]),
  /** Another goal on the canvas (cascade or weekly)… */
  target: NodeRefSchema.nullish(),
  /** …or a free-text external blocker. */
  label: z.string().max(300).nullish(),
});

export async function addGoalDependency(
  input: z.infer<typeof AddDependencySchema>,
): Promise<ActionResult<{ dependency: DetailDependency }>> {
  const { me, isAdmin } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = AddDependencySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };
  const d = parsed.data;

  const auth = await authorizeWrite(d.node, { id: me.id, isAdmin });
  if (!auth.ok) return auth;

  let label = (d.label ?? "").trim();
  if (d.target) {
    if (d.target.id === d.node.id && d.target.kind === d.node.kind) {
      return { ok: false, error: "A goal can't depend on itself." };
    }
    // The target must be READ-visible to the caller (their own canvas).
    const targetNode = await loadNodeCore(d.target);
    if (!targetNode) return { ok: false, error: "That goal doesn't exist." };
    if (!(await authorizeRead(targetNode, { id: me.id, isAdmin }))) {
      return { ok: false, error: "You can't reference that goal." };
    }
    if (!label) {
      // Snapshot the target title for the display label.
      if (d.target.kind === "cascade") {
        const [t] = await db.select({ v: goals.title }).from(goals).where(eq(goals.id, d.target.id)).limit(1);
        label = t?.v ?? "Goal";
      } else {
        const [t] = await db
          .select({ td: weeklyGoals.targetDone, s: weeklyGoals.subject })
          .from(weeklyGoals)
          .where(eq(weeklyGoals.id, d.target.id))
          .limit(1);
        label = t?.td?.trim() || t?.s?.trim() || "Weekly goal";
      }
    }
  }
  if (!label) return { ok: false, error: "Name the blocker or pick a goal." };

  try {
    const [row] = await db
      .insert(goalDependencies)
      .values({
        goalId: d.node.kind === "cascade" ? d.node.id : null,
        weeklyGoalId: d.node.kind === "weekly" ? d.node.id : null,
        onGoalId: d.target?.kind === "cascade" ? d.target.id : null,
        onWeeklyGoalId: d.target?.kind === "weekly" ? d.target.id : null,
        kind: d.kind,
        label,
        createdById: me.id,
      })
      .returning();
    if (!row) return { ok: false, error: "Insert returned no row" };

    void logGoalActivity(d.node.id, GoalEventTypes.DependencyAdded, {
      employeeId: auth.node.employeeId,
      goalKind: d.node.kind,
      detail: `${d.kind === "blocked_by" ? "blocked by" : "depends on"} ${label}`,
    }, me.id);

    return {
      ok: true,
      dependency: {
        id: row.id,
        kind: row.kind,
        label: row.label,
        onGoalId: row.onGoalId,
        onWeeklyGoalId: row.onWeeklyGoalId,
        resolvedAt: null,
        createdAt: row.createdAt.toISOString(),
      },
    };
  } catch {
    return { ok: false, error: MIGRATION_HINT };
  }
}

const ResolveDependencySchema = z.object({ id: z.string().uuid(), resolved: z.boolean() });

export async function resolveGoalDependency(
  input: z.infer<typeof ResolveDependencySchema>,
): Promise<ActionResult<{ dependency: DetailDependency }>> {
  const { me, isAdmin } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = ResolveDependencySchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  try {
    const [row] = await db
      .select({ id: goalDependencies.id, goalId: goalDependencies.goalId, weeklyGoalId: goalDependencies.weeklyGoalId, label: goalDependencies.label })
      .from(goalDependencies)
      .where(eq(goalDependencies.id, parsed.data.id))
      .limit(1);
    if (!row) return { ok: false, error: "Dependency not found" };
    const ref: NodeRef = row.goalId
      ? { id: row.goalId, kind: "cascade" }
      : { id: row.weeklyGoalId!, kind: "weekly" };
    const auth = await authorizeWrite(ref, { id: me.id, isAdmin });
    if (!auth.ok) return auth;

    const [updated] = await db
      .update(goalDependencies)
      .set({ resolvedAt: parsed.data.resolved ? new Date() : null })
      .where(eq(goalDependencies.id, parsed.data.id))
      .returning();
    if (!updated) return { ok: false, error: "Dependency not found" };
    if (parsed.data.resolved) {
      void logGoalActivity(ref.id, GoalEventTypes.DependencyResolved, {
        employeeId: auth.node.employeeId,
        goalKind: ref.kind,
        detail: row.label,
      }, me.id);
    }
    return {
      ok: true,
      dependency: {
        id: updated.id,
        kind: updated.kind,
        label: updated.label,
        onGoalId: updated.onGoalId,
        onWeeklyGoalId: updated.onWeeklyGoalId,
        resolvedAt: iso(updated.resolvedAt),
        createdAt: updated.createdAt.toISOString(),
      },
    };
  } catch {
    return { ok: false, error: MIGRATION_HINT };
  }
}

export async function removeGoalDependency(input: { id: string }): Promise<ActionResult> {
  const { me, isAdmin } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  try {
    const [row] = await db
      .select({ id: goalDependencies.id, goalId: goalDependencies.goalId, weeklyGoalId: goalDependencies.weeklyGoalId })
      .from(goalDependencies)
      .where(eq(goalDependencies.id, parsed.data.id))
      .limit(1);
    if (!row) return { ok: true };
    const ref: NodeRef = row.goalId
      ? { id: row.goalId, kind: "cascade" }
      : { id: row.weeklyGoalId!, kind: "weekly" };
    const auth = await authorizeWrite(ref, { id: me.id, isAdmin });
    if (!auth.ok) return auth;
    await db.delete(goalDependencies).where(eq(goalDependencies.id, parsed.data.id));
    return { ok: true };
  } catch {
    return { ok: false, error: MIGRATION_HINT };
  }
}

/* ------------------------------------------------------------------ */
/* Attachments — documents-table gallery (uploadGoalEvidence semantics) */
/* ------------------------------------------------------------------ */

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;
const BLOCKED_EXT = /\.(html?|htm|svg|xht|xhtml|js|mjs|exe|bat|cmd|sh|com|scr)$/i;

function safeName(name: string): string {
  return name.replace(/[^\w.\-]+/g, "_").slice(0, 120) || "attachment";
}

/**
 * Upload one file into the goal's evidence GALLERY: private `documents` bucket
 * (same storage + signed-URL read path as uploadGoalEvidence) + a `documents`
 * catalogue row pointed at the goal via the 0142 FK. FormData: nodeId,
 * nodeKind, file.
 */
export async function uploadGoalAttachment(
  form: FormData,
): Promise<ActionResult<{ attachment: DetailAttachment }>> {
  const { me, isAdmin } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const refParsed = NodeRefSchema.safeParse({
    id: String(form.get("nodeId") ?? ""),
    kind: String(form.get("nodeKind") ?? ""),
  });
  if (!refParsed.success) return { ok: false, error: "Invalid goal" };
  const ref = refParsed.data;

  const auth = await authorizeWrite(ref, { id: me.id, isAdmin });
  if (!auth.ok) return auth;

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Pick a file first." };
  }
  if (file.size > MAX_ATTACHMENT_BYTES) return { ok: false, error: "File exceeds 25 MB." };
  if (BLOCKED_EXT.test(file.name)) return { ok: false, error: "That file type isn't allowed." };

  const path = `goals/evidence/${auth.node.employeeId}/${crypto.randomUUID()}/${safeName(file.name)}`;
  const admin = getSupabaseAdmin();
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await admin.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, buffer, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
  if (upErr) return { ok: false, error: `Upload failed: ${upErr.message}` };

  try {
    const [row] = await db
      .insert(documents)
      .values({
        title: safeName(file.name),
        storagePath: path,
        mimeType: file.type || null,
        sizeBytes: file.size,
        goalId: ref.kind === "cascade" ? ref.id : null,
        weeklyGoalId: ref.kind === "weekly" ? ref.id : null,
        uploadedById: me.id,
      })
      .returning({ id: documents.id, createdAt: documents.createdAt });
    if (!row) throw new Error("no row");

    void logGoalActivity(ref.id, GoalEventTypes.AttachmentAdded, {
      employeeId: auth.node.employeeId,
      goalKind: ref.kind,
      detail: safeName(file.name),
    }, me.id);

    let url: string | null = null;
    try {
      const { data } = await admin.storage.from(DOCUMENTS_BUCKET).createSignedUrl(path, 60 * 30);
      url = data?.signedUrl ?? null;
    } catch {
      /* renders unsigned */
    }

    return {
      ok: true,
      attachment: {
        id: row.id,
        title: safeName(file.name),
        mimeType: file.type || null,
        sizeBytes: file.size,
        url,
        uploadedById: me.id,
        uploadedByName: me.name,
        createdAt: row.createdAt.toISOString(),
      },
    };
  } catch {
    // The 0142 columns are missing — remove the orphaned storage object.
    await admin.storage.from(DOCUMENTS_BUCKET).remove([path]).catch(() => {});
    return { ok: false, error: MIGRATION_HINT };
  }
}

export async function removeGoalAttachment(input: { id: string }): Promise<ActionResult> {
  const { me, isAdmin } = await requireGoalsAccess();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: firstError(parsed.error) };

  try {
    const [row] = await db
      .select({
        id: documents.id,
        title: documents.title,
        storagePath: documents.storagePath,
        uploadedById: documents.uploadedById,
        goalId: documents.goalId,
        weeklyGoalId: documents.weeklyGoalId,
      })
      .from(documents)
      .where(eq(documents.id, parsed.data.id))
      .limit(1);
    if (!row) return { ok: true };
    if (!row.goalId && !row.weeklyGoalId) {
      return { ok: false, error: "That file isn't a goal attachment." };
    }
    const ref: NodeRef = row.goalId
      ? { id: row.goalId, kind: "cascade" }
      : { id: row.weeklyGoalId!, kind: "weekly" };
    const auth = await authorizeWrite(ref, { id: me.id, isAdmin });
    if (!auth.ok) return auth;
    if (!(isAdmin || row.uploadedById === me.id || auth.node.employeeId === me.id)) {
      return { ok: false, error: "Only the uploader, the owner, or an admin can remove it." };
    }

    await db.delete(documents).where(eq(documents.id, parsed.data.id));
    await getSupabaseAdmin()
      .storage.from(DOCUMENTS_BUCKET)
      .remove([row.storagePath])
      .catch(() => {});
    void logGoalActivity(ref.id, GoalEventTypes.AttachmentRemoved, {
      employeeId: auth.node.employeeId,
      goalKind: ref.kind,
      detail: row.title,
    }, me.id);
    return { ok: true };
  } catch {
    return { ok: false, error: MIGRATION_HINT };
  }
}
