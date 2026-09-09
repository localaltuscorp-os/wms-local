import "server-only";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  hrTickets,
  hrTicketMessages,
  hrTicketAttachments,
  type HrTicket,
  type Employee,
} from "@/db/schema";
import { emit } from "@/lib/events/emit";
import {
  hrTicketCreated,
  hrTicketAssigned,
  hrTicketStatusChanged,
  hrTicketReplied,
  hrTicketNoteAdded,
  hrTicketResolved,
  hrTicketClosed,
  hrTicketReopened,
  hrTicketEvent,
} from "@/lib/events/hr-ticket-events";
import { HrTicketEventTypes } from "@/lib/events/types";
import { notify } from "@/lib/notifications/dispatch";
import { resolveViewer, routeOwnerFor, canHandle, type Viewer } from "@/lib/queries/hr-support";
import { superAdminIds } from "@/lib/hr/access";
import { computeSlaStamps } from "@/lib/hr/sla";
import { accessFor } from "@/lib/auth/workspace-access";
import { canAccessWorkspace } from "@/lib/workspaces";
import {
  HR_TICKET_CATEGORIES,
  HR_TICKET_PRIORITIES,
  HR_TICKET_STATUS_EMPLOYEE_LABELS,
  type HrTicketCategory,
  type HrTicketPriority,
  type HrTicketStatus,
} from "@/db/enums";

/**
 * Shared HR-desk write core for the native app's Support + Queries endpoints.
 * These mirror the web server actions in app/(app)/support/actions.ts EXACTLY
 * (same DB writes, event emits, SLA stamping, routing and notify fan-out) so the
 * phone and the web can never diverge. The only mobile-specific difference is
 * file handling: the web takes multipart `File`s and uploads them; the app
 * pre-uploads each attachment via POST /api/mobile/storage/sign (which forces a
 * `<me.id>/…` Supabase path) and passes the resulting paths as JSON here.
 */

/** A single pre-uploaded attachment reference (path minted by storage/sign). */
export const AttachmentSchema = z.object({
  filePath: z.string().trim().min(1),
  fileName: z.string().trim().min(1).max(200),
  mimeType: z.string().trim().max(255).optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
});
export type AttachmentInput = z.infer<typeof AttachmentSchema>;

export interface DeskFail {
  ok: false;
  status: number;
  error: string;
}
type DeskResult<T> = ({ ok: true } & T) | DeskFail;

/** Same workspace gate the web /support page enforces (requireWorkspace("hr")). */
export async function requireHrWorkspace(me: Employee): Promise<DeskFail | null> {
  const ok = canAccessWorkspace("hr", await accessFor(me));
  return ok ? null : { ok: false, status: 403, error: "forbidden" };
}

/** JSON meta on the notification body so the inbox/email can deep-link. */
function notifyBody(
  t: Pick<HrTicket, "id" | "ticketNo" | "category" | "confidential">,
  extra?: Record<string, unknown>,
): string {
  return JSON.stringify({
    ticketId: t.id,
    ticketNo: t.ticketNo,
    category: t.category,
    confidential: t.confidential,
    ...extra,
  });
}

/** Title for a ticket notification — confidential tickets NEVER leak the subject. */
function ticketTitle(t: Pick<HrTicket, "ticketNo" | "subject" | "confidential">, verb: string): string {
  if (t.confidential) return `Confidential HR case #${t.ticketNo} — ${verb}`;
  const subj = t.subject.length > 48 ? `${t.subject.slice(0, 47)}…` : t.subject;
  return `#${t.ticketNo} ${subj} — ${verb}`;
}

/**
 * Validate that every pre-uploaded attachment path lives under the caller's own
 * storage folder — the same guard /api/mobile/storage/sign enforces on upload,
 * so one user can't attach another's object. Returns the normalised rows.
 */
