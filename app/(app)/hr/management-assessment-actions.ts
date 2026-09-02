"use server";

import { sql } from "drizzle-orm";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireUser } from "@/lib/auth/current";
import { requireHrStaff } from "@/lib/hr/access";
import { rateLimitOrError } from "@/lib/rate-limit";
import { getSupabaseAdmin, DOCUMENTS_BUCKET } from "@/lib/supabase/admin";
import { createHrAssignmentTask } from "@/lib/hr/assignment-task";
import { sendRecruiterOutcomeEmail } from "@/lib/email/hr-recruiter-email";

/**
 * Management Assessment (Pre-Interview, management round) — persistence + signed
 * reads for the per-candidate capture: rich notes, in-browser voice recordings
 * and file/image/video attachments.
 *
 * The whole blob lives in candidate_intake.management_assessment (jsonb, added by
 * migration 0159). Files are uploaded via the API route
 * /api/hr/management-assessment/upload (large bodies — server actions cap at ~1MB)
 * and only their storage paths + metadata are saved here. This file uses raw SQL
 * for the jsonb column so it stays independent of the shared drizzle schema map.
 */

type Result<T> = ({ ok: true } & T) | { ok: false; error: string };

const STORAGE_PREFIX = "management-assessment/";
const SIGNED_TTL = 60 * 60; // 1 hour

const RecordingSchema = z.object({
  path: z.string().min(1).max(400),
  durationSec: z.number().finite().min(0).max(60 * 60 * 8),
  createdAt: z.string().max(40),
});
const AttachmentSchema = z.object({
  path: z.string().min(1).max(400),
  name: z.string().max(255).default("file"),
  mime: z.string().max(120).default("application/octet-stream"),
  size: z.number().finite().min(0).max(1024 * 1024 * 1024),
});
const OutcomeSchema = z.enum(["selected", "shortlisted", "rejected"]).nullable().default(null);

const RecruiterSchema = z.object({
  via: z.boolean().default(false),
  name: z.string().max(200).optional(),
  email: z.string().max(200).optional(),
});

const SkillsSchema = z.object({
  technical: z.array(z.string().max(120)).max(100).default([]),
  nonTechnical: z.array(z.string().max(120)).max(100).default([]),
});

const AssessmentSchema = z.object({
  notes: z.string().max(20000).default(""),
  recordings: z.array(RecordingSchema).max(60).default([]),
  attachments: z.array(AttachmentSchema).max(60).default([]),
  // Extension (0162 program) — decision + hiring metadata captured on the MA screen.
  designation: z.string().max(200).optional(),
  dateOfJoining: z.string().max(20).optional(), // yyyy-mm-dd
  outcome: OutcomeSchema,
  oneMoreAssignment: z.boolean().optional(),
  assignmentBrief: z.string().max(8000).optional(),
  recruiter: RecruiterSchema.optional(),
  rejectionReason: z.string().max(8000).optional(),
  skills: SkillsSchema.optional(),
  // 0163 program — the management round's own score (Manan's 0..10) + the
  // proposed salary (₹, free-text, only meaningful when the outcome is Selected).
  managementScore: z.number().finite().min(0).max(10).optional(),
  proposedSalary: z.string().max(60).optional(),
});

export type MgmtRecording = z.infer<typeof RecordingSchema>;
export type MgmtAttachment = z.infer<typeof AttachmentSchema>;
export type MgmtOutcome = z.infer<typeof OutcomeSchema>;
export type MgmtRecruiter = z.infer<typeof RecruiterSchema>;
export type MgmtSkills = z.infer<typeof SkillsSchema>;

/** Recording/attachment enriched with a short-lived signed URL for playback/preview. */
export interface MgmtRecordingView extends MgmtRecording {
  url: string | null;
}
export interface MgmtAttachmentView extends MgmtAttachment {
  url: string | null;
}
export interface ManagementAssessmentState {
  notes: string;
  recordings: MgmtRecordingView[];
  attachments: MgmtAttachmentView[];
  // Extension (0162 program) — decision + hiring metadata (all optional).
  designation?: string;
  dateOfJoining?: string;
  outcome: MgmtOutcome;
  oneMoreAssignment?: boolean;
  assignmentBrief?: string;
  recruiter?: MgmtRecruiter;
  rejectionReason?: string;
  skills?: MgmtSkills;
  managementScore?: number;
  proposedSalary?: string;
}

