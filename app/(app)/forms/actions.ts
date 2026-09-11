"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { moduleSubmissions, moduleSubmissionAttachments, formConfigs, productOptions } from "@/db/schema";
import { requireUser, requireAdmin } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { validateFields, type FormFieldDef, type FormFieldType } from "@/lib/forms/field-types";
import { MODULES, MODULE_KEYS, type ModuleKey } from "@/lib/forms/modules";
import {
  resolveRequestFields,
  resolveAdminFields,
  getProductOptions,
} from "@/lib/forms/server";
import {
  buildClaimAttachmentRows,
  type ClaimUploadRef,
} from "@/lib/reimbursements/attachment-rows";

type ActionResult<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

const isModule = (m: string): m is ModuleKey => (MODULE_KEYS as string[]).includes(m);

function revalidateModule(m: ModuleKey) {
  revalidatePath(MODULES[m].path);
}

/* ----------------------------------------------------------------- */
/* Submissions                                                        */
/* ----------------------------------------------------------------- */

/**
 * File a request to a module (any signed-in employee, for themselves).
 *
 * ── `attachments` ──────────────────────────────────────────────────────────
 * References to documents the BROWSER has already uploaded straight to storage
 * (reimbursement receipts — see app/(app)/reimbursements/attachment-actions.ts
 * for why the bytes do not come through here). Only refs, never file content, so
 * this action's body stays small enough for a serverless request whatever the
 * receipt weighs.
 *
 * They are recorded in the SAME transaction as the submission: a claim that
 * saved without its receipt, or a receipt row orphaned by a failed insert, would
 * both need someone to notice and fix them by hand. Every ref is re-validated
 * by `buildClaimAttachmentRows`, which re-checks the object path against the caller's
 * own prefix — the path travelled through the client, so it is not trusted.
 */
export async function submitModule(input: {
  module: string;
  fields: Record<string, string>;
  attachments?: ClaimUploadRef[];
}): Promise<ActionResult<{ id: string }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!isModule(input.module)) return { ok: false, error: "Unknown form." };

  const [fields, products] = await Promise.all([
    resolveRequestFields(input.module),
    getProductOptions(),
  ]);
  const validated = validateFields(fields, input.fields ?? {}, products);
  if (!validated.ok) return validated;

  try {
    const id = await db.transaction(async (tx) => {
      const [row] = await tx
        .insert(moduleSubmissions)
        .values({ module: input.module, employeeId: me.id, fields: validated.values })
        .returning({ id: moduleSubmissions.id });
      const submissionId = row!.id;

      // Attachments are a REIMBURSEMENT concept — the object prefix, the type
      // allow-list and the size cap are all that module's rules. The other two
      // modules have no file surface, so refs sent for them are ignored rather
      // than stored somewhere nothing will ever read them.
      const refs = input.module === "reimbursement" ? (input.attachments ?? []) : [];
      if (refs.length > 0) {
        const built = buildClaimAttachmentRows(refs, me, submissionId);
        // Throwing rolls the submission back — a claim must not be created
        // without the documents the employee attached to it.
        if (!built.ok) throw new AttachmentError(built.error);
        if (built.rows.length > 0) {
          await tx.insert(moduleSubmissionAttachments).values(built.rows);
        }
      }
      return submissionId;
    });

    revalidateModule(input.module);
    return { ok: true, id };
  } catch (err) {
    if (err instanceof AttachmentError) return { ok: false, error: err.message };
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
}

/** Carries an attachment rejection out of the transaction as a clean message. */
class AttachmentError extends Error {}

/** Admin saves the manual (admin) fields on a submission. */
export async function setModuleAdminFields(input: {
  id: string;
  adminFields: Record<string, string>;
}): Promise<ActionResult> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!/^[0-9a-f-]{36}$/i.test(input.id)) return { ok: false, error: "Invalid id" };

  const [sub] = await db.select().from(moduleSubmissions).where(eq(moduleSubmissions.id, input.id)).limit(1);
  if (!sub || !isModule(sub.module)) return { ok: false, error: "Not found" };

  const fields = await resolveAdminFields(sub.module);
  const validated = validateFields(fields, input.adminFields ?? {}, []);
  if (!validated.ok) return validated;

  try {
    await db
      .update(moduleSubmissions)
      .set({ adminFields: validated.values, updatedAt: new Date() })
      .where(eq(moduleSubmissions.id, input.id));
    revalidateModule(sub.module);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
}

const DecideSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["approved", "rejected", "pending"]),
}).strict();

