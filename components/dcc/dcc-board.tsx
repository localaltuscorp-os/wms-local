"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import Link from "next/link";
import {
  ChevronLeft, ChevronRight, ChevronDown, Flame, CheckCircle2, Loader2, StickyNote, Plus, Pencil,
  Trash2, X, Check, Trophy, Sparkles, ListChecks, PenLine, ShieldCheck, CalendarDays, Users, CalendarClock,
} from "lucide-react";
import { fireToast } from "@/lib/toast";
import { Avatar } from "@/components/ui/avatar";
import type { DccItemRow, DccEntryRow, DccPerson, DccClientRow, DccSubjectRow, DccItemSubjectRow } from "@/lib/queries/dcc";
import { DCC_STATUSES, dccStatusTone, scheduledDueOn, slotKey, isoDate, maskLabel, isDueOn } from "@/lib/dcc/util";
import { setDccEntry, setParticipantEntries, createDccItem, updateDccItem, deleteDccItem, setDccReview, summarizeDccDay, addParticipant, removeParticipant, renameParticipant } from "@/app/(app)/dcc/actions";

type ReviewRow = { ownerEmployeeId: string; reviewDate: string; status: string | null; note: string | null };

interface Props {
  ownerId: string;
  ownerName: string;
  meId: string;
  canFill: boolean;
  canReview: boolean;
  canManage: boolean;
  people: DccPerson[];
  items: DccItemRow[];
  entries: DccEntryRow[];
  reviews: ReviewRow[];
  clients?: DccClientRow[];
  subjects?: DccSubjectRow[];
  itemSubjects?: DccItemSubjectRow[];
  today: string;
}

const GREEN = "#16a34a";
const GREEN_DEEP = "#15803d";
const AMBER = "var(--color-amber, #f59e0b)";
const RED = "var(--color-altus-red)";

const cellKey = (itemId: string, date: string) => `${itemId}|${date}`;
const INPUT =
  "w-full rounded-lg border border-hairline-strong bg-white px-3.5 py-2.5 text-[15.5px] font-medium text-ink-strong outline-none transition-colors placeholder:text-ink-subtle placeholder:font-normal focus:border-[#16a34a]";
const CARD_SHADOW = "inset 0 0 0 1px var(--color-hairline), inset 0 1px 0 rgba(255,255,255,0.7), 0 10px 28px -20px rgba(15,23,42,0.35)";
const PANEL_SHADOW = "inset 0 0 0 1px var(--color-hairline), 0 6px 24px -18px rgba(15,23,42,0.25)";

/** Green ≥80 · amber ≥60 · red below — matches the punctuality card. */
function rateColor(pct: number): string {
  if (pct >= 80) return GREEN;
  if (pct >= 60) return AMBER;
  return RED;
}

