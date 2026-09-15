import "server-only";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, interviewPositions, recruitmentJdSends, recruitmentJds } from "@/db/schema";
import { normalizeJdContent, type JdContent } from "@/lib/hr/recruitment-jd";

export interface RecruitmentJdRow {
  positionId: string;
  label: string;
  isActive: boolean;
  jdId: string | null;
  master: JdContent | null;
  /** Null = same as the master. */
  recruiter: JdContent | null;
  masterUpdatedAt: string | null;
  masterUpdatedBy: string | null;
  recruiterUpdatedAt: string | null;
  recruiterUpdatedBy: string | null;
}

export interface RecruitmentJdSendRow {
  id: string;
  jdId: string | null;
  positionLabel: string;
  channel: "whatsapp" | "email";
  recipientName: string | null;
  recipientPhone: string | null;
  recipientEmail: string | null;
  status: "opened" | "sent" | "failed";
  error: string | null;
  sentBy: string | null;
  sentAt: string;
}

function isMissingTable(err: unknown): boolean {
  const code = (v: unknown) => (typeof v === "object" && v !== null ? (v as { code?: unknown }).code : undefined);
  const cause = typeof err === "object" && err !== null ? (err as { cause?: unknown }).cause : undefined;
  return code(err) === "42P01" || code(cause) === "42P01";
}

/**
 * Every candidate position with its JD, plus the latest sends.
 *
 * `missing` = migration 0232 not applied yet: the positions still load, so the
 * page can show them and say what to do, rather than erroring.
 */
export async function loadRecruitmentJdData(): Promise<{
  rows: RecruitmentJdRow[];
  sends: RecruitmentJdSendRow[];
  missing: boolean;
}> {
  const positions = await db
    .select({ id: interviewPositions.id, label: interviewPositions.label, isActive: interviewPositions.isActive })
    .from(interviewPositions)
    .orderBy(asc(interviewPositions.sortOrder), asc(interviewPositions.label));

  let jds: Array<typeof recruitmentJds.$inferSelect> = [];
  let sendRows: Array<typeof recruitmentJdSends.$inferSelect> = [];
  let missing = false;
  try {
    [jds, sendRows] = await Promise.all([
      db.select().from(recruitmentJds),
      db.select().from(recruitmentJdSends).orderBy(desc(recruitmentJdSends.sentAt)).limit(300),
    ]);
  } catch (err) {
    if (!isMissingTable(err)) throw err;
    missing = true;
  }

  const personIds = [
    ...new Set(
      [...jds.flatMap((j) => [j.masterUpdatedById, j.recruiterUpdatedById]), ...sendRows.map((s) => s.sentById)].filter(
        (id): id is string => Boolean(id),
      ),
    ),
  ];
  const names = new Map(
    personIds.length
      ? (await db.select({ id: employees.id, name: employees.name }).from(employees).where(inArray(employees.id, personIds))).map(
          (e) => [e.id, e.name] as const,
        )
      : [],
  );
  const nameOf = (id: string | null) => (id ? names.get(id) ?? null : null);
  const jdByPosition = new Map(jds.map((j) => [j.positionId, j]));

  const rows: RecruitmentJdRow[] = positions
    .map((p) => {
      const j = jdByPosition.get(p.id);
      return {
        positionId: p.id,
        label: p.label,
        isActive: p.isActive,
        jdId: j?.id ?? null,
        master: j?.masterContent ? normalizeJdContent(j.masterContent, p.label) : null,
        recruiter: j?.recruiterContent ? normalizeJdContent(j.recruiterContent, p.label) : null,
        masterUpdatedAt: j?.masterUpdatedAt?.toISOString() ?? null,
        masterUpdatedBy: nameOf(j?.masterUpdatedById ?? null),
        recruiterUpdatedAt: j?.recruiterUpdatedAt?.toISOString() ?? null,
        recruiterUpdatedBy: nameOf(j?.recruiterUpdatedById ?? null),
      };
    })
    // A retired position stays listed only while it still holds a JD.
    .filter((r) => r.isActive || r.jdId);

  const sends: RecruitmentJdSendRow[] = sendRows.map((s) => ({
    id: s.id,
    jdId: s.jdId,
    positionLabel: s.positionLabel,
    channel: s.channel,
    recipientName: s.recipientName,
    recipientPhone: s.recipientPhone,
    recipientEmail: s.recipientEmail,
    status: s.status,
    error: s.error,
    sentBy: nameOf(s.sentById),
    sentAt: s.sentAt.toISOString(),
  }));

  return { rows, sends, missing };
}

/** One position's JD row, for the server actions. */
export async function loadJdForPosition(positionId: string) {
  const [position] = await db
    .select({ id: interviewPositions.id, label: interviewPositions.label })
    .from(interviewPositions)
    .where(eq(interviewPositions.id, positionId))
    .limit(1);
  if (!position) return null;
  const [jd] = await db.select().from(recruitmentJds).where(eq(recruitmentJds.positionId, positionId)).limit(1);
  return {
    position,
    jd: jd ?? null,
    master: jd?.masterContent ? normalizeJdContent(jd.masterContent, position.label) : null,
    recruiter: jd?.recruiterContent ? normalizeJdContent(jd.recruiterContent, position.label) : null,
  };
}
