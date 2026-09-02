"use server";

import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import {
  outstandingContracts,
  outstandingInstallments,
  outstandingCollections,
  outstandingAttachments,
  outstandingProducts,
  outstandingEntitiesTbl,
  outstandingPaymentModes,
  outstandingResponsibles,
} from "@/db/schema";
import { parse as parseCsv } from "csv-parse/sync";
import {
  mapOutstandingRows,
  mapCollectionRows,
} from "@/lib/outstanding/import-map";
import { pickOutstanding, pickCollection } from "@/lib/outstanding/import-shape";
import { sheetCsvUrl } from "@/lib/outstanding/import-fetch";
import { OUTSTANDING_CYCLES, SUBSCRIPTION_FREQUENCIES } from "@/db/enums";
import { requireWorkspace, requireWorkspaceAdmin } from "@/lib/auth/workspace-access";
import { rateLimitOrError } from "@/lib/rate-limit";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import { generateSchedule } from "@/lib/outstanding/schedule";
import type { ContractInput } from "@/lib/outstanding/types";
import { rollingHorizon, todayISO } from "@/lib/outstanding/horizon";
import {
  listInstallmentsForContract,
  type AdminInstallmentRow,
} from "@/lib/queries/outstanding";
import {
  CreateContractSchema,
  UpdateContractSchema,
  EditInstallmentSchema,
  AdhocInstallmentSchema,
  CreateCollectionSchema,
  type UpdateContractInput,
} from "@/lib/validators/outstanding";

type ActionResult<T = unknown> =
  | ({ ok: true } & T)
  | { ok: false; error: string };

// ───────────────────────────────────────────────────────────────────────────
// v2 — contract-driven schedule (Milestone 3). The v1 ledger write actions
// (createOutstandingEntry / addOutstandingFollowup / setOutstandingWriteOff /
// deleteOutstandingEntry) were removed in the rebuild cleanup; the v2 surface
// below is what the rebuilt Outstanding Tracker uses.
// ───────────────────────────────────────────────────────────────────────────

/**
 * Rebuild a contract's auto-generated installments from the schedule engine.
 * Override rows (is_override = true) are preserved — only the engine-owned
 * rows are deleted and re-created, so admin edits / ad-hoc rows survive a
 * re-materialization. Runs in a transaction so a partial rebuild never
 * leaves the contract with no installments.
 */
async function materializeInstallments(
  contractId: string,
  // partial_payment / slabs rows aren't a column on the contract — they're
  // passed straight through to the engine so it returns them verbatim. For
  // every other cycle the engine ignores this and derives the schedule.
  explicitInstallments?: { dueDate: string; amount: number }[] | null,
): Promise<void> {
  const contract = await db.query.outstandingContracts.findFirst({
    where: eq(outstandingContracts.id, contractId),
  });
  if (!contract) return;

  const input: ContractInput = {
    id: contract.id,
    clientName: contract.clientName,
    cycle: contract.cycle,
    baseAmount: Number(contract.baseAmount),
    gstRate: contract.gstRate,
    startDate: contract.startDate,
    periods: contract.periods,
    endDate: contract.endDate,
    status: contract.status,
    // iter-2 cycle-specific inputs (monthly_bill / subscription / partial / slabs).
    retainerStart: contract.retainerStart,
    retainerEnd: contract.retainerEnd,
    billDate: contract.billDate,
    emiCount: contract.emiCount,
    frequency: (contract.frequency as ContractInput["frequency"]) ?? null,
    explicitInstallments: explicitInstallments ?? null,
  };

  const specs = generateSchedule(input, rollingHorizon(todayISO()));

  await db.transaction(async (tx) => {
    await tx
      .delete(outstandingInstallments)
      .where(
        sql`${outstandingInstallments.contractId} = ${contractId} AND ${outstandingInstallments.isOverride} = false`,
      );
    if (specs.length > 0) {
      await tx.insert(outstandingInstallments).values(
        specs.map((s) => ({
          contractId,
          periodIndex: s.periodIndex,
          dueDate: s.dueDate,
          amount: s.amount.toFixed(2),
          isOverride: false,
        })),
      );
    }
  });
}

