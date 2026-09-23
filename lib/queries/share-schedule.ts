import "server-only";
import { and, asc, eq, gte, lte, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { tcShareSchedule, tcShareAttendees, employees, functions } from "@/db/schema";
import type { ShareSlot } from "@/db/enums";

export interface ShareScheduleRow {
  id: string;
  shareDate: string;
  slot: ShareSlot;
  presenterId: string | null;
  presenterName: string | null;
  topic: string | null;
  functionName: string | null;
  los: string | null;
  keyTakeaway: string | null;
  status: "scheduled" | "done" | "cancelled" | "replaced";
  replacedById: string | null;
  attendeeCount: number;
}

export async function listShareSchedule(from: string, to: string): Promise<ShareScheduleRow[]> {
  const rows = await db
    .select({
      id: tcShareSchedule.id,
      shareDate: tcShareSchedule.shareDate,
      slot: tcShareSchedule.slot,
      presenterId: tcShareSchedule.presenterId,
      presenterName: employees.name,
      topic: tcShareSchedule.topic,
      functionName: functions.name,
      los: tcShareSchedule.los,
      keyTakeaway: tcShareSchedule.keyTakeaway,
      status: tcShareSchedule.status,
      replacedById: tcShareSchedule.replacedById,
      attendeeCount: sql<number>`(
        SELECT count(*)::int FROM ${tcShareAttendees} a WHERE a.share_schedule_id = ${tcShareSchedule.id}
      )`,
    })
    .from(tcShareSchedule)
    .leftJoin(employees, eq(employees.id, tcShareSchedule.presenterId))
    .leftJoin(functions, eq(functions.id, tcShareSchedule.functionId))
    .where(and(gte(tcShareSchedule.shareDate, from), lte(tcShareSchedule.shareDate, to)))
    .orderBy(asc(tcShareSchedule.shareDate), asc(tcShareSchedule.slot));

  return rows.map((r) => ({
    id: r.id,
    shareDate: r.shareDate,
    slot: r.slot as ShareSlot,
    presenterId: r.presenterId,
    presenterName: r.presenterName,
    topic: r.topic,
    functionName: r.functionName,
    los: r.los,
    keyTakeaway: r.keyTakeaway,
    status: r.status as ShareScheduleRow["status"],
    replacedById: r.replacedById,
    attendeeCount: r.attendeeCount ?? 0,
  }));
}

/** The next N scheduled shares (for rotation "who's up today"). */
export async function upcomingShares(limit = 6): Promise<ShareScheduleRow[]> {
  const today = new Date().toISOString().slice(0, 10);
  const rows = await db
    .select({
      id: tcShareSchedule.id,
      shareDate: tcShareSchedule.shareDate,
      slot: tcShareSchedule.slot,
      presenterId: tcShareSchedule.presenterId,
      presenterName: employees.name,
      topic: tcShareSchedule.topic,
      status: tcShareSchedule.status,
    })
    .from(tcShareSchedule)
    .leftJoin(employees, eq(employees.id, tcShareSchedule.presenterId))
    .where(and(gte(tcShareSchedule.shareDate, today), eq(tcShareSchedule.status, "scheduled")))
    .orderBy(asc(tcShareSchedule.shareDate), asc(tcShareSchedule.slot))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    shareDate: r.shareDate,
    slot: r.slot as ShareSlot,
    presenterId: r.presenterId,
    presenterName: r.presenterName,
    topic: r.topic,
    functionName: null,
    los: null,
    keyTakeaway: null,
    status: r.status as ShareScheduleRow["status"],
    replacedById: null,
    attendeeCount: 0,
  }));
}
