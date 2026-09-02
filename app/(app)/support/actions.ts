"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  hrTickets,
  hrTicketMessages,
  hrTicketAttachments,
  type HrTicket,
} from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { requireHrSupport } from "@/lib/hr/flag";
import { rateLimitOrError } from "@/lib/rate-limit";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import { emit } from "@/lib/events/emit";
import {
  hrTicketCreated,
  hrTicketAssigned,
  hrTicketStatusChanged,
  hrTicketReplied,
  hrTicketNoteAdded,
  hrTicketReopened,
  hrTicketResolved,
  hrTicketClosed,
  hrTicketEvent,
} from "@/lib/events/hr-ticket-events";
import { HrTicketEventTypes } from "@/lib/events/types";
import { notify } from "@/lib/notifications/dispatch";
import {
  resolveViewer,
  routeOwnerFor,
  canHandle,
  type Viewer,
} from "@/lib/queries/hr-support";
import { superAdminIds } from "@/lib/hr/access";
import { computeSlaStamps } from "@/lib/hr/sla";
import {
  HR_TICKET_CATEGORIES,
  HR_TICKET_PRIORITIES,
  HR_TICKET_STATUS_EMPLOYEE_LABELS,
  type HrTicketCategory,
  type HrTicketPriority,
  type HrTicketStatus,
} from "@/db/enums";

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

const MAX_BYTES = 25 * 1024 * 1024;
const DISALLOWED_EXTENSIONS =
  /\.(exe|com|cmd|bat|msi|scr|pif|vbs|js|mjs|cjs|jar|sh|bash|app|dmg|ps1|psm1|reg|hta|cpl|gadget|html?|xhtml|svgz?)$/i;
const DISALLOWED_MIME_TYPES = new Set<string>([
  "application/x-msdownload",
  "application/x-msdos-program",
  "application/x-executable",
  "application/x-sh",
  "application/x-shellscript",
  "text/x-shellscript",
  "text/html",
  "application/xhtml+xml",
  "image/svg+xml",
]);

function safeName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "file";
}

function validFile(file: File): { ok: true } | { ok: false; error: string } {
  if (file.size === 0) return { ok: false, error: "Empty file." };
  if (file.size > MAX_BYTES) return { ok: false, error: "File exceeds 25 MB." };
  if (DISALLOWED_EXTENSIONS.test(file.name)) return { ok: false, error: "This file type is not allowed." };
  if (file.type && DISALLOWED_MIME_TYPES.has(file.type)) return { ok: false, error: "This file type is not allowed." };
  return { ok: true };
}

/** Upload the raise/reply attachments to the documents bucket + insert rows. */
async function persistAttachments(
  ticketId: string,
  messageId: string | null,
  uploadedById: string,
  files: File[],
): Promise<void> {
  if (files.length === 0) return;
  const admin = getSupabaseAdmin();
  for (const file of files) {
    if (!(file instanceof File)) continue;
    const shape = validFile(file);
    if (!shape.ok) continue; // skip bad files silently (the message still posts)
    const path = `hr-tickets/${ticketId}/${crypto.randomUUID()}/${safeName(file.name)}`;
    const buffer = Buffer.from(await file.arrayBuffer());
    const { error } = await admin.storage
      .from(DOCUMENTS_BUCKET)
      .upload(path, buffer, { contentType: file.type || "application/octet-stream", upsert: false });
    if (error) continue;
    await db.insert(hrTicketAttachments).values({
      ticketId,
      messageId,
      uploadedById,
      storagePath: path,
      fileName: file.name.slice(0, 200),
      mimeType: file.type || null,
      sizeBytes: file.size,
    });
  }
}

