import "server-only";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  tcSessions,
  tcSessionAttendees,
  tcSessionFeedback,
  tcAssessments,
  tcSubjects,
  employees,
} from "@/db/schema";
import { withRetry } from "@/lib/db/with-timeout";
import { getDownlineIds } from "@/lib/weekly-goals/hierarchy";

const RETRY = { attempts: 3, timeoutMs: [6000, 10000, 14000] as number[] };

export type SessionStatus = "scheduled" | "done" | "cancelled";
export type SessionMode = "in_person" | "online";

/**
 * Visibility scope for the calendar.
 *  - "all"      → every session (admins / super-admins)
 *  - "downline" → sessions I run, attend, created, or that my downline runs/attends
 *  - "mine"     → sessions I run, attend, or created
 */
export interface ListScope {
  kind: "all" | "downline" | "mine";
  meId: string;
}

export interface SessionListRow {
  id: string;
  topic: string;
  subject: string | null;
  los: string | null;
  criticality: number;
  trainerId: string | null;
  trainerName: string | null;
  scheduledAt: string; // ISO
  durationMin: number;
  mode: SessionMode;
  location: string | null;
  meetingUrl: string | null;
  status: SessionStatus;
  inManual: boolean;
  recordingRequested: boolean;
  attendeeCount: number;
  attendedCount: number;
}

/** Resolve the set of employee ids whose sessions are visible under a non-admin
 *  scope (me + my downline). Admin scope ignores this. */
async function scopeIds(scope: ListScope): Promise<string[]> {
  if (scope.kind === "all") return [];
  if (scope.kind === "mine") return [scope.meId];
  const downline = await getDownlineIds(scope.meId).catch(() => [] as string[]);
  return [scope.meId, ...downline];
}

/**
 * Sessions for the calendar — newest scheduled first. Carries the trainer name,
 * subject, and live attendee / attended counts. Under a scoped (non-admin) view
 * a session is visible when the viewer (or their downline) is the trainer, the
 * creator, OR an attendee.
 */
export async function listSessions(opts: {
  scope: ListScope;
}): Promise<SessionListRow[]> {
  const ids = await scopeIds(opts.scope);
  const scoped = opts.scope.kind !== "all";

  // Attendee-membership predicate for the scoped view (resolved as a subquery so
  // we keep a single round-trip).
  const visibility =
    scoped && ids.length > 0
      ? sql`(
          ${tcSessions.trainerId} = ANY(${ids})
          OR ${tcSessions.createdById} = ANY(${ids})
          OR EXISTS (
            SELECT 1 FROM ${tcSessionAttendees} a
            WHERE a.session_id = ${tcSessions.id}
              AND a.employee_id = ANY(${ids})
          )
        )`
      : undefined;

  const rows = await withRetry(
    () =>
      db
        .select({
          id: tcSessions.id,
          topic: tcSessions.topic,
          subject: tcSubjects.name,
          los: tcSessions.los,
          criticality: tcSessions.criticality,
          trainerId: tcSessions.trainerId,
          trainerName: employees.name,
          scheduledAt: tcSessions.scheduledAt,
          durationMin: tcSessions.durationMin,
          mode: tcSessions.mode,
          location: tcSessions.location,
          meetingUrl: tcSessions.meetingUrl,
          status: tcSessions.status,
          inManual: tcSessions.inManual,
          recordingRequested: tcSessions.recordingRequested,
          attendeeCount: sql<number>`(
            SELECT count(*)::int FROM ${tcSessionAttendees} a WHERE a.session_id = ${tcSessions.id}
          )`,
          attendedCount: sql<number>`(
            SELECT count(*)::int FROM ${tcSessionAttendees} a
            WHERE a.session_id = ${tcSessions.id}
              AND a.status IN ('attended','left_halfway')
          )`,
        })
        .from(tcSessions)
        .leftJoin(tcSubjects, eq(tcSubjects.id, tcSessions.subjectId))
        .leftJoin(employees, eq(employees.id, tcSessions.trainerId))
        .where(visibility)
        .orderBy(desc(tcSessions.scheduledAt)),
    { ...RETRY, label: "tc-list-sessions" },
  );

  return rows.map((r) => ({
    id: r.id,
    topic: r.topic,
    subject: r.subject,
    los: r.los,
    criticality: r.criticality,
    trainerId: r.trainerId,
    trainerName: r.trainerName,
    scheduledAt: r.scheduledAt.toISOString(),
    durationMin: r.durationMin,
    mode: r.mode as SessionMode,
    location: r.location,
    meetingUrl: r.meetingUrl,
    status: r.status as SessionStatus,
    inManual: r.inManual,
    recordingRequested: r.recordingRequested,
    attendeeCount: r.attendeeCount ?? 0,
    attendedCount: r.attendedCount ?? 0,
  }));
}

