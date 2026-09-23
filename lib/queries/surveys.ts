import "server-only";
import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  tcTrainingSurveys,
  tcSurveyQuestions,
  tcSurveyResponses,
  tcSessions,
} from "@/db/schema";

/**
 * Per-training feedback survey. The AGGREGATE reads never select employee_id —
 * that is the anonymity boundary. A response's employee_id exists only so the
 * (survey, question, employee) uniqueness can stop double-submission.
 */

export interface SurveyQuestion {
  id: string;
  prompt: string;
  type: "rating" | "text";
  position: number;
}

export interface SurveyDetail {
  id: string;
  sessionId: string;
  sessionTopic: string;
  title: string | null;
  questions: SurveyQuestion[];
}

/** The survey for a session (for a responder — no answers, no identities). */
export async function getSurveyForSession(sessionId: string): Promise<SurveyDetail | null> {
  const [s] = await db
    .select({
      id: tcTrainingSurveys.id,
      sessionId: tcTrainingSurveys.sessionId,
      title: tcTrainingSurveys.title,
      topic: tcSessions.topic,
    })
    .from(tcTrainingSurveys)
    .innerJoin(tcSessions, eq(tcSessions.id, tcTrainingSurveys.sessionId))
    .where(eq(tcTrainingSurveys.sessionId, sessionId))
    .limit(1);
  if (!s) return null;

  const questions = await db
    .select({ id: tcSurveyQuestions.id, prompt: tcSurveyQuestions.prompt, type: tcSurveyQuestions.type, position: tcSurveyQuestions.position })
    .from(tcSurveyQuestions)
    .where(eq(tcSurveyQuestions.surveyId, s.id))
    .orderBy(asc(tcSurveyQuestions.position));

  return {
    id: s.id,
    sessionId: s.sessionId,
    sessionTopic: s.topic,
    title: s.title,
    questions: questions.map((q) => ({ id: q.id, prompt: q.prompt, type: q.type as "rating" | "text", position: q.position })),
  };
}

export interface QuestionAggregate {
  questionId: string;
  prompt: string;
  responses: number;
  average: number | null; // 1..5 mean, null when no rating responses
}

/** Trainer-facing aggregate — average per question + response count. NO identity. */
export async function surveyAggregate(sessionId: string): Promise<{
  surveyId: string;
  title: string | null;
  questions: QuestionAggregate[];
  responses: number;
} | null> {
  const [s] = await db
    .select({ id: tcTrainingSurveys.id, title: tcTrainingSurveys.title })
    .from(tcTrainingSurveys)
    .where(eq(tcTrainingSurveys.sessionId, sessionId))
    .limit(1);
  if (!s) return null;

  const questions = await db
    .select({
      questionId: tcSurveyQuestions.id,
      prompt: tcSurveyQuestions.prompt,
      type: tcSurveyQuestions.type,
      avg: sql<number | null>`round(avg(${tcSurveyResponses.rating})::numeric, 2)`,
      count: sql<number>`count(${tcSurveyResponses.id})::int`,
    })
    .from(tcSurveyQuestions)
    .leftJoin(tcSurveyResponses, eq(tcSurveyResponses.questionId, tcSurveyQuestions.id))
    .where(eq(tcSurveyQuestions.surveyId, s.id))
    .groupBy(tcSurveyQuestions.id, tcSurveyQuestions.prompt, tcSurveyQuestions.type, tcSurveyQuestions.position)
    .orderBy(asc(tcSurveyQuestions.position));

  const [resp] = await db
    .select({ n: sql<number>`count(distinct ${tcSurveyResponses.employeeId})::int` })
    .from(tcSurveyResponses)
    .where(eq(tcSurveyResponses.surveyId, s.id));

  return {
    surveyId: s.id,
    title: s.title,
    questions: questions.map((q) => ({
      questionId: q.questionId,
      prompt: q.prompt,
      responses: q.count ?? 0,
      average: q.avg != null ? Number(q.avg) : null,
    })),
    responses: resp?.n ?? 0,
  };
}

/** True when `employeeId` already answered this survey. */
export async function hasResponded(surveyId: string, employeeId: string): Promise<boolean> {
  const [r] = await db
    .select({ id: tcSurveyResponses.id })
    .from(tcSurveyResponses)
    .where(and(eq(tcSurveyResponses.surveyId, surveyId), eq(tcSurveyResponses.employeeId, employeeId)))
    .limit(1);
  return !!r;
}
