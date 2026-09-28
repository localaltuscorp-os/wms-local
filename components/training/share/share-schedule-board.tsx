"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, CalendarClock, CheckCircle2, UserRound } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { scheduleShare, recordShare, replaceShare } from "@/app/(app)/training/share/schedule-actions";
import { SHARE_SLOTS, SHARE_SLOT_LABELS } from "@/db/enums";
import type { ShareSlot } from "@/db/enums";

const INPUT =
  "w-full rounded-xl border border-hairline bg-white px-3.5 py-3 text-[15px] font-semibold text-ink-strong outline-none transition-colors focus:border-[#E10600]";

export interface ScheduleRow {
  id: string;
  shareDate: string;
  slot: ShareSlot;
  presenterId: string | null;
  presenterName: string | null;
  topic: string | null;
  status: string;
}

export function ShareScheduleBoard({
  rows,
  employeeOptions,
  canManage,
  meId,
  meName,
}: {
  rows: ScheduleRow[];
  employeeOptions: { id: string; name: string }[];
  canManage: boolean;
  meId: string;
  meName: string;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState<string | null>(null);
  const [date, setDate] = React.useState(() => new Date().toISOString().slice(0, 10));
  const [slot, setSlot] = React.useState<ShareSlot>("junior");
  const [presenterId, setPresenterId] = React.useState("");

  async function onAssign(e: React.FormEvent) {
    e.preventDefault();
    setPending("assign");
    const res = await scheduleShare({ shareDate: date, slot, presenterId: presenterId || null });
    setPending(null);
    if (!res.ok) return fireToast({ message: res.error, type: "error" });
    fireToast({ message: "Share scheduled.", type: "success" });
    router.refresh();
  }

  async function onRecord(id: string) {
    const topic = prompt("Topic of your share:");
    if (!topic) return;
    setPending(id);
    const res = await recordShare({ id, topic });
    setPending(null);
    if (!res.ok) return fireToast({ message: res.error, type: "error" });
    fireToast({ message: "Share recorded.", type: "success" });
    router.refresh();
  }

  async function onReplace(id: string) {
    const to = prompt("Employee id of the replacement presenter:");
    if (!to) return;
    setPending(id);
    const res = await replaceShare({ id, replacementPresenterId: to });
    setPending(null);
    if (!res.ok) return fireToast({ message: res.error, type: "error" });
    fireToast({ message: "Presenter replaced.", type: "success" });
    router.refresh();
  }

  return (
    <div className="grid gap-4">
      {canManage && (
        <form onSubmit={onAssign} className="grid grid-cols-4 gap-2 max-md:grid-cols-1 rounded-2xl border border-hairline bg-surface-card p-4">
          <input type="date" className={INPUT} value={date} onChange={(e) => setDate(e.target.value)} />
          <select className={INPUT} value={slot} onChange={(e) => setSlot(e.target.value as ShareSlot)}>
            {SHARE_SLOTS.map((s) => <option key={s} value={s}>{SHARE_SLOT_LABELS[s]}</option>)}
          </select>
          <select className={INPUT} value={presenterId} onChange={(e) => setPresenterId(e.target.value)}>
            <option value="">Unassigned</option>
            {employeeOptions.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <button type="submit" disabled={pending !== null}
            className="inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-[14px] font-bold text-white disabled:opacity-60"
            style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}>
            {pending === "assign" ? <Loader2 size={15} className="animate-spin" /> : <CalendarClock size={15} />} Assign
          </button>
        </form>
      )}

      <div className="grid gap-2">
        {rows.map((r) => (
          <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-hairline bg-surface-card px-4 py-3">
            <div className="flex items-center gap-3">
              <CalendarClock size={16} className="text-ink-subtle" />
              <div>
                <p className="text-[14px] font-bold text-ink-strong">{r.shareDate} · {SHARE_SLOT_LABELS[r.slot]}</p>
                <p className="text-[12.5px] font-semibold text-ink-subtle">{r.topic ? r.topic : `${r.presenterName ?? "Unassigned"}${r.status === "done" ? " — delivered" : ""}`}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {r.status === "done" ? (
                <span className="inline-flex items-center gap-1 text-[13px] font-bold text-[var(--color-green-deep)]"><CheckCircle2 size={15} /> Done</span>
              ) : r.presenterId === meId ? (
                <button type="button" onClick={() => onRecord(r.id)} disabled={pending === r.id}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-white px-3 py-2 text-[13px] font-bold text-ink-soft hover:border-ink-subtle">
                  {pending === r.id ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle2 size={14} />} Record
                </button>
              ) : canManage && r.presenterId ? (
                <button type="button" onClick={() => onReplace(r.id)} className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-white px-3 py-2 text-[13px] font-bold text-ink-soft hover:border-ink-subtle">
                  <UserRound size={14} /> Replace
                </button>
              ) : null}
            </div>
          </div>
        ))}
        {rows.length === 0 && <p className="text-ink-subtle">No shares scheduled.</p>}
      </div>
    </div>
  );
}