export interface SessionAttendeeRow {
  id: string;
  employeeId: string;
  employeeName: string;
  status: "invited" | "attended" | "left_halfway" | "absent";
  attendedMin: number | null;
}

export interface SessionFeedbackRow {
  id: string;
  employeeId: string;
  employeeName: string;
  content: number | null;
  depth: number | null;
  understanding: number | null;
  applicability: number | null;
  learned: string | null;
  improve: string | null;
}

export interface SessionAssessmentRow {
  id: string;
  employeeId: string;
  employeeName: string;
  score: number | null;
  target: number | null;
  passed: boolean | null;
  waived: boolean;
  note: string | null;
}

export interface SessionDetail {
  id: string;
  topic: string;
  subjectId: string | null;
  subject: string | null;
  los: string | null;
  criticality: number;
  trainerId: string | null;
  trainerName: string | null;
  scheduledAt: string; // ISO
  durationMin: number;
  mode: SessionMode;
  location: string | null;
  meetingUrl: string | null;
  videoPath: string | null;
  pptPath: string | null;
  status: SessionStatus;
  inManual: boolean;
  recordingRequested: boolean;
  notes: string | null;
  createdById: string | null;
  attendees: SessionAttendeeRow[];
  feedback: SessionFeedbackRow[];
  assessments: SessionAssessmentRow[];
}

/** Full session for the detail page — attendees, feedback and assessments joined
 *  to employee names. Returns null when the id doesn't resolve. */
export async function getSession(id: string): Promise<SessionDetail | null> {
  const [s] = await withRetry(
    () =>
      db
        .select({
          id: tcSessions.id,
          topic: tcSessions.topic,
          subjectId: tcSessions.subjectId,
          subject: tcSubjects.name,
          los: tcSessions.los,
          criticality: tcSessions.criticality,
          trainerId: tcSessions.trainerId,
          trainerName: employees.name,
          scheduledAt: tcSessions.scheduledAt,
          durationMin: tcSessions.durationMin,
          mode: tcSessions.mode,
          location: tcSessions.location,
          meetingUrl: tcSessions.meetingUrl,
          videoPath: tcSessions.videoPath,
          pptPath: tcSessions.pptPath,
          status: tcSessions.status,
          inManual: tcSessions.inManual,
          recordingRequested: tcSessions.recordingRequested,
          notes: tcSessions.notes,
          createdById: tcSessions.createdById,
        })
        .from(tcSessions)
        .leftJoin(tcSubjects, eq(tcSubjects.id, tcSessions.subjectId))
        .leftJoin(employees, eq(employees.id, tcSessions.trainerId))
        .where(eq(tcSessions.id, id))
        .limit(1),
    { ...RETRY, label: "tc-get-session" },
  );
  if (!s) return null;

  const att = employees;
  const [attendees, feedback, assessments] = await Promise.all([
    withRetry(
      () =>
        db
          .select({
            id: tcSessionAttendees.id,
            employeeId: tcSessionAttendees.employeeId,
            employeeName: att.name,
            status: tcSessionAttendees.status,
            attendedMin: tcSessionAttendees.attendedMin,
          })
          .from(tcSessionAttendees)
          .leftJoin(att, eq(att.id, tcSessionAttendees.employeeId))
          .where(eq(tcSessionAttendees.sessionId, id))
          .orderBy(asc(att.name)),
      { ...RETRY, label: "tc-session-attendees" },
    ),
    withRetry(
      () =>
        db
          .select({
            id: tcSessionFeedback.id,
            employeeId: tcSessionFeedback.employeeId,
            employeeName: att.name,
            content: tcSessionFeedback.content,
            depth: tcSessionFeedback.depth,
            understanding: tcSessionFeedback.understanding,
            applicability: tcSessionFeedback.applicability,
            learned: tcSessionFeedback.learned,
            improve: tcSessionFeedback.improve,
          })
          .from(tcSessionFeedback)
          .leftJoin(att, eq(att.id, tcSessionFeedback.employeeId))
          .where(eq(tcSessionFeedback.sessionId, id))
          .orderBy(desc(tcSessionFeedback.createdAt)),
      { ...RETRY, label: "tc-session-feedback" },
    ),
    withRetry(
      () =>
        db
          .select({
            id: tcAssessments.id,
            employeeId: tcAssessments.employeeId,
            employeeName: att.name,
            score: tcAssessments.score,
            target: tcAssessments.target,
            passed: tcAssessments.passed,
            waived: tcAssessments.waived,
            note: tcAssessments.note,
          })
          .from(tcAssessments)
          .leftJoin(att, eq(att.id, tcAssessments.employeeId))
          .where(eq(tcAssessments.sessionId, id))
          .orderBy(asc(att.name)),
      { ...RETRY, label: "tc-session-assessments" },
    ),
  ]);

  return {
    id: s.id,
    topic: s.topic,
    subjectId: s.subjectId,
    subject: s.subject,
    los: s.los,
    criticality: s.criticality,
    trainerId: s.trainerId,
    trainerName: s.trainerName,
    scheduledAt: s.scheduledAt.toISOString(),
    durationMin: s.durationMin,
    mode: s.mode as SessionMode,
    location: s.location,
    meetingUrl: s.meetingUrl,
    videoPath: s.videoPath,
    pptPath: s.pptPath,
    status: s.status as SessionStatus,
    inManual: s.inManual,
    recordingRequested: s.recordingRequested,
    notes: s.notes,
    createdById: s.createdById,
    attendees: attendees.map((a) => ({
      id: a.id,
      employeeId: a.employeeId,
      employeeName: a.employeeName ?? "Unknown",
      status: a.status as SessionAttendeeRow["status"],
      attendedMin: a.attendedMin,
    })),
    feedback: feedback.map((f) => ({
      id: f.id,
      employeeId: f.employeeId,
      employeeName: f.employeeName ?? "Unknown",
      content: f.content,
      depth: f.depth,
      understanding: f.understanding,
      applicability: f.applicability,
      learned: f.learned,
      improve: f.improve,
    })),
    assessments: assessments.map((a) => ({
      id: a.id,
      employeeId: a.employeeId,
      employeeName: a.employeeName ?? "Unknown",
      score: a.score,
      target: a.target,
      passed: a.passed,
      waived: a.waived,
      note: a.note,
    })),
  };
}

