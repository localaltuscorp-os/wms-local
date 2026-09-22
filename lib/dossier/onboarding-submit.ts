import "server-only";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { onboardingSubmissions, employees } from "@/db/schema";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import { recordHrFormSubmission } from "@/lib/hr/forms/record";
import { mailSubmittedFormToHr } from "@/lib/hr/forms/notify";
import { afterResponse } from "@/lib/after";
import { onboardingResponses } from "@/lib/dossier/onboarding-responses";
import {
  ONB_TEXT_FIELDS,
  ONB_FILE_KEYS,
  ONB_ALL_FIELDS,
  normaliseRepeaterValue,
  countCompleteRepeaterRows,
  isOnbFieldRequired,
  type OnboardingFileRef,
} from "@/lib/dossier/onboarding-schema";

/**
 * THE ONBOARDING SAVE — shared by both doors into the form.
 *
 *   · app/(app)/dossier/onboarding/actions.ts — a signed-in employee, or HR
 *     filling on someone's behalf.
 *   · app/c/onboarding/actions.ts — a candidate on an emailed access link, BEFORE
 *     they have a login.
 *
 * AUTHORIZATION IS THE CALLER'S JOB, and it must be settled before this runs:
 * `employeeId` is trusted here as "the record the caller is allowed to write".
 * The candidate door derives it from the link cookie; the employee door checks
 * self / admin / HR staff. Keeping the rules for WHAT a valid form is in one place
 * is the point — two copies of the required-field guard is how the public one
 * ends up weaker.
 */

export type OnboardingSaveResult = { ok: true; status: string } | { ok: false; error: string };

const MAX_BYTES = 25 * 1024 * 1024;
const DISALLOWED_EXTENSIONS =
  /\.(exe|com|cmd|bat|msi|scr|pif|vbs|js|mjs|cjs|jar|sh|bash|app|dmg|ps1|psm1|reg|hta|cpl|gadget|html?|xhtml|svgz?)$/i;
const DISALLOWED_MIME = new Set(["text/html", "application/xhtml+xml", "image/svg+xml", "application/x-msdownload", "application/x-sh", "application/x-shellscript"]);

const safeName = (n: string) => n.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "file";

/**
 * Save (or submit) one onboarding form. Text answers land in `fields`; each
 * attached file's storage ref lands in `files`. Re-submitting keeps previously
 * uploaded files that weren't replaced. One row per employee (upsert).
 */