/** Admin decision: approve / grant / reject. */
export async function decideModule(input: { id: string; status: "approved" | "rejected" | "pending" }): Promise<ActionResult> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = DecideSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid input" };

  const [sub] = await db.select({ module: moduleSubmissions.module }).from(moduleSubmissions).where(eq(moduleSubmissions.id, parsed.data.id)).limit(1);
  if (!sub) return { ok: false, error: "Not found" };

  await db
    .update(moduleSubmissions)
    .set({
      status: parsed.data.status,
      decidedById: parsed.data.status === "pending" ? null : me.id,
      decidedAt: parsed.data.status === "pending" ? null : new Date(),
      updatedAt: new Date(),
    })
    .where(eq(moduleSubmissions.id, parsed.data.id));
  if (isModule(sub.module)) revalidateModule(sub.module);
  return { ok: true };
}

export async function setModuleArchived(input: { id: string; archived: boolean }): Promise<ActionResult> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!/^[0-9a-f-]{36}$/i.test(input.id)) return { ok: false, error: "Invalid id" };
  const [sub] = await db.select({ module: moduleSubmissions.module }).from(moduleSubmissions).where(eq(moduleSubmissions.id, input.id)).limit(1);
  if (!sub) return { ok: false, error: "Not found" };
  await db.update(moduleSubmissions).set({ archived: input.archived, updatedAt: new Date() }).where(eq(moduleSubmissions.id, input.id));
  if (isModule(sub.module)) revalidateModule(sub.module);
  return { ok: true };
}

export async function deleteModuleSubmission(input: { id: string }): Promise<ActionResult> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!/^[0-9a-f-]{36}$/i.test(input.id)) return { ok: false, error: "Invalid id" };
  const [sub] = await db.select({ module: moduleSubmissions.module }).from(moduleSubmissions).where(eq(moduleSubmissions.id, input.id)).limit(1);
  if (!sub) return { ok: false, error: "Not found" };
  await db.delete(moduleSubmissions).where(eq(moduleSubmissions.id, input.id));
  if (isModule(sub.module)) revalidateModule(sub.module);
  return { ok: true };
}

/* ----------------------------------------------------------------- */
/* Admin-editable form definitions                                    */
/* ----------------------------------------------------------------- */

const FIELD_TYPES: FormFieldType[] = ["text", "textarea", "select", "buttons", "product", "date", "number", "email", "tel", "url"];

const FieldSchema: z.ZodType<FormFieldDef> = z.object({
  key: z.string().trim().min(1).max(60).regex(/^[a-z0-9_]+$/i, "Field key: letters, numbers, underscore only"),
  label: z.string().trim().min(1).max(120),
  type: z.enum(FIELD_TYPES as [FormFieldType, ...FormFieldType[]]),
  required: z.boolean().optional(),
  options: z.array(z.string().trim().min(1).max(120)).max(60).optional(),
  placeholder: z.string().trim().max(160).optional(),
  showIf: z.object({ key: z.string().trim().max(60), value: z.string().trim().max(120) }).optional(),
}) as z.ZodType<FormFieldDef>;

const SaveConfigSchema = z.object({
  formKey: z.string().trim().min(1).max(80).regex(/^[a-z0-9:_]+$/i),
  fields: z.array(FieldSchema).max(60),
}).strict();

/** Admin saves a customised field list for a form. */
export async function saveFormConfig(input: { formKey: string; fields: FormFieldDef[] }): Promise<ActionResult> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = SaveConfigSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid form" };

  const keys = parsed.data.fields.map((f) => f.key);
  if (new Set(keys).size !== keys.length) return { ok: false, error: "Duplicate field keys." };

  await db
    .insert(formConfigs)
    .values({ formKey: parsed.data.formKey, fields: parsed.data.fields, updatedById: me.id, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: formConfigs.formKey,
      set: { fields: parsed.data.fields, updatedById: me.id, updatedAt: new Date() },
    });
  revalidatePath("/", "layout");
  return { ok: true };
}

/** Admin resets a form back to its built-in default (delete override). */
export async function resetFormConfig(input: { formKey: string }): Promise<ActionResult> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  await db.delete(formConfigs).where(eq(formConfigs.formKey, input.formKey));
  revalidatePath("/", "layout");
  return { ok: true };
}

/* ----------------------------------------------------------------- */
/* Global Product Name list                                           */
/* ----------------------------------------------------------------- */

export async function addProductOption(input: { label: string }): Promise<ActionResult> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const label = (input.label ?? "").trim().slice(0, 120);
  if (!label) return { ok: false, error: "Enter a product name." };
  await db.insert(productOptions).values({ label }).onConflictDoNothing();
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteProductOption(input: { label: string }): Promise<ActionResult> {
  const me = await requireAdmin();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  await db.delete(productOptions).where(eq(productOptions.label, (input.label ?? "").trim()));
  revalidatePath("/", "layout");
  return { ok: true };
}
