import "server-only";
import { and, or, eq, desc, inArray, sql, type SQL } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  hrTickets,
  hrTicketMessages,
  hrTicketAttachments,
  hrTicketRoutes,
  employees,
  notifications,
  type HrTicket,
} from "@/db/schema";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { isHrHandler } from "@/lib/hr/access";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import {
  HR_TICKET_OPEN_STATUSES,
  type HrTicketStatus,
  type HrTicketPriority,
  type HrTicketCategory,
} from "@/db/enums";
import type { Employee } from "@/db/schema";

/**
 * HR Support read layer. The SINGLE grievance-wall choke point lives here in
 * {@link visibleTicketsFilter} — every ticket read composes it. Do not reach
 * around it with a bespoke query.
 */

/** Viewer capability flags, resolved once per read. */
export interface Viewer {
  me: Employee;
  handler: boolean;
  superAdmin: boolean;
}

export async function resolveViewer(me: Employee): Promise<Viewer> {
  const [handler] = await Promise.all([isHrHandler(me)]);
  return { me, handler, superAdmin: isSuperAdmin(me.email) };
}

/**
 * THE choke point. Returns the SQL predicate that limits which hr_tickets a
 * viewer may read — or `undefined` for super-admins (who see everything).
 *
 *   - super-admin        → no restriction (undefined)
 *   - HR handler         → own OR assigned-to-me OR any NON-confidential ticket
 *   - plain employee     → own OR assigned-to-me
 *
 * A confidential (grievance) ticket is therefore visible ONLY to its requester,
 * its CURRENT assignee, and super-admins — never all-HR, never every admin,
 * never the manager downline.
 */
export function visibleTicketsFilter(v: Viewer): SQL | undefined {
  if (v.superAdmin) return undefined;
  const clauses: SQL[] = [
    eq(hrTickets.employeeId, v.me.id),
    eq(hrTickets.assigneeId, v.me.id),
  ];
  if (v.handler) clauses.push(eq(hrTickets.confidential, false));
  return or(...clauses);
}

/** May this viewer see INTERNAL (HR-only) notes on a ticket they can read? */
export function canSeeInternal(v: Viewer, ticket: Pick<HrTicket, "assigneeId">): boolean {
  return v.handler || v.superAdmin || ticket.assigneeId === v.me.id;
}

/** May this viewer act as HR on this ticket (reply as HR / note / assign / status)? */
export function canHandle(v: Viewer, ticket: Pick<HrTicket, "assigneeId">): boolean {
  return v.handler || v.superAdmin || ticket.assigneeId === v.me.id;
}

export interface TicketListRow {
  id: string;
  ticketNo: number;
  subject: string;
  category: HrTicketCategory;
  status: HrTicketStatus;
  priority: HrTicketPriority;
  confidential: boolean;
  source: string;
  employeeId: string;
  requesterName: string | null;
  assigneeId: string | null;
  assigneeName: string | null;
  createdAt: Date;
  updatedAt: Date;
  firstResponseDueAt: Date | null;
  resolutionDueAt: Date | null;
  firstRespondedAt: Date | null;
  resolvedAt: Date | null;
}

const requester = employees;

async function selectTickets(
  v: Viewer,
  extra: SQL | undefined,
): Promise<TicketListRow[]> {
  const visible = visibleTicketsFilter(v);
  const where = and(...[visible, extra].filter(Boolean) as SQL[]);
  const rows = await db
    .select({
      id: hrTickets.id,
      ticketNo: hrTickets.ticketNo,
      subject: hrTickets.subject,
      category: hrTickets.category,
      status: hrTickets.status,
      priority: hrTickets.priority,
      confidential: hrTickets.confidential,
      source: hrTickets.source,
      employeeId: hrTickets.employeeId,
      requesterName: requester.name,
      assigneeId: hrTickets.assigneeId,
      createdAt: hrTickets.createdAt,
      updatedAt: hrTickets.updatedAt,
      firstResponseDueAt: hrTickets.firstResponseDueAt,
      resolutionDueAt: hrTickets.resolutionDueAt,
      firstRespondedAt: hrTickets.firstRespondedAt,
      resolvedAt: hrTickets.resolvedAt,
    })
    .from(hrTickets)
    .leftJoin(requester, eq(requester.id, hrTickets.employeeId))
    .where(where ?? sql`true`)
    .orderBy(desc(hrTickets.updatedAt))
    .limit(300);

  // Resolve assignee names in a second small query (avoids a self-join alias).
  const assigneeIds = Array.from(
    new Set(rows.map((r) => r.assigneeId).filter(Boolean) as string[]),
  );
  const names = assigneeIds.length
    ? await db
        .select({ id: employees.id, name: employees.name })
        .from(employees)
        .where(inArray(employees.id, assigneeIds))
    : [];
  const nameById = new Map(names.map((n) => [n.id, n.name]));

  return rows.map((r) => ({
    ...r,
    category: r.category as HrTicketCategory,
    status: r.status as HrTicketStatus,
    priority: r.priority as HrTicketPriority,
    assigneeName: r.assigneeId ? nameById.get(r.assigneeId) ?? null : null,
  }));
}

