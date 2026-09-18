import "server-only";
import { asc, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/lib/db";
import { employees, recruitmentJdSends, recruitmentJds } from "@/db/schema";
import { normalizeJdContent, type JdContent } from "@/lib/operations/recruitment-jd";
import { RECRUITMENT_JD_SEED } from "@/lib/operations/recruitment-jd-seed";

export interface RecruitmentJdRow {
  /** The role's stable key — what the UI and the actions address it by. */
  slug: string;
  title: string;
  isActive: boolean;
  jdId: string | null;
  master: JdContent | null;
  /** Null = same as the master. */
  recruiter: JdContent | null;
  masterUpdatedAt: string | null;
  masterUpdatedBy: string | null;
  recruiterUpdatedAt: string | null;
  recruiterUpdatedBy: string | null;
  /** True when lib/operations/recruitment-jd-seed.ts still ships an original for this role. */
  hasSeed: boolean;
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

export function isMissingRecruitmentJdTable(err: unknown): boolean {
  const code = (v: unknown) =>
    typeof v === "object" && v !== null ? (v as { code?: unknown }).code : undefined;
  const cause = typeof err === "object" && err !== null ? (err as { cause?: unknown }).cause : undefined;
  // 42P01 undefined_table, 42703 undefined_column — the latter when 0236 is
  // outstanding on a database that did run 0232.
  return [code(err), code(cause)].some((c) => c === "42P01" || c === "42703");
}

/**
 * Put any role from the seed that has no row yet into the table.
 *
 * ── WHY ON READ, AND WHY ONLY THE MISSING ONES ─────────────────────────────
 * Migrations in this repository are applied by hand, so a data-only seed shipped
 * as SQL tends to sit unapplied for weeks — and an empty Recruitment JD screen
 * is indistinguishable from a broken one. Inserting on read means the section
 * is populated the first time anybody opens it.
 *
 * It only ever INSERTS. A master somebody has edited is never overwritten and a
 * role somebody has deleted never comes back, because a deploy that silently
 * reverted an HR edit would be far worse than a missing row.
 */
async function ensureSeed(existing: Set<string>): Promise<boolean> {
  const missing = RECRUITMENT_JD_SEED.filter((s) => !existing.has(s.slug));
  if (missing.length === 0) return false;
  await db
    .insert(recruitmentJds)
    .values(
      missing.map((s) => ({
        slug: s.slug,
        title: s.title,
        sortOrder: s.sortOrder,
        masterContent: s.content,
        masterUpdatedAt: new Date(),
      })),
    )
    // Two people opening the page at once must not collide on the unique slug.
    .onConflictDoNothing({ target: recruitmentJds.slug });
  return true;
}

/**
 * Every recruitment JD with its master and recruiter copy, plus recent sends.
 *
 * `missing` = the tables are not there yet (migration 0236): the page says so
 * and shows the seed read-only, rather than erroring.
 */
export async function loadRecruitmentJdData(): Promise<{
  rows: RecruitmentJdRow[];
  sends: RecruitmentJdSendRow[];
  missing: boolean;
}> {
  let jds: Array<typeof recruitmentJds.$inferSelect> = [];
  let sendRows: Array<typeof recruitmentJdSends.$inferSelect> = [];

  try {
    jds = await db.select().from(recruitmentJds);
    if (await ensureSeed(new Set(jds.map((j) => j.slug)))) {
      jds = await db.select().from(recruitmentJds);
    }
    sendRows = await db
      .select()
      .from(recruitmentJdSends)
      .orderBy(desc(recruitmentJdSends.sentAt))
      .limit(300);
  } catch (err) {
    if (!isMissingRecruitmentJdTable(err)) throw err;
    /* Nothing is deployed yet. Show the originals read-only so the section can
       be read and judged — the page prints which migration is outstanding. */
    return {
      rows: RECRUITMENT_JD_SEED.map((s) => ({
        slug: s.slug,
        title: s.title,
        isActive: true,
        jdId: null,
        master: s.content,
        recruiter: null,
        masterUpdatedAt: null,
        masterUpdatedBy: null,
        recruiterUpdatedAt: null,
        recruiterUpdatedBy: null,
        hasSeed: true,
      })),
      sends: [],
      missing: true,
    };
  }

  const personIds = [
    ...new Set(
      [
        ...jds.flatMap((j) => [j.masterUpdatedById, j.recruiterUpdatedById]),
        ...sendRows.map((s) => s.sentById),
      ].filter((id): id is string => Boolean(id)),
    ),
  ];
  const names = new Map(
    personIds.length
      ? (
          await db
            .select({ id: employees.id, name: employees.name })
            .from(employees)
            .where(inArray(employees.id, personIds))
        ).map((e) => [e.id, e.name] as const)
      : [],
  );
  const nameOf = (id: string | null) => (id ? (names.get(id) ?? null) : null);
  const seeded = new Set(RECRUITMENT_JD_SEED.map((s) => s.slug));

  const rows: RecruitmentJdRow[] = jds
    .filter((j) => j.isActive)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title))
    .map((j) => ({
      slug: j.slug,
      title: j.title,
      isActive: j.isActive,
      jdId: j.id,
      master: j.masterContent ? normalizeJdContent(j.masterContent, j.title) : null,
      recruiter: j.recruiterContent ? normalizeJdContent(j.recruiterContent, j.title) : null,
      masterUpdatedAt: j.masterUpdatedAt?.toISOString() ?? null,
      masterUpdatedBy: nameOf(j.masterUpdatedById),
      recruiterUpdatedAt: j.recruiterUpdatedAt?.toISOString() ?? null,
      recruiterUpdatedBy: nameOf(j.recruiterUpdatedById),
      hasSeed: seeded.has(j.slug),
    }));

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

  return { rows, sends, missing: false };
}

/** One role's JD row, for the server actions. */
export async function loadJdBySlug(slug: string) {
  const [jd] = await db.select().from(recruitmentJds).where(eq(recruitmentJds.slug, slug)).limit(1);
  if (!jd) return null;
  return {
    jd,
    title: jd.title,
    master: jd.masterContent ? normalizeJdContent(jd.masterContent, jd.title) : null,
    recruiter: jd.recruiterContent ? normalizeJdContent(jd.recruiterContent, jd.title) : null,
  };
}

/** Roles in the order the workbench lists them — used by the "add a role" action. */
export async function nextRecruitmentJdSortOrder(): Promise<number> {
  const [last] = await db
    .select({ sortOrder: recruitmentJds.sortOrder })
    .from(recruitmentJds)
    .orderBy(desc(recruitmentJds.sortOrder))
    .limit(1);
  return (last?.sortOrder ?? 0) + 10;
}

/** Ascending order is the workbench's order; exported so tests can assert it. */
export const RECRUITMENT_JD_ORDER = [asc(recruitmentJds.sortOrder), asc(recruitmentJds.title)];
