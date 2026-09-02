import { NextResponse } from "next/server";
import { authenticateMobileRequest, MOBILE_CORS } from "@/lib/auth/mobile";
import {
  listOwnerItems,
  listOwnerEntries,
  listOwnerClients,
  listOwnerSubjects,
  listItemSubjectsForItems,
  type DccItemRow,
} from "@/lib/queries/dcc";
import { scheduledDueOn, slotKey, DCC_STATUSES } from "@/lib/dcc/util";
import { localDateString } from "@/lib/format";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: MOBILE_CORS });
}

interface EntryVal { status: string | null; value: string | null; note: string | null }
function itemDto(it: DccItemRow, e: EntryVal | undefined) {
  return {
    id: it.id,
    code: it.code,
    title: it.title,
    frequency: it.frequency,
    status: e?.status ?? null,
    value: e?.value ?? null,
    note: e?.note ?? null,
  };
}

/** `YYYY-MM-DD` → a local Date (noon, so weekday math never crosses a boundary). */
function dateObj(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1, 12, 0, 0);
}

/**
 * GET /api/mobile/dcc[?date=YYYY-MM-DD] — the signed-in user's own DCC board for
 * a day: the honest daily due-set (scheduled, non-participant), grouped by
 * section + client instance; participant-list KPIs with their rosters; and the
 * weekly / monthly / when-it-happens trays. Mirrors the web board's derivation
 * (scheduledDueOn, slotKey) so the two never diverge.
 */
export async function GET(req: Request) {
  const auth = await authenticateMobileRequest(req);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status, headers: MOBILE_CORS });
  const me = auth.employee;
  const tz = me.timezone || "Asia/Kolkata";
  const today = localDateString(tz);

  const url = new URL(req.url);
  const qDate = url.searchParams.get("date");
  const date = qDate && /^\d{4}-\d{2}-\d{2}$/.test(qDate) ? qDate : today;
  const d = dateObj(date);

  const [items, entries, clients, subjects] = await Promise.all([
    listOwnerItems(me.id),
    listOwnerEntries(me.id, date),
    listOwnerClients(me.id),
    listOwnerSubjects(me.id),
  ]);
  const participantItems = items.filter((i) => i.isParticipantList);
  const itemSubjects = await listItemSubjectsForItems(participantItems.map((i) => i.id));

  // Entry map keyed by slot — only this date's rows.
  const map = new Map<string, EntryVal>();
  for (const e of entries) {
    if (e.entryDate !== date) continue;
    map.set(slotKey(e.itemId, e.subjectId, date), { status: e.status, value: e.valueNumber, note: e.note });
  }
  const clientById = new Map(clients.map((c) => [c.id, c]));
  const subjectById = new Map(subjects.map((s) => [s.id, s]));

  // Daily due-set → grouped by (section, client instance), order-preserving.
  const groupOrder: string[] = [];
  const groups = new Map<string, { key: string; section: string; clientName: string | null; items: ReturnType<typeof itemDto>[] }>();
  let due = 0, filled = 0;
  for (const it of items) {
    if (!scheduledDueOn(it, d)) continue; // excludes participant/weekly/monthly/adhoc
    const key = `${it.section ?? ""}∷${it.clientId ?? ""}`;
    if (!groups.has(key)) {
      groups.set(key, { key, section: it.section ?? "KPIs", clientName: it.clientId ? clientById.get(it.clientId)?.name ?? null : null, items: [] });
      groupOrder.push(key);
    }
    const e = map.get(slotKey(it.id, null, date));
    groups.get(key)!.items.push(itemDto(it, e));
    due++;
    if (e?.status) filled++;
  }

  // Participant KPIs with rosters.
  const subsForItem = new Map<string, string[]>();
  for (const l of itemSubjects) {
    if (!subsForItem.has(l.itemId)) subsForItem.set(l.itemId, []);
    subsForItem.get(l.itemId)!.push(l.subjectId);
  }
  const participants = participantItems.map((it) => {
    const subs = (subsForItem.get(it.id) ?? [])
      .map((sid) => {
        const s = subjectById.get(sid);
        if (!s) return null;
        const st = map.get(slotKey(it.id, sid, date))?.status ?? null;
        return { id: sid, name: s.name, kind: s.kind, status: st };
      })
      .filter(Boolean) as Array<{ id: string; name: string; kind: string | null; status: string | null }>;
    return {
      id: it.id,
      code: it.code,
      title: it.title,
      frequency: it.frequency,
      total: subs.length,
      doneCount: subs.filter((s) => (s.status ?? "").toLowerCase() === "done").length,
      subjects: subs,
    };
  });

  const trayItems = (kinds: string[]) =>
    items.filter((i) => !i.isParticipantList && kinds.includes(i.scheduleKind ?? "scheduled")).map((it) => itemDto(it, map.get(slotKey(it.id, null, date))));

  return NextResponse.json(
    {
      date,
      today,
      ownerName: me.name,
      statuses: [...DCC_STATUSES],
      stats: { due, filled, pct: due ? Math.round((filled / due) * 100) : 0 },
      sections: groupOrder.map((k) => groups.get(k)!),
      participants,
      trays: {
        weekly: trayItems(["weekly"]),
        monthly: trayItems(["monthly"]),
        adhoc: trayItems(["adhoc", "event"]),
      },
    },
    { headers: MOBILE_CORS },
  );
}
