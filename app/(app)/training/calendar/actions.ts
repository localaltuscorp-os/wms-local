"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  tcSessions,
  tcSessionAttendees,
  tcSessionFeedback,
  tcAssessments,
  tcSubjects,
  type Employee,
} from "@/db/schema";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { isManager } from "@/lib/queries/training";
import { getScoreConfig } from "@/lib/queries/pms";
import { rateLimitOrError } from "@/lib/rate-limit";
import { notify } from "@/lib/notifications/dispatch";

const PATH = "/training/calendar";
export type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

const UUID = z.string().uuid();

/** Training scheduling/marking is for managers (have a downline), admins, supers. */
async function requireTrainingManager(): Promise<Employee> {
  const me = await requireWorkspace("training");
  const allowed = me.isAdmin || isSuperAdmin(me.email) || (await isManager(me.id));
  if (!allowed) throw new Error("Managers only");
  return me;
}

function fail(parsed: { success: false; error: z.ZodError }): { ok: false; error: string } {
  return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
}

// ── Schemas ──────────────────────────────────────────────────────────────────

const SessionCoreSchema = z.object({
  topic: z.string().trim().min(2, "Add a topic.").max(200),
  subjectId: UUID.nullable().optional(),
  los: z.string().trim().max(2000).nullable().optional(),
  criticality: z.coerce.number().int().min(1).max(5),
  trainerId: UUID.nullable().optional(),
  scheduledAt: z.string().min(1, "Pick a date & time."),
  durationMin: z.coerce.number().int().min(5, "Too short.").max(600),
  mode: z.enum(["in_person", "online"]),
  location: z.string().trim().max(300).nullable().optional(),
  meetingUrl: z.string().trim().url("Enter a valid URL.").max(500).nullable().optional().or(z.literal("")),
  videoPath: z.string().trim().max(500).nullable().optional(),
  pptPath: z.string().trim().max(500).nullable().optional(),
  inManual: z.boolean().optional(),
  notes: z.string().trim().max(4000).nullable().optional(),
  attendeeIds: z.array(UUID).max(500).optional(),
});

const CreateSessionSchema = SessionCoreSchema;
const UpdateSessionSchema = SessionCoreSchema.extend({ id: UUID });

const AttendanceSchema = z.object({
  sessionId: UUID,
  rows: z
    .array(
      z.object({
        employeeId: UUID,
        status: z.enum(["invited", "attended", "left_halfway", "absent"]),
        attendedMin: z.coerce.number().int().min(0).max(600).nullable().optional(),
      }),
    )
    .max(500),
});

const FeedbackSchema = z.object({
  sessionId: UUID,
  content: z.coerce.number().int().min(1).max(5),
  depth: z.coerce.number().int().min(1).max(5),
  understanding: z.coerce.number().int().min(1).max(5),
  applicability: z.coerce.number().int().min(1).max(5),
  learned: z.string().trim().max(4000).nullable().optional(),
  improve: z.string().trim().max(4000).nullable().optional(),
});

const AssessmentSchema = z.object({
  sessionId: UUID,
  employeeId: UUID,
  score: z.coerce.number().int().min(0).max(100),
  target: z.coerce.number().int().min(0).max(100),
  note: z.string().trim().max(2000).nullable().optional(),
});

// ── Helpers ────────────────────────────────────────────────────────────────

function emptyToNull(s: string | null | undefined): string | null {
  const v = (s ?? "").trim();
  return v.length ? v : null;
}

// ── Session lifecycle ─────────────────────────────────────────────────────