function dateToObj(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1);
}
function fmtLong(iso: string): string {
  return dateToObj(iso).toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

export function DccBoard({ ownerId, ownerName, meId, canFill, canReview, canManage, people, items, entries, reviews, clients = [], subjects = [], itemSubjects = [], today }: Props) {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = React.useState(today);
  const [showAll, setShowAll] = React.useState(false);
  const [, startTransition] = React.useTransition();

  // Live optimistic entry map. Simple KPIs are keyed cellKey(item,date); a
  // participant fill is keyed slotKey(item,subject,date) — the two never collide.
  const [map, setMap] = React.useState<Record<string, { status: string | null; value: string | null; note: string | null }>>(() => {
    const m: Record<string, { status: string | null; value: string | null; note: string | null }> = {};
    for (const e of entries) {
      const k = e.subjectId ? slotKey(e.itemId, e.subjectId, e.entryDate) : cellKey(e.itemId, e.entryDate);
      m[k] = { status: e.status, value: e.valueNumber, note: e.note };
    }
    return m;
  });
  const [busy, setBusy] = React.useState<string | null>(null);
  const [aiSummary, setAiSummary] = React.useState<string | null>(null);
  const [aiBusy, setAiBusy] = React.useState(false);

  const selObj = dateToObj(selectedDate);

  function summarize() {
    setAiBusy(true);
    setAiSummary(null);
    startTransition(async () => {
      const res = await summarizeDccDay({ ownerId, date: selectedDate });
      setAiBusy(false);
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      setAiSummary(res.summary);
    });
  }

  // Items due on the selected date (plus any with an existing entry that day).
  const dueItems = React.useMemo(
    () =>
      items.filter((it) => {
        if (scheduledDueOn(it, selObj)) return true;
        return Boolean(map[cellKey(it.id, selectedDate)]);
      }),
    [items, selObj, map, selectedDate],
  );
  const shownItems = showAll ? items : dueItems;

  const clientById = React.useMemo(() => new Map(clients.map((c) => [c.id, c])), [clients]);

  // Daily section render: scheduled, non-participant items, grouped by
  // (section, client-instance). A client-instanced section (B = Lawrence & Mayo,
  // B-2 = Soul Storii) becomes one group per client with the client name shown.
  const groups = React.useMemo(() => {
    const daily = shownItems.filter((it) => (it.scheduleKind ?? "scheduled") === "scheduled" && !it.isParticipantList);
    const order: string[] = [];
    const by = new Map<string, { section: string; clientName: string | null; rows: DccItemRow[] }>();
    for (const it of daily) {
      const sec = it.section || "—";
      const key = `${sec}∷${it.clientId ?? ""}`;
      if (!by.has(key)) { by.set(key, { section: sec, clientName: it.clientId ? clientById.get(it.clientId)?.name ?? null : null, rows: [] }); order.push(key); }
      by.get(key)!.rows.push(it);
    }
    return order.map((k) => ({ key: k, ...by.get(k)! }));
  }, [shownItems, clientById]);

  // Participant-list KPIs + the period/adhoc trays (never in the daily count).
  const participantItems = React.useMemo(() => items.filter((it) => it.isParticipantList), [items]);
  const weeklyItems = React.useMemo(() => items.filter((it) => it.scheduleKind === "weekly" && !it.isParticipantList), [items]);
  const monthlyItems = React.useMemo(() => items.filter((it) => it.scheduleKind === "monthly" && !it.isParticipantList), [items]);
  const otherItems = React.useMemo(() => items.filter((it) => (it.scheduleKind === "adhoc" || it.scheduleKind === "event") && !it.isParticipantList), [items]);
  const subjectById = React.useMemo(() => new Map(subjects.map((s) => [s.id, s])), [subjects]);
  const subjectsForItem = React.useMemo(() => {
    const m = new Map<string, DccSubjectRow[]>();
    for (const link of itemSubjects) {
      const s = subjectById.get(link.subjectId);
      if (!s) continue;
      if (!m.has(link.itemId)) m.set(link.itemId, []);
      m.get(link.itemId)!.push(s);
    }
    return m;
  }, [itemSubjects, subjectById]);

  // Completion for selected day = Done / due.
  const dayStats = React.useMemo(() => {
    let done = 0, filled = 0;
    for (const it of dueItems) {
      const e = map[cellKey(it.id, selectedDate)];
      if (e && (e.status || e.value || e.note)) filled++;
      if (e && (e.status ?? "").toLowerCase() === "done") done++;
    }
    return { due: dueItems.length, done, filled };
  }, [dueItems, map, selectedDate]);
  const pct = dayStats.due ? Math.round((dayStats.done / dayStats.due) * 100) : 0;

  // Streak: consecutive days ending today where every due item is filled.
  const streak = React.useMemo(() => {
    let s = 0;
    const d = dateToObj(today);
    for (let i = 0; i < 60; i++) {
      const iso = isoDate(d);
      const due = items.filter((it) => scheduledDueOn(it, d));
      if (due.length > 0) {
        const allFilled = due.every((it) => {
          const e = map[cellKey(it.id, iso)];
          return e && (e.status || e.value || e.note);
        });
        if (!allFilled) break;
        s++;
      }
      d.setDate(d.getDate() - 1);
    }
    return s;
  }, [items, map, today]);

  // Last-21-day strip with per-day completion.
  const strip = React.useMemo(() => {
    const out: { iso: string; pct: number; due: number }[] = [];
    const d = dateToObj(today);
    d.setDate(d.getDate() - 20);
    for (let i = 0; i < 21; i++) {
      const iso = isoDate(d);
      const due = items.filter((it) => scheduledDueOn(it, d));
      let done = 0;
      for (const it of due) if ((map[cellKey(it.id, iso)]?.status ?? "").toLowerCase() === "done") done++;
      out.push({ iso, due: due.length, pct: due.length ? Math.round((done / due.length) * 100) : -1 });
      d.setDate(d.getDate() + 1);
    }
    return out;
  }, [items, map, today]);

  const review = reviews.find((r) => r.reviewDate === selectedDate);

  function shiftDay(delta: number) {
    const d = dateToObj(selectedDate);
    d.setDate(d.getDate() + delta);
    const iso = isoDate(d);
    if (iso > today) return;
    setSelectedDate(iso);
  }

  function commit(itemId: string, patch: { status?: string | null; value?: string | null; note?: string | null }) {
    if (!canFill) return;
    const k = cellKey(itemId, selectedDate);
    const prev = map[k];
    const next = { status: patch.status !== undefined ? patch.status : prev?.status ?? null, value: patch.value !== undefined ? patch.value : prev?.value ?? null, note: patch.note !== undefined ? patch.note : prev?.note ?? null };
    setMap((m) => ({ ...m, [k]: next }));
    setBusy(k);
    startTransition(async () => {
      const res = await setDccEntry({ itemId, date: selectedDate, status: next.status, value: next.value, note: next.note });
      setBusy((b) => (b === k ? null : b));
      if (!res.ok) {
        setMap((m) => ({ ...m, [k]: prev ?? { status: null, value: null, note: null } }));
        fireToast({ message: res.error, type: "error" });
      }
    });
  }

  // Fill one participant's slot for a participant-list KPI.
  function commitSubject(itemId: string, subjectId: string, status: string | null) {
    if (!canFill) return;
    const k = slotKey(itemId, subjectId, selectedDate);
    const prev = map[k];
    setMap((m) => ({ ...m, [k]: { status, value: null, note: null } }));
    setBusy(k);
    startTransition(async () => {
      const res = await setDccEntry({ itemId, date: selectedDate, status, subjectId });
      setBusy((b) => (b === k ? null : b));
      if (!res.ok) {
        setMap((m) => ({ ...m, [k]: prev ?? { status: null, value: null, note: null } }));
        fireToast({ message: res.error, type: "error" });
      }
    });
  }
  // [All Done] / [All NA] across every participant of a KPI.
  function bulkParticipants(itemId: string, status: string | null) {
    if (!canFill) return;
    const subs = subjectsForItem.get(itemId) ?? [];
    setMap((m) => {
      const nm = { ...m };
      for (const s of subs) nm[slotKey(itemId, s.id, selectedDate)] = { status, value: null, note: null };
      return nm;
    });
    startTransition(async () => {
      const res = await setParticipantEntries({ itemId, date: selectedDate, status });
      if (!res.ok) fireToast({ message: res.error, type: "error" });
    });
  }

  const filledPct = dayStats.due ? Math.round((dayStats.filled / dayStats.due) * 100) : 0;

  return (
    <section className="flex flex-col gap-5">
      {/* ── KPI stat cards ── */}
      <div className="grid grid-cols-4 gap-3.5 max-lg:grid-cols-2">
        <div className="wg-rise wg-btn flex items-center gap-4 rounded-2xl bg-surface-card px-4.5 py-4 max-md:px-4" style={{ boxShadow: CARD_SHADOW }}>
          <ProgressRing pct={pct} size={62} stroke={6} color={rateColor(pct)} />
          <div className="min-w-0">
            <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-subtle">{selectedDate === today ? "Today's compliance" : "Day compliance"}</p>
            <p className="mt-1 tabular-nums text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 26, letterSpacing: "-0.02em", lineHeight: 1 }}>
              {pct}%
            </p>
            <p className="mt-1 text-[12px] font-medium text-ink-subtle">{dayStats.done}/{dayStats.due} done</p>
          </div>
        </div>
        <StatCard
          icon={<PenLine size={17} strokeWidth={2.4} />}
          accent={GREEN}
          label="Filled"
          value={`${dayStats.filled}/${dayStats.due}`}
          caption={dayStats.due ? `${filledPct}% of due entries` : "nothing due"}
          progress={dayStats.due ? dayStats.filled / dayStats.due : null}
          delay={60}
        />
        <StatCard
          icon={<Flame size={17} strokeWidth={2.4} />}
          accent={streak > 0 ? RED : "#334155"}
          label="Streak"
          value={`${streak}`}
          caption={streak === 1 ? "day fully filled" : "days fully filled"}
          delay={120}
        />
        <StatCard
          icon={<ListChecks size={17} strokeWidth={2.4} />}
          accent={GREEN_DEEP}
          label="KPIs"
          value={`${dueItems.length}`}
          caption={`due ${selectedDate === today ? "today" : "this day"} · ${items.length} total`}
          delay={180}
        />
      </div>

      {/* ── Toolbar: person switcher · date nav · actions ── */}
      <div className="wg-rise flex flex-wrap items-center gap-3 rounded-[22px] bg-surface-card px-4 py-3 max-md:px-3" style={{ boxShadow: PANEL_SHADOW, animationDelay: "80ms" }}>
        {people.length > 0 && (
          <label className="flex items-center gap-2.5 rounded-xl px-2.5 py-1.5 transition-colors hover:bg-surface-soft">
            <Avatar name={ownerName} size={34} />
            <select
              value={ownerId}
              onChange={(e) => router.push(`/dcc?emp=${e.target.value}` as Route)}
              className="bg-transparent text-[16px] font-bold text-ink-strong outline-none"
              aria-label="Choose whose board to view"
            >
              {people.map((p) => (
                <option key={p.id} value={p.id}>{p.id === meId ? `${p.name} (me)` : p.name}</option>
              ))}
            </select>
          </label>
        )}

        <div className="flex items-center gap-1 rounded-xl px-1 py-0.5" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
          <button onClick={() => shiftDay(-1)} className="grid h-10 w-10 place-items-center rounded-lg text-ink-soft transition-colors hover:bg-surface-soft" aria-label="Previous day"><ChevronLeft size={20} /></button>
          <div className="min-w-[150px] px-2 text-center">
            <div className="text-[16px] font-extrabold leading-tight text-ink-strong">{selectedDate === today ? "Today" : fmtLong(selectedDate)}</div>
            {selectedDate === today && <div className="text-[11.5px] font-semibold uppercase tracking-wide text-ink-subtle">{fmtLong(selectedDate)}</div>}
          </div>
          <button onClick={() => shiftDay(1)} disabled={selectedDate >= today} className="grid h-10 w-10 place-items-center rounded-lg text-ink-soft transition-colors hover:bg-surface-soft disabled:opacity-30" aria-label="Next day"><ChevronRight size={20} /></button>
        </div>
        {selectedDate !== today && (
          <button onClick={() => setSelectedDate(today)} className="rounded-lg px-2.5 py-2 text-[14px] font-bold transition-colors hover:underline" style={{ color: GREEN_DEEP }}>Back to Today</button>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Link href={"/dcc/ranking" as Route} className="wg-btn inline-flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2.5 text-[14px] font-bold text-ink-soft transition-colors hover:text-[#15803d]" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)" }}>
            <Trophy size={16} style={{ color: AMBER }} /> Ranking
          </Link>
          <button onClick={summarize} disabled={aiBusy} className="wg-btn inline-flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2.5 text-[14px] font-bold text-ink-soft transition-colors hover:text-[#15803d] disabled:opacity-50" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)" }}>
            {aiBusy ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} style={{ color: RED }} />} Summarize My Day
          </button>
          <button onClick={() => setShowAll((v) => !v)} className="wg-btn rounded-xl bg-white px-3.5 py-2.5 text-[14px] font-bold text-ink-soft transition-colors hover:text-[#15803d]" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)" }}>
            {showAll ? "Due Today Only" : `Show all (${items.length})`}
          </button>
          {canManage && <ItemEditor ownerId={ownerId} mode="add" allItems={items} clients={clients} />}
        </div>
      </div>

      {/* ── 21-day trend ── */}
      <div className="wg-rise rounded-[22px] bg-surface-card px-5 py-4 max-md:px-4" style={{ boxShadow: PANEL_SHADOW, animationDelay: "120ms" }}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <span className="inline-grid size-8 place-items-center rounded-[10px]" style={{ background: "color-mix(in srgb, #16a34a 10%, transparent)", color: GREEN_DEEP }}>
              <CalendarDays size={16} strokeWidth={2.4} />
            </span>
            <span className="text-[13px] font-black tracking-tight text-ink-strong">Last 21 Days</span>
          </div>
          <div className="flex items-center gap-3 text-[11px] font-bold text-ink-subtle max-md:hidden">
            <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: GREEN }} /> ≥80%</span>
            <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: AMBER }} /> ≥60%</span>
            <span className="inline-flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: RED }} /> below</span>
          </div>
        </div>
        <div className="flex items-end gap-1 overflow-x-auto">
          {strip.map((s) => {
            const active = s.iso === selectedDate;
            const color = s.pct < 0 ? "var(--color-hairline-strong)" : rateColor(s.pct);
            const h = s.pct < 0 ? 8 : 8 + Math.round((s.pct / 100) * 26);
            return (
              <button key={s.iso} onClick={() => setSelectedDate(s.iso)} className="group flex flex-1 min-w-[20px] flex-col items-center gap-1" title={`${fmtLong(s.iso)} · ${s.pct < 0 ? "no items" : s.pct + "%"}`} aria-label={`${fmtLong(s.iso)} — ${s.pct < 0 ? "no items due" : `${s.pct}% done`}`}>
                <div className="w-full rounded-md transition-all group-hover:opacity-90" style={{ height: h + 4, background: color, opacity: active ? 1 : 0.55, outline: active ? "2px solid var(--color-ink-strong)" : "none", outlineOffset: 2 }} />
                <span className={`text-[11px] font-bold ${active ? "text-ink-strong" : "text-ink-subtle"}`}>{dateToObj(s.iso).getDate()}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Manager review ── */}
      {(canReview || review) && (
        <ReviewBar ownerId={ownerId} date={selectedDate} canReview={canReview} review={review} />
      )}

      {!canFill && ownerId !== meId && (
        <p className="rounded-xl bg-surface-soft px-4 py-2.5 text-[13px] font-semibold text-ink-muted" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
          Viewing {ownerName}&apos;s KPIs — read-only.
        </p>
      )}

      {aiSummary && (
        <div className="wg-rise flex items-start gap-3 rounded-[22px] px-5 py-4" style={{ boxShadow: PANEL_SHADOW, background: "linear-gradient(135deg, color-mix(in srgb, var(--color-altus-red) 5%, white), white 60%)" }}>
          <Sparkles size={18} style={{ color: RED }} className="mt-0.5 shrink-0" />
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-ink-subtle">AI summary · {selectedDate === today ? "today" : selectedDate}</p>
            <p className="mt-1 text-[15.5px] font-medium leading-relaxed text-ink-strong">{aiSummary}</p>
          </div>
          <button onClick={() => setAiSummary(null)} className="ml-auto shrink-0 text-ink-subtle transition-colors hover:text-ink-strong" aria-label="Dismiss summary"><X size={16} /></button>
        </div>
      )}

      {/* ── Fill surface ── */}
      <div className="flex items-center justify-between gap-3 px-1">
        <span className="text-[14px] font-bold text-ink-muted">
          {shownItems.length} {showAll ? "total" : "due"} {shownItems.length === 1 ? "KPI" : "KPIs"}
          {shownItems.length > 0 && <span className="font-semibold text-ink-subtle"> · {selectedDate === today ? "today" : fmtLong(selectedDate)}</span>}
        </span>
      </div>

      <div className="flex flex-col gap-6">
        {groups.length === 0 && participantItems.length === 0 && weeklyItems.length === 0 && monthlyItems.length === 0 && otherItems.length === 0 && (
          <div className="wg-rise rounded-[22px] bg-surface-card px-6 py-16 text-center" style={{ boxShadow: PANEL_SHADOW }}>
            <span className="mx-auto inline-grid size-14 place-items-center rounded-full" style={{ background: "color-mix(in srgb, #16a34a 10%, transparent)", color: GREEN }}>
              <CheckCircle2 size={30} strokeWidth={2.2} />
            </span>
            <p className="mt-4 text-[19px] font-black tracking-tight text-ink-strong">Nothing due {selectedDate === today ? "today" : "this day"}.</p>
            {canManage && <p className="mt-1 text-[15px] font-medium text-ink-muted">Add a KPI to get started.</p>}
          </div>
        )}
        {groups.map((g, gi) => (
          <div key={g.key} className="wg-rise" style={{ animationDelay: `${Math.min(gi, 6) * 60}ms` }}>
            <h3 className="mb-2.5 flex items-center gap-2.5 px-1 text-[12.5px] font-black uppercase tracking-[0.14em] text-ink-muted">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: `linear-gradient(135deg, ${GREEN}, ${GREEN_DEEP})` }} />
              {g.section}
              {g.clientName && <span className="rounded-md px-2 py-0.5 text-[11.5px] font-bold normal-case tracking-normal" style={{ background: "color-mix(in srgb, #16a34a 12%, transparent)", color: GREEN_DEEP }}>{g.clientName}</span>}
              <span className="font-bold normal-case tracking-normal text-ink-subtle">{g.rows.length}</span>
              {canManage && (
                <span className="ml-auto normal-case tracking-normal">
                  <ItemEditor ownerId={ownerId} mode="add" allItems={items} presetSection={g.section} clients={clients} sectionButton />
                </span>
              )}
            </h3>
            <div className="overflow-hidden rounded-[22px] bg-surface-card" style={{ boxShadow: PANEL_SHADOW }}>
              {g.rows.map((it, i) => (
                <FillRow
                  key={it.id}
                  item={it}
                  entry={map[cellKey(it.id, selectedDate)]}
                  busy={busy === cellKey(it.id, selectedDate)}
                  canFill={canFill}
                  canManage={canManage}
                  first={i === 0}
                  onCommit={commit}
                  clients={clients}
                />
              ))}
            </div>
          </div>
        ))}

        {/* Participant-list KPIs — one expandable card each, own compliance meter. */}
        {participantItems.filter((it) => isDueOn(it.weekdays, selObj)).map((it) => (
          <ParticipantCard
            key={it.id}
            item={it}
            ownerId={ownerId}
            allItems={items}
            clients={clients}
            canManage={canManage}
            subjects={subjectsForItem.get(it.id) ?? []}
            statusFor={(subjectId) => map[slotKey(it.id, subjectId, selectedDate)]?.status ?? null}
            busyFor={(subjectId) => busy === slotKey(it.id, subjectId, selectedDate)}
            canFill={canFill}
            onCommit={commitSubject}
            onBulk={bulkParticipants}
          />
        ))}

        {/* Period + adhoc trays — never in the daily count, never block a punch. */}
        <Tray title="This Week" icon={<CalendarClock size={15} strokeWidth={2.4} />} items={weeklyItems} map={map} selectedDate={selectedDate} busy={busy} canFill={canFill} canManage={canManage} onCommit={commit} />
        <Tray title="This Month" icon={<CalendarDays size={15} strokeWidth={2.4} />} items={monthlyItems} map={map} selectedDate={selectedDate} busy={busy} canFill={canFill} canManage={canManage} onCommit={commit} />
        <Tray title="When It Happens" icon={<Sparkles size={15} strokeWidth={2.4} />} items={otherItems} map={map} selectedDate={selectedDate} busy={busy} canFill={canFill} canManage={canManage} onCommit={commit} />
      </div>
    </section>
  );
}