/** Create a contract (any signed-in employee) and materialize its schedule. */
export async function createOutstandingContract(input: {
  clientName?: string;
  firstName?: string;
  lastName?: string;
  contactPhone?: string;
  productId?: string;
  entityId?: string;
  responsibleId?: string;
  expectedModeId?: string;
  cycle: (typeof OUTSTANDING_CYCLES)[number];
  baseAmount: number;
  gstRate: number;
  startDate: string;
  retainerStart?: string | null;
  retainerEnd?: string | null;
  billDate?: number | null;
  emiCount?: number | null;
  frequency?: (typeof SUBSCRIPTION_FREQUENCIES)[number] | null;
  explicitInstallments?: { dueDate: string; amount: number }[];
  periods?: number | null;
  endDate?: string | null;
  pdcReceived: boolean;
  comments?: string;
}): Promise<ActionResult<{ id: string }>> {
  const me = await requireWorkspace("sales");
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = CreateContractSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const d = parsed.data;

  // clientName is derived from first+last; fall back to the legacy clientName
  // field for the iter-1 form until it's migrated to the split inputs.
  const clientName =
    d.firstName && d.lastName
      ? `${d.firstName} ${d.lastName}`.trim()
      : (d.clientName ?? "").trim();

  // A full payment is a single installment by definition.
  const periods = d.cycle === "full_payment" ? 1 : d.periods ?? null;

  let inserted;
  try {
    [inserted] = await db
      .insert(outstandingContracts)
      .values({
        clientName,
        firstName: d.firstName ?? null,
        lastName: d.lastName ?? null,
        contactPhone: d.contactPhone || null,
        productId: d.productId ?? null,
        entityId: d.entityId ?? null,
        responsibleId: d.responsibleId ?? null,
        expectedModeId: d.expectedModeId ?? null,
        cycle: d.cycle,
        baseAmount: d.baseAmount.toFixed(2),
        gstRate: d.gstRate,
        startDate: d.startDate,
        retainerStart: d.retainerStart ?? null,
        retainerEnd: d.retainerEnd ?? null,
        billDate: d.billDate ?? null,
        emiCount: d.emiCount ?? null,
        frequency: d.frequency ?? null,
        periods,
        endDate: d.endDate ?? null,
        pdcReceived: d.pdcReceived,
        comments: d.comments || null,
        createdById: me.id,
      })
      .returning({ id: outstandingContracts.id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }
  if (!inserted) return { ok: false, error: "DB: insert returned no row" };

  try {
    await materializeInstallments(inserted.id, d.explicitInstallments);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  revalidatePath("/outstanding");
  return { ok: true, id: inserted.id };
}

/** Edit a contract (admin) and re-materialize its schedule. */
export async function updateOutstandingContract(
  id: string,
  fields: UpdateContractInput,
): Promise<ActionResult> {
  const me = await requireWorkspaceAdmin("sales");
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "Invalid contract id" };
  }
  const parsed = UpdateContractSchema.safeParse(fields);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const d = parsed.data;

  const existing = await db.query.outstandingContracts.findFirst({
    where: eq(outstandingContracts.id, id),
  });
  if (!existing) return { ok: false, error: "Contract not found" };

  const patch: Partial<typeof outstandingContracts.$inferInsert> = { updatedAt: new Date() };
  if (d.firstName !== undefined) patch.firstName = d.firstName;
  if (d.lastName !== undefined) patch.lastName = d.lastName;
  // Re-derive clientName from first+last when either is edited; else honour an
  // explicit clientName (iter-1 form / direct rename).
  if (d.firstName !== undefined || d.lastName !== undefined) {
    const first = d.firstName ?? existing.firstName ?? "";
    const last = d.lastName ?? existing.lastName ?? "";
    const derived = `${first} ${last}`.trim();
    if (derived) patch.clientName = derived;
  } else if (d.clientName !== undefined) {
    patch.clientName = d.clientName;
  }
  if (d.contactPhone !== undefined) patch.contactPhone = d.contactPhone || null;
  if (d.productId !== undefined) patch.productId = d.productId;
  if (d.entityId !== undefined) patch.entityId = d.entityId;
  if (d.responsibleId !== undefined) patch.responsibleId = d.responsibleId;
  if (d.expectedModeId !== undefined) patch.expectedModeId = d.expectedModeId;
  if (d.cycle !== undefined) patch.cycle = d.cycle;
  if (d.baseAmount !== undefined) patch.baseAmount = d.baseAmount.toFixed(2);
  if (d.gstRate !== undefined) patch.gstRate = d.gstRate;
  if (d.startDate !== undefined) patch.startDate = d.startDate;
  if (d.retainerStart !== undefined) patch.retainerStart = d.retainerStart;
  if (d.retainerEnd !== undefined) patch.retainerEnd = d.retainerEnd;
  if (d.billDate !== undefined) patch.billDate = d.billDate;
  if (d.emiCount !== undefined) patch.emiCount = d.emiCount;
  if (d.frequency !== undefined) patch.frequency = d.frequency;
  if (d.periods !== undefined) patch.periods = d.periods;
  if (d.endDate !== undefined) patch.endDate = d.endDate;
  if (d.pdcReceived !== undefined) patch.pdcReceived = d.pdcReceived;
  if (d.comments !== undefined) patch.comments = d.comments || null;

  // full_payment always means a single period regardless of what's sent.
  const effectiveCycle = d.cycle ?? existing.cycle;
  if (effectiveCycle === "full_payment") patch.periods = 1;

  try {
    await db.update(outstandingContracts).set(patch).where(eq(outstandingContracts.id, id));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  // For partial_payment / slabs the rows aren't a contract column — pass them
  // through to the engine. If the edit didn't include rows, fall back to the
  // ones already stored so a re-materialize doesn't wipe the schedule.
  let explicit = d.explicitInstallments;
  if (
    explicit === undefined &&
    (effectiveCycle === "partial_payment" || effectiveCycle === "slabs")
  ) {
    const stored = await listInstallmentsForContract(id);
    explicit = stored.map((r) => ({ dueDate: r.dueDate, amount: Number(r.amount) }));
  }

  try {
    await materializeInstallments(id, explicit);
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  revalidatePath("/outstanding");
  return { ok: true };
}

async function setContractStatus(
  id: string,
  status: "written_off" | "closed",
): Promise<ActionResult> {
  const me = await requireWorkspaceAdmin("sales");
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "Invalid contract id" };
  }

  try {
    await db
      .update(outstandingContracts)
      .set({ status, updatedAt: new Date() })
      .where(eq(outstandingContracts.id, id));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  revalidatePath("/outstanding");
  return { ok: true };
}

/** Mark a contract as written off (admin). */
export async function writeOffContract(id: string): Promise<ActionResult> {
  return setContractStatus(id, "written_off");
}

/** Mark a contract as closed (admin). */
export async function closeContract(id: string): Promise<ActionResult> {
  return setContractStatus(id, "closed");
}

/** Override a single installment's due date / amount (admin). */
export async function editInstallment(
  id: string,
  fields: { dueDate?: string; amount?: number },
): Promise<ActionResult> {
  const me = await requireWorkspaceAdmin("sales");
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "Invalid installment id" };
  }
  const parsed = EditInstallmentSchema.safeParse(fields);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const patch: Partial<typeof outstandingInstallments.$inferInsert> = {
    isOverride: true,
    updatedAt: new Date(),
  };
  if (parsed.data.dueDate !== undefined) patch.dueDate = parsed.data.dueDate;
  if (parsed.data.amount !== undefined) patch.amount = parsed.data.amount.toFixed(2);

  try {
    await db.update(outstandingInstallments).set(patch).where(eq(outstandingInstallments.id, id));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  revalidatePath("/outstanding");
  return { ok: true };
}

/** Add a one-off (override) installment to a contract (admin). */
export async function addAdhocInstallment(
  contractId: string,
  fields: { dueDate: string; amount: number },
): Promise<ActionResult<{ id: string }>> {
  const me = await requireWorkspaceAdmin("sales");
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  if (!z.string().uuid().safeParse(contractId).success) {
    return { ok: false, error: "Invalid contract id" };
  }
  const parsed = AdhocInstallmentSchema.safeParse(fields);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  let inserted;
  try {
    [inserted] = await db
      .insert(outstandingInstallments)
      .values({
        contractId,
        periodIndex: null,
        dueDate: parsed.data.dueDate,
        amount: parsed.data.amount.toFixed(2),
        isOverride: true,
      })
      .returning({ id: outstandingInstallments.id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }
  if (!inserted) return { ok: false, error: "DB: insert returned no row" };

  revalidatePath("/outstanding");
  return { ok: true, id: inserted.id };
}

/**
 * Fetch a contract's installments (admin). Thin server-action wrapper around
 * the read query so the client-side installment editor can lazy-load rows
 * when a contract's editor is opened.
 */
export async function fetchInstallmentsForContract(
  contractId: string,
): Promise<ActionResult<{ rows: AdminInstallmentRow[] }>> {
  const me = await requireWorkspaceAdmin("sales");
  const limited = rateLimitOrError(me.id, "read");
  if (limited) return limited;

  if (!z.string().uuid().safeParse(contractId).success) {
    return { ok: false, error: "Invalid contract id" };
  }

  try {
    const rows = await listInstallmentsForContract(contractId);
    return { ok: true, rows };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }
}

/** Delete a single installment (admin). */
export async function deleteInstallment(id: string): Promise<ActionResult> {
  const me = await requireWorkspaceAdmin("sales");
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "Invalid installment id" };
  }

  try {
    await db.delete(outstandingInstallments).where(eq(outstandingInstallments.id, id));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  revalidatePath("/outstanding");
  return { ok: true };
}

/** Record a collection / receipt (any signed-in employee). */
export async function createCollection(input: {
  clientName: string;
  contractId?: string | null;
  amount: number;
  paymentModeId: string;
  responsibleId: string;
  collectedAt?: string;
  comments?: string;
}): Promise<ActionResult<{ id: string }>> {
  const me = await requireWorkspace("sales");
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = CreateCollectionSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  const d = parsed.data;

  let inserted;
  try {
    [inserted] = await db
      .insert(outstandingCollections)
      .values({
        clientName: d.clientName,
        contractId: d.contractId ?? null,
        amount: d.amount.toFixed(2),
        paymentModeId: d.paymentModeId,
        responsibleId: d.responsibleId,
        collectedAt: d.collectedAt ?? todayISO(),
        comments: d.comments || null,
        createdById: me.id,
      })
      .returning({ id: outstandingCollections.id });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }
  if (!inserted) return { ok: false, error: "DB: insert returned no row" };

  revalidatePath("/outstanding");
  return { ok: true, id: inserted.id };
}

// ── Attachments ────────────────────────────────────────────────────────────

const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

// Allowlist mirrors the documents library: images + pdf + common office docs.
const ATTACHMENT_MIME_ALLOWLIST = new Set<string>([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
  "image/heic",
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
  "text/csv",
]);

function safeAttachmentName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "file";
}

// Mirrors DISALLOWED_EXTENSIONS in app/(app)/documents/actions.ts. Kept as a
// literal copy (not imported) because that regex is a module-private constant
// in the documents server action — replicated here to keep the two upload
// guards consistent. If documents.ts ever exports it, switch to an import.
const DISALLOWED_ATTACHMENT_EXTENSIONS =
  /\.(exe|com|cmd|bat|msi|scr|pif|vbs|js|mjs|cjs|jar|sh|bash|app|dmg|ps1|psm1|reg|hta|cpl|gadget|html?|xhtml|svgz?)$/i;

/** Upload a contract/collection attachment (any signed-in employee). */
export async function uploadOutstandingAttachment(
  form: FormData,
): Promise<ActionResult<{ id: string }>> {
  const me = await requireWorkspace("sales");
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const ownerType = form.get("ownerType");
  if (ownerType !== "contract" && ownerType !== "collection") {
    return { ok: false, error: "Invalid owner type" };
  }
  const ownerId = form.get("ownerId");
  if (typeof ownerId !== "string" || !z.string().uuid().safeParse(ownerId).success) {
    return { ok: false, error: "Invalid owner id" };
  }

  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: "Pick a file to upload." };
  }
  if (file.size > MAX_ATTACHMENT_BYTES) {
    return { ok: false, error: "File exceeds 25 MB." };
  }
  if (DISALLOWED_ATTACHMENT_EXTENSIONS.test(file.name)) {
    return { ok: false, error: "This file type is not allowed." };
  }
  if (!file.type || !ATTACHMENT_MIME_ALLOWLIST.has(file.type)) {
    return { ok: false, error: "This file type is not allowed." };
  }

  const path = `outstanding/${ownerType}/${crypto.randomUUID()}/${safeAttachmentName(file.name)}`;
  const admin = getSupabaseAdmin();
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: upErr } = await admin.storage
    .from(DOCUMENTS_BUCKET)
    .upload(path, buffer, {
      contentType: file.type || "application/octet-stream",
      upsert: false,
    });
  if (upErr) return { ok: false, error: `Upload failed: ${upErr.message}` };

  let inserted;
  try {
    [inserted] = await db
      .insert(outstandingAttachments)
      .values({
        ownerType,
        ownerId,
        storagePath: path,
        fileName: file.name.slice(0, 255),
        mimeType: file.type || null,
        sizeBytes: file.size,
        uploadedById: me.id,
      })
      .returning({ id: outstandingAttachments.id });
  } catch (err: unknown) {
    await admin.storage.from(DOCUMENTS_BUCKET).remove([path]).catch(() => {});
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }
  if (!inserted) {
    await admin.storage.from(DOCUMENTS_BUCKET).remove([path]).catch(() => {});
    return { ok: false, error: "DB: insert returned no row" };
  }

  revalidatePath("/outstanding");
  return { ok: true, id: inserted.id };
}