function normaliseAttachments(
  me: Employee,
  attachments: AttachmentInput[] | undefined,
): DeskResult<{ rows: AttachmentInput[] }> {
  const rows = attachments ?? [];
  for (const a of rows) {
    const path = a.filePath.replace(/^\/+/, "");
    if (!path.startsWith(`${me.id}/`)) {
      return { ok: false, status: 403, error: "filePath must be under your own folder" };
    }
  }
  return { ok: true, rows };
}

/** Insert attachment rows referencing the already-uploaded storage paths. */
async function persistAttachments(
  ticketId: string,
  messageId: string | null,
  me: Employee,
  rows: AttachmentInput[],
): Promise<void> {
  if (rows.length === 0) return;
  await db.insert(hrTicketAttachments).values(
    rows.map((a) => ({
      ticketId,
      messageId,
      uploadedById: me.id,
      storagePath: a.filePath.replace(/^\/+/, ""),
      fileName: a.fileName.slice(0, 200),
      mimeType: a.mimeType ?? null,
      sizeBytes: a.sizeBytes ?? null,
    })),
  );
}

/* ------------------------------------------------------------------ */
/* Raise a ticket (support form) OR an Ask-HR query (source="query")   */
/* ------------------------------------------------------------------ */

export const RaiseSchema = z.object({
  subject: z.string().trim().min(3, "Add a short subject").max(200, "Subject too long"),
  description: z.string().trim().min(1, "Describe your request").max(8000, "Too long"),
  category: z.enum(HR_TICKET_CATEGORIES as unknown as [HrTicketCategory, ...HrTicketCategory[]]),
  priority: z.enum(HR_TICKET_PRIORITIES as unknown as [HrTicketPriority, ...HrTicketPriority[]]).optional(),
  source: z.enum(["support", "query"]).default("support"),
  attachments: z.array(AttachmentSchema).max(10).optional(),
});
export type RaiseInput = z.infer<typeof RaiseSchema>;

