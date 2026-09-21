"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { hrAssetCounters, hrAssets } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { rateLimitOrError } from "@/lib/rate-limit";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import { encryptSecret, decryptSecret } from "@/lib/accounts/crypto";
import { assetPrefix, canEditHrRegisters, formatAssetCode, isAssetType } from "@/lib/hr/registers";

type R<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

/**
 * Asset Register writes. Ruchita, Rutvisha and Manan only (lib/hr/registers.ts),
 * checked here on every call.
 */
async function editor(): Promise<R<{ id: string }>> {
  const me = await requireUser();
  if (!canEditHrRegisters(me.email)) {
    return { ok: false, error: "Only Ruchita, Rutvisha and Manan can change the Asset Register." };
  }
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, error: limited.error };
  return { ok: true, id: me.id };
}

const opt = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .optional()
    .nullable()
    .transform((v) => (v ? v : null));

/** Uploaded file refs must be ones this module minted (see createAssetUploadUrl). */
const filePath = z
  .string()
  .trim()
  .max(400)
  .optional()
  .nullable()
  .refine((v) => !v || v.startsWith("hr-assets/"), "Invalid file reference.")
  .transform((v) => (v ? v : null));

const AssetSchema = z
  .object({
    id: z.string().uuid().optional(),
    assetType: z.string().refine(isAssetType, "Choose an asset type."),
    assetName: z.string().trim().min(1, "Enter the asset name.").max(160),
    location: opt(160),
    serialNo: opt(120),
    model: opt(120),
    make: opt(120),
    description: opt(2000),
    specifications: opt(2000),
    warrantyUntil: z
      .string()
      .trim()
      .optional()
      .nullable()
      .refine((v) => !v || /^\d{4}-\d{2}-\d{2}$/.test(v), "Enter a valid warranty date.")
      .transform((v) => (v ? v : null)),
    underAmc: z.boolean(),
    vendorName: opt(160),
    photoPath: filePath,
    invoicePath: filePath,
    issuedKind: z.enum(["person", "office", "none"]),
    issuedEmployeeId: z.string().uuid().optional().nullable(),
    issuedOffice: opt(160),
    notes: opt(2000),
    username: opt(200),
    /** New password — blank keeps whatever is stored. */
    password: z.string().max(500).optional(),
    clearPassword: z.boolean().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.issuedKind === "person" && !v.issuedEmployeeId) {
      ctx.addIssue({ code: "custom", message: "Choose who the asset is issued to." });
    }
    if (v.issuedKind === "office" && !v.issuedOffice) {
      ctx.addIssue({ code: "custom", message: "Enter the office the asset is issued to." });
    }
  });

export async function saveAsset(input: z.input<typeof AssetSchema>): Promise<R<{ id: string; assetCode: string }>> {
  const who = await editor();
  if (!who.ok) return who;

  const parsed = AssetSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid details." };
  const { id, password, clearPassword, ...v } = parsed.data;

  // Only the fields that matter for the chosen "Issued to" are kept, so a
  // switch from Person to Office never leaves a stale person on the row.
  const values = {
    ...v,
    issuedEmployeeId: v.issuedKind === "person" ? v.issuedEmployeeId ?? null : null,
    issuedOffice: v.issuedKind === "office" ? v.issuedOffice : null,
  };
  const passwordSet = clearPassword ? { passwordEnc: null } : password ? { passwordEnc: encryptSecret(password) } : {};

  try {
    if (id) {
      // The code is NOT regenerated on edit, even if the type changes: a code
      // that is already written on a sticker must keep meaning this asset.
      const [row] = await db
        .update(hrAssets)
        .set({ ...values, ...passwordSet, updatedById: who.id, updatedAt: new Date() })
        .where(eq(hrAssets.id, id))
        .returning({ id: hrAssets.id, assetCode: hrAssets.assetCode });
      if (!row) return { ok: false, error: "That asset no longer exists." };
      revalidatePath("/hr/assets");
      return { ok: true, ...row };
    }

    const prefix = assetPrefix(v.assetType);
    const row = await db.transaction(async (tx) => {
      // ATOMIC NEXT NUMBER: one upsert both creates the counter on first use and
      // increments it under the row lock, so concurrent saves never share a code.
      const [counter] = await tx
        .insert(hrAssetCounters)
        .values({ prefix, last: 1 })
        .onConflictDoUpdate({ target: hrAssetCounters.prefix, set: { last: sql`${hrAssetCounters.last} + 1` } })
        .returning({ last: hrAssetCounters.last });
      const assetCode = formatAssetCode(prefix, counter!.last);
      const [inserted] = await tx
        .insert(hrAssets)
        .values({
          ...values,
          assetCode,
          passwordEnc: password ? encryptSecret(password) : null,
          createdById: who.id,
          updatedById: who.id,
        })
        .returning({ id: hrAssets.id, assetCode: hrAssets.assetCode });
      return inserted!;
    });
    revalidatePath("/hr/assets");
    return { ok: true, ...row };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not save the asset." };
  }
}

export async function deleteAsset(id: string): Promise<R> {
  const who = await editor();
  if (!who.ok) return who;
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Invalid asset." };
  await db.delete(hrAssets).where(eq(hrAssets.id, id));
  revalidatePath("/hr/assets");
  return { ok: true };
}

/** Decrypt one asset's password for an editor who asked to see it. */
export async function revealAssetPassword(id: string): Promise<R<{ password: string }>> {
  const who = await editor();
  if (!who.ok) return who;
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: "Invalid asset." };
  const [row] = await db
    .select({ enc: hrAssets.passwordEnc })
    .from(hrAssets)
    .where(eq(hrAssets.id, id))
    .limit(1);
  if (!row) return { ok: false, error: "That asset no longer exists." };
  try {
    return { ok: true, password: decryptSecret(row.enc) };
  } catch {
    return { ok: false, error: "The stored password could not be read." };
  }
}

const UPLOAD_MAX_BYTES = 25 * 1024 * 1024;
const PHOTO_MIME = /^image\/(jpeg|png|webp|heic|heif)$/i;
const INVOICE_MIME = /^(application\/pdf|image\/(jpeg|png|webp|heic|heif))$/i;

/**
 * A signed URL so the BROWSER uploads the asset photo / original invoice straight
 * to storage (Server Action bodies are capped). The path is minted here, under
 * `hr-assets/`, and saveAsset refuses any path outside it.
 */
export async function createAssetUploadUrl(input: {
  kind: "photo" | "invoice";
  fileName: string;
  mime?: string | null;
  size?: number;
}): Promise<R<{ path: string; token: string; bucket: string }>> {
  const who = await editor();
  if (!who.ok) return who;

  const mime = (input.mime ?? "").toLowerCase();
  if (input.kind === "photo" ? !PHOTO_MIME.test(mime) : !INVOICE_MIME.test(mime)) {
    return {
      ok: false,
      error: input.kind === "photo" ? "Please choose a JPG, PNG or WebP photo." : "Please attach a PDF or an image.",
    };
  }
  if (Number(input.size ?? 0) > UPLOAD_MAX_BYTES) return { ok: false, error: "That file is over 25 MB." };

  const safe = String(input.fileName ?? "file").replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 100) || "file";
  const path = `hr-assets/${randomUUID()}/${input.kind}-${safe}`;
  try {
    const { data, error } = await getSupabaseAdmin().storage.from(DOCUMENTS_BUCKET).createSignedUploadUrl(path);
    if (error || !data) return { ok: false, error: error?.message ?? "Could not start the upload." };
    return { ok: true, path, token: data.token, bucket: DOCUMENTS_BUCKET };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Could not start the upload." };
  }
}