export async function saveOnboardingSubmission(
  form: FormData,
  ctx: { employeeId: string; actorId: string },
): Promise<OnboardingSaveResult> {
  const { employeeId, actorId } = ctx;

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
  const requestedStatus =
    String(form.get("status") ?? "submitted") === "draft" ? "draft" : "submitted";
  const status = wasSubmitted ? "submitted" : requestedStatus;
  // ── ONLY AN EXPLICIT SUBMIT IS HELD TO THE REQUIRED-FIELD RULES ──────────
  // Autosave and Save Draft always post "draft". On an already-submitted form
  // the line above keeps the status "submitted", and the guards below used to
  // key off that - so every autosave of a mid-edit (a field cleared to retype
  // it, or a required field added after they submitted) was rejected. The hook
  // then retried it forever, Save Draft failed with the same error, and nothing
  // reached the database, so the edits were lost when the session timed out.
  const enforceRequired = requestedStatus === "submitted";

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
  if (enforceRequired) {
    for (const f of ONB_ALL_FIELDS) {
      if (!isOnbFieldRequired(f, fields)) continue;
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
  const files: Record<string, OnboardingFileRef> = { ...((existing?.files as Record<string, OnboardingFileRef>) ?? {}) };
  const admin = getSupabaseAdmin();
  const uploadedPaths: string[] = [];

  for (const key of ONB_FILE_KEYS) {
    // (a) a file already uploaded DIRECTLY to storage via a signed URL
    // (mintOnboardingUploadUrl). Trusted only under THIS employee's onboarding
    // prefix, so a crafted ref can't point the record at someone else's object.
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

  // 3b) attachments that stand in for another (Address Proof → Aadhaar Card).
  // While the choice holds, LINK the source file in (same storage object, marked
  // `fromKey`), so HR sees an address proof on the record; when the choice
  // changes, drop only a linked ref — never a file the person uploaded here.
  for (const f of ONB_ALL_FIELDS) {
    const s = f.satisfiedBy;
    if (!s) continue;
    const source = files[s.fileKey];
    if (fields[s.whenKey] === s.equals) {
      if (source && (source.path || source.link)) files[f.key] = { ...source, fromKey: s.fileKey };
    } else if (files[f.key]?.fromKey === s.fileKey) {
      delete files[f.key];
    }
  }

  // 4) required-attachment guard (submit only) — a file OR a link satisfies it
  if (enforceRequired) {
    for (const f of ONB_ALL_FIELDS) {
      if (f.type === "file" && isOnbFieldRequired(f, fields)) {
        const ref = files[f.key];
        if (!ref || (!ref.path && !ref.link)) {
          if (uploadedPaths.length) await admin.storage.from(DOCUMENTS_BUCKET).remove(uploadedPaths).catch(() => {});
          return { ok: false, error: `“${f.label}” is required (attach a file).` };
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
        createdById: existing?.createdById ?? actorId,
        updatedById: actorId,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: onboardingSubmissions.employeeId,
        set: {
          fields,
          files,
          status,
          // Keep the FIRST submission's timestamp. An edit is not a new submission.
          submittedAt:
            status === "submitted" ? existing?.submittedAt ?? new Date() : onboardingSubmissions.submittedAt,
          updatedById: actorId,
          updatedAt: new Date(),
        },
      })
      .returning({ id: onboardingSubmissions.id });
    rowId = saved?.id;
  } catch (err) {
    if (uploadedPaths.length) await admin.storage.from(DOCUMENTS_BUCKET).remove(uploadedPaths).catch(() => {});
    return { ok: false, error: `DB: ${err instanceof Error ? err.message : String(err)}` };
  }

  // ── INDEX IT FOR THE HR FORMS LIST, AND TELL HR ───────────────────────
  // `onboarding_submissions` stays the source of truth; this is the uniform
  // index My/All Filled Forms read. Written AFTER the real save. Non-fatal: an
  // index hiccup must not turn a successful save into an error, or the person
  // fills the form again.
  //
  // On the FIRST submit (`newlySubmitted` — not a draft, not a later edit) the
  // completed form is mailed to the HR desk as a PDF, deferred past the response
  // so it never slows the save (mailSubmittedFormToHr never throws).
  if (rowId) {
    try {
      const indexed = await recordHrFormSubmission({
        formKey: "onboarding",
        employeeId, // the SUBJECT — not the actor, who may be the HR filler
        submittedById: actorId,
        status,
        responses: onboardingResponses(fields, files),
        sourceId: rowId,
      });
      if (indexed.ok && indexed.newlySubmitted) {
        const submissionId = indexed.id;
        afterResponse(() => mailSubmittedFormToHr(submissionId));
      } else if (!indexed.ok) {
        console.error("[onboarding] saved but indexing failed:", indexed.error);
      }
    } catch {
      /* index-only; the submission itself is already committed above */
    }
  }

  revalidatePath("/dossier");
  revalidatePath("/c/onboarding");
  revalidatePath("/hr/my-forms");
  revalidatePath("/hr/all-forms");
  return { ok: true, status };
}

/**
 * Mint a short-lived signed UPLOAD url so the BROWSER sends an onboarding
 * attachment straight to Supabase Storage, never through the Server Action body
 * (Next caps action posts at 1 MB and Vercel at ~4.5 MB). The path is built HERE,
 * under the employee's own onboarding prefix, so the client can neither choose
 * the bucket nor land the object in someone else's folder. Authorization is the
 * caller's, exactly as for saveOnboardingSubmission.
 */
export async function mintOnboardingUploadUrl(
  employeeId: string,
  input: { key: string; fileName: string; mime?: string | null; size?: number },
): Promise<{ ok: true; path: string; token: string; bucket: string } | { ok: false; error: string }> {
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
