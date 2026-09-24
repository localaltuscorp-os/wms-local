"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  tcTrainingSurveys,
  tcSurveyQuestions,
  tcSurveyResponses,
  tcSessionAttendees,
} from "@/db/schema";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { canTrain } from "@/lib/training/roles";
import { rateLimitOrError } from "@/lib/rate-limit";
import { auditAction } from "@/lib/logs/audit";

const PATH = "/training/surveys";
export type Result<T = unknown> = ({ ok: true } & T) | { ok: false; error: string };

const UUID = z.string().uuid();

export const DEFAULT_SURVEY_QUESTIONS = [
  "Trainer explained concepts clearly",
  "Trainer demonstrated knowledge",
  "Training was relevant to my role",
  "Training was engaging",
  "Training improved my understanding",
  "Training material was useful",
];

async function requireTrainer() {
  const me = await requireWorkspace("training");
  if (!me.isAdmin && !isSuperAdmin(me.email) && !(await canTrain(me))) {
    throw new Error("Trainers only");
  }
  return me;
}

function fail(parsed: { success: false; error: z.ZodError }): { ok: false; error: string } {
  return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input." };
}

const UpsertSurveySchema = z.object({
  sessionId: UUID,
  title: z.string().trim().max(300).nullable().optional(),
  questions: z.array(z.object({ prompt: z.string().trim().min(2).max(500) })).max(20),
});

/** Create (or replace the questions of) a training's feedback survey. */
export async function upsertSurvey(input: unknown): Promise<Result<{ id: string }>> {
  const me = await requireTrainer();
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = UpsertSurveySchema.safeParse(input);
  if (!parsed.success) return fail(parsed);
  const d = parsed.data;

  try {
    const [existing] = await db
      .select({ id: tcTrainingSurveys.id })
      .from(tcTrainingSurveys)
      .where(eq(tcTrainingSurveys.sessionId, d.sessionId))
      .limit(1);

    let surveyId = existing?.id;
    if (existing) {
      await db.update(tcTrainingSurveys).set({ title: d.title ?? null, updatedAt: new Date() }).where(eq(tcTrainingSurveys.id, existing.id));
      await db.delete(tcSurveyQuestions).where(eq(tcSurveyQuestions.surveyId, existing.id));
    } else {
      const [row] = await db
        .insert(tcTrainingSurveys)
        .values({ sessionId: d.sessionId, title: d.title ?? null, createdById: me.id })
        .returning({ id: tcTrainingSurveys.id });
      surveyId = row!.id;
    }

    if (d.questions.length > 0) {
      await db.insert(tcSurveyQuestions).values(
        d.questions.map((q, i) => ({ surveyId: surveyId!, prompt: q.prompt, type: "rating" as const, position: i })),
      );
    }

    auditAction({
      eventType: "CREATE",
      employeeId: me.id,
      route: PATH,
      module: "Training",
      resourceType: "training_survey",
      resourceId: surveyId,
      action: "save",
      status: "SUCCESS",
    });

    revalidatePath(PATH);
    revalidatePath(`/training/calendar/${d.sessionId}`);
    return { ok: true, id: surveyId! };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

const SubmitSurveySchema = z.object({
  surveyId: UUID,
  answers: z.array(
    z.object({
      questionId: UUID,
      rating: z.coerce.number().int().min(1).max(5).nullable().optional(),
      comment: z.string().trim().max(2000).nullable().optional(),
    }),
  ).max(50),
});

/**
 * An attendee submits their (anonymous) feedback. The employee_id is stored for
 * dedup; it is NEVER surfaced to the trainer — see `surveyAggregate`.
 */
export async function submitSurveyResponse(input: unknown): Promise<Result> {
  const me = await requireWorkspace("training");
  const limited = rateLimitOrError(me.id, "write");
  if (limited) return limited;
  const parsed = SubmitSurveySchema.safeParse(input);
  if (!parsed.success) return fail(parsed);
  const { surveyId, answers } = parsed.data;

  try {
    const [survey] = await db
      .select({ sessionId: tcTrainingSurveys.sessionId })
      .from(tcTrainingSurveys)
      .where(eq(tcTrainingSurveys.id, surveyId))
      .limit(1);
    if (!survey) return { ok: false, error: "Survey not found." };

    const [att] = await db
      .select({ id: tcSessionAttendees.id })
      .from(tcSessionAttendees)
      .where(and(eq(tcSessionAttendees.sessionId, survey.sessionId), eq(tcSessionAttendees.employeeId, me.id)))
      .limit(1);
    if (!att) return { ok: false, error: "Only attendees can give feedback." };

    const rows = answers.map((a) => ({
      surveyId,
      questionId: a.questionId,
      employeeId: me.id,
      rating: a.rating ?? null,
      comment: a.comment?.trim() || null,
    }));

    for (const r of rows) {
      await db
        .insert(tcSurveyResponses)
        .values(r)
        .onConflictDoUpdate({
          target: [tcSurveyResponses.questionId, tcSurveyResponses.employeeId],
          set: { rating: r.rating, comment: r.comment },
        });
    }

    revalidatePath(`/training/calendar/${survey.sessionId}`);
    revalidatePath(PATH);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}