/** Mirror of the web `raiseTicket` action — routing + SLA + first message + notify. */
export async function raiseTicketMobile(me: Employee, input: RaiseInput): Promise<DeskResult<{ id: string }>> {
  const { subject, description, category, source } = input;

  const att = normaliseAttachments(me, input.attachments);
  if (!att.ok) return att;

  // Grievances are born confidential + priority ≥ high (design brief).
  const confidential = category === "grievance";
  let priority: HrTicketPriority = input.priority ?? (source === "query" ? "low" : "normal");
  if (confidential && (priority === "low" || priority === "normal")) priority = "high";

  const routedOwner = await routeOwnerFor(category);
  // NULL route → super-admin fallback so no ticket is ever born unowned.
  const fallbackOwner = routedOwner ?? (await superAdminIds())[0] ?? null;
  const sla = computeSlaStamps(priority);

  let created: HrTicket | undefined;
  try {
    created = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(hrTickets)
        .values({
          employeeId: me.id,
          category,
          subject,
          priority,
          confidential,
          source,
          assigneeId: fallbackOwner,
          firstResponseDueAt: sla.firstResponseDueAt,
          resolutionDueAt: sla.resolutionDueAt,
        })
        .returning();
      const ticket = row!;
      // First message = the description (an outward message from the requester).
      await tx.insert(hrTicketMessages).values({
        ticketId: ticket.id,
        authorId: me.id,
        body: description,
        internal: false,
      });
      await emit(
        tx,
        hrTicketCreated(
          ticket.id,
          { employeeId: me.id, ticketNo: ticket.ticketNo, category, confidential, source, assigneeId: fallbackOwner },
          { actorId: me.id },
        ),
      );
      return ticket;
    });
  } catch (err) {
    return { ok: false, status: 500, error: `Could not raise ticket: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (!created) return { ok: false, status: 500, error: "Insert returned no row" };

  await persistAttachments(created.id, null, me, att.rows).catch(() => {});

  // Notify the routed assignee (+ super-admins for grievances).
  const recipients = new Set<string>();
  if (created.assigneeId) recipients.add(created.assigneeId);
  if (confidential) for (const id of await superAdminIds()) recipients.add(id);
  recipients.delete(me.id);
  await Promise.allSettled(
    Array.from(recipients).map((userId) =>
      notify({
        userId,
        kind: "hr_ticket_created",
        title: ticketTitle(created!, "new request"),
        body: notifyBody(created!),
        actorId: me.id,
      }),
    ),
  );

  return { ok: true, id: created.id };
}

/* ------------------------------------------------------------------ */
/* Shared loader for mutating actions on an existing ticket            */
/* ------------------------------------------------------------------ */

export interface LoadedTicket {
  v: Viewer;
  ticket: HrTicket;
}

/** Loads a ticket + resolves the viewer, gated by the SAME visibility choke point. */
export async function loadForViewer(me: Employee, ticketId: string): Promise<DeskResult<LoadedTicket>> {
  if (!z.string().uuid().safeParse(ticketId).success) return { ok: false, status: 400, error: "Invalid ticket" };
  const v = await resolveViewer(me);
  const [ticket] = await db.select().from(hrTickets).where(eq(hrTickets.id, ticketId)).limit(1);
  if (!ticket) return { ok: false, status: 404, error: "not-found" };
  const isRequester = ticket.employeeId === me.id;
  const isAssignee = ticket.assigneeId === me.id;
  const canRead = v.superAdmin || isRequester || isAssignee || (v.handler && !ticket.confidential);
  if (!canRead) return { ok: false, status: 404, error: "not-found" };
  return { ok: true, v, ticket };
}

/* ------------------------------------------------------------------ */
/* Reply (outward) + Internal note (HR-only)                           */
/* ------------------------------------------------------------------ */

const BodySchema = z.string().trim().min(1, "Write a message").max(8000, "Too long");

export async function replyOnTicketMobile(
  me: Employee,
  loaded: LoadedTicket,
  rawBody: unknown,
  attachments: AttachmentInput[] | undefined,
): Promise<DeskResult<unknown>> {
  const { ticket } = loaded;
  const bodyRes = BodySchema.safeParse(rawBody);
  if (!bodyRes.success) return { ok: false, status: 400, error: bodyRes.error.issues[0]!.message };
  const att = normaliseAttachments(me, attachments);
  if (!att.ok) return att;

  const isRequester = ticket.employeeId === me.id;
  const nextStatus: HrTicketStatus = isRequester ? "in_progress" : "waiting_on_employee";
  const stampFirstResponse = !ticket.firstRespondedAt && !isRequester;

  let messageId = "";
  try {
    await db.transaction(async (tx) => {
      const [msg] = await tx
        .insert(hrTicketMessages)
        .values({ ticketId: ticket.id, authorId: me.id, body: bodyRes.data, internal: false })
        .returning({ id: hrTicketMessages.id });
      messageId = msg!.id;
      await tx
        .update(hrTickets)
        .set({ status: nextStatus, updatedAt: new Date(), ...(stampFirstResponse ? { firstRespondedAt: new Date() } : {}) })
        .where(eq(hrTickets.id, ticket.id));
      await emit(
        tx,
        hrTicketReplied(
          ticket.id,
          {
            employeeId: ticket.employeeId,
            ticketNo: ticket.ticketNo,
            category: ticket.category,
            confidential: ticket.confidential,
            toStatus: nextStatus,
            internal: false,
          },
          { actorId: me.id },
        ),
      );
    });
  } catch (err) {
    return { ok: false, status: 500, error: `Could not post reply: ${err instanceof Error ? err.message : String(err)}` };
  }

  await persistAttachments(ticket.id, messageId, me, att.rows).catch(() => {});

  const recipient = isRequester ? ticket.assigneeId : ticket.employeeId;
  if (recipient && recipient !== me.id) {
    await notify({
      userId: recipient,
      kind: "hr_ticket_replied",
      title: ticketTitle(ticket, "new reply"),
      body: notifyBody(ticket),
      actorId: me.id,
    });
  }
  return { ok: true };
}

export async function addInternalNoteMobile(
  me: Employee,
  loaded: LoadedTicket,
  rawBody: unknown,
  attachments: AttachmentInput[] | undefined,
): Promise<DeskResult<unknown>> {
  const { v, ticket } = loaded;
  if (!canHandle(v, ticket)) return { ok: false, status: 403, error: "Only HR can add internal notes." };
  const bodyRes = BodySchema.safeParse(rawBody);
  if (!bodyRes.success) return { ok: false, status: 400, error: bodyRes.error.issues[0]!.message };
  const att = normaliseAttachments(me, attachments);
  if (!att.ok) return att;

  let messageId = "";
  try {
    await db.transaction(async (tx) => {
      const [msg] = await tx
        .insert(hrTicketMessages)
        .values({ ticketId: ticket.id, authorId: me.id, body: bodyRes.data, internal: true })
        .returning({ id: hrTicketMessages.id });
      messageId = msg!.id;
      await tx.update(hrTickets).set({ updatedAt: new Date() }).where(eq(hrTickets.id, ticket.id));
      await emit(
        tx,
        hrTicketNoteAdded(
          ticket.id,
          {
            employeeId: ticket.employeeId,
            ticketNo: ticket.ticketNo,
            category: ticket.category,
            confidential: ticket.confidential,
            internal: true,
          },
          { actorId: me.id },
        ),
      );
    });
  } catch (err) {
    return { ok: false, status: 500, error: `Could not add note: ${err instanceof Error ? err.message : String(err)}` };
  }
  // Internal notes NEVER notify the requester (Reply/Note fork). No dispatch.
  await persistAttachments(ticket.id, messageId, me, att.rows).catch(() => {});
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Assign · Status · Priority                                          */
/* ------------------------------------------------------------------ */

export async function assignTicketMobile(
  me: Employee,
  loaded: LoadedTicket,
  assigneeId: string | null,
): Promise<DeskResult<unknown>> {
  const { v, ticket } = loaded;
  if (!canHandle(v, ticket)) return { ok: false, status: 403, error: "Forbidden" };
  if (assigneeId && !z.string().uuid().safeParse(assigneeId).success) return { ok: false, status: 400, error: "Invalid assignee" };

  try {
    await db.transaction(async (tx) => {
      await tx.update(hrTickets).set({ assigneeId, updatedAt: new Date() }).where(eq(hrTickets.id, ticket.id));
      await emit(
        tx,
        hrTicketAssigned(
          ticket.id,
          { employeeId: ticket.employeeId, ticketNo: ticket.ticketNo, category: ticket.category, confidential: ticket.confidential, assigneeId },
          { actorId: me.id },
        ),
      );
    });
  } catch (err) {
    return { ok: false, status: 500, error: `Could not assign: ${err instanceof Error ? err.message : String(err)}` };
  }

  if (assigneeId && assigneeId !== me.id) {
    await notify({
      userId: assigneeId,
      kind: "hr_ticket_assigned",
      title: ticketTitle(ticket, "assigned to you"),
      body: notifyBody(ticket),
      actorId: me.id,
    });
  }
  return { ok: true };
}

const STATUS_VALUES = ["in_progress", "waiting_on_employee", "resolved", "closed", "reopened"] as const;

export async function changeStatusMobile(
  me: Employee,
  loaded: LoadedTicket,
  status: string,
): Promise<DeskResult<unknown>> {
  const { v, ticket } = loaded;
  if (!(STATUS_VALUES as readonly string[]).includes(status)) return { ok: false, status: 400, error: "Invalid status" };
  const next = status as HrTicketStatus;
  const isRequester = ticket.employeeId === me.id;

  // Employees may only confirm-close a resolved ticket or reopen their own.
  const employeeAllowed =
    (ticket.status === "resolved" && next === "closed") || (ticket.status === "closed" && next === "reopened");
  if (!canHandle(v, ticket) && !(isRequester && employeeAllowed)) {
    return { ok: false, status: 403, error: "Forbidden" };
  }

  // Reopen window: ≤7 days after close.
  if (next === "reopened" && ticket.closedAt) {
    const days = (Date.now() - ticket.closedAt.getTime()) / 86_400_000;
    if (days > 7) return { ok: false, status: 400, error: "This ticket was closed more than 7 days ago — raise a new one." };
  }

  const now = new Date();
  const patch: Partial<typeof hrTickets.$inferInsert> = { status: next, updatedAt: now };
  if (next === "resolved") patch.resolvedAt = now;
  if (next === "closed") patch.closedAt = now;
  if (next === "reopened") {
    patch.reopenedCount = ticket.reopenedCount + 1;
    patch.resolvedAt = null;
    patch.closedAt = null;
  }

  try {
    await db.transaction(async (tx) => {
      await tx.update(hrTickets).set(patch).where(eq(hrTickets.id, ticket.id));
      const p = {
        employeeId: ticket.employeeId,
        ticketNo: ticket.ticketNo,
        category: ticket.category,
        confidential: ticket.confidential,
        fromStatus: ticket.status,
        toStatus: next,
      };
      const ev =
        next === "resolved"
          ? hrTicketResolved(ticket.id, p, { actorId: me.id })
          : next === "closed"
            ? hrTicketClosed(ticket.id, p, { actorId: me.id })
            : next === "reopened"
              ? hrTicketReopened(ticket.id, p, { actorId: me.id })
              : hrTicketStatusChanged(ticket.id, p, { actorId: me.id });
      await emit(tx, ev);
    });
  } catch (err) {
    return { ok: false, status: 500, error: `Could not update status: ${err instanceof Error ? err.message : String(err)}` };
  }

  // Notify the requester of the new state (employee-facing label copy).
  if (ticket.employeeId !== me.id) {
    await notify({
      userId: ticket.employeeId,
      kind: "hr_ticket_status_changed",
      title: ticketTitle(ticket, HR_TICKET_STATUS_EMPLOYEE_LABELS[next]),
      body: notifyBody(ticket, { toStatus: next }),
      actorId: me.id,
    });
  } else if (ticket.assigneeId && ticket.assigneeId !== me.id) {
    await notify({
      userId: ticket.assigneeId,
      kind: "hr_ticket_status_changed",
      title: ticketTitle(ticket, next === "reopened" ? "reopened" : "closed by employee"),
      body: notifyBody(ticket, { toStatus: next }),
      actorId: me.id,
    });
  }
  return { ok: true };
}

export async function changePriorityMobile(
  me: Employee,
  loaded: LoadedTicket,
  priority: string,
): Promise<DeskResult<unknown>> {
  const { v, ticket } = loaded;
  if (!canHandle(v, ticket)) return { ok: false, status: 403, error: "Forbidden" };
  if (!(HR_TICKET_PRIORITIES as readonly string[]).includes(priority)) return { ok: false, status: 400, error: "Invalid priority" };
  const next = priority as HrTicketPriority;
  const sla = computeSlaStamps(next, ticket.createdAt);

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(hrTickets)
        .set({
          priority: next,
          firstResponseDueAt: sla.firstResponseDueAt,
          resolutionDueAt: sla.resolutionDueAt,
          slaBreachedAt: null,
          updatedAt: new Date(),
        })
        .where(eq(hrTickets.id, ticket.id));
      await emit(
        tx,
        hrTicketEvent(
          ticket.id,
          HrTicketEventTypes.PriorityChanged,
          {
            employeeId: ticket.employeeId,
            ticketNo: ticket.ticketNo,
            category: ticket.category,
            confidential: ticket.confidential,
            fromPriority: ticket.priority,
            toPriority: next,
          },
          { actorId: me.id },
        ),
      );
    });
  } catch (err) {
    return { ok: false, status: 500, error: `Could not change priority: ${err instanceof Error ? err.message : String(err)}` };
  }
  return { ok: true };
}