/** JSON meta stored on the notification body so the inbox/email can deep-link. */
function notifyBody(t: Pick<HrTicket, "id" | "ticketNo" | "category" | "confidential">, extra?: Record<string, unknown>): string {
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

/* ------------------------------------------------------------------ */
/* Raise a ticket (support form) OR an Ask-HR query (source="query")   */
/* ------------------------------------------------------------------ */

const RaiseSchema = z.object({
  subject: z.string().trim().min(3, "Add a short subject").max(200, "Subject too long"),
  description: z.string().trim().min(1, "Describe your request").max(8000, "Too long"),
  category: z.enum(HR_TICKET_CATEGORIES as unknown as [HrTicketCategory, ...HrTicketCategory[]]),
  priority: z.enum(HR_TICKET_PRIORITIES as unknown as [HrTicketPriority, ...HrTicketPriority[]]).optional(),
  source: z.enum(["support", "query"]).default("support"),
});

export async function raiseTicket(form: FormData): Promise<Result<{ id: string }>> {
  requireHrSupport();
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = RaiseSchema.safeParse({
    subject: form.get("subject"),
    description: form.get("description"),
    category: form.get("category"),
    priority: form.get("priority") || undefined,
    source: form.get("source") || "support",
  });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]!.message };
  const { subject, description, category, source } = parsed.data;

  // Grievances are born confidential + priority ≥ high (design brief).
  const confidential = category === "grievance";
  let priority: HrTicketPriority = parsed.data.priority ?? (source === "query" ? "low" : "normal");
  if (confidential && (priority === "low" || priority === "normal")) priority = "high";

  const routedOwner = await routeOwnerFor(category);
  // NULL route → super-admin fallback so no ticket is ever born unowned.
  const fallbackOwner = routedOwner ?? (await superAdminIds())[0] ?? null;
  const sla = computeSlaStamps(priority);

  const files = (form.getAll("attachments").filter((f) => f instanceof File) as File[]);

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
          {
            employeeId: me.id,
            ticketNo: ticket.ticketNo,
            category,
            confidential,
            source,
            assigneeId: fallbackOwner,
          },
          { actorId: me.id },
        ),
      );
      return ticket;
    });
  } catch (err) {
    return { ok: false, error: `Could not raise ticket: ${err instanceof Error ? err.message : String(err)}` };
  }
  if (!created) return { ok: false, error: "Insert returned no row" };

  // Attachments (outside the tx — Storage isn't transactional anyway).
  await persistAttachments(created.id, null, me.id, files).catch(() => {});

  // Notify the routed assignee (+ super-admins for grievances, generic copy).
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

  revalidatePath("/support");
  revalidatePath("/queries");
  return { ok: true, id: created.id };
}

/* ------------------------------------------------------------------ */
/* Shared loader for mutating actions on an existing ticket            */
/* ------------------------------------------------------------------ */

async function loadForViewer(
  ticketId: string,
): Promise<{ ok: true; me: Awaited<ReturnType<typeof requireUser>>; v: Viewer; ticket: HrTicket } | { ok: false; error: string }> {
  if (!z.string().uuid().safeParse(ticketId).success) return { ok: false, error: "Invalid ticket" };
  const me = await requireUser();
  const v = await resolveViewer(me);
  const [ticket] = await db.select().from(hrTickets).where(eq(hrTickets.id, ticketId)).limit(1);
  if (!ticket) return { ok: false, error: "Ticket not found" };
  // Visibility choke point (same predicate as the read layer).
  const isRequester = ticket.employeeId === me.id;
  const isAssignee = ticket.assigneeId === me.id;
  const canRead = v.superAdmin || isRequester || isAssignee || (v.handler && !ticket.confidential);
  if (!canRead) return { ok: false, error: "Not found" };
  return { ok: true, me, v, ticket };
}

/* ------------------------------------------------------------------ */
/* Reply (outward) + Internal note (HR-only) — the Reply/Note fork      */
/* ------------------------------------------------------------------ */

const BodySchema = z.string().trim().min(1, "Write a message").max(8000, "Too long");