function isUuid(v: string): boolean {
  return z.string().uuid().safeParse(v).success;
}

/** Sign a batch of storage paths → { path: signedUrl|null }. Empty-safe. */
async function signPaths(paths: string[]): Promise<Map<string, string | null>> {
  const out = new Map<string, string | null>();
  const unique = [...new Set(paths.filter(Boolean))];
  if (unique.length === 0) return out;
  try {
    const admin = getSupabaseAdmin();
    const { data } = await admin.storage.from(DOCUMENTS_BUCKET).createSignedUrls(unique, SIGNED_TTL);
    for (const row of data ?? []) out.set(row.path ?? "", row.signedUrl ?? null);
  } catch {
    /* signing is best-effort — the UI degrades to "unavailable" tiles */
  }
  return out;
}

/**
 * Load a candidate's saved management assessment, with fresh signed URLs for
 * every recording and attachment so the workspace can play/preview them.
 */
export async function getManagementAssessment(candidateId: string): Promise<ManagementAssessmentState> {
  await requireHrStaff();
  const empty: ManagementAssessmentState = { notes: "", recordings: [], attachments: [], outcome: null };
  if (!isUuid(candidateId)) return empty;

  const rows = (await db.execute(
    sql`select management_assessment as ma from candidate_intake where id = ${candidateId} limit 1`,
  )) as unknown as { ma: unknown }[];
  const raw = rows[0]?.ma;
  if (!raw || typeof raw !== "object") return empty;

  const parsed = AssessmentSchema.safeParse(raw);
  const data = parsed.success ? parsed.data : empty;

  const signed = await signPaths([
    ...data.recordings.map((r) => r.path),
    ...data.attachments.map((a) => a.path),
  ]);

  return {
    notes: data.notes,
    recordings: data.recordings.map((r) => ({ ...r, url: signed.get(r.path) ?? null })),
    attachments: data.attachments.map((a) => ({ ...a, url: signed.get(a.path) ?? null })),
    designation: data.designation,
    dateOfJoining: data.dateOfJoining,
    outcome: data.outcome,
    oneMoreAssignment: data.oneMoreAssignment,
    assignmentBrief: data.assignmentBrief,
    recruiter: data.recruiter,
    rejectionReason: data.rejectionReason,
    skills: data.skills,
    managementScore: data.managementScore,
    proposedSalary: data.proposedSalary,
  };
}

/**
 * Persist the whole assessment blob for a candidate (notes + recording/attachment
 * metadata). Rate-limited. Only storage paths + light metadata are stored — never
 * the file bytes.
 */
export async function saveManagementAssessment(
  candidateId: string,
  input: z.input<typeof AssessmentSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!isUuid(candidateId)) return { ok: false, error: "Pick a candidate first." };

  const parsed = AssessmentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid data." };

  // Strip anything outside the known shape before persisting.
  const clean = {
    notes: parsed.data.notes,
    recordings: parsed.data.recordings.map((r) => ({ path: r.path, durationSec: r.durationSec, createdAt: r.createdAt })),
    attachments: parsed.data.attachments.map((a) => ({ path: a.path, name: a.name, mime: a.mime, size: a.size })),
    designation: parsed.data.designation,
    dateOfJoining: parsed.data.dateOfJoining,
    outcome: parsed.data.outcome,
    oneMoreAssignment: parsed.data.oneMoreAssignment,
    assignmentBrief: parsed.data.assignmentBrief,
    recruiter: parsed.data.recruiter,
    rejectionReason: parsed.data.rejectionReason,
    skills: parsed.data.skills,
    managementScore: parsed.data.managementScore,
    proposedSalary: parsed.data.proposedSalary,
  };

  try {
    await db.execute(sql`
      update candidate_intake
      set management_assessment = ${JSON.stringify(clean)}::jsonb, updated_at = now()
      where id = ${candidateId}
    `);
    revalidatePath("/hr/management-assessment");
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Save failed." };
  }
}