export interface OutstandingAttachmentView {
  id: string;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number | null;
  url: string | null;
}

/** List attachments for an owner with fresh signed download URLs. */
export async function listOutstandingAttachments(
  ownerType: "contract" | "collection",
  ownerId: string,
): Promise<OutstandingAttachmentView[]> {
  const me = await requireWorkspace("sales");
  const limited = rateLimitOrError(me.id, "read");
  if (limited) return [];

  if (!z.string().uuid().safeParse(ownerId).success) return [];

  const rows = await db
    .select({
      id: outstandingAttachments.id,
      fileName: outstandingAttachments.fileName,
      mimeType: outstandingAttachments.mimeType,
      sizeBytes: outstandingAttachments.sizeBytes,
      storagePath: outstandingAttachments.storagePath,
    })
    .from(outstandingAttachments)
    .where(
      sql`${outstandingAttachments.ownerType} = ${ownerType} AND ${outstandingAttachments.ownerId} = ${ownerId}`,
    );
  if (rows.length === 0) return [];

  const admin = getSupabaseAdmin();
  const { data: signed } = await admin.storage
    .from(DOCUMENTS_BUCKET)
    .createSignedUrls(
      rows.map((r) => r.storagePath),
      3600,
    );
  const urlByPath = new Map<string, string>();
  (signed ?? []).forEach((s, i) => {
    const path = rows[i]?.storagePath;
    if (path && s.signedUrl) urlByPath.set(path, s.signedUrl);
  });

  return rows.map((r) => ({
    id: r.id,
    fileName: r.fileName,
    mimeType: r.mimeType,
    sizeBytes: r.sizeBytes,
    url: urlByPath.get(r.storagePath) ?? null,
  }));
}