export async function replyOnTicket(ticketId: string, form: FormData): Promise<Result> {
  requireHrSupport();
  const loaded = await loadForViewer(ticketId);
  if (!loaded.ok) return loaded;
  const { me, v, ticket } = loaded;
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const bodyRes = BodySchema.safeParse(form.get("body"));
  if (!bodyRes.success) return { ok: false, error: bodyRes.error.issues[0]!.message };
  const body = bodyRes.data;
  const files = form.getAll("attachments").filter((f) => f instanceof File) as File[];

  const isRequester = ticket.employeeId === me.id;
  // A reply from HR → waiting_on_employee; a reply from the requester → in_progress.
  const nextStatus: HrTicketStatus = isRequester ? "in_progress" : "waiting_on_employee";
  const stampFirstResponse = !ticket.firstRespondedAt && !isRequester;

  let messageId = "";
  try {
    await db.transaction(async (tx) => {
      const [msg] = await tx
        .insert(hrTicketMessages)
        .values({ ticketId, authorId: me.id, body, internal: false })
        .returning({ id: hrTicketMessages.id });
      messageId = msg!.id;
      await tx
        .update(hrTickets)
        .set({
          status: nextStatus,
          updatedAt: new Date(),
          ...(stampFirstResponse ? { firstRespondedAt: new Date() } : {}),
        })
        .where(eq(hrTickets.id, ticketId));
      await emit(
        tx,
        hrTicketReplied(
          ticketId,
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
    return { ok: false, error: `Could not post reply: ${err instanceof Error ? err.message : String(err)}` };
  }

  await persistAttachments(ticketId, messageId, me.id, files).catch(() => {});

  // Notify the OTHER side of the thread.
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

  revalidatePath(`/support/${ticketId}`);
  revalidatePath("/support");
  return { ok: true };
}

export async function addInternalNote(ticketId: string, form: FormData): Promise<Result> {
  requireHrSupport();
  const loaded = await loadForViewer(ticketId);
  if (!loaded.ok) return loaded;
  const { me, v, ticket } = loaded;
  if (!canHandle(v, ticket)) return { ok: false, error: "Only HR can add internal notes." };
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const bodyRes = BodySchema.safeParse(form.get("body"));
  if (!bodyRes.success) return { ok: false, error: bodyRes.error.issues[0]!.message };
  const files = form.getAll("attachments").filter((f) => f instanceof File) as File[];

  let messageId = "";
  try {
    await db.transaction(async (tx) => {
      const [msg] = await tx
        .insert(hrTicketMessages)
        .values({ ticketId, authorId: me.id, body: bodyRes.data, internal: true })
        .returning({ id: hrTicketMessages.id });
      messageId = msg!.id;
      await tx.update(hrTickets).set({ updatedAt: new Date() }).where(eq(hrTickets.id, ticketId));
      await emit(
        tx,
        hrTicketNoteAdded(
          ticketId,
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
    return { ok: false, error: `Could not add note: ${err instanceof Error ? err.message : String(err)}` };
  }
  // Internal notes NEVER notify the requester (Reply/Note fork). No dispatch.
  await persistAttachments(ticketId, messageId, me.id, files).catch(() => {});
  revalidatePath(`/support/${ticketId}`);
  return { ok: true };
}

/* ------------------------------------------------------------------ */
/* Assign · Status · Priority · Reopen                                 */
/* ------------------------------------------------------------------ */

export async function assignTicket(ticketId: string, assigneeId: string | null): Promise<Result> {
  requireHrSupport();
  const loaded = await loadForViewer(ticketId);
  if (!loaded.ok) return loaded;
  const { me, v, ticket } = loaded;
  if (!canHandle(v, ticket)) return { ok: false, error: "Forbidden" };
  if (assigneeId && !z.string().uuid().safeParse(assigneeId).success) return { ok: false, error: "Invalid assignee" };

  try {
    await db.transaction(async (tx) => {
      await tx
        .update(hrTickets)
        .set({ assigneeId, updatedAt: new Date() })
        .where(eq(hrTickets.id, ticketId));
      await emit(
        tx,
        hrTicketAssigned(
          ticketId,
          {
            employeeId: ticket.employeeId,
            ticketNo: ticket.ticketNo,
            category: ticket.category,
            confidential: ticket.confidential,
            assigneeId,
          },
          { actorId: me.id },
        ),
      );
    });
  } catch (err) {
    return { ok: false, error: `Could not assign: ${err instanceof Error ? err.message : String(err)}` };
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
  revalidatePath(`/support/${ticketId}`);
  revalidatePath("/support");
  return { ok: true };
}

const STATUS_VALUES = ["in_progress", "waiting_on_employee", "resolved", "closed", "reopened"] as const;

export async function changeStatus(ticketId: string, status: string): Promise<Result> {
  requireHrSupport();
  const loaded = await loadForViewer(ticketId);
  if (!loaded.ok) return loaded;
  const { me, v, ticket } = loaded;
  if (!(STATUS_VALUES as readonly string[]).includes(status)) return { ok: false, error: "Invalid status" };
  const next = status as HrTicketStatus;
  const isRequester = ticket.employeeId === me.id;

  // Employees may only confirm-close a resolved ticket or reopen their own;
  // everything else is an HR handler action.
  const employeeAllowed =
    (ticket.status === "resolved" && next === "closed") ||
    (ticket.status === "closed" && next === "reopened");
  if (!canHandle(v, ticket) && !(isRequester && employeeAllowed)) {
    return { ok: false, error: "Forbidden" };
  }

  // Reopen window: ≤7 days after close.
  if (next === "reopened" && ticket.closedAt) {
    const days = (Date.now() - ticket.closedAt.getTime()) / 86_400_000;
    if (days > 7) return { ok: false, error: "This ticket was closed more than 7 days ago — raise a new one." };
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
      await tx.update(hrTickets).set(patch).where(eq(hrTickets.id, ticketId));
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
          ? hrTicketResolved(ticketId, p, { actorId: me.id })
          : next === "closed"
            ? hrTicketClosed(ticketId, p, { actorId: me.id })
            : next === "reopened"
              ? hrTicketReopened(ticketId, p, { actorId: me.id })
              : hrTicketStatusChanged(ticketId, p, { actorId: me.id });
      await emit(tx, ev);
    });
  } catch (err) {
    return { ok: false, error: `Could not update status: ${err instanceof Error ? err.message : String(err)}` };
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
    // Employee-driven transition (confirm-close / reopen) → tell the handler.
    await notify({
      userId: ticket.assigneeId,
      kind: "hr_ticket_status_changed",
      title: ticketTitle(ticket, next === "reopened" ? "reopened" : "closed by employee"),
      body: notifyBody(ticket, { toStatus: next }),
      actorId: me.id,
    });
  }

  revalidatePath(`/support/${ticketId}`);
  revalidatePath("/support");
  return { ok: true };
}

export async function changePriority(ticketId: string, priority: string): Promise<Result> {
  requireHrSupport();
  const loaded = await loadForViewer(ticketId);
  if (!loaded.ok) return loaded;
  const { me, v, ticket } = loaded;
  if (!canHandle(v, ticket)) return { ok: false, error: "Forbidden" };
  if (!(HR_TICKET_PRIORITIES as readonly string[]).includes(priority)) return { ok: false, error: "Invalid priority" };
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
        .where(eq(hrTickets.id, ticketId));
      await emit(
        tx,
        hrTicketEvent(
          ticketId,
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
    return { ok: false, error: `Could not change priority: ${err instanceof Error ? err.message : String(err)}` };
  }
  revalidatePath(`/support/${ticketId}`);
  return { ok: true };
}

// Convenience wrapper the thread UI calls for the employee "Reopen" button.
export async function reopenTicket(ticketId: string): Promise<Result> {
  return changeStatus(ticketId, "reopened");
}