export async function createSession(input: unknown): Promise<Result<{ id: string }>> {
  const me = await requireTrainingManager();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = CreateSessionSchema.safeParse(input);
  if (!parsed.success) return fail(parsed);
  const d = parsed.data;

  const when = new Date(d.scheduledAt);
  if (Number.isNaN(when.getTime())) return { ok: false, error: "Invalid date & time." };

  const cfg = await getScoreConfig();
  const maxMin = cfg.thresholds.maxSessionMinutes || 90;
  if (d.durationMin > maxMin) {
    return { ok: false, error: `No session may exceed ${maxMin} minutes.` };
  }

  try {
    const [row] = await db
      .insert(tcSessions)
      .values({
        topic: d.topic,
        subjectId: d.subjectId ?? null,
        los: emptyToNull(d.los),
        criticality: d.criticality,
        trainerId: d.trainerId ?? me.id,
        scheduledAt: when,
        durationMin: d.durationMin,
        mode: d.mode,
        location: emptyToNull(d.location),
        meetingUrl: emptyToNull(d.meetingUrl),
        videoPath: emptyToNull(d.videoPath),
        pptPath: emptyToNull(d.pptPath),
        inManual: !!d.inManual,
        notes: emptyToNull(d.notes),
        createdById: me.id,
      })
      .returning({ id: tcSessions.id });

    const sessionId = row!.id;
    const attendeeIds = Array.from(new Set(d.attendeeIds ?? []));
    if (attendeeIds.length > 0) {
      await db
        .insert(tcSessionAttendees)
        .values(attendeeIds.map((employeeId) => ({ sessionId, employeeId, status: "invited" as const })))
        .onConflictDoNothing({ target: [tcSessionAttendees.sessionId, tcSessionAttendees.employeeId] });
    }

    // Notify invited attendees in-app (best-effort, never blocks). A dedicated
    // training_session enum/email+WhatsApp template is a follow-up (see notes).
    for (const employeeId of attendeeIds) {
      if (employeeId === me.id) continue;
      notify({
        userId: employeeId,
        kind: "nudged",
        title: `Training scheduled: ${d.topic}`,
        body: `${d.durationMin} min · ${when.toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })}`,
        actorId: me.id,
      });
    }

    revalidatePath(PATH);
    return { ok: true, id: sessionId };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function updateSession(input: unknown): Promise<Result<{ id: string }>> {
  const me = await requireTrainingManager();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = UpdateSessionSchema.safeParse(input);
  if (!parsed.success) return fail(parsed);
  const d = parsed.data;

  const when = new Date(d.scheduledAt);
  if (Number.isNaN(when.getTime())) return { ok: false, error: "Invalid date & time." };

  const cfg = await getScoreConfig();
  const maxMin = cfg.thresholds.maxSessionMinutes || 90;
  if (d.durationMin > maxMin) {
    return { ok: false, error: `No session may exceed ${maxMin} minutes.` };
  }

  try {
    await db
      .update(tcSessions)
      .set({
        topic: d.topic,
        subjectId: d.subjectId ?? null,
        los: emptyToNull(d.los),
        criticality: d.criticality,
        trainerId: d.trainerId ?? null,
        scheduledAt: when,
        durationMin: d.durationMin,
        mode: d.mode,
        location: emptyToNull(d.location),
        meetingUrl: emptyToNull(d.meetingUrl),
        videoPath: emptyToNull(d.videoPath),
        pptPath: emptyToNull(d.pptPath),
        inManual: !!d.inManual,
        notes: emptyToNull(d.notes),
        updatedAt: new Date(),
      })
      .where(eq(tcSessions.id, d.id));

    // Reconcile attendees when supplied (add new invitees; never drop anyone who
    // already has attendance/feedback recorded).
    if (d.attendeeIds) {
      const want = new Set(d.attendeeIds);
      const existing = await db
        .select({ employeeId: tcSessionAttendees.employeeId })
        .from(tcSessionAttendees)
        .where(eq(tcSessionAttendees.sessionId, d.id));
      const have = new Set(existing.map((e) => e.employeeId));
      const toAdd = [...want].filter((id) => !have.has(id));
      if (toAdd.length > 0) {
        await db
          .insert(tcSessionAttendees)
          .values(toAdd.map((employeeId) => ({ sessionId: d.id, employeeId, status: "invited" as const })))
          .onConflictDoNothing({ target: [tcSessionAttendees.sessionId, tcSessionAttendees.employeeId] });
      }
    }

    revalidatePath(PATH);
    revalidatePath(`${PATH}/${d.id}`);
    return { ok: true, id: d.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

export async function cancelSession(id: string): Promise<Result> {
  const me = await requireTrainingManager();
  if (!UUID.safeParse(id).success) return { ok: false, error: "Invalid session." };
  try {
    await db.update(tcSessions).set({ status: "cancelled", updatedAt: new Date() }).where(eq(tcSessions.id, id));
    revalidatePath(PATH);
    revalidatePath(`${PATH}/${id}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Mark a session done (records the attendance + feedback window). */
export async function completeSession(id: string): Promise<Result> {
  await requireTrainingManager();
  if (!UUID.safeParse(id).success) return { ok: false, error: "Invalid session." };
  try {
    await db.update(tcSessions).set({ status: "done", updatedAt: new Date() }).where(eq(tcSessions.id, id));
    revalidatePath(PATH);
    revalidatePath(`${PATH}/${id}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Toggle ★ "add to the training manual". */
export async function toggleManual(id: string, inManual: boolean): Promise<Result> {
  await requireTrainingManager();
  if (!UUID.safeParse(id).success) return { ok: false, error: "Invalid session." };
  try {
    await db.update(tcSessions).set({ inManual, updatedAt: new Date() }).where(eq(tcSessions.id, id));
    revalidatePath(PATH);
    revalidatePath(`${PATH}/${id}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Request a recording of the session (any workspace member). */
export async function requestRecording(id: string): Promise<Result> {
  const me = await requireWorkspace("training");
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  if (!UUID.safeParse(id).success) return { ok: false, error: "Invalid session." };
  try {
    const [s] = await db
      .select({ trainerId: tcSessions.trainerId, topic: tcSessions.topic })
      .from(tcSessions)
      .where(eq(tcSessions.id, id))
      .limit(1);
    if (!s) return { ok: false, error: "Session not found." };
    await db.update(tcSessions).set({ recordingRequested: true, updatedAt: new Date() }).where(eq(tcSessions.id, id));
    if (s.trainerId && s.trainerId !== me.id) {
      notify({
        userId: s.trainerId,
        kind: "nudged",
        title: `Recording requested: ${s.topic}`,
        body: `${me.name} asked for a recording of this session.`,
        actorId: me.id,
      });
    }
    revalidatePath(PATH);
    revalidatePath(`${PATH}/${id}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Attendance ────────────────────────────────────────────────────────────

/**
 * Trainer/admin marks attendance — set each attendee's status (attended /
 * left_halfway / absent / invited) and editable minutes. Upserts so a row is
 * created if the person wasn't on the original invite list.
 */
export async function setAttendance(input: unknown): Promise<Result> {
  const me = await requireTrainingManager();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = AttendanceSchema.safeParse(input);
  if (!parsed.success) return fail(parsed);
  const { sessionId, rows } = parsed.data;

  try {
    const now = new Date();
    for (const r of rows) {
      const attendedMin =
        r.status === "attended" || r.status === "left_halfway"
          ? r.attendedMin ?? null
          : null;
      await db
        .insert(tcSessionAttendees)
        .values({
          sessionId,
          employeeId: r.employeeId,
          status: r.status,
          attendedMin,
          markedById: me.id,
          markedAt: now,
        })
        .onConflictDoUpdate({
          target: [tcSessionAttendees.sessionId, tcSessionAttendees.employeeId],
          set: { status: r.status, attendedMin, markedById: me.id, markedAt: now },
        });
    }
    revalidatePath(`${PATH}/${sessionId}`);
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Feedback (attendee → trainer) ───────────────────────────────────────────

export async function submitSessionFeedback(input: unknown): Promise<Result> {
  const me = await requireWorkspace("training");
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = FeedbackSchema.safeParse(input);
  if (!parsed.success) return fail(parsed);
  const d = parsed.data;

  try {
    // Only an invited/attended employee may leave feedback.
    const [att] = await db
      .select({ id: tcSessionAttendees.id })
      .from(tcSessionAttendees)
      .where(and(eq(tcSessionAttendees.sessionId, d.sessionId), eq(tcSessionAttendees.employeeId, me.id)))
      .limit(1);
    if (!att) return { ok: false, error: "Only attendees can leave feedback." };

    await db
      .insert(tcSessionFeedback)
      .values({
        sessionId: d.sessionId,
        employeeId: me.id,
        content: d.content,
        depth: d.depth,
        understanding: d.understanding,
        applicability: d.applicability,
        learned: emptyToNull(d.learned),
        improve: emptyToNull(d.improve),
      })
      .onConflictDoUpdate({
        target: [tcSessionFeedback.sessionId, tcSessionFeedback.employeeId],
        set: {
          content: d.content,
          depth: d.depth,
          understanding: d.understanding,
          applicability: d.applicability,
          learned: emptyToNull(d.learned),
          improve: emptyToNull(d.improve),
        },
      });
    revalidatePath(`${PATH}/${d.sessionId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Assessment ("Manan's Assessment") ───────────────────────────────────────

/**
 * Record (or update) an attendee's assessment for a session. `passed` is derived
 * from the config's assessmentPassPct threshold (< pass% ⇒ fail ⇒ must redo).
 * Recording one assessment supersedes the previous (one current row per person
 * per session) — re-recording a failed score is the "redo".
 */
export async function recordAssessment(input: unknown): Promise<Result<{ passed: boolean }>> {
  const me = await requireTrainingManager();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = AssessmentSchema.safeParse(input);
  if (!parsed.success) return fail(parsed);
  const d = parsed.data;

  try {
    const cfg = await getScoreConfig();
    const passPct = cfg.thresholds.assessmentPassPct || 80;
    const passed = d.score >= passPct;

    const [existing] = await db
      .select({ id: tcAssessments.id })
      .from(tcAssessments)
      .where(and(eq(tcAssessments.sessionId, d.sessionId), eq(tcAssessments.employeeId, d.employeeId)))
      .limit(1);

    if (existing) {
      await db
        .update(tcAssessments)
        .set({
          score: d.score,
          target: d.target,
          passed,
          waived: false,
          assessedById: me.id,
          note: emptyToNull(d.note),
          updatedAt: new Date(),
        })
        .where(eq(tcAssessments.id, existing.id));
    } else {
      await db.insert(tcAssessments).values({
        sessionId: d.sessionId,
        employeeId: d.employeeId,
        score: d.score,
        target: d.target,
        passed,
        assessedById: me.id,
        note: emptyToNull(d.note),
      });
    }

    if (!passed && d.employeeId !== me.id) {
      const [s] = await db.select({ topic: tcSessions.topic }).from(tcSessions).where(eq(tcSessions.id, d.sessionId)).limit(1);
      notify({
        userId: d.employeeId,
        kind: "training_test_failed",
        title: `Assessment to redo: ${s?.topic ?? "training"}`,
        body: `You scored ${d.score}% (pass mark ${passPct}%). Please redo this assessment.`,
        actorId: me.id,
      });
    }

    revalidatePath(`${PATH}/${d.sessionId}`);
    return { ok: true, passed };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

/** Waive a failed assessment (trainer/admin). */
export async function waiveAssessment(id: string): Promise<Result> {
  const me = await requireTrainingManager();
  if (!UUID.safeParse(id).success) return { ok: false, error: "Invalid assessment." };
  try {
    const [a] = await db.select({ sessionId: tcAssessments.sessionId }).from(tcAssessments).where(eq(tcAssessments.id, id)).limit(1);
    if (!a) return { ok: false, error: "Assessment not found." };
    await db
      .update(tcAssessments)
      .set({ waived: true, passed: true, waivedById: me.id, updatedAt: new Date() })
      .where(eq(tcAssessments.id, id));
    if (a.sessionId) revalidatePath(`${PATH}/${a.sessionId}`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

// ── Inline subject add (for the session form's subject picker) ───────────────

const SubjectSchema = z.object({ name: z.string().trim().min(2, "Enter a subject.").max(120) });

/** Add (or re-activate) a Training subject, returning the option for the picker. */
export async function addSessionSubject(
  name: string,
): Promise<Result<{ option: { id: string; name: string } }>> {
  const me = await requireTrainingManager();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = SubjectSchema.safeParse({ name });
  if (!parsed.success) return fail(parsed);
  const value = parsed.data.name;
  try {
    const [existing] = await db
      .select({ id: tcSubjects.id, name: tcSubjects.name, isActive: tcSubjects.isActive })
      .from(tcSubjects)
      .where(sql`lower(${tcSubjects.name}) = lower(${value})`)
      .limit(1);
    if (existing) {
      if (!existing.isActive) {
        await db.update(tcSubjects).set({ isActive: true, updatedAt: new Date() }).where(eq(tcSubjects.id, existing.id));
      }
      revalidatePath(PATH);
      return { ok: true, option: { id: existing.id, name: existing.name } };
    }
    const [row] = await db.insert(tcSubjects).values({ name: value }).returning({ id: tcSubjects.id, name: tcSubjects.name });
    revalidatePath(PATH);
    return { ok: true, option: { id: row!.id, name: row!.name } };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