// ── Bulk import (admin) ──────────────────────────────────────────────────────
// In-app counterpart to scripts/import-outstanding*.ts: parse CSV (uploaded or
// fetched from a public Google Sheet), shape rows through the shared shaper,
// run the pure mappers, preview the result with NO writes, then confirm into a
// single transaction tagged with a fresh importBatchId so it can be undone.

type ImportKind = "file" | "gsheet";

interface ImportPayload {
  kind: ImportKind;
  outstandingCsv?: string;
  collectionCsv?: string;
  sheetUrl?: string;
  sheetCollectionUrl?: string;
}

const ImportPayloadSchema = z.object({
  kind: z.enum(["file", "gsheet"]),
  outstandingCsv: z.string().max(10_000_000).optional(),
  collectionCsv: z.string().max(10_000_000).optional(),
  sheetUrl: z.string().max(2000).optional(),
  sheetCollectionUrl: z.string().max(2000).optional(),
});

export interface ImportPreview {
  contracts: number;
  installments: number;
  collections: number;
  totalOutstanding: number;
  totalCollected: number;
  sample: {
    clientName: string;
    product: string | null;
    cycle: string;
    installments: number;
    amount: number;
  }[];
  unmatched: {
    products: string[];
    entities: string[];
    modes: string[];
    responsibles: string[];
  };
}

