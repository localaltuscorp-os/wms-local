import "server-only";
import { and, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { db } from "@/lib/db";
import { tcSessions, tcSessionAttendees } from "@/db/schema";

/**
 * Recurring training materialization — mirrors the Tasks recurrence model
 * (lib/recurrence/materialize.ts) but simpler: a template session holds a
 * `recurrence_rule` and spawns dated children. Only one future occurrence is
 * ever created per run, inside a forward window, so a daily template never
 * explodes into a wall of rows. Idempotent via the (parent, occurrence_date)
 * uniqueness check.
 */

const FORWARD_DAYS = 14;
const MAX_ITERATIONS = 60;

export interface MaterializeStats {
  templates: number;
  created: number;
}

function nextOccurrence(rule: string, last: Date): Date {
  const d = new Date(last);
  if (rule.includes("MONTHLY")) d.setMonth(d.getMonth() + 1);
  else d.setDate(d.getDate() + 7); // WEEKLY (default)
  return d;
}

export async function materializeRecurringTrainings(now: Date = new Date()): Promise<MaterializeStats> {
  const templates = await db
    .select()
    .from(tcSessions)
    .where(and(isNotNull(tcSessions.recurrenceRule), isNull(tcSessions.recurrenceParentId)));

  let created = 0;
  const horizon = new Date(now.getTime() + FORWARD_DAYS * 86_400_000);

  for (const t of templates) {
    const rule = t.recurrenceRule ?? "FREQ=WEEKLY";

    const [lastChild] = await db
      .select({ scheduledAt: tcSessions.scheduledAt })
      .from(tcSessions)
      .where(eq(tcSessions.recurrenceParentId, t.id))
      .orderBy(desc(tcSessions.scheduledAt))
      .limit(1);

    let next = nextOccurrence(rule, lastChild?.scheduledAt ?? t.scheduledAt);
    let guard = 0;

    while (next.getTime() <= horizon.getTime() && guard < MAX_ITERATIONS) {
      guard++;
      const occurrenceDate = next.toISOString().slice(0, 10);

      const [dup] = await db
        .select({ id: tcSessions.id })
        .from(tcSessions)
        .where(and(eq(tcSessions.recurrenceParentId, t.id), eq(tcSessions.recurrenceOccurrenceDate, occurrenceDate)))
        .limit(1);

      if (!dup) {
        const [child] = await db
          .insert(tcSessions)
          .values({
            subjectId: t.subjectId,
            topic: t.topic,
            los: t.los,
            criticality: t.criticality,
            trainerId: t.trainerId,
            scheduledAt: next,
            durationMin: t.durationMin,
            mode: t.mode,
            location: t.location,
            meetingUrl: t.meetingUrl,
            functionId: t.functionId,
            trainingType: t.trainingType,
            audienceScope: t.audienceScope,
            recurrenceRule: null,
            recurrenceParentId: t.id,
            recurrenceOccurrenceDate: occurrenceDate,
            status: "scheduled",
            inManual: t.inManual,
            notes: t.notes,
            createdById: t.createdById,
          })
          .returning({ id: tcSessions.id });

        const attendees = await db
          .select({ employeeId: tcSessionAttendees.employeeId, required: tcSessionAttendees.required })
          .from(tcSessionAttendees)
          .where(eq(tcSessionAttendees.sessionId, t.id));

        if (attendees.length > 0 && child) {
          await db
            .insert(tcSessionAttendees)
            .values(
              attendees.map((a) => ({
                sessionId: child.id,
                employeeId: a.employeeId,
                required: a.required,
                status: "invited" as const,
              })),
            )
            .onConflictDoNothing({ target: [tcSessionAttendees.sessionId, tcSessionAttendees.employeeId] });
        }
        created++;
      }

      next = nextOccurrence(rule, next);
    }
  }

  return { templates: templates.length, created };
}
