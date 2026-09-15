"use server";

import { and, asc, eq, gte, lte } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { dccEntries, dccKpiItems } from "@/db/schema";
import { requireUser } from "@/lib/auth/current";
import { canViewFor, loadDccScope } from "@/lib/dcc/access";
import { scheduledDueOn } from "@/lib/dcc/util";
import { daysInRange, localDate, outcomeOf } from "@/lib/dcc/dashboard";
import { DETAIL_MAX_DAYS, type DccDetailDay, type DccDetailResult } from "@/lib/dcc/dashboard-detail";
import { activeFromOf, loadFirstEntryDates } from "@/lib/queries/dcc-dashboard";
import { rateLimitOrError } from "@/lib/rate-limit";

const ymd = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const DetailInput = z.object({
  ownerId: z.string().uuid(),
  from: ymd,
  to: ymd,
});

/**
 * One person's due KPIs, day by day, for the dashboard drawer.
 *
 * Fetched on open rather than shipped with the page: a year view across a whole
 * team would otherwise send every entry to the browser for a drawer most
 * readers never open. The rules are the dashboard's own (`scheduledDueOn`,
 * `outcomeOf`, the KPI's first possible day), so the drawer cannot disagree with
 * the cell that opened it.
 */
export async function getDccDashboardDetail(input: unknown): Promise<DccDetailResult> {
  const me = await requireUser();
  const limited = rateLimitOrError(me.id, "read");
  if (limited) return { ok: false, error: limited.error };

  const parsed = DetailInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Invalid request." };
  const { ownerId, from, to } = parsed.data;
  if (from > to) return { ok: false, error: "That window runs backwards." };
  if (daysInRange(from, to).length > DETAIL_MAX_DAYS) {
    return { ok: false, error: `Pick a window of ${DETAIL_MAX_DAYS} days or less.` };
  }

  const scope = await loadDccScope(me);
  if (!canViewFor(scope, ownerId)) {
    return { ok: false, error: "You can't view this person's DCC." };
  }

  try {
    const [items, entries, firstEntries] = await Promise.all([
      db
        .select({
          id: dccKpiItems.id,
          code: dccKpiItems.code,
          section: dccKpiItems.section,
          title: dccKpiItems.title,
          weekdays: dccKpiItems.weekdays,
          scheduleKind: dccKpiItems.scheduleKind,
          isParticipantList: dccKpiItems.isParticipantList,
          createdAt: dccKpiItems.createdAt,
        })
        .from(dccKpiItems)
        .where(and(eq(dccKpiItems.ownerEmployeeId, ownerId), eq(dccKpiItems.archived, false)))
        .orderBy(asc(dccKpiItems.sortOrder), asc(dccKpiItems.code)),
      db
        .select({
          itemId: dccEntries.itemId,
          entryDate: dccEntries.entryDate,
          status: dccEntries.status,
          valueNumber: dccEntries.valueNumber,
          note: dccEntries.note,
          subjectId: dccEntries.subjectId,
        })
        .from(dccEntries)
        .innerJoin(dccKpiItems, eq(dccEntries.itemId, dccKpiItems.id))
        .where(
          and(
            eq(dccKpiItems.ownerEmployeeId, ownerId),
            gte(dccEntries.entryDate, from),
            lte(dccEntries.entryDate, to),
          ),
        ),
      loadFirstEntryDates([ownerId]),
    ]);

    const byKey = new Map(
      entries.filter((e) => !e.subjectId).map((e) => [`${e.itemId}|${e.entryDate}`, e]),
    );
    const activeFrom = new Map(items.map((it) => [it.id, activeFromOf(it.createdAt, firstEntries.get(it.id))]));

    // Newest day first — the drawer is opened to see what went wrong recently.
    const days: DccDetailDay[] = [];
    for (const day of daysInRange(from, to).reverse()) {
      const d = localDate(day);
      const rows = items
        .filter((it) => {
          const start = activeFrom.get(it.id);
          return (!start || day >= start) && scheduledDueOn(it, d);
        })
        .map((it) => {
          const e = byKey.get(`${it.id}|${day}`);
          return {
            itemId: it.id,
            code: it.code,
            section: it.section,
            title: it.title,
            outcome: outcomeOf(e),
            value: e?.valueNumber ?? null,
            note: e?.note ?? null,
          };
        });
      if (rows.length > 0) days.push({ date: day, rows });
    }
    return { ok: true, days };
  } catch {
    return { ok: false, error: "Couldn't load the detail. Try again." };
  }
}
