"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { onboardingSubmissions, employees } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { isHrStaff } from "@/lib/hr/access";
import { listOnboardingInviteTargets, getMyOnboardingStatus } from "@/lib/queries/onboarding";
import { sendOnboardingInviteEmail } from "@/lib/email/onboarding-email";
import { siteUrl } from "@/lib/site-url";
import { rateLimitOrError } from "@/lib/rate-limit";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import { recordHrFormSubmission } from "@/lib/hr/forms/record";
import { onboardingResponses } from "@/lib/dossier/onboarding-responses";
import {
  ONB_TEXT_FIELDS,
  ONB_FILE_KEYS,
  ONB_ALL_FIELDS,
  normaliseRepeaterValue,
  countCompleteRepeaterRows,
  type OnboardingFileRef,
} from "@/lib/dossier/onboarding-schema";
import type { Employee } from "@/db/schema";

type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

const MAX_BYTES = 25 * 1024 * 1024;
const DISALLOWED_EXTENSIONS =
  /\.(exe|com|cmd|bat|msi|scr|pif|vbs|js|mjs|cjs|jar|sh|bash|app|dmg|ps1|psm1|reg|hta|cpl|gadget|html?|xhtml|svgz?)$/i;
const DISALLOWED_MIME = new Set(["text/html", "application/xhtml+xml", "image/svg+xml", "application/x-msdownload", "application/x-sh", "application/x-shellscript"]);

const safeName = (n: string) => n.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "file";
function isAdmin(me: Employee) {
  return me.isAdmin || isSuperAdmin(me.email);
}

/**
 * Save (or submit) an employee's onboarding form. Self fills their own; admins
 * fill/view anyone's. Text answers land in `fields`; each attached file uploads
 * to the documents bucket and its ref is stored in `files`. Re-submitting keeps
 * previously-uploaded files that weren't replaced. One row per employee (upsert).
 */