function parseCsvText(text: string): Record<string, string>[] {
  return parseCsv(text, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
    relax_column_count: true,
  }) as Record<string, string>[];
}

/** Looks like an HTML page (a private/locked Google Sheet), not CSV. */
function looksLikeHtml(text: string): boolean {
  const head = text.slice(0, 400).trim().toLowerCase();
  return head.startsWith("<!doctype html") || head.startsWith("<html") || head.includes("<head");
}

/**
 * Resolve the payload to { outstandingCsv, collectionCsv } CSV text, fetching
 * from Google Sheets server-side for the gsheet kind. Returns an error string
 * on any fetch/visibility failure.
 */
async function resolveCsv(
  payload: ImportPayload,
): Promise<{ ok: true; outstandingCsv: string; collectionCsv: string } | { ok: false; error: string }> {
  if (payload.kind === "file") {
    return {
      ok: true,
      outstandingCsv: payload.outstandingCsv ?? "",
      collectionCsv: payload.collectionCsv ?? "",
    };
  }

  // gsheet: convert + fetch each provided tab URL.
  async function fetchTab(shareUrl: string | undefined): Promise<{ ok: true; csv: string } | { ok: false; error: string }> {
    const url = (shareUrl ?? "").trim();
    if (!url) return { ok: true, csv: "" };
    const csvUrl = sheetCsvUrl(url);
    if (!csvUrl) return { ok: false, error: "Not a Google Sheets link." };
    let res: Response;
    try {
      res = await fetch(csvUrl, { redirect: "follow" });
    } catch {
      return { ok: false, error: "Could not reach Google Sheets. Check the link and your connection." };
    }
    if (!res.ok) {
      return {
        ok: false,
        error: "Make the sheet link-viewable (Anyone with the link can view).",
      };
    }
    const text = await res.text();
    if (looksLikeHtml(text)) {
      return {
        ok: false,
        error: "Make the sheet link-viewable (Anyone with the link can view).",
      };
    }
    return { ok: true, csv: text };
  }

  const out = await fetchTab(payload.sheetUrl);
  if (!out.ok) return out;
  const col = await fetchTab(payload.sheetCollectionUrl);
  if (!col.ok) return col;
  return { ok: true, outstandingCsv: out.csv, collectionCsv: col.csv };
}

