"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { moduleSubmissions, formConfigs, productOptions } from "@/db/schema";
import { requireUser, requireAdmin } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { validateFields, type FormFieldDef, type FormFieldType } from "@/lib/forms/field-types";
import { MODULES, MODULE_KEYS, type ModuleKey } from "@/lib/forms/modules";
import {
  resolveRequestFields,
  resolveAdminFields,
  getProductOptions,
} from "@/lib/forms/server";

type ActionResult<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

const isModule = (m: string): m is ModuleKey => (MODULE_KEYS as string[]).includes(m);

function revalidateModule(m: ModuleKey) {
  revalidatePath(MODULES[m].path);
}

/* ----------------------------------------------------------------- */
/* Submissions                                                        */
/* ----------------------------------------------------------------- */

/** File a request to a module (any signed-in employee, for themselves). */
export async function submitModule(input: {
  module: string;
  fields: Record<string, string>;
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
    const [row] = await db
      .insert(moduleSubmissions)
      .values({ module: input.module, employeeId: me.id, fields: validated.values })
      .returning({ id: moduleSubmissions.id });
    revalidateModule(input.module);
    return { ok: true, id: row!.id };
  } catch (err) {
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }
}

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