export async function submitOnboarding(form: FormData): Promise<Result<{ status: string }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const employeeId = String(form.get("employeeId") ?? "");
  if (!z.string().uuid().safeParse(employeeId).success) return { ok: false, error: "Missing employee." };
  // WHOSE form is decided by the posted `employeeId`, never by the session — the
  // whole point is that HR fills and corrects OTHER people's forms. The session
  // only decides whether they are ALLOWED to, and HR staff now count: collecting
  // and correcting joining data is their job, and gating it on the DB `is_admin`
  // flag left them able to open a colleague's form but not save it.
  if (employeeId !== me.id && !isAdmin(me) && !(await isHrStaff(me).catch(() => false))) {
    return { ok: false, error: "Forbidden" };
  }

  const emp = await db.query.employees.findFirst({ where: eq(employees.id, employeeId) });
  if (!emp) return { ok: false, error: "Employee not found." };

  // What is already on file for THIS employee. Read once, up front: it decides
  // the status rule below and supplies the file refs to merge onto later.
  const existing = await db.query.onboardingSubmissions.findFirst({
    where: eq(onboardingSubmissions.employeeId, employeeId),
  });
  const wasSubmitted = existing?.status === "submitted";

  // ── A SUBMITTED FORM IS NEVER DEMOTED BY AN EDIT (Sir) ──────────────────
  // "Save Draft" on an ALREADY-SUBMITTED form used to write status='draft',
  // which silently un-submitted it: the employee dropped back to "not filled",
  // the invite list picked them up again, and the post-joining steps that unlock
  // on submission re-locked. Correcting a phone number is not a retraction.
  //
  // So once submitted, it stays submitted; Save Draft on such a form is simply
  // an update. A form that has never been submitted keeps the old behaviour and
  // can still be saved as a draft.
  const requestedStatus =
    String(form.get("status") ?? "submitted") === "draft" ? "draft" : "submitted";
  const status = wasSubmitted ? "submitted" : requestedStatus;

  // 1) text/select/repeater answers (repeaters stored as normalised JSON strings)
  const fields: Record<string, string> = {};
  for (const f of ONB_TEXT_FIELDS) {
    if (f.type === "repeater") {
      fields[f.key] = normaliseRepeaterValue(f, String(form.get(f.key) ?? ""));
      continue;
    }
    fields[f.key] = String(form.get(f.key) ?? "").trim().slice(0, 2000);
  }

  // 2) required-field guard (only when actually submitting)
  if (status === "submitted") {
    for (const f of ONB_ALL_FIELDS) {
      if (!f.required) continue;
      if (f.type === "file") continue; // files checked below
      if (f.type === "repeater") {
        // min-N complete rows — enforced server-side so the UI gate can't be bypassed
        const need = f.min ?? 1;
        const have = countCompleteRepeaterRows(f, fields[f.key]);
        if (have < need) {
          const cols = (f.sub ?? []).map((s) => s.label).join(", ");
          return { ok: false, error: `Add at least ${need} complete ${f.itemLabel ?? f.label} (each needs ${cols}).` };
        }
        continue;
      }
      if (!fields[f.key]) return { ok: false, error: `“${f.label}” is required.` };
    }
  }

  // 3) files — merge onto whatever already exists so a re-submit keeps prior uploads
  // (read above as `existing`).
  const files: Record<string, OnboardingFileRef> = { ...((existing?.files as Record<string, OnboardingFileRef>) ?? {}) };
  const admin = getSupabaseAdmin();
  const uploadedPaths: string[] = [];

  for (const key of ONB_FILE_KEYS) {
    // (a) a file already uploaded DIRECTLY to storage — the browser sent the
    // bytes to Supabase via a signed URL (createOnboardingUploadUrl) and posted
    // back only the resulting path. This is the normal path now; it keeps the
    // Server Action body tiny so large scans/photos submit at all. The path is
    // trusted only when it sits under THIS employee's onboarding prefix, so a
    // crafted ref can't point the record at someone else's object.
    const uploadedRaw = String(form.get(`${key}__uploaded`) ?? "").trim();
    if (uploadedRaw) {
      let ref: { path?: string; fileName?: string; mime?: string | null; size?: number } | null = null;
      try {
        ref = JSON.parse(uploadedRaw);
      } catch {
        ref = null;
      }
      const prefix = `dossier/onboarding/${employeeId}/`;
      if (ref?.path && ref.path.startsWith(prefix)) {
        files[key] = {
          path: ref.path,
          fileName: (ref.fileName ?? "file").slice(0, 200),
          mime: ref.mime ?? null,
          size: typeof ref.size === "number" ? ref.size : null,
        };
        continue;
      }
      // Malformed or out-of-prefix — ignore and fall through to link/existing.
    }
    const file = form.get(key);
    // (b) a File posted through the action body (legacy / small-file fallback)
    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_BYTES) return { ok: false, error: `“${key}” exceeds 25 MB.` };
      if (DISALLOWED_EXTENSIONS.test(file.name) || (file.type && DISALLOWED_MIME.has(file.type))) {
        return { ok: false, error: "That file type is not allowed." };
      }
      const path = `dossier/onboarding/${employeeId}/${key}-${crypto.randomUUID()}/${safeName(file.name)}`;
      const buffer = Buffer.from(await file.arrayBuffer());
      const { error: upErr } = await admin.storage.from(DOCUMENTS_BUCKET).upload(path, buffer, {
        contentType: file.type || "application/octet-stream",
        upsert: false,
      });
      if (upErr) {
        if (uploadedPaths.length) await admin.storage.from(DOCUMENTS_BUCKET).remove(uploadedPaths).catch(() => {});
        return { ok: false, error: `Upload failed (${key}): ${upErr.message}` };
      }
      uploadedPaths.push(path);
      files[key] = { path, fileName: file.name.slice(0, 200), mime: file.type || null, size: file.size };
      continue;
    }
    // (c) else a pasted Drive / URL link
    const link = String(form.get(`${key}__link`) ?? "").trim();
    if (link) {
      if (!/^https?:\/\//i.test(link)) return { ok: false, error: `“${key}” link must start with http(s)://` };
      files[key] = { link: link.slice(0, 1000), fileName: link.slice(0, 200) };
    }
  }

  // 4) required-attachment guard (submit only) — a file OR a link satisfies it
  if (status === "submitted") {
    for (const f of ONB_ALL_FIELDS) {
      if (f.type === "file" && f.required) {
        const ref = files[f.key];
        if (!ref || (!ref.path && !ref.link)) {
          if (uploadedPaths.length) await admin.storage.from(DOCUMENTS_BUCKET).remove(uploadedPaths).catch(() => {});
          return { ok: false, error: `“${f.label}” is required (attach a file or paste a link).` };
        }
      }
    }
  }

  let rowId: string | undefined;
  try {
    const [saved] = await db
      .insert(onboardingSubmissions)
      .values({
        employeeId,
        fields,
        files,
        status,
        submittedAt: status === "submitted" ? existing?.submittedAt ?? new Date() : existing?.submittedAt ?? null,
        createdById: existing?.createdById ?? me.id,
        updatedById: me.id,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: onboardingSubmissions.employeeId,
        set: {
          fields,
          files,
          status,
          // Keep the FIRST submission's timestamp. An edit is not a new
          // submission, and restamping it every save made "submitted on" read as
          // the date HR last touched the record.
          submittedAt:
            status === "submitted" ? existing?.submittedAt ?? new Date() : onboardingSubmissions.submittedAt,
          updatedById: me.id,
          updatedAt: new Date(),
        },
      })
      .returning({ id: onboardingSubmissions.id });
    rowId = saved?.id;
  } catch (err) {
    if (uploadedPaths.length) await admin.storage.from(DOCUMENTS_BUCKET).remove(uploadedPaths).catch(() => {});
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }

  // ── INDEX IT FOR THE HR FORMS LIST ────────────────────────────────────
  // `onboarding_submissions` stays the source of truth; this is the uniform
  // index My/All Filled Forms read. Written AFTER the real save, exactly as
  // recordHrFormSubmission documents: if the index write fails the form is still
  // saved and the next save repairs the row — the reverse order would advertise
  // a submission that was never stored.
  //
  // Non-fatal by design. An index hiccup must not turn a successful save into an
  // error the employee sees, or they will fill the form again.
  if (rowId) {
    try {
      await recordHrFormSubmission({
        formKey: "onboarding",
        employeeId, // the SUBJECT — not `me.id`, which may be the HR filler
        submittedById: me.id,
        status,
        responses: onboardingResponses(fields, files),
        sourceId: rowId,
      });
    } catch {
      /* index-only; the submission itself is already committed above */
    }
  }

  revalidatePath("/dossier");
  revalidatePath("/hr/my-forms");
  revalidatePath("/hr/all-forms");
  return { ok: true, status };
}