export interface UpcomingAlert {
  /** Days since the most recent scheduled-or-done session (null = never). */
  daysSinceLast: number | null;
  /** ISO of the next upcoming scheduled session, if any. */
  nextScheduledAt: string | null;
  /** ISO of the most recent past session, if any. */
  lastSessionAt: string | null;
  /** True when there is no scheduled session in the future. */
  noneScheduled: boolean;
}

/**
 * Drives the ">N-day no-schedule" amber banner. Looks at the most recent past
 * session and the next upcoming scheduled one. `daysSinceLast` is whole IST days
 * since the latest session in the past; the page compares it to the configured
 * `noScheduleAlertDays`. Cancelled sessions are ignored.
 */
export async function upcomingAlert(): Promise<UpcomingAlert> {
  const now = new Date();
  const [past, next] = await Promise.all([
    withRetry(
      () =>
        db
          .select({ at: tcSessions.scheduledAt })
          .from(tcSessions)
          .where(and(inArray(tcSessions.status, ["scheduled", "done"]), sql`${tcSessions.scheduledAt} <= now()`))
          .orderBy(desc(tcSessions.scheduledAt))
          .limit(1),
      { ...RETRY, label: "tc-alert-past" },
    ),
    withRetry(
      () =>
        db
          .select({ at: tcSessions.scheduledAt })
          .from(tcSessions)
          .where(and(eq(tcSessions.status, "scheduled"), sql`${tcSessions.scheduledAt} > now()`))
          .orderBy(asc(tcSessions.scheduledAt))
          .limit(1),
      { ...RETRY, label: "tc-alert-next" },
    ),
  ]);

  const lastAt = past[0]?.at ?? null;
  const nextAt = next[0]?.at ?? null;
  const daysSinceLast =
    lastAt != null ? Math.floor((now.getTime() - lastAt.getTime()) / 86_400_000) : null;

  return {
    daysSinceLast,
    nextScheduledAt: nextAt ? nextAt.toISOString() : null,
    lastSessionAt: lastAt ? lastAt.toISOString() : null,
    noneScheduled: nextAt == null,
  };
}