/** Parse + shape + map the resolved CSV text into the import specs. */
function buildSpecs(outstandingCsv: string, collectionCsv: string) {
  const outRows = outstandingCsv.trim() ? parseCsvText(outstandingCsv).map(pickOutstanding) : [];
  const colRows = collectionCsv.trim() ? parseCsvText(collectionCsv).map(pickCollection) : [];
  const { contracts } = mapOutstandingRows(outRows);
  const collections = mapCollectionRows(colRows);
  return { contracts, collections };
}

/**
 * Preview an import — parse + map + report counts/totals/unmatched, NO writes.
 */
export async function previewImport(
  input: ImportPayload,
): Promise<ActionResult<{ preview: ImportPreview }>> {
  const me = await requireWorkspaceAdmin("sales");
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = ImportPayloadSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const resolved = await resolveCsv(parsed.data);
  if (!resolved.ok) return resolved;
  if (!resolved.outstandingCsv.trim() && !resolved.collectionCsv.trim()) {
    return { ok: false, error: "No data found. Provide an Outstanding and/or Collection sheet." };
  }

  let contracts, collections;
  try {
    ({ contracts, collections } = buildSpecs(resolved.outstandingCsv, resolved.collectionCsv));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Could not parse the data: ${msg}` };
  }

  if (contracts.length === 0 && collections.length === 0) {
    return {
      ok: false,
      error: "Parsed 0 rows. Column headers must match the Outstanding sheet format.",
    };
  }

  const installments = contracts.reduce((s, c) => s + c.installments.length, 0);
  const totalScheduled = contracts.reduce(
    (s, c) => s + c.installments.reduce((a, i) => a + i.amount, 0),
    0,
  );
  const totalCollected = collections.reduce((s, c) => s + c.amount, 0);

  // Resolve roster names read-only for the unmatched report.
  const [prodRows, entRows, modeRows, respRows] = await Promise.all([
    db.select({ name: outstandingProducts.name }).from(outstandingProducts),
    db.select({ name: outstandingEntitiesTbl.name }).from(outstandingEntitiesTbl),
    db.select({ name: outstandingPaymentModes.name }).from(outstandingPaymentModes),
    db.select({ name: outstandingResponsibles.name }).from(outstandingResponsibles),
  ]);
  const lset = (rows: { name: string }[]) =>
    new Set(rows.map((r) => r.name.trim().toLowerCase()));
  const prodSet = lset(prodRows);
  const entSet = lset(entRows);
  const modeSet = lset(modeRows);
  const respSet = lset(respRows);

  const unmatched = {
    products: new Set<string>(),
    entities: new Set<string>(),
    modes: new Set<string>(),
    responsibles: new Set<string>(),
  };
  const check = (set: Set<string>, into: Set<string>, name: string | null) => {
    const t = (name ?? "").trim();
    if (t && !set.has(t.toLowerCase())) into.add(t);
  };
  for (const c of contracts) {
    check(prodSet, unmatched.products, c.product);
    check(entSet, unmatched.entities, c.entity);
    check(respSet, unmatched.responsibles, c.responsible);
  }
  for (const col of collections) {
    check(modeSet, unmatched.modes, col.paymentMode);
    check(respSet, unmatched.responsibles, col.responsible);
  }

  const sample = contracts.slice(0, 5).map((c) => ({
    clientName: c.clientName,
    product: c.product,
    cycle: c.cycle,
    installments: c.installments.length,
    amount: c.installments.reduce((a, i) => a + i.amount, 0),
  }));

  return {
    ok: true,
    preview: {
      contracts: contracts.length,
      installments,
      collections: collections.length,
      totalOutstanding: totalScheduled - totalCollected,
      totalCollected,
      sample,
      unmatched: {
        products: [...unmatched.products].sort(),
        entities: [...unmatched.entities].sort(),
        modes: [...unmatched.modes].sort(),
        responsibles: [...unmatched.responsibles].sort(),
      },
    },
  };
}

/** Resolve a roster name → id within a txn, creating the row if missing. */
async function resolveOrCreateRoster(
  tx: Parameters<Parameters<typeof db.transaction>[0]>[0],
  table:
    | typeof outstandingProducts
    | typeof outstandingEntitiesTbl
    | typeof outstandingPaymentModes
    | typeof outstandingResponsibles,
  cache: Map<string, string>,
  name: string | null,
): Promise<string | null> {
  const t = (name ?? "").trim();
  if (!t) return null;
  const key = t.toLowerCase();
  const cached = cache.get(key);
  if (cached) return cached;
  const [existing] = await tx
    .select({ id: table.id })
    .from(table)
    .where(sql`lower(${table.name}) = ${key}`)
    .limit(1);
  if (existing) {
    cache.set(key, existing.id);
    return existing.id;
  }
  const [ins] = await tx
    .insert(table)
    .values({ name: t })
    .onConflictDoNothing()
    .returning({ id: table.id });
  if (ins) {
    cache.set(key, ins.id);
    return ins.id;
  }
  // Lost a conflict race — re-read.
  const [row] = await tx
    .select({ id: table.id })
    .from(table)
    .where(sql`lower(${table.name}) = ${key}`)
    .limit(1);
  if (row) cache.set(key, row.id);
  return row?.id ?? null;
}

/**
 * Confirm an import — re-parse the same payload and insert contracts +
 * installments + collections in a single transaction, all tagged with a fresh
 * importBatchId. Missing rosters (product/entity/mode/responsible) are created
 * so the import is self-sufficient.
 */
export async function confirmImport(
  input: ImportPayload,
): Promise<ActionResult<{ batchId: string; contracts: number; installments: number; collections: number }>> {
  const me = await requireWorkspaceAdmin("sales");
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = ImportPayloadSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const resolved = await resolveCsv(parsed.data);
  if (!resolved.ok) return resolved;

  let contracts, collections;
  try {
    ({ contracts, collections } = buildSpecs(resolved.outstandingCsv, resolved.collectionCsv));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Could not parse the data: ${msg}` };
  }
  if (contracts.length === 0 && collections.length === 0) {
    return { ok: false, error: "Nothing to import." };
  }

  const batchId = crypto.randomUUID();
  let installmentsInserted = 0;

  try {
    await db.transaction(async (tx) => {
      const prodCache = new Map<string, string>();
      const entCache = new Map<string, string>();
      const modeCache = new Map<string, string>();
      const respCache = new Map<string, string>();

      for (const c of contracts) {
        const productId = await resolveOrCreateRoster(tx, outstandingProducts, prodCache, c.product);
        const entityId = await resolveOrCreateRoster(tx, outstandingEntitiesTbl, entCache, c.entity);
        const responsibleId = await resolveOrCreateRoster(tx, outstandingResponsibles, respCache, c.responsible);

        const [insertedContract] = await tx
          .insert(outstandingContracts)
          .values({
            clientName: c.clientName,
            productId,
            entityId,
            responsibleId,
            cycle: c.cycle,
            baseAmount: c.baseAmount.toFixed(2),
            gstRate: c.gstRate,
            startDate: c.startDate,
            periods: null, // verbatim import — do not let the app re-materialize
            pdcReceived: c.pdcReceived,
            status: "active",
            importBatchId: batchId,
            createdById: me.id,
          })
          .returning({ id: outstandingContracts.id });
        const contractId = insertedContract!.id;

        // installments are already sorted by dueDate in the mapper; verbatim.
        const rows = c.installments.map((ins, idx) => ({
          contractId,
          periodIndex: idx,
          dueDate: ins.dueDate,
          amount: ins.amount.toFixed(2),
          isOverride: true, // protect imported rows from re-materialization
        }));
        if (rows.length) {
          await tx.insert(outstandingInstallments).values(rows);
          installmentsInserted += rows.length;
        }
      }

      for (const col of collections) {
        // collectedAt is NOT NULL — fall back to today when the sheet has no date.
        const collectedAt = col.collectedAt || todayISO();
        const paymentModeId = await resolveOrCreateRoster(tx, outstandingPaymentModes, modeCache, col.paymentMode);
        const responsibleId = await resolveOrCreateRoster(tx, outstandingResponsibles, respCache, col.responsible);
        await tx.insert(outstandingCollections).values({
          clientName: col.clientName,
          contractId: null,
          amount: col.amount.toFixed(2),
          paymentModeId,
          responsibleId,
          collectedAt,
          comments: col.comments,
          importBatchId: batchId,
          createdById: me.id,
        });
      }
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  revalidatePath("/outstanding");
  return {
    ok: true,
    batchId,
    contracts: contracts.length,
    installments: installmentsInserted,
    collections: collections.length,
  };
}

/**
 * Undo a confirmed import by batch id — delete its collections + contracts
 * (installments cascade off the contract FK). Rosters created during the
 * import are intentionally left in place (harmless + may be referenced now).
 */
export async function undoImport(
  batchId: string,
): Promise<ActionResult<{ contracts: number; collections: number }>> {
  const me = await requireWorkspaceAdmin("sales");
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  if (!z.string().uuid().safeParse(batchId).success) {
    return { ok: false, error: "Invalid batch id" };
  }

  let contractsDeleted = 0;
  let collectionsDeleted = 0;
  try {
    await db.transaction(async (tx) => {
      const delCols = await tx
        .delete(outstandingCollections)
        .where(eq(outstandingCollections.importBatchId, batchId))
        .returning({ id: outstandingCollections.id });
      collectionsDeleted = delCols.length;
      // installments cascade via contract_id FK (onDelete: cascade).
      const delContracts = await tx
        .delete(outstandingContracts)
        .where(eq(outstandingContracts.importBatchId, batchId))
        .returning({ id: outstandingContracts.id });
      contractsDeleted = delContracts.length;
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `DB: ${msg}` };
  }

  revalidatePath("/outstanding");
  return { ok: true, contracts: contractsDeleted, collections: collectionsDeleted };
}