/**
 * Mint a short-lived signed UPLOAD url so the BROWSER sends an onboarding
 * attachment straight to Supabase Storage, never through the Server Action body.
 *
 * WHY: a Server Action post is capped — Next defaults to 1 MB, and the host
 * (Vercel) caps its function request bodies around 4.5 MB regardless of config.
 * Onboarding needs several scans/photos, so routing the bytes through
 * `submitOnboarding` made large forms impossible to submit. The client uploads to
 * the returned URL, then posts back only the storage PATH (a few bytes), which
 * `submitOnboarding` picks up as `<key>__uploaded`.
 *
 * Authorization mirrors submitOnboarding exactly: self, admin, or HR staff, for
 * the named employee only. The path is built HERE, under that employee's own
 * onboarding prefix, so the client can neither choose the bucket nor land the
 * object in someone else's folder.
 */
export async function createOnboardingUploadUrl(input: {
  employeeId: string;
  key: string;
  fileName: string;
  mime?: string | null;
  size?: number;
}): Promise<Result<{ path: string; token: string; bucket: string }>> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;

  const employeeId = String(input.employeeId ?? "");
  if (!z.string().uuid().safeParse(employeeId).success) return { ok: false, error: "Missing employee." };
  if (employeeId !== me.id && !isAdmin(me) && !(await isHrStaff(me).catch(() => false))) {
    return { ok: false, error: "Forbidden" };
  }
  if (!ONB_FILE_KEYS.includes(input.key)) return { ok: false, error: "Unknown attachment." };

  const size = Number(input.size ?? 0);
  if (size > MAX_BYTES) return { ok: false, error: `“${input.key}” exceeds 25 MB.` };

  const fileName = String(input.fileName ?? "");
  const mime = input.mime ?? "";
  if (DISALLOWED_EXTENSIONS.test(fileName) || (mime && DISALLOWED_MIME.has(mime))) {
    return { ok: false, error: "That file type is not allowed." };
  }

  const path = `dossier/onboarding/${employeeId}/${input.key}-${crypto.randomUUID()}/${safeName(fileName)}`;
  try {
    const { data, error } = await getSupabaseAdmin()
      .storage.from(DOCUMENTS_BUCKET)
      .createSignedUploadUrl(path);
    if (error || !data) return { ok: false, error: error?.message ?? "Could not start upload." };
    return { ok: true, path, token: data.token, bucket: DOCUMENTS_BUCKET };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/**
 * Email EVERY active employee whose onboarding is NOT yet submitted a warm
 * branded "Complete your Onboarding Form" invite (button → the hardcoded public
 * prod URL + the document checklist). HR-staff / admin gated. Per-recipient
 * try/catch so one bad address never aborts the run; employees with no email are
 * skipped upstream. Safe to re-run (idempotent nudge).
 */
export async function sendOnboardingInvites(): Promise<{
  ok: boolean;
  sent: number;
  skipped: number;
  error?: string;
}> {
  const me = await requireUser();
  if (!(await isHrStaff(me)) && !isAdmin(me)) {
    return { ok: false, sent: 0, skipped: 0, error: "Forbidden" };
  }

  const limited = rateLimitOrError(me.id, "write");
  if (limited) return { ok: false, sent: 0, skipped: 0, error: limited.error };

  let targets: Array<{ id: string; name: string; email: string }>;
  try {
    targets = await listOnboardingInviteTargets();
  } catch (err) {
    return { ok: false, sent: 0, skipped: 0, error: err instanceof Error ? err.message : "Could not load recipients." };
  }

  const base = siteUrl();
  let sent = 0;
  let skipped = 0;
  for (const t of targets) {
    try {
      const res = await sendOnboardingInviteEmail({ recipient: { email: t.email, name: t.name }, siteUrl: base });
      if (res.error) skipped += 1;
      else sent += 1;
    } catch {
      skipped += 1;
    }
  }

  return { ok: true, sent, skipped };
}

/**
 * Client-callable status for the app-wide onboarding nudge banner. Kept OFF the
 * SSR/dashboard load path — the banner calls this after mount (and only when the
 * session isn't dismissed), so it never adds a blocking query to page render.
 */
export async function getMyOnboardingStatusAction(): Promise<{ submitted: boolean }> {
  return getMyOnboardingStatus();
}