/**
 * Remove a management-assessment file from storage (called when a recording or
 * attachment tile is deleted). Guards the path prefix so only this module's
 * objects can be removed. The caller then re-saves the trimmed blob.
 */
export async function deleteManagementFile(path: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (typeof path !== "string" || !path.startsWith(STORAGE_PREFIX) || path.includes("..")) {
    return { ok: false, error: "Invalid file." };
  }
  try {
    await getSupabaseAdmin().storage.from(DOCUMENTS_BUCKET).remove([path]);
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Delete failed." };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Decision actions — thin, HR-gated wrappers over the server-only lib helpers.
// ─────────────────────────────────────────────────────────────────────────────

/** Candidate name + position + email for the outcome email / assignment task. */
async function candidateHeader(
  candidateId: string,
): Promise<{ name: string; position: string; email: string } | null> {
  const rows = (await db.execute(
    sql`select full_name, position_applied, email from candidate_intake where id = ${candidateId} limit 1`,
  )) as unknown as { full_name: string | null; position_applied: string | null; email: string | null }[];
  const r = rows[0];
  if (!r) return null;
  return { name: r.full_name || "Candidate", position: r.position_applied || "", email: r.email || "" };
}

const RecruiterOutcomeSchema = z.object({
  to: z.string().trim().email("Enter a valid recruiter email").max(200),
  recruiterName: z.string().max(200).optional(),
  outcome: z.enum(["selected", "shortlisted", "rejected"]),
  reason: z.string().max(8000).optional(),
});

/**
 * Email the recruiter/consultant the candidate's outcome. HR-gated + rate-limited.
 * Derives the candidate name + position from the record so the client only sends
 * the recruiter contact + verdict. No-ops gracefully when Resend is unconfigured
 * (returns { ok:true, skipped:true } so the UI can say "email isn't configured").
 */
export async function sendRecruiterOutcome(
  candidateId: string,
  input: z.input<typeof RecruiterOutcomeSchema>,
): Promise<{ ok: true; skipped: boolean } | { ok: false; error: string }> {
  const me = await requireHrStaff();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!isUuid(candidateId)) return { ok: false, error: "Pick a candidate first." };

  const parsed = RecruiterOutcomeSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid data." };

  const header = await candidateHeader(candidateId);
  if (!header) return { ok: false, error: "Candidate not found." };

  const res = await sendRecruiterOutcomeEmail({
    to: parsed.data.to,
    recruiterName: parsed.data.recruiterName,
    candidateName: header.name,
    position: header.position,
    outcome: parsed.data.outcome,
    reason: parsed.data.reason,
  });
  if (res.skipped) return { ok: true, skipped: true };
  if (!res.ok) return { ok: false, error: "The email could not be sent." };
  return { ok: true, skipped: false };
}

const AssignmentTaskSchema = z.object({
  brief: z.string().trim().min(1, "Write a short assignment brief").max(8000),
});

/**
 * Create the "one more assignment" task for the HR assignment owner (Initiated,
 * Critical). HR-gated + rate-limited; initiator = the acting HR user. Derives the
 * candidate name + position from the record.
 */
export async function createAssignmentTask(
  candidateId: string,
  input: z.input<typeof AssignmentTaskSchema>,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await requireHrStaff();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!isUuid(candidateId)) return { ok: false, error: "Pick a candidate first." };

  const parsed = AssignmentTaskSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid data." };

  const header = await candidateHeader(candidateId);
  if (!header) return { ok: false, error: "Candidate not found." };

  const res = await createHrAssignmentTask({
    candidateName: header.name,
    position: header.position,
    brief: parsed.data.brief,
    initiatorId: me.id,
  });
  if (!res.ok) return { ok: false, error: res.error ?? "Could not create the assignment task." };
  return { ok: true };
}
