"use server";

import { existsSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import PDFDocument from "pdfkit";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { format } from "date-fns";
import { db } from "@/lib/db";
import {
  documentSignatures,
  documentInstances,
  employeeDocuments,
  agreements,
  employees,
} from "@/db/schema";
import { getDocType } from "@/lib/hr/letters/registry";
import { requireUser, requireAdmin, forbiddenError } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { rateLimitOrError } from "@/lib/rate-limit";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import { cookies } from "next/headers";
import {
  isDigiLockerConfigured,
  digiLockerConfigStatus,
  buildAuthUrl,
  isPkceEnabled,
  generatePkce,
} from "@/lib/digilocker/config";
import {
  PKCE_COOKIE,
  serializePkceCookie,
  pkceCookieOptions,
} from "@/lib/digilocker/pkce-cookie";
import {
  DOC_KIND_LABELS,
  isDocKind,
  type DocKind,
  type SignatureState,
} from "@/lib/documents/signing";
import { COLORS } from "@/lib/salary/pdf-house-style";
import type { Employee } from "@/db/schema";

/**
 * Documents · DigiLocker-VERIFIED e-signing — server actions.
 *
 * The signer proves identity via DigiLocker OAuth (config.ts), the callback
 * route stamps the VERIFIED identity + MASKED Aadhaar onto the
 * `document_signatures` row, and finalizeSignature() renders + archives a signed
 * PDF (identity + audit block) into the private `documents` bucket.
 *
 * ⚠ AADHAAR ACT: only the masked last-4 ('XXXXXXXX1234') ever appears here — it
 * is set upstream by exchangeCodeForKyc()/the callback. No full 12-digit value
 * is stored, logged, or rendered.
 *
 * Every write is auth-guarded (the doc's own employee, or an admin) +
 * rate-limited. Actions run on the Node.js runtime (pdfkit is a
 * serverExternalPackage), so no `runtime` export is needed on this "use server"
 * module — Vercel runs server actions under Node.
 */

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

const UUID = z.string().uuid();

const LOGO_PATH = path.join(process.cwd(), "public", "logo.png");
const MARK_PATH = path.join(process.cwd(), "public", "logo-mark.png");

function isAdmin(me: Employee): boolean {
  return me.isAdmin || isSuperAdmin(me.email);
}

/** Resolve the source document's owning employee + a display reference. */
async function resolveDoc(
  docKind: DocKind,
  docId: string,
): Promise<
  | { ok: true; employeeId: string; employeeName: string; title: string }
  | { ok: false; error: string }
> {
  if (docKind === "agreement") {
    const [row] = await db
      .select({ a: agreements, name: employees.name })
      .from(agreements)
      .innerJoin(employees, eq(employees.id, agreements.employeeId))
      .where(eq(agreements.id, docId))
      .limit(1);
    if (row) {
      return {
        ok: true,
        employeeId: row.a.employeeId,
        employeeName: row.name,
        title: row.a.title,
      };
    }
    // HR Letters engine: appointment-category instances sign as 'agreement'.
    const inst = await resolveFromInstance(docId);
    return inst ?? { ok: false, error: "Document not found." };
  }
  // 'letter' | 'exit_doc' both live in employee_documents (HR document library).
  const [row] = await db
    .select({ d: employeeDocuments, name: employees.name })
    .from(employeeDocuments)
    .innerJoin(employees, eq(employees.id, employeeDocuments.employeeId))
    .where(eq(employeeDocuments.id, docId))
    .limit(1);
  if (row) {
    return {
      ok: true,
      employeeId: row.d.employeeId,
      employeeName: row.name,
      title: row.d.title,
    };
  }
  // HR Letters engine: composed/CTC instances sign as 'letter'.
  const inst = await resolveFromInstance(docId);
  return inst ?? { ok: false, error: "Document not found." };
}

/**
 * Resolve a signable document that lives in the HR Letters engine's
 * `document_instances` table (the Phase 2/3/4 program) rather than the legacy
 * agreements / employee_documents tables. Instance ids are UUIDs that never
 * collide with the legacy tables, so this is a safe fallback for both doc kinds.
 * Returns null when the id is not a signable instance.
 */
async function resolveFromInstance(
  docId: string,
): Promise<{ ok: true; employeeId: string; employeeName: string; title: string } | null> {
  const [row] = await db
    .select({ i: documentInstances, name: employees.name })
    .from(documentInstances)
    .innerJoin(employees, eq(employees.id, documentInstances.employeeId))
    .where(eq(documentInstances.id, docId))
    .limit(1);
  if (!row || !row.i.employeeId) return null;
  const dt = getDocType(row.i.typeKey);
  return {
    ok: true,
    employeeId: row.i.employeeId,
    employeeName: row.name,
    title: dt?.title ?? row.i.typeKey,
  };
}

/** Latest signature row for a (docKind, docId), if any. */
async function latestSignatureRow(docKind: DocKind, docId: string) {
  const [row] = await db
    .select()
    .from(documentSignatures)
    .where(
      and(
        eq(documentSignatures.docKind, docKind),
        eq(documentSignatures.docId, docId),
      ),
    )
    .orderBy(desc(documentSignatures.createdAt))
    .limit(1);
  return row ?? null;
}

/**
 * Create-or-load the 'pending' signature row for a document and return the
 * DigiLocker authorize URL (using the row id as OAuth `state`). When DigiLocker
 * isn't configured the flow degrades gracefully: { configured: false, authUrl:
 * null } so the UI can render the calm "not configured yet" state.
 *
 * Guard: the doc's own employee, or an admin.
 */
export async function startSignature(input: {
  docKind: string;
  docId: string;
}): Promise<
  Result<{
    signatureId: string;
    authUrl: string | null;
    configured: boolean;
    /** true → DigiLocker isn't set up and this row was self-attested (no e-KYC). */
    selfAttested?: boolean;
    /** the self-attested signer's own name (for the identity card). */
    verifiedName?: string | null;
  }>
> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  if (!isDocKind(input.docKind)) return { ok: false, error: "Unknown document type." };
  if (!UUID.safeParse(input.docId).success) return { ok: false, error: "Invalid document." };
  const docKind: DocKind = input.docKind;

  const doc = await resolveDoc(docKind, input.docId);
  if (!doc.ok) return doc;
  if (!isAdmin(me) && doc.employeeId !== me.id) {
    return { ok: false, error: "This document isn't yours to sign." };
  }

  const configured = isDigiLockerConfigured();

  try {
    let row = await latestSignatureRow(docKind, input.docId);

    // Already signed → hand back the existing row; no re-verification needed.
    if (row && row.status === "signed") {
      return { ok: true, signatureId: row.id, authUrl: null, configured };
    }

    if (!row) {
      const [inserted] = await db
        .insert(documentSignatures)
        .values({
          docKind,
          docId: input.docId,
          signerEmployeeId: doc.employeeId,
          status: "pending",
          createdById: me.id,
        })
        .returning();
      if (!inserted) return { ok: false, error: "Could not start signing." };
      row = inserted;
    }

    if (!configured) {
      // Self-attested fallback (DigiLocker not set up): the signer e-signs with
      // their OWN logged-in identity, clearly marked NOT DigiLocker-verified.
      // Flip a fresh 'pending' row straight to a 'self' verified state so they
      // can draw/type their mark. Auto-upgrades to DigiLocker once keys land.
      if (row.status === "pending") {
        await db
          .update(documentSignatures)
          .set({
            status: "verified",
            method: "self",
            verifiedName: me.name,
            verifiedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(eq(documentSignatures.id, row.id));
      }
      return {
        ok: true,
        signatureId: row.id,
        authUrl: null,
        configured: false,
        selfAttested: true,
        verifiedName: me.name,
      };
    }

    // PKCE: generate a verifier now, stash it in a short-lived HttpOnly cookie
    // (SameSite=Lax survives the DigiLocker redirect back), and send only the
    // S256 challenge to the authorize endpoint. The callback re-presents the
    // verifier at token exchange.
    let codeChallenge: string | undefined;
    if (isPkceEnabled()) {
      const pkce = generatePkce();
      codeChallenge = pkce.challenge;
      const jar = await cookies();
      jar.set(PKCE_COOKIE, serializePkceCookie(row.id, pkce.verifier), pkceCookieOptions());
    }

    const authUrl = buildAuthUrl({ state: row.id, codeChallenge });
    return { ok: true, signatureId: row.id, authUrl, configured: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

const FinalizeSchema = z.object({
  signatureId: UUID,
  signatureKind: z.enum(["drawn", "typed"]),
  signatureText: z.string().trim().max(120).optional(),
  signatureImageDataUrl: z.string().optional(),
});

/** Decode a `data:image/png;base64,...` URL into a Buffer, or null if malformed. */
function parsePngDataUrl(dataUrl: string): Buffer | null {
  const m = /^data:image\/png;base64,([A-Za-z0-9+/=\s]+)$/.exec(dataUrl.trim());
  if (!m || !m[1]) return null;
  try {
    const buf = Buffer.from(m[1].replace(/\s+/g, ""), "base64");
    return buf.length > 0 ? buf : null;
  } catch {
    return null;
  }
}

/**
 * Finalize a VERIFIED signature: accept a drawn PNG (uploaded to the bucket) or a
 * typed legal name, render the signed PDF (title · reference · verified-identity
 * block incl. masked Aadhaar + DigiLocker ref · signature · audit line), archive
 * it, and flip the row to 'signed'.
 *
 * Guard: the doc's own employee, or an admin. Requires the row is 'verified'.
 */
export async function finalizeSignature(input: {
  signatureId: string;
  signatureKind: string;
  signatureText?: string;
  signatureImageDataUrl?: string;
}): Promise<Result<{ pdfPath: string }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const parsed = FinalizeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid signature." };
  }
  const { signatureId, signatureKind, signatureText, signatureImageDataUrl } = parsed.data;

  const [row] = await db
    .select()
    .from(documentSignatures)
    .where(eq(documentSignatures.id, signatureId))
    .limit(1);
  if (!row) return { ok: false, error: "Signing session not found." };

  if (!isDocKind(row.docKind)) return { ok: false, error: "Unknown document type." };
  const docKind: DocKind = row.docKind;

  // Guard: the signer (doc owner) or an admin.
  if (!isAdmin(me) && row.signerEmployeeId !== me.id) {
    return { ok: false, error: "This signature isn't yours to complete." };
  }

  if (row.status === "signed") return { ok: false, error: "This document is already signed." };
  if (row.status !== "verified") {
    return { ok: false, error: "Verify your identity with DigiLocker before signing." };
  }

  const doc = await resolveDoc(docKind, row.docId);
  if (!doc.ok) return doc;

  const signerId = row.signerEmployeeId ?? me.id;
  const admin = getSupabaseAdmin();

  // ── Signature mark ──
  let signatureImagePath: string | null = null;
  let imageBuffer: Buffer | null = null;
  let typedName: string | null = null;

  if (signatureKind === "drawn") {
    if (!signatureImageDataUrl) return { ok: false, error: "Draw your signature to sign." };
    imageBuffer = parsePngDataUrl(signatureImageDataUrl);
    if (!imageBuffer) return { ok: false, error: "The drawn signature couldn't be read." };
    if (imageBuffer.length > 4 * 1024 * 1024) {
      return { ok: false, error: "Signature image is too large." };
    }
    signatureImagePath = `${signerId}/signatures/${randomUUID()}.png`;
    const { error: upErr } = await admin.storage
      .from(DOCUMENTS_BUCKET)
      .upload(signatureImagePath, imageBuffer, {
        contentType: "image/png",
        upsert: false,
      });
    if (upErr) return { ok: false, error: `Upload failed: ${upErr.message}` };
  } else {
    typedName = (signatureText ?? "").trim();
    if (typedName.length < 2) return { ok: false, error: "Type your full legal name to sign." };
  }

  // ── Request metadata (best-effort) ──
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || null;
  const userAgent = h.get("user-agent")?.slice(0, 400) || null;

  const selfAttested = row.method === "self";
  const signedAt = new Date();
  const verifiedNameForConsent = row.verifiedName ?? doc.employeeName;
  const consentText = selfAttested
    ? `I, ${verifiedNameForConsent}, confirm I have read and willingly e-sign the ${DOC_KIND_LABELS[docKind]} "${doc.title}". This is a SELF-ATTESTED electronic signature — my identity was NOT verified via DigiLocker (Aadhaar e-KYC). This signature is legally attributable to me.`
    : `I, ${verifiedNameForConsent}, confirm my identity was verified via DigiLocker (Aadhaar e-KYC) and I willingly e-sign the ${DOC_KIND_LABELS[docKind]} "${doc.title}". This signature and the identity block below are legally attributable to me.`;

  // ── Render the signed PDF ──
  let pdfBuffer: Buffer;
  try {
    pdfBuffer = await buildSignedPdf({
      docKindLabel: DOC_KIND_LABELS[docKind],
      title: doc.title,
      docId: row.docId,
      employeeName: doc.employeeName,
      selfAttested,
      identity: {
        name: row.verifiedName,
        dob: row.verifiedDob,
        gender: row.verifiedGender,
        address: row.verifiedAddress,
        maskedAadhaar: row.maskedAadhaar,
        ref: row.digilockerRef,
        verifiedAt: row.verifiedAt,
      },
      signature: { kind: signatureKind, text: typedName, imageBuffer },
      consentText,
      ip,
      signedAt,
    });
  } catch (err) {
    // Roll back the just-uploaded signature image on render failure.
    if (signatureImagePath) {
      await admin.storage.from(DOCUMENTS_BUCKET).remove([signatureImagePath]).catch(() => {});
    }
    return { ok: false, error: `Could not render the signed PDF: ${err instanceof Error ? err.message : String(err)}` };
  }

  const signedPdfPath = `${signerId}/signed/${randomUUID()}.pdf`;
  const { error: pdfErr } = await admin.storage
    .from(DOCUMENTS_BUCKET)
    .upload(signedPdfPath, pdfBuffer, {
      contentType: "application/pdf",
      upsert: false,
    });
  if (pdfErr) {
    if (signatureImagePath) {
      await admin.storage.from(DOCUMENTS_BUCKET).remove([signatureImagePath]).catch(() => {});
    }
    return { ok: false, error: `Upload failed: ${pdfErr.message}` };
  }

  try {
    await db
      .update(documentSignatures)
      .set({
        status: "signed",
        signatureKind,
        signatureText: typedName,
        signatureImagePath,
        consentText,
        signedPdfPath,
        signedAt,
        ip,
        userAgent,
        updatedAt: new Date(),
      })
      .where(eq(documentSignatures.id, row.id));
  } catch (err) {
    await admin.storage
      .from(DOCUMENTS_BUCKET)
      .remove(signatureImagePath ? [signedPdfPath, signatureImagePath] : [signedPdfPath])
      .catch(() => {});
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }

  // Mirror: when the signed document is a POLICY (a letter-kind instance whose
  // typeKey is a registered policy), flip its policy_compliance row to `signed`
  // so the employee portal ledger agrees with this signature (the source of
  // truth). Best-effort — a mirror failure must never fail a completed signing.
  if (docKind === "letter") {
    try {
      const { policyKeyForInstance, markPolicySigned } = await import("@/lib/hr/policies/compliance-sync");
      const policyKey = await policyKeyForInstance(row.docId);
      if (policyKey) await markPolicySigned(signerId, policyKey, row.docId, signedAt);
    } catch (err) {
      console.error("[finalizeSignature] policy_compliance signed mirror failed", err);
    }
  }

  revalidatePath("/documents/sign");
  revalidatePath(docKind === "agreement" ? "/agreements" : "/letters");
  revalidatePath("/hr/letters");
  return { ok: true, pdfPath: signedPdfPath };
}

/**
 * Current signature state for a document — drives the sign UI (status, verified
 * identity display-back, signature artefacts, configured flag).
 *
 * Guard: the doc's own employee, or an admin (throws Forbidden otherwise).
 */
export async function getSignatureState(input: {
  docKind: string;
  docId: string;
}): Promise<SignatureState> {
  const me = await requireUser();

  if (!isDocKind(input.docKind)) throw new Error("Unknown document type.");
  const docKind: DocKind = input.docKind;
  if (!UUID.safeParse(input.docId).success) throw new Error("Invalid document.");

  const doc = await resolveDoc(docKind, input.docId);
  if (!doc.ok) throw new Error(doc.error);
  if (!isAdmin(me) && doc.employeeId !== me.id) throw forbiddenError();

  const row = await latestSignatureRow(docKind, input.docId);
  const configStatus = digiLockerConfigStatus();

  return {
    exists: row !== null,
    signatureId: row?.id ?? null,
    docKind,
    docId: input.docId,
    status: row?.status ?? "pending",
    method: row?.method ?? "digilocker",
    signerEmployeeId: row?.signerEmployeeId ?? doc.employeeId,
    identity: {
      name: row?.verifiedName ?? null,
      dob: row?.verifiedDob ?? null,
      gender: row?.verifiedGender ?? null,
      address: row?.verifiedAddress ?? null,
      maskedAadhaar: row?.maskedAadhaar ?? null,
      photoPath: row?.photoPath ?? null,
      ref: row?.digilockerRef ?? null,
      verifiedAt: row?.verifiedAt ? row.verifiedAt.toISOString() : null,
    },
    signature: {
      kind: row?.signatureKind ?? null,
      text: row?.signatureText ?? null,
      imagePath: row?.signatureImagePath ?? null,
      consentText: row?.consentText ?? null,
      signedPdfPath: row?.signedPdfPath ?? null,
      signedAt: row?.signedAt ? row.signedAt.toISOString() : null,
    },
    digilockerConfigured: configStatus.configured,
    digilockerMissingEnv: configStatus.missing,
  };
}

/** One row in the admin HR signature-status view. Masked Aadhaar only. */
export interface SignatureAdminRow {
  id: string;
  docKind: DocKind;
  docId: string;
  status: string;
  signerEmployeeId: string | null;
  verifiedName: string | null;
  maskedAadhaar: string | null;
  digilockerRef: string | null;
  verifiedAt: string | null;
  signatureKind: "drawn" | "typed" | null;
  signedPdfPath: string | null;
  signedAt: string | null;
  ip: string | null;
  createdAt: string;
}

/** Admin HR status view: every signature row for a document, newest first. */
export async function listSignaturesFor(input: {
  docKind: string;
  docId: string;
}): Promise<Result<{ rows: SignatureAdminRow[] }>> {
  await requireAdmin();

  if (!isDocKind(input.docKind)) return { ok: false, error: "Unknown document type." };
  const docKind: DocKind = input.docKind;
  if (!UUID.safeParse(input.docId).success) return { ok: false, error: "Invalid document." };

  const rows = await db
    .select()
    .from(documentSignatures)
    .where(
      and(
        eq(documentSignatures.docKind, docKind),
        eq(documentSignatures.docId, input.docId),
      ),
    )
    .orderBy(desc(documentSignatures.createdAt));

  return {
    ok: true,
    rows: rows.map((r) => ({
      id: r.id,
      docKind,
      docId: r.docId,
      status: r.status,
      signerEmployeeId: r.signerEmployeeId,
      verifiedName: r.verifiedName,
      maskedAadhaar: r.maskedAadhaar,
      digilockerRef: r.digilockerRef,
      verifiedAt: r.verifiedAt ? r.verifiedAt.toISOString() : null,
      signatureKind: r.signatureKind,
      signedPdfPath: r.signedPdfPath,
      signedAt: r.signedAt ? r.signedAt.toISOString() : null,
      ip: r.ip,
      createdAt: r.createdAt.toISOString(),
    })),
  };
}

/**
 * Mint short-lived signed URLs for a signature row's private assets so the UI
 * can display the DigiLocker photo (verified state) and offer a "Download signed
 * PDF" link (signed state). Nothing is proxied through the app — authorization
 * lives here (owner or admin), the browser fetches Storage directly.
 *
 * Guard: the doc's own employee, or an admin.
 */
export async function getSignatureAssetUrls(input: {
  signatureId: string;
}): Promise<Result<{ pdfUrl: string | null; photoUrl: string | null }>> {
  const me = await requireUser();

  if (!UUID.safeParse(input.signatureId).success) {
    return { ok: false, error: "Invalid signing session." };
  }

  const [row] = await db
    .select()
    .from(documentSignatures)
    .where(eq(documentSignatures.id, input.signatureId))
    .limit(1);
  if (!row) return { ok: false, error: "Signing session not found." };

  if (!isAdmin(me) && row.signerEmployeeId !== me.id) {
    return { ok: false, error: "Forbidden" };
  }

  const admin = getSupabaseAdmin();
  const TTL = 300; // 5 minutes

  let pdfUrl: string | null = null;
  let photoUrl: string | null = null;

  if (row.signedPdfPath) {
    const { data } = await admin.storage
      .from(DOCUMENTS_BUCKET)
      .createSignedUrl(row.signedPdfPath, TTL, { download: true });
    pdfUrl = data?.signedUrl ?? null;
  }
  if (row.photoPath) {
    const { data } = await admin.storage
      .from(DOCUMENTS_BUCKET)
      .createSignedUrl(row.photoPath, TTL);
    photoUrl = data?.signedUrl ?? null;
  }

  return { ok: true, pdfUrl, photoUrl };
}

// ─────────────────────────────────────────────────────────────────────────────
// Signed-PDF renderer (pdfkit, house style). Not exported (this is a "use
// server" module — only async server actions may be exported).
// ─────────────────────────────────────────────────────────────────────────────

interface SignedPdfInput {
  docKindLabel: string;
  title: string;
  docId: string;
  employeeName: string;
  /** true → self-attested (no DigiLocker); the PDF drops the verified-identity claims. */
  selfAttested: boolean;
  identity: {
    name: string | null;
    dob: string | null;
    gender: string | null;
    address: string | null;
    maskedAadhaar: string | null;
    ref: string | null;
    verifiedAt: Date | null;
  };
  signature: { kind: "drawn" | "typed"; text: string | null; imageBuffer: Buffer | null };
  consentText: string;
  ip: string | null;
  signedAt: Date;
}

function fmtStamp(d: Date): string {
  return format(d, "EEE, dd MMM yyyy · HH:mm");
}

async function buildSignedPdf(input: SignedPdfInput): Promise<Buffer> {
  const doc = new PDFDocument({
    size: "A4",
    layout: "portrait",
    margin: 56,
    info: {
      Title: `${input.title} — Signed`,
      Author: "Altus Corp Dashboard",
      Subject: `${input.selfAttested ? "Self-attested e-signature" : "DigiLocker-verified e-signature"} · ${input.docKindLabel}`,
    },
  });

  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
  });

  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  const width = right - left;

  // ── Full-page border ──
  doc
    .save()
    .strokeColor(COLORS.hairlineStrong)
    .lineWidth(1)
    .rect(left - 16, 26, width + 32, doc.page.height - 52)
    .stroke()
    .restore();

  // ── Watermark ──
  if (existsSync(MARK_PATH)) {
    try {
      const wm = 360;
      doc.save();
      doc.opacity(0.05);
      doc.image(MARK_PATH, doc.page.width / 2 - wm / 2, doc.page.height / 2 - wm / 2, {
        width: wm,
      });
      doc.opacity(1);
      doc.restore();
    } catch {
      /* missing/corrupt asset → no watermark */
    }
  }

  // ── Brand stripe ──
  doc.save().rect(0, 0, doc.page.width, 5).fill(COLORS.brand).restore();
  doc.save().rect(0, 5, doc.page.width, 1.2).fill(COLORS.brandDeep).restore();

  // ── Masthead ──
  const headerTop = doc.page.margins.top + 2;
  const LOGO_H = 44;
  if (existsSync(LOGO_PATH)) {
    try {
      doc.image(LOGO_PATH, left, headerTop, { height: LOGO_H });
    } catch {
      /* text-only masthead */
    }
  }
  doc
    .font("Helvetica-Bold")
    .fontSize(15)
    .fillColor(COLORS.ink)
    .text("ALTUS CORP", left, headerTop + 2, {
      width,
      align: "right",
      characterSpacing: 0.4,
      lineBreak: false,
    });
  doc
    .font("Helvetica")
    .fontSize(8.5)
    .fillColor(COLORS.inkSoft)
    .text(input.selfAttested ? "DIGITALLY SIGNED · SELF-ATTESTED" : "DIGITALLY SIGNED · DIGILOCKER VERIFIED", left, headerTop + 22, {
      width,
      align: "right",
      characterSpacing: 1.2,
      lineBreak: false,
    });
  const mastheadBottom = headerTop + Math.max(LOGO_H, 34) + 8;
  doc
    .save()
    .strokeColor(COLORS.hairline)
    .lineWidth(0.6)
    .moveTo(left, mastheadBottom)
    .lineTo(right, mastheadBottom)
    .stroke()
    .restore();
  doc.y = mastheadBottom + 16;

  // ── Red title band ──
  const titleY = doc.y;
  doc.save().rect(left, titleY, width, 30).fill(COLORS.brand).restore();
  doc
    .font("Helvetica-Bold")
    .fontSize(12.5)
    .fillColor("#FFFFFF")
    .text(input.title.toUpperCase(), left + 12, titleY + 9, {
      width: width - 24,
      characterSpacing: 0.7,
      lineBreak: false,
      ellipsis: true,
    });
  doc.y = titleY + 30 + 14;

  // ── Document reference ──
  doc
    .font("Helvetica")
    .fontSize(9.5)
    .fillColor(COLORS.inkMuted)
    .text(`${input.docKindLabel} · ${input.employeeName}`, left, doc.y, {
      width,
      lineBreak: false,
    });
  doc.y += 13;
  doc
    .font("Helvetica")
    .fontSize(8.5)
    .fillColor(COLORS.inkFaint)
    .text(`Reference: ${input.docId}`, left, doc.y, { width, lineBreak: false });
  doc.y += 20;

  // ── VERIFIED IDENTITY block ──
  drawSectionHeading(doc, input.selfAttested ? "Signatory — Self-Attested" : "Verified Identity — DigiLocker e-KYC");
  const idRows: Array<[string, string]> = input.selfAttested
    ? [
        ["Name", input.identity.name ?? input.employeeName],
        ["Identity", "Self-attested — NOT DigiLocker-verified"],
        ["Signed At", fmtStamp(input.identity.verifiedAt ?? input.signedAt)],
      ]
    : [
        ["Name", input.identity.name ?? "—"],
        ["Date of Birth", input.identity.dob ?? "—"],
        ["Gender", input.identity.gender ?? "—"],
        ["Address", input.identity.address ?? "—"],
        ["Aadhaar (masked)", input.identity.maskedAadhaar ?? "—"],
        ["DigiLocker Ref", input.identity.ref ?? "—"],
        ["Verified At", input.identity.verifiedAt ? fmtStamp(input.identity.verifiedAt) : "—"],
      ];
  const labelW = 130;
  for (const [label, value] of idRows) {
    const rowTop = doc.y;
    doc
      .font("Helvetica")
      .fontSize(9.5)
      .fillColor(COLORS.inkSoft)
      .text(label, left, rowTop, { width: labelW, lineBreak: false });
    const valH = doc.heightOfString(value, {
      width: width - labelW - 8,
      lineGap: 1,
    });
    doc
      .font("Helvetica-Bold")
      .fontSize(9.5)
      .fillColor(COLORS.ink)
      .text(value, left + labelW + 8, rowTop, {
        width: width - labelW - 8,
        lineGap: 1,
      });
    doc.y = rowTop + Math.max(15, valH + 4);
  }
  doc.y += 8;

  // ── SIGNATURE block ──
  drawSectionHeading(doc, "Signature");
  const sigTop = doc.y;
  if (input.signature.kind === "drawn" && input.signature.imageBuffer) {
    try {
      doc.image(input.signature.imageBuffer, left, sigTop, { fit: [240, 90] });
    } catch {
      doc
        .font("Helvetica-Oblique")
        .fontSize(15)
        .fillColor(COLORS.inkSoft)
        .text(input.identity.name ?? input.employeeName, left, sigTop + 30, {
          lineBreak: false,
        });
    }
    doc.y = sigTop + 96;
  } else {
    doc
      .font("Helvetica-Oblique")
      .fontSize(20)
      .fillColor(COLORS.ink)
      .text(input.signature.text ?? input.employeeName, left, sigTop + 6, {
        lineBreak: false,
      });
    doc.y = sigTop + 40;
  }
  // Ruled signature line + name.
  doc
    .save()
    .strokeColor(COLORS.ink)
    .lineWidth(0.8)
    .moveTo(left, doc.y)
    .lineTo(left + 240, doc.y)
    .stroke()
    .restore();
  doc.y += 5;
  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor(COLORS.ink)
    .text(input.identity.name ?? input.employeeName, left, doc.y, { lineBreak: false });
  doc.y += 14;
  doc
    .font("Helvetica")
    .fontSize(8.5)
    .fillColor(COLORS.inkSoft)
    .text(
      input.signature.kind === "drawn" ? "Drawn signature" : "Typed signature",
      left,
      doc.y,
      { lineBreak: false },
    );
  doc.y += 18;

  // ── Consent statement ──
  doc
    .font("Helvetica-Oblique")
    .fontSize(9)
    .fillColor(COLORS.inkMuted)
    .text(input.consentText, left, doc.y, { width, align: "justify", lineGap: 2 });
  doc.y += 14;

  // ── Audit line ──
  drawSectionHeading(doc, "Audit");
  doc
    .font("Helvetica")
    .fontSize(8.5)
    .fillColor(COLORS.inkSoft)
    .text(
      `Signed on ${fmtStamp(input.signedAt)} · IP ${input.ip ?? "unavailable"} · Method: ${input.selfAttested ? "Self-attested e-signature (identity not DigiLocker-verified)" : "DigiLocker-verified e-signature"}`,
      left,
      doc.y,
      { width, lineGap: 2 },
    );

  // ── Footer ──
  const footerY = doc.page.height - doc.page.margins.bottom - 22;
  doc
    .save()
    .strokeColor(COLORS.hairline)
    .lineWidth(0.5)
    .moveTo(left, footerY - 10)
    .lineTo(right, footerY - 10)
    .stroke()
    .restore();
  doc
    .font("Helvetica")
    .fontSize(8)
    .fillColor(COLORS.inkFaint)
    .text(
      `${input.docKindLabel} · ${input.employeeName} · ${input.selfAttested ? "Self-attested e-signature" : "DigiLocker-verified e-signature"} · Generated ${fmtStamp(new Date())}`,
      left,
      footerY,
      { width, lineBreak: false },
    );

  doc.end();
  return done;
}

/** Small uppercase section heading with a hairline under it. */
function drawSectionHeading(doc: PDFKit.PDFDocument, label: string): void {
  const left = doc.page.margins.left;
  const right = doc.page.width - doc.page.margins.right;
  doc
    .font("Helvetica-Bold")
    .fontSize(9)
    .fillColor(COLORS.brandDeep)
    .text(label.toUpperCase(), left, doc.y, { characterSpacing: 0.7, lineBreak: false });
  doc.y += 13;
  doc
    .save()
    .strokeColor(COLORS.hairlineStrong)
    .lineWidth(0.8)
    .moveTo(left, doc.y)
    .lineTo(right, doc.y)
    .stroke()
    .restore();
  doc.y += 8;
}