/** The requester's own tickets (employee "My requests" view). Excludes queries? No — includes both doors; the caller filters by source when needed. */
export async function listMyTickets(v: Viewer, source?: "support" | "query"): Promise<TicketListRow[]> {
  const extra = and(
    eq(hrTickets.employeeId, v.me.id),
    source ? eq(hrTickets.source, source) : undefined,
  );
  return selectTickets(v, extra);
}

export interface QueueFilters {
  status?: HrTicketStatus | "open" | "all";
  priority?: HrTicketPriority;
  category?: HrTicketCategory;
  assignee?: "me" | "unassigned" | "all";
  source?: "support" | "query" | "all";
}

/** The HR queue (handler view) with filter pills applied over the visible set. */
export async function listQueue(v: Viewer, f: QueueFilters = {}): Promise<TicketListRow[]> {
  const clauses: (SQL | undefined)[] = [];
  if (!f.status || f.status === "open") {
    clauses.push(inArray(hrTickets.status, [...HR_TICKET_OPEN_STATUSES]));
  } else if (f.status !== "all") {
    clauses.push(eq(hrTickets.status, f.status));
  }
  if (f.priority) clauses.push(eq(hrTickets.priority, f.priority));
  if (f.category) clauses.push(eq(hrTickets.category, f.category));
  if (f.source && f.source !== "all") clauses.push(eq(hrTickets.source, f.source));
  if (f.assignee === "me") clauses.push(eq(hrTickets.assigneeId, v.me.id));
  else if (f.assignee === "unassigned") clauses.push(sql`${hrTickets.assigneeId} is null`);
  const extra = clauses.filter(Boolean).length
    ? and(...(clauses.filter(Boolean) as SQL[]))
    : undefined;
  return selectTickets(v, extra);
}

/** Counts for the queue pills — open / unassigned / assigned-to-me / breaching. */
export async function queueCounts(v: Viewer): Promise<{
  open: number;
  mine: number;
  unassigned: number;
  breaching: number;
}> {
  const all = await selectTickets(v, undefined);
  const now = Date.now();
  const open = all.filter((t) => (HR_TICKET_OPEN_STATUSES as readonly string[]).includes(t.status));
  return {
    open: open.length,
    mine: open.filter((t) => t.assigneeId === v.me.id).length,
    unassigned: open.filter((t) => !t.assigneeId).length,
    breaching: open.filter(
      (t) =>
        (!t.firstRespondedAt && t.firstResponseDueAt && t.firstResponseDueAt.getTime() < now) ||
        (!t.resolvedAt && t.resolutionDueAt && t.resolutionDueAt.getTime() < now),
    ).length,
  };
}

export interface ThreadMessage {
  id: string;
  authorId: string;
  authorName: string | null;
  body: string;
  internal: boolean;
  createdAt: Date;
}

export interface TicketAttachmentView {
  id: string;
  messageId: string | null;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  signedUrl: string | null;
  createdAt: Date;
}

export interface TicketBundle {
  ticket: HrTicket & { requesterName: string | null; assigneeName: string | null };
  messages: ThreadMessage[];
  attachments: TicketAttachmentView[];
  viewer: Viewer;
  isRequester: boolean;
  canHandle: boolean;
  canSeeInternal: boolean;
}

/** Sign a batch of storage paths → Map(path → url). Failures map to null. */
async function signPaths(paths: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  if (paths.length === 0) return out;
  try {
    const admin = getSupabaseAdmin();
    const { data } = await admin.storage
      .from(DOCUMENTS_BUCKET)
      .createSignedUrls(paths, 60 * 60);
    for (const row of data ?? []) {
      out.set(row.path ?? "", row.signedUrl ?? null);
    }
  } catch {
    // best-effort — attachments render without a link on signing failure
  }
  for (const p of paths) if (!out.has(p)) out.set(p, null);
  return out;
}

/**
 * Full ticket detail, gated by the same visibility choke point. Returns null
 * when the viewer may not read it (so callers can notFound()). Internal notes
 * are stripped for viewers who may not see them.
 */
