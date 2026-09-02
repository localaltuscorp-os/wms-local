"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Gauge, StickyNote, Loader2, CheckCircle2 } from "lucide-react";
import { fireToast } from "@/lib/toast";
import type { DccItemRow, DccEntryRow } from "@/lib/queries/dcc";
import { DCC_STATUSES, dccStatusTone, maskLabel } from "@/lib/dcc/util";
import { setDccEntry } from "@/app/(app)/dcc/actions";

interface Props {
  greetingName: string;
  date: string;
  items: DccItemRow[];
  entries: DccEntryRow[];
}

const cellKey = (id: string, date: string) => `${id}|${date}`;
function fmtLong(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y!, (m ?? 1) - 1, d ?? 1).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" });
}

export function DccGateView({ greetingName, date, items, entries }: Props) {
  const router = useRouter();
  const [isPending, startTransition] = React.useTransition();
  const [map, setMap] = React.useState<Record<string, { status: string | null; value: string | null; note: string | null }>>(() => {
    const m: Record<string, { status: string | null; value: string | null; note: string | null }> = {};
    for (const e of entries) m[cellKey(e.itemId, e.entryDate)] = { status: e.status, value: e.valueNumber, note: e.note };
    return m;
  });
  const [busy, setBusy] = React.useState<string | null>(null);
  const [done, setDone] = React.useState(false);

  const groups = React.useMemo(() => {
    const order: string[] = [];
    const by = new Map<string, DccItemRow[]>();
    for (const it of items) {
      const key = it.section || "—";
      if (!by.has(key)) { by.set(key, []); order.push(key); }
      by.get(key)!.push(it);
    }
    return order.map((k) => ({ section: k, rows: by.get(k)! }));
  }, [items]);

  const filled = items.filter((it) => (map[cellKey(it.id, date)]?.status ?? "").trim()).length;
  const total = items.length;
  const pct = total ? Math.round((filled / total) * 100) : 100;

  function commit(itemId: string, patch: { status?: string | null; value?: string | null; note?: string | null }) {
    const k = cellKey(itemId, date);
    const prev = map[k];
    const next = { status: patch.status !== undefined ? patch.status : prev?.status ?? null, value: patch.value !== undefined ? patch.value : prev?.value ?? null, note: patch.note !== undefined ? patch.note : prev?.note ?? null };
    setMap((m) => ({ ...m, [k]: next }));
    setBusy(k);
    startTransition(async () => {
      const res = await setDccEntry({ itemId, date, status: next.status, value: next.value, note: next.note, silent: true });
      setBusy((b) => (b === k ? null : b));
      if (!res.ok) {
        setMap((m) => ({ ...m, [k]: prev ?? { status: null, value: null, note: null } }));
        fireToast({ message: res.error, type: "error" });
      }
    });
  }

  function finish() {
    setDone(true);
    startTransition(() => router.refresh());
  }

  return (
    <div className="min-h-[calc(100vh-64px)] w-full bg-gradient-to-b from-[#F4EEE3] to-[#FBF7F0]">
      <div className="mx-auto w-full max-w-[860px] px-6 max-md:px-4 pt-10 pb-28">
        {/* Hero */}
        <div className="text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-hairline-strong bg-white px-4 py-1.5 text-[13px] font-extrabold uppercase tracking-[0.18em]" style={{ color: "var(--color-altus-red-deep)" }}>
            <Gauge size={16} /> Daily Compliance
          </span>
          <h1 className="mt-4 text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: "clamp(30px, 4.4vw, 48px)", letterSpacing: "-0.03em", lineHeight: 1.04 }}>
            Good morning, {greetingName}.
          </h1>
          <p className="mt-3 text-[17px] font-semibold text-ink-muted">
            Before you start — fill your DCC for <span className="text-ink-strong">{fmtLong(date)}</span>.
          </p>
        </div>

        {/* Progress */}
        <div className="mt-7 flex items-center gap-3 rounded-2xl border border-hairline-strong bg-white px-5 py-4 shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-[color:var(--color-surface-track,#eef2f7)]">
            <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: pct >= 100 ? "var(--color-green)" : "var(--color-altus-red)" }} />
          </div>
          <span className="text-[16px] font-extrabold text-ink-strong tabular-nums">{filled}/{total}</span>
        </div>

        {/* Items */}
        <div className="mt-6 flex flex-col gap-6">
          {groups.map((g) => (
            <div key={g.section}>
              <h3 className="mb-2.5 flex items-center gap-2.5 px-1 text-[14px] font-extrabold uppercase tracking-[0.12em] text-ink-muted">
                <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: "var(--color-altus-red)" }} /> {g.section}
              </h3>
              <div className="overflow-hidden rounded-2xl border border-hairline-strong bg-white shadow-[0_1px_3px_rgba(0,0,0,0.05)]">
                {g.rows.map((it, i) => (
                  <GateRow key={it.id} item={it} date={date} entry={map[cellKey(it.id, date)]} busy={busy === cellKey(it.id, date)} first={i === 0} onCommit={commit} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Sticky finish bar */}
      <div className="fixed inset-x-0 bottom-0 border-t border-hairline-strong bg-white/95 backdrop-blur px-6 py-4">
        <div className="mx-auto flex max-w-[860px] items-center justify-between gap-4">
          <span className="text-[15px] font-bold text-ink-muted">{total - filled === 0 ? "All KPIs filled 🎉" : `${total - filled} left to fill`}</span>
          <button
            onClick={finish}
            disabled={filled < total || done || isPending}
            className="inline-flex items-center gap-2 rounded-xl bg-altus-red px-6 py-3 text-[16px] font-bold text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            {done || isPending ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={18} />} Continue to Hub
          </button>
        </div>
      </div>
    </div>
  );
}

function GateRow({ item, date, entry, busy, first, onCommit }: {
  item: DccItemRow;
  date: string;
  entry?: { status: string | null; value: string | null; note: string | null };
  busy: boolean;
  first: boolean;
  onCommit: (itemId: string, patch: { status?: string | null; value?: string | null; note?: string | null }) => void;
}) {
  const [noteOpen, setNoteOpen] = React.useState(Boolean(entry?.note));
  const hasNumber = item.targetNumber != null || item.unit != null;
  const status = entry?.status ?? null;
  return (
    <div className={`flex flex-col gap-3 px-5 py-4 max-md:px-3.5 ${first ? "" : "border-t border-hairline"}`} style={{ background: status?.toLowerCase() === "done" ? "color-mix(in srgb, var(--color-green) 5%, transparent)" : undefined }}>
      <div className="flex items-center gap-4 max-md:flex-col max-md:items-stretch">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {item.code && <span className="mt-0.5 shrink-0 rounded-lg bg-[color:var(--color-surface-track,#eef2f7)] px-2 py-1 text-[13.5px] font-extrabold text-ink-muted tabular-nums">{item.code}</span>}
          <div className="min-w-0">
            <p className="text-[17px] font-bold leading-snug text-ink-strong">{item.title}</p>
            <div className="mt-1 flex flex-wrap items-center gap-x-2.5 text-[13.5px] font-semibold text-ink-subtle">
              {item.frequency ? <span>{item.frequency}</span> : item.weekdays != null && <span>{maskLabel(item.weekdays)}</span>}
              {item.targetNumber != null && <span className="text-altus-red">target {item.targetNumber}{item.unit ? ` ${item.unit}` : ""}</span>}
            </div>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2 max-md:flex-wrap">
          <div className="flex overflow-hidden rounded-xl border border-hairline-strong">
            {DCC_STATUSES.map((s) => {
              const on = (status ?? "").toLowerCase() === s.toLowerCase();
              const tone = dccStatusTone(s);
              return (
                <button key={s} onClick={() => onCommit(item.id, { status: on ? null : s })} className="px-3.5 py-2.5 text-[14.5px] font-bold transition-colors" style={on ? { background: tone.bg, color: tone.fg } : { color: "var(--color-ink-subtle)", background: "white" }}>{s}</button>
              );
            })}
          </div>
          {hasNumber && (
            <input type="number" defaultValue={entry?.value ?? ""} placeholder="#" onBlur={(e) => { const v = e.target.value.trim(); if ((v || null) !== (entry?.value ?? null)) onCommit(item.id, { value: v || null }); }} className="w-[68px] rounded-xl border border-hairline-strong bg-white px-2.5 py-2.5 text-center text-[15px] font-bold text-ink-strong outline-none focus:border-[color:var(--color-altus-red)]" />
          )}
          <button onClick={() => setNoteOpen((v) => !v)} className="grid h-11 w-11 place-items-center rounded-xl border border-hairline-strong text-ink-subtle transition-colors hover:border-altus-red hover:text-altus-red" title="Add a note" style={entry?.note ? { color: "var(--color-altus-red)", borderColor: "var(--color-altus-red)" } : undefined}><StickyNote size={18} /></button>
          {busy && <Loader2 size={16} className="animate-spin text-ink-subtle" />}
        </div>
      </div>
      {noteOpen && (
        <input autoFocus defaultValue={entry?.note ?? ""} placeholder="Add a note…" onBlur={(e) => { const v = e.target.value.trim(); if ((v || null) !== (entry?.note ?? null)) onCommit(item.id, { note: v || null }); }} className="w-full rounded-lg border border-hairline-strong bg-white px-3.5 py-2.5 text-[15.5px] font-medium text-ink-strong outline-none focus:border-[color:var(--color-altus-red)]" />
      )}
    </div>
  );
}
