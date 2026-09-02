import "server-only";
import { and, desc, eq, gte, isNull, sql } from "drizzle-orm";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/db";
import {
  authSessions,
  auditDataExports,
  employees,
  tasks,
  taskEvents,
} from "@/db/schema";
import { PROFILE_CACHE_TAGS } from "@/lib/cache-tags";

/**
 * Hero quick-stats for /profile. Three numbers: open tasks (where I'm
 * doer + not done/cancelled/etc), tasks completed this calendar week
 * (Mon-Sun in user's tz — for v1 we approximate using server-side
 * UTC week boundary; revisit when timezone is fully wired through),
 * and current streak (consecutive days with at least one completion).
 *
 * Cached 60s per user via PROFILE_CACHE_TAGS.quickStats(employeeId).
 */
export async function getQuickStats(employeeId: string) {
  return unstable_cache(
    async () => {
      const now = new Date();
      const weekStart = new Date(now);
      weekStart.setUTCHours(0, 0, 0, 0);
      // Monday of the current ISO week (server UTC — close enough for v1).
      const day = weekStart.getUTCDay() === 0 ? 6 : weekStart.getUTCDay() - 1;
      weekStart.setUTCDate(weekStart.getUTCDate() - day);

      const TERMINAL = sql`('done','approved','cancelled','transferred','not_approved')`;

      const [openRow] = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(tasks)
        .where(
          and(
            eq(tasks.doerId, employeeId),
            eq(tasks.archived, false),
            sql`${tasks.status}::text NOT IN ${TERMINAL}`,
          ),
        );

      const [weekDoneRow] = await db
        .select({ c: sql<number>`count(*)::int` })
        .from(tasks)
        .where(
          and(
            eq(tasks.doerId, employeeId),
            eq(tasks.status, "done"),
            gte(tasks.completedAt, weekStart),
          ),
        );

      // Streak: count consecutive days back from today where the user
      // completed at least one task (in UTC for v1). One query that
      // returns the distinct completion-date set for the last 60 days,
      // then walk it in code.
      const recent = await db
        .select({
          day: sql<string>`(${tasks.completedAt} AT TIME ZONE 'UTC')::date`,
        })
        .from(tasks)
        .where(
          and(
            eq(tasks.doerId, employeeId),
            eq(tasks.status, "done"),
            gte(tasks.completedAt, sql`now() - interval '60 days'`),
          ))
        .groupBy(sql`(${tasks.completedAt} AT TIME ZONE 'UTC')::date`)
        .orderBy(desc(sql`(${tasks.completedAt} AT TIME ZONE 'UTC')::date`));

      const set = new Set(recent.map((r) => r.day));
      let streak = 0;
      const cursor = new Date();
      cursor.setUTCHours(0, 0, 0, 0);
      while (set.has(cursor.toISOString().slice(0, 10))) {
        streak += 1;
        cursor.setUTCDate(cursor.getUTCDate() - 1);
      }

      return {
        openCount: openRow?.c ?? 0,
        completedThisWeek: weekDoneRow?.c ?? 0,
        streakDays: streak,
      };
    },
    [PROFILE_CACHE_TAGS.quickStats(employeeId)],
    {
      revalidate: 60,
      tags: [PROFILE_CACHE_TAGS.quickStats(employeeId)],
    },
  )();
}

/**
 * Active sessions list for the Identity tab. Excludes revoked rows.
 * Cached per user via PROFILE_CACHE_TAGS.authSessions(employeeId);
 * invalidated by revokeSession / revokeAllSessions / new mints.
 */
export async function getActiveSessions(employeeId: string) {
  return unstable_cache(
    async () => {
      return db
        .select({
          id: authSessions.id,
          createdAt: authSessions.createdAt,
          lastSeenAt: authSessions.lastSeenAt,
          userAgent: authSessions.userAgent,
          country: authSessions.country,
          city: authSessions.city,
          sessionHash: authSessions.sessionHash,
        })
        .from(authSessions)
        .where(
          and(
            eq(authSessions.employeeId, employeeId),
            isNull(authSessions.revokedAt),
          ),
        )
        .orderBy(desc(authSessions.lastSeenAt))
        .limit(20);
    },
    [PROFILE_CACHE_TAGS.authSessions(employeeId)],
    { tags: [PROFILE_CACHE_TAGS.authSessions(employeeId)] },
  )();
}

/**
 * Recent data export requests (last 5). Not cached aggressively because
 * status transitions pending→processing→done and we want the user to
 * see them live; 5s feels fast enough.
 */
export async function getRecentDataExports(employeeId: string) {
  return unstable_cache(
    async () =>
      db
        .select()
        .from(auditDataExports)
        .where(eq(auditDataExports.employeeId, employeeId))
        .orderBy(desc(auditDataExports.requestedAt))
        .limit(5),
    [PROFILE_CACHE_TAGS.dataExports(employeeId)],
    {
      revalidate: 5,
      tags: [PROFILE_CACHE_TAGS.dataExports(employeeId)],
    },
  )();
}

/**
 * Profile v2 columns the hero + identity tab need. Pulled from the
 * already-cached getCurrentEmployee() in v2-aware components; this
 * helper exists for routes that only need the v2 slice (e.g. theme
 * lookup for the html root class).
 */
export async function getProfileV2Fields(employeeId: string) {
  const row = await db
    .select({
      bio: employees.bio,
      tags: employees.tags,
      availability: employees.availability,
      availabilityAutoRevertAt: employees.availabilityAutoRevertAt,
      timezone: employees.timezone,
      theme: employees.theme,
      density: employees.density,
      accent: employees.accent,
      oooStart: employees.oooStart,
      oooEnd: employees.oooEnd,
      oooDelegateId: employees.oooDelegateId,
    })
    .from(employees)
    .where(eq(employees.id, employeeId))
    .limit(1);
  return row[0] ?? null;
}

// Silence unused-import warnings when the file is built standalone.
void taskEvents;