export async function getTicketBundle(v: Viewer, id: string): Promise<TicketBundle | null> {
  const visible = visibleTicketsFilter(v);
  const where = and(eq(hrTickets.id, id), visible);
  const [ticket] = await db
    .select()
    .from(hrTickets)
    .where(where ?? eq(hrTickets.id, id))
    .limit(1);
  if (!ticket) return null;

  const seeInternal = canSeeInternal(v, ticket);

  const msgRows = await db
    .select({
      id: hrTicketMessages.id,
      authorId: hrTicketMessages.authorId,
      authorName: employees.name,
      body: hrTicketMessages.body,
      internal: hrTicketMessages.internal,
      createdAt: hrTicketMessages.createdAt,
    })
    .from(hrTicketMessages)
    .leftJoin(employees, eq(employees.id, hrTicketMessages.authorId))
    .where(
      seeInternal
        ? eq(hrTicketMessages.ticketId, id)
        : and(eq(hrTicketMessages.ticketId, id), eq(hrTicketMessages.internal, false)),
    )
    .orderBy(hrTicketMessages.createdAt);

  const attRows = await db
    .select()
    .from(hrTicketAttachments)
    .where(eq(hrTicketAttachments.ticketId, id))
    .orderBy(hrTicketAttachments.createdAt);
  // Attachments tied to an internal note are hidden from non-internal viewers.
  const internalMsgIds = new Set(msgRows.filter((m) => m.internal).map((m) => m.id));
  const visibleAtt = attRows.filter(
    (a) => seeInternal || !a.messageId || !internalMsgIds.has(a.messageId),
  );
  const signed = await signPaths(visibleAtt.map((a) => a.storagePath));

  const [requesterRow, assigneeRow] = await Promise.all([
    db.query.employees.findFirst({ where: eq(employees.id, ticket.employeeId), columns: { name: true } }),
    ticket.assigneeId
      ? db.query.employees.findFirst({ where: eq(employees.id, ticket.assigneeId), columns: { name: true } })
      : Promise.resolve(null),
  ]);

  return {
    ticket: {
      ...ticket,
      requesterName: requesterRow?.name ?? null,
      assigneeName: assigneeRow?.name ?? null,
    },
    messages: msgRows,
    attachments: visibleAtt.map((a) => ({
      id: a.id,
      messageId: a.messageId,
      fileName: a.fileName,
      mimeType: a.mimeType,
      sizeBytes: a.sizeBytes,
      signedUrl: signed.get(a.storagePath) ?? null,
      createdAt: a.createdAt,
    })),
    viewer: v,
    isRequester: ticket.employeeId === v.me.id,
    canHandle: canHandle(v, ticket),
    canSeeInternal: seeInternal,
  };
}

/** The 9 category→owner routes (admin surface / raise-time routing). */
export async function listRoutes() {
  const rows = await db
    .select({
      category: hrTicketRoutes.category,
      ownerId: hrTicketRoutes.ownerId,
      ownerName: employees.name,
      isActive: hrTicketRoutes.isActive,
    })
    .from(hrTicketRoutes)
    .leftJoin(employees, eq(employees.id, hrTicketRoutes.ownerId));
  return rows;
}

/** Resolve the routed owner for a category (NULL → super-admin fallback in the action). */
export async function routeOwnerFor(category: HrTicketCategory): Promise<string | null> {
  const [row] = await db
    .select({ ownerId: hrTicketRoutes.ownerId, isActive: hrTicketRoutes.isActive })
    .from(hrTicketRoutes)
    .where(eq(hrTicketRoutes.category, category))
    .limit(1);
  if (!row || !row.isActive) return null;
  return row.ownerId ?? null;
}

/**
 * The employees an HR handler may assign a ticket to — admins + the HR
 * department (super-admins are admins here in practice, plus the allow-list).
 * Small list, active only, sorted by name.
 */
export async function listAssignableHandlers(): Promise<Array<{ id: string; name: string }>> {
  const { employeeIdsInDepartments } = await import("@/lib/queries/departments");
  const { HR_DEPARTMENT, superAdminIds: sa } = await import("@/lib/hr/access");
  const [hrDeptIds, saIds] = await Promise.all([
    employeeIdsInDepartments([HR_DEPARTMENT]).catch(() => [] as string[]),
    sa().catch(() => [] as string[]),
  ]);
  const rows = await db
    .select({ id: employees.id, name: employees.name, isAdmin: employees.isAdmin, isActive: employees.isActive })
    .from(employees)
    .where(eq(employees.isActive, true));
  const explicit = new Set([...hrDeptIds, ...saIds]);
  return rows
    .filter((r) => r.isAdmin || explicit.has(r.id))
    .map((r) => ({ id: r.id, name: r.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** HR-ticket notifications for the /queries inbox — kind LIKE 'hr_ticket_%'. */
export async function listHrNotifications(me: Employee, limit = 40) {
  const rows = await db
    .select({
      id: notifications.id,
      kind: notifications.kind,
      title: notifications.title,
      body: notifications.body,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .where(
      and(
        eq(notifications.userId, me.id),
        sql`${notifications.kind} like 'hr_ticket_%'`,
      ),
    )
    .orderBy(desc(notifications.createdAt))
    .limit(limit);
  return rows.map((r) => {
    let link: string | null = null;
    let ticketNo: number | null = null;
    if (r.body) {
      try {
        const meta = JSON.parse(r.body);
        if (meta && typeof meta === "object") {
          if (typeof meta.ticketId === "string") link = `/support/${meta.ticketId}`;
          if (typeof meta.ticketNo === "number") ticketNo = meta.ticketNo;
        }
      } catch {
        /* free-text body — no deep link */
      }
    }
    return { ...r, link, ticketNo };
  });
}