/* ──────────────────────── Participant-list card ──────────────────────── */

function ParticipantCard({ item, ownerId, allItems, clients, canManage, subjects, statusFor, busyFor, canFill, onCommit, onBulk }: {
  item: DccItemRow;
  ownerId: string;
  allItems: DccItemRow[];
  clients: DccClientRow[];
  canManage: boolean;
  subjects: DccSubjectRow[];
  statusFor: (subjectId: string) => string | null;
  busyFor: (subjectId: string) => boolean;
  canFill: boolean;
  onCommit: (itemId: string, subjectId: string, status: string | null) => void;
  onBulk: (itemId: string, status: string | null) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [newName, setNewName] = React.useState("");
  const [rosterBusy, startRoster] = React.useTransition();
  const rosterRouter = useRouter();
  const doneN = subjects.filter((s) => (statusFor(s.id) ?? "").toLowerCase() === "done").length;
  const addressed = subjects.filter((s) => statusFor(s.id) != null).length;
  const freqLabel = item.frequency || maskLabel(item.weekdays);

  const runRoster = (fn: () => Promise<{ ok: boolean; error?: string }>, done?: () => void) => {
    startRoster(async () => {
      const res = await fn();
      if (!res.ok) { fireToast({ message: res.error ?? "Couldn't save.", type: "error" }); return; }
      done?.(); rosterRouter.refresh();
    });
  };
  const addPerson = () => {
    const name = newName.trim();
    if (!name) return;
    runRoster(() => addParticipant({ itemId: item.id, name }), () => setNewName(""));
  };
  const renamePerson = (subjectId: string, current: string) => {
    const name = typeof window !== "undefined" ? window.prompt("Rename participant", current) : null;
    if (!name || !name.trim() || name.trim() === current) return;
    runRoster(() => renameParticipant({ subjectId, name: name.trim() }));
  };
  const removePerson = (subjectId: string, name: string) => {
    if (typeof window !== "undefined" && !window.confirm(`Remove ${name} from this KPI? Their history is kept.`)) return;
    runRoster(() => removeParticipant({ itemId: item.id, subjectId }));
  };
  return (
    <div className="wg-rise overflow-hidden rounded-[22px] bg-surface-card" style={{ boxShadow: PANEL_SHADOW }}>
      <div className="flex w-full items-center gap-3 px-5 py-4 max-md:px-3.5">
        <button onClick={() => setOpen((v) => !v)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <span className="inline-grid size-9 shrink-0 place-items-center rounded-xl" style={{ background: "color-mix(in srgb, #4338ca 10%, transparent)", color: "#4338ca" }}><Users size={18} strokeWidth={2.3} /></span>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {item.code && <span className="shrink-0 rounded-md px-1.5 py-0.5 text-[12px] font-extrabold tabular-nums text-ink-muted" style={{ background: "var(--color-surface-soft, #eef2f7)" }}>{item.code}</span>}
              <p className="truncate text-[16px] font-bold text-ink-strong">{item.title}</p>
            </div>
            <p className="mt-0.5 text-[12.5px] font-semibold text-ink-subtle">{subjects.length} participant{subjects.length === 1 ? "" : "s"} · {doneN} done · {addressed} addressed{freqLabel ? ` · ${freqLabel}` : ""}</p>
          </div>
        </button>
        {canManage && <ItemEditor ownerId={ownerId} mode="edit" item={item} allItems={allItems} clients={clients} compact />}
        <button onClick={() => setOpen((v) => !v)} className="shrink-0 text-ink-subtle transition-transform" style={{ transform: open ? "rotate(180deg)" : undefined }} aria-label={open ? "Collapse" : "Expand"}><ChevronDown size={18} /></button>
      </div>
      {open && (
        <div className="border-t border-hairline">
          {canFill && (
            <div className="flex items-center gap-2 px-5 py-2.5 max-md:px-3.5">
              <button onClick={() => onBulk(item.id, "Done")} className="rounded-lg px-3 py-1.5 text-[13px] font-bold" style={{ background: "color-mix(in srgb, #16a34a 14%, transparent)", color: GREEN_DEEP }}>All Done</button>
              <button onClick={() => onBulk(item.id, "NA")} className="bg-surface-card rounded-lg px-3 py-1.5 text-[13px] font-bold text-ink-subtle" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)" }}>All NA</button>
              <button onClick={() => onBulk(item.id, null)} className="bg-surface-card rounded-lg px-3 py-1.5 text-[13px] font-bold text-ink-subtle" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)" }}>Clear</button>
            </div>
          )}
          {subjects.length === 0 && <p className="px-5 py-4 text-[14px] text-ink-subtle max-md:px-3.5">No participants linked yet.</p>}
          {subjects.map((s, i) => {
            const st = statusFor(s.id);
            return (
              <div key={s.id} className={`flex items-center gap-3 px-5 py-2.5 max-md:px-3.5 ${i === 0 ? "" : "border-t border-hairline"}`}>
                <span className="min-w-0 flex-1 truncate text-[15px] font-semibold text-ink-strong">{s.name}{s.kind ? <span className="ml-1.5 text-[11.5px] font-bold text-ink-subtle">{s.kind}</span> : null}</span>
                <div className="flex shrink-0 overflow-hidden rounded-lg" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)" }}>
                  {["Done", "NA"].map((opt) => {
                    const on = (st ?? "").toLowerCase() === opt.toLowerCase();
                    const tone = dccStatusTone(opt);
                    return (
                      <button key={opt} disabled={!canFill || busyFor(s.id)} onClick={() => onCommit(item.id, s.id, on ? null : opt)} className="px-3 py-1.5 text-[13px] font-bold disabled:opacity-60" style={on ? { background: tone.bg, color: tone.fg } : { color: "var(--color-ink-subtle)", background: "white" }} aria-pressed={on}>{opt}</button>
                    );
                  })}
                </div>
                {canManage && (
                  <div className="flex shrink-0 items-center gap-1">
                    <button onClick={() => renamePerson(s.id, s.name)} disabled={rosterBusy} className="grid size-7 place-items-center rounded-md text-ink-subtle transition-colors hover:text-[#15803d] disabled:opacity-50" title="Rename" aria-label="Rename participant"><Pencil size={13} /></button>
                    <button onClick={() => removePerson(s.id, s.name)} disabled={rosterBusy} className="grid size-7 place-items-center rounded-md text-ink-subtle transition-colors hover:text-altus-red disabled:opacity-50" title="Remove" aria-label="Remove participant"><Trash2 size={13} /></button>
                  </div>
                )}
              </div>
            );
          })}
          {canManage && (
            <div className="flex items-center gap-2 border-t border-hairline px-5 py-2.5 max-md:px-3.5">
              <input value={newName} onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addPerson(); }} placeholder="Add participant…" className="min-w-0 flex-1 rounded-lg border border-hairline-strong bg-white px-3 py-2 text-[14px] text-ink-strong outline-none focus:border-[#16a34a]" />
              <button onClick={addPerson} disabled={rosterBusy || !newName.trim()} className="inline-flex items-center gap-1 rounded-lg px-3 py-2 text-[13px] font-bold text-white disabled:opacity-50" style={{ background: `linear-gradient(135deg, ${GREEN}, ${GREEN_DEEP})` }}><Plus size={14} /> Add</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────── Tray ───────────────────────────────── */

function Tray({ title, icon, items, map, selectedDate, busy, canFill, canManage, onCommit }: {
  title: string;
  icon: React.ReactNode;
  items: DccItemRow[];
  map: Record<string, { status: string | null; value: string | null; note: string | null }>;
  selectedDate: string;
  busy: string | null;
  canFill: boolean;
  canManage: boolean;
  onCommit: (itemId: string, patch: { status?: string | null; value?: string | null; note?: string | null }) => void;
}) {
  const [open, setOpen] = React.useState(false);
  if (items.length === 0) return null;
  const doneN = items.filter((it) => (map[cellKey(it.id, selectedDate)]?.status ?? "").toLowerCase() === "done").length;
  return (
    <div className="wg-rise overflow-hidden rounded-[22px] bg-surface-card" style={{ boxShadow: PANEL_SHADOW }}>
      <button onClick={() => setOpen((v) => !v)} className="flex w-full items-center gap-2.5 px-5 py-3.5 text-left max-md:px-3.5">
        <span className="inline-grid size-8 shrink-0 place-items-center rounded-lg" style={{ background: "var(--color-surface-soft, #eef2f7)", color: "var(--color-ink-subtle)" }}>{icon}</span>
        <span className="text-[13px] font-black uppercase tracking-[0.12em] text-ink-muted">{title}</span>
        <span className="text-[12.5px] font-semibold text-ink-subtle">{doneN}/{items.length} done</span>
        <span className="ml-auto text-ink-subtle transition-transform" style={{ transform: open ? "rotate(180deg)" : undefined }}><ChevronDown size={18} /></span>
      </button>
      {open && (
        <div className="border-t border-hairline">
          {items.map((it, i) => (
            <FillRow key={it.id} item={it} entry={map[cellKey(it.id, selectedDate)]} busy={busy === cellKey(it.id, selectedDate)} canFill={canFill} canManage={canManage} first={i === 0} onCommit={onCommit} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────── Stat primitives ─────────────────────────── */

function StatCard({ icon, accent, label, value, caption, progress, delay }: {
  icon: React.ReactNode;
  accent: string;
  label: string;
  value: string;
  caption: string;
  progress?: number | null;
  delay: number;
}) {
  return (
    <div className="wg-rise wg-btn rounded-2xl bg-surface-card px-4.5 py-4 max-md:px-4" style={{ boxShadow: CARD_SHADOW, animationDelay: `${delay}ms` }}>
      <div className="flex items-center gap-2">
        <span className="inline-grid size-8 shrink-0 place-items-center rounded-[10px]" style={{ background: `color-mix(in srgb, ${accent} 10%, transparent)`, color: accent }}>
          {icon}
        </span>
        <span className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-subtle">{label}</span>
      </div>
      <div className="mt-2 tabular-nums text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 26, letterSpacing: "-0.02em", lineHeight: 1 }}>
        {value}
      </div>
      <div className="mt-1 text-[12px] font-medium text-ink-subtle">{caption}</div>
      {progress != null && (
        <div className="mt-2.5 h-1 w-full overflow-hidden rounded-full" style={{ background: "var(--color-surface-soft)" }} role="presentation">
          <div className="h-full rounded-full transition-[width] duration-700" style={{ width: `${Math.round(Math.max(0, Math.min(progress, 1)) * 100)}%`, background: `linear-gradient(90deg, color-mix(in srgb, ${accent} 70%, white), ${accent})` }} />
        </div>
      )}
    </div>
  );
}

function ProgressRing({ pct, size, stroke, color }: { pct: number; size: number; stroke: number; color: string }) {
  const R = (42 - stroke) / 2 - 1;
  const C = 2 * Math.PI * R;
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 42 42" className="-rotate-90">
        <circle cx={21} cy={21} r={R} fill="none" stroke="var(--color-surface-soft, #eef2f7)" strokeWidth={stroke} />
        <circle cx={21} cy={21} r={R} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C - (C * Math.min(pct, 100)) / 100} style={{ transition: "stroke-dashoffset .5s cubic-bezier(0.22,1,0.36,1)" }} />
      </svg>
      <span className="absolute tabular-nums text-[13px] font-black text-ink-strong">{pct}</span>
    </div>
  );
}

/* ────────────────────────────── Fill row ─────────────────────────────── */

function FillRow({ item, entry, busy, canFill, canManage, first, onCommit, clients }: {
  item: DccItemRow;
  entry?: { status: string | null; value: string | null; note: string | null };
  busy: boolean;
  canFill: boolean;
  canManage: boolean;
  first: boolean;
  onCommit: (itemId: string, patch: { status?: string | null; value?: string | null; note?: string | null }) => void;
  clients?: DccClientRow[];
}) {
  const [noteOpen, setNoteOpen] = React.useState(Boolean(entry?.note));
  const hasNumber = item.targetNumber != null || item.unit != null;
  const status = entry?.status ?? null;
  const isDone = status?.toLowerCase() === "done";

  return (
    <div
      className={`relative flex flex-col gap-3 px-5 py-4 transition-colors max-md:px-3.5 ${first ? "" : "border-t border-hairline"}`}
      style={{ background: isDone ? "color-mix(in srgb, #16a34a 5%, transparent)" : undefined }}
    >
      {isDone && <span aria-hidden className="absolute left-0 top-2 bottom-2 w-[3px] rounded-full" style={{ background: `linear-gradient(180deg, ${GREEN}, color-mix(in srgb, ${GREEN} 45%, transparent))` }} />}
      <div className="flex items-center gap-4 max-md:flex-col max-md:items-stretch">
        {/* Code + title */}
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {item.code && <span className="mt-0.5 shrink-0 rounded-lg px-2 py-1 text-[13px] font-extrabold tabular-nums text-ink-muted" style={{ background: "var(--color-surface-soft, #eef2f7)", boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>{item.code}</span>}
          <div className="min-w-0">
            <p className="text-[16.5px] font-bold leading-snug text-ink-strong">{item.title}</p>
            <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[13px] font-semibold text-ink-subtle">
              {item.frequency && <span>{item.frequency}</span>}
              {!item.frequency && item.weekdays != null && <span>{maskLabel(item.weekdays)}</span>}
              {item.targetNumber != null && <span style={{ color: GREEN_DEEP }}>target {item.targetNumber}{item.unit ? ` ${item.unit}` : ""}</span>}
            </div>
          </div>
        </div>

        {/* Status segmented */}
        <div className="flex shrink-0 items-center gap-2 max-md:flex-wrap">
          <div className="flex overflow-hidden rounded-xl" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)" }}>
            {DCC_STATUSES.map((s) => {
              const on = (status ?? "").toLowerCase() === s.toLowerCase();
              const tone = dccStatusTone(s);
              return (
                <button
                  key={s}
                  disabled={!canFill}
                  onClick={() => onCommit(item.id, { status: on ? null : s })}
                  className="px-3.5 py-2.5 text-[14px] font-bold transition-colors disabled:cursor-default"
                  style={on ? { background: tone.bg, color: tone.fg } : { color: "var(--color-ink-subtle)", background: "white" }}
                  aria-pressed={on}
                >
                  {s}
                </button>
              );
            })}
          </div>
          {hasNumber && (
            <input
              type="number"
              defaultValue={entry?.value ?? ""}
              disabled={!canFill}
              placeholder="#"
              onBlur={(e) => { const v = e.target.value.trim(); if ((v || null) !== (entry?.value ?? null)) onCommit(item.id, { value: v || null }); }}
              className="w-[68px] rounded-xl border border-hairline-strong bg-white px-2.5 py-2.5 text-center text-[15px] font-bold text-ink-strong outline-none transition-colors focus:border-[#16a34a]"
              aria-label={`Value for ${item.title}`}
            />
          )}
          <button
            onClick={() => setNoteOpen((v) => !v)}
            className="grid h-11 w-11 place-items-center rounded-xl border border-hairline-strong text-ink-subtle transition-colors hover:border-[#16a34a] hover:text-[#15803d]"
            title="Add a note"
            aria-label="Add a note"
            style={entry?.note ? { color: GREEN_DEEP, borderColor: GREEN } : undefined}
          >
            <StickyNote size={18} />
          </button>
          {busy && <Loader2 size={16} className="animate-spin text-ink-subtle" />}
          {canManage && <ItemEditor ownerId={item.ownerEmployeeId} mode="edit" item={item} clients={clients} compact />}
        </div>
      </div>

      {noteOpen && (
        <input
          autoFocus
          defaultValue={entry?.note ?? ""}
          disabled={!canFill}
          placeholder="Add a note…"
          onBlur={(e) => { const v = e.target.value.trim(); if ((v || null) !== (entry?.note ?? null)) onCommit(item.id, { note: v || null }); }}
          className={INPUT}
        />
      )}
    </div>
  );
}

/* ──────────────────────────── Manager review ─────────────────────────── */

function ReviewBar({ ownerId, date, canReview, review }: { ownerId: string; date: string; canReview: boolean; review?: ReviewRow }) {
  const [, startTransition] = React.useTransition();
  const [status, setStatus] = React.useState(review?.status ?? null);
  const [note, setNote] = React.useState(review?.note ?? "");
  React.useEffect(() => { setStatus(review?.status ?? null); setNote(review?.note ?? ""); }, [review?.status, review?.note, date]);

  function save(next: string | null) {
    if (!canReview) return;
    setStatus(next);
    startTransition(async () => {
      const res = await setDccReview({ ownerEmployeeId: ownerId, date, status: next ?? "", note });
      if (!res.ok) fireToast({ message: res.error, type: "error" });
    });
  }
  const tone = status === "approved" ? GREEN : status === "needs_rework" ? RED : "var(--color-ink-subtle)";

  return (
    <div
      className="wg-rise flex flex-wrap items-center gap-3 rounded-[22px] px-5 py-3.5 max-md:px-4"
      style={{ boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${tone} 35%, var(--color-hairline)), 0 6px 24px -18px rgba(15,23,42,0.25)`, background: `color-mix(in srgb, ${tone} 5%, white)` }}
    >
      <span className="inline-flex items-center gap-1.5 text-[12.5px] font-black uppercase tracking-[0.12em]" style={{ color: status === "approved" ? GREEN_DEEP : tone }}>
        <ShieldCheck size={15} strokeWidth={2.5} /> Manager review
      </span>
      {canReview ? (
        <>
          <button onClick={() => save(status === "approved" ? null : "approved")} className="wg-btn rounded-xl px-4 py-2.5 text-[14px] font-bold transition-colors" style={status === "approved" ? { background: GREEN, color: "white" } : { background: "white", color: GREEN_DEEP, boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)" }} aria-pressed={status === "approved"}>✓ Approved</button>
          <button onClick={() => save(status === "needs_rework" ? null : "needs_rework")} className="wg-btn rounded-xl px-4 py-2.5 text-[14px] font-bold transition-colors" style={status === "needs_rework" ? { background: "var(--color-altus-red)", color: "white" } : { background: "white", color: "var(--color-altus-red-deep)", boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)" }} aria-pressed={status === "needs_rework"}>Needs Rework</button>
          <input value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => save(status)} placeholder="Review note…" className="flex-1 min-w-[180px] rounded-xl border border-hairline-strong bg-white px-3.5 py-2.5 text-[14.5px] font-medium text-ink-strong outline-none transition-colors focus:border-[#16a34a]" aria-label="Review note" />
        </>
      ) : (
        <span className="text-[14.5px] font-bold" style={{ color: status === "approved" ? GREEN_DEEP : tone }}>{status === "approved" ? "Approved" : status === "needs_rework" ? "Needs Rework" : "Not Yet Reviewed"}{review?.note ? ` — ${review.note}` : ""}</span>
      )}
    </div>
  );
}

/* ── Inline KPI item add/edit ─────────────────────────────────────────── */
function ItemEditor({ ownerId, mode, item, compact, allItems, presetSection, sectionButton, clients }: { ownerId: string; mode: "add" | "edit"; item?: DccItemRow; compact?: boolean; allItems?: DccItemRow[]; presetSection?: string; sectionButton?: boolean; clients?: DccClientRow[] }) {
  const [open, setOpen] = React.useState(false);
  // Portal target — the dialog must render on document.body so an ancestor with
  // a transform/filter + overflow-hidden can't turn it into the fixed-overlay's
  // containing block and clip it (that made the backdrop miss the viewport and
  // the KPI fields show the page bleeding through). Mount-guarded for SSR.
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  const [, startTransition] = React.useTransition();
  const blank = React.useMemo(() => ({
    section: item?.section ?? presetSection ?? "", code: item?.code ?? "", title: item?.title ?? "",
    frequency: item?.frequency ?? "", targetNumber: item?.targetNumber ?? "", unit: item?.unit ?? "",
    isParticipantList: item?.isParticipantList ?? false, clientId: item?.clientId ?? "",
  }), [item, presetSection]);
  const [form, setForm] = React.useState(blank);
  const [codeTouched, setCodeTouched] = React.useState(false);
  const router = useRouter();

  // Distinct existing sections for the dropdown (kept in first-seen order).
  const sections = React.useMemo(() => {
    const seen: string[] = [];
    for (const it of allItems ?? []) { const s = (it.section ?? "").trim(); if (s && !seen.includes(s)) seen.push(s); }
    return seen;
  }, [allItems]);

  // Auto-suggest the next code for a section: take the letter prefix its items
  // already use and increment the highest number (A6 → A7). Blank if none.
  const suggestCode = React.useCallback((section: string): string => {
    const rows = (allItems ?? []).filter((it) => (it.section ?? "").trim() === section.trim() && it.code);
    let letter = "", max = 0;
    for (const it of rows) {
      const m = /^([A-Za-z]+)(\d+)$/.exec((it.code ?? "").trim());
      if (!m) continue;
      if (!letter) letter = m[1]!.toUpperCase();
      if (m[1]!.toUpperCase() === letter) max = Math.max(max, Number(m[2]));
    }
    return letter ? `${letter}${max + 1}` : "";
  }, [allItems]);

  // Reset the form every time the dialog OPENS — otherwise the last-typed values
  // linger and "New KPI" shows a stale/previous KPI. Edit re-syncs from the item.
  React.useEffect(() => {
    if (!open) return;
    const base = { ...blank };
    if (mode === "add" && base.section && !base.code) base.code = suggestCode(base.section);
    setForm(base);
    setCodeTouched(false);
  }, [open, blank, mode, suggestCode]);

  function pickSection(section: string) {
    setForm((f) => ({ ...f, section, code: mode === "add" && !codeTouched ? suggestCode(section) : f.code }));
  }

  function submit() {
    if (!form.title.trim()) { fireToast({ message: "A title is required.", type: "error" }); return; }
    startTransition(async () => {
      const payload = { section: form.section || null, code: form.code || null, title: form.title, frequency: form.frequency || null, targetNumber: form.targetNumber || null, unit: form.unit || null, isParticipantList: form.isParticipantList, clientId: form.clientId || null };
      const res = mode === "add"
        ? await createDccItem({ ownerEmployeeId: ownerId, ...payload })
        : await updateDccItem({ id: item!.id, ...payload });
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      fireToast({ message: mode === "add" ? "KPI added." : "KPI saved.", type: "success" });
      setOpen(false);
      router.refresh();
    });
  }
  function remove() {
    if (!item) return;
    startTransition(async () => {
      const res = await deleteDccItem(item.id);
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      fireToast({ message: "KPI removed.", type: "info" });
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      {mode === "add" && sectionButton ? (
        <button onClick={() => setOpen(true)} className="bg-surface-card inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[12px] font-bold text-ink-soft transition-colors hover:text-[#15803d]" title="Add a KPI to this section"><Plus size={14} /> Add</button>
      ) : mode === "add" ? (
        <button onClick={() => setOpen(true)} className="wg-btn wg-sheen inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-[14px] font-bold text-white" style={{ background: `linear-gradient(135deg, ${GREEN}, ${GREEN_DEEP})`, boxShadow: "0 8px 20px -12px rgba(21,128,61,0.6)" }}><Plus size={17} /> Add KPI</button>
      ) : (
        <button onClick={() => setOpen(true)} className={`inline-flex items-center gap-1.5 rounded-xl border border-hairline-strong font-bold text-ink-soft transition-colors hover:border-[#16a34a] hover:text-[#15803d] ${compact ? "h-11 px-3 text-[14px]" : "h-9 w-9 justify-center"}`} title="Edit KPI" aria-label="Edit KPI"><Pencil size={16} />{compact && <span className="max-md:hidden">Edit</span>}</button>
      )}
      {open && mounted && createPortal(
        <div className="fixed inset-0 z-[100] grid place-items-center bg-black/40 p-4 backdrop-blur-[2px]" onClick={() => setOpen(false)}>
          <div className="wg-rise max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label={mode === "add" ? "New KPI" : "Edit KPI"}>
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-[18px] font-black tracking-tight text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif" }}>{mode === "add" ? "New KPI" : "Edit KPI"}</h3>
              <button onClick={() => setOpen(false)} className="grid h-8 w-8 place-items-center rounded-lg text-ink-subtle transition-colors hover:bg-surface-soft" aria-label="Close"><X size={18} /></button>
            </div>
            <div className="flex flex-col gap-2.5">
              <input autoFocus value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="KPI title *" className={INPUT} />
              <div className="grid grid-cols-2 gap-2.5">
                <input value={form.section} list="dcc-section-list" onChange={(e) => pickSection(e.target.value)} placeholder="Section" className={INPUT} />
                <input value={form.code} onChange={(e) => { setCodeTouched(true); setForm((f) => ({ ...f, code: e.target.value })); }} placeholder="Code (auto)" className={INPUT} />
              </div>
              {sections.length > 0 && (
                <datalist id="dcc-section-list">{sections.map((s) => <option key={s} value={s} />)}</datalist>
              )}
              <input value={form.frequency} onChange={(e) => setForm((f) => ({ ...f, frequency: e.target.value }))} placeholder="Frequency (Daily, Wed & Sat, Every Sat…)" className={INPUT} />
              <div className="grid grid-cols-2 gap-2.5">
                <input value={form.targetNumber} onChange={(e) => setForm((f) => ({ ...f, targetNumber: e.target.value }))} placeholder="Target number" className={INPUT} />
                <input value={form.unit} onChange={(e) => setForm((f) => ({ ...f, unit: e.target.value }))} placeholder="Unit (count, calls…)" className={INPUT} />
              </div>
              {clients && clients.length > 0 && (
                <select value={form.clientId} onChange={(e) => setForm((f) => ({ ...f, clientId: e.target.value }))} className={INPUT}>
                  <option value="">No Client</option>
                  {clients.map((c) => <option key={c.id} value={c.id}>{c.section} · {c.name}</option>)}
                </select>
              )}
              <label className="flex cursor-pointer items-center gap-2.5 rounded-xl px-1 py-1 text-[14px] font-semibold text-ink-soft">
                <input type="checkbox" checked={form.isParticipantList} onChange={(e) => setForm((f) => ({ ...f, isParticipantList: e.target.checked }))} className="size-4 accent-[#16a34a]" />
                Participant-list KPI (tracks a roster of people)
              </label>
            </div>
            <div className="mt-4 flex items-center justify-between">
              {mode === "edit" ? (
                <button onClick={remove} className="bg-surface-card inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13px] font-bold text-altus-red transition-colors hover:bg-[color:color-mix(in_srgb,var(--color-altus-red)_8%,transparent)]"><Trash2 size={14} /> Delete</button>
              ) : <span />}
              <button onClick={submit} className="wg-btn inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[14px] font-bold text-white" style={{ background: `linear-gradient(135deg, ${GREEN}, ${GREEN_DEEP})` }}><Check size={15} /> Save</button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
