import "server-only";
import { and, count, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  tcSessions,
  tcSessionAttendees,
  tcAssessments,
  tcSubjects,
  tcTrainingSurveys,
  tcSurveyResponses,
  employees,
  functions,
} from "@/db/schema";

export interface NameCount {
  name: string;
  count: number;
}

export interface TrainerStat {
  trainerId: string;
  trainerName: string;
  conducted: number;
  avgAssessment: number | null;
  avgSurvey: number | null;
}

export interface TrainingAnalytics {
  total: number;
  conducted: number;
  cancelled: number;
  byFunction: NameCount[];
  byTopic: NameCount[];
  attendance: { present: number; late: number; partial: number; absent: number; viaRecording: number };
  avgAssessment: number | null;
  avgSurvey: number | null;
  trainers: TrainerStat[];
}

export async function trainingAnalytics(monthStart: string, monthEnd: string): Promise<TrainingAnalytics> {
  const start = new Date(monthStart);
  const end = new Date(monthEnd);

  const [byFunction, byTopic, attendance, avgAssessment, avgSurvey, trainers, totals] = await Promise.all([
    db
      .select({ name: functions.name, count: count() })
      .from(tcSessions)
      .leftJoin(functions, eq(functions.id, tcSessions.functionId))
      .where(and(gte(tcSessions.scheduledAt, start), lte(tcSessions.scheduledAt, end)))
      .groupBy(functions.name)
      .orderBy(desc(count())),
    db
      .select({ name: tcSubjects.name, count: count() })
      .from(tcSessions)
      .leftJoin(tcSubjects, eq(tcSubjects.id, tcSessions.subjectId))
      .where(and(gte(tcSessions.scheduledAt, start), lte(tcSessions.scheduledAt, end)))
      .groupBy(tcSubjects.name)
      .orderBy(desc(count())),
    db
      .select({
        present: sql<number>`count(*) filter (where ${tcSessionAttendees.status} in ('present','attended'))::int`,
        late: sql<number>`count(*) filter (where ${tcSessionAttendees.status} = 'late')::int`,
        partial: sql<number>`count(*) filter (where ${tcSessionAttendees.status} in ('partial','left_halfway'))::int`,
        absent: sql<number>`count(*) filter (where ${tcSessionAttendees.status} = 'absent')::int`,
        viaRecording: sql<number>`count(*) filter (where ${tcSessionAttendees.status} = 'completed_via_recording')::int`,
      })
      .from(tcSessionAttendees)
      .innerJoin(tcSessions, eq(tcSessions.id, tcSessionAttendees.sessionId))
      .where(and(gte(tcSessions.scheduledAt, start), lte(tcSessions.scheduledAt, end))),
    db
      .select({ avg: sql<number | null>`round(avg(${tcAssessments.score})::numeric, 2)` })
      .from(tcAssessments)
      .innerJoin(tcSessions, eq(tcSessions.id, tcAssessments.sessionId))
      .where(and(gte(tcSessions.scheduledAt, start), lte(tcSessions.scheduledAt, end))),
    db
      .select({ avg: sql<number | null>`round(avg(${tcSurveyResponses.rating})::numeric, 2)` })
      .from(tcSurveyResponses)
      .innerJoin(tcTrainingSurveys, eq(tcTrainingSurveys.id, tcSurveyResponses.surveyId))
      .innerJoin(tcSessions, eq(tcSessions.id, tcTrainingSurveys.sessionId))
      .where(and(gte(tcSessions.scheduledAt, start), lte(tcSessions.scheduledAt, end))),
    db
      .select({
        trainerId: tcSessions.trainerId,
        trainerName: employees.name,
        conducted: count(),
        avgAssessment: sql<number | null>`null`,
        avgSurvey: sql<number | null>`null`,
      })
      .from(tcSessions)
      .leftJoin(employees, eq(employees.id, tcSessions.trainerId))
      .where(
        and(
          gte(tcSessions.scheduledAt, start),
          lte(tcSessions.scheduledAt, end),
          inArray(tcSessions.status, ["done", "completed", "closed"]),
        ),
      )
      .groupBy(tcSessions.trainerId, employees.name)
      .orderBy(desc(count())),
    db
      .select({
        total: count(),
        conducted: sql<number>`count(*) filter (where ${tcSessions.status} in ('done','completed','closed'))::int`,
        cancelled: sql<number>`count(*) filter (where ${tcSessions.status} = 'cancelled')::int`,
      })
      .from(tcSessions)
      .where(and(gte(tcSessions.scheduledAt, start), lte(tcSessions.scheduledAt, end))),
  ]);

  return {
    total: totals[0]?.total ?? 0,
    conducted: totals[0]?.conducted ?? 0,
    cancelled: totals[0]?.cancelled ?? 0,
    byFunction: byFunction.map((r) => ({ name: r.name ?? "Unassigned", count: r.count })),
    byTopic: byTopic.map((r) => ({ name: r.name ?? "Untitled", count: r.count })),
    attendance: {
      present: attendance[0]?.present ?? 0,
      late: attendance[0]?.late ?? 0,
      partial: attendance[0]?.partial ?? 0,
      absent: attendance[0]?.absent ?? 0,
      viaRecording: attendance[0]?.viaRecording ?? 0,
    },
    avgAssessment: avgAssessment[0]?.avg != null ? Number(avgAssessment[0].avg) : null,
    avgSurvey: avgSurvey[0]?.avg != null ? Number(avgSurvey[0].avg) : null,
    trainers: trainers.map((t) => ({
      trainerId: t.trainerId ?? "",
      trainerName: t.trainerName ?? "Unknown",
      conducted: t.conducted,
      avgAssessment: null,
      avgSurvey: null,
    })),
  };
}
