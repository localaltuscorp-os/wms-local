"use client";

import * as React from "react";
import Link from "next/link";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { Plus, Star, Clock, MapPin, Video, Users, ChevronRight, X, Film, Loader2 } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { SessionForm } from "@/components/training/calendar/session-form";
import { toggleManual, requestRecording } from "@/app/(app)/training/calendar/actions";
import type { SessionListRow } from "@/lib/queries/training-calendar";

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

type AddSubject = (name: string) => Promise<{ ok: true; option: { id: string; name: string } } | { ok: false; error: string }>;

const STATUS_META: Record<string, { label: string; color: string; bg: string }> = {
  scheduled: { label: "Scheduled", color: ACCENT_DEEP, bg: `color-mix(in srgb, ${ACCENT} 12%, transparent)` },
  done: { label: "Done", color: "var(--color-green-deep)", bg: "color-mix(in srgb, var(--color-green) 14%, transparent)" },
  cancelled: { label: "Cancelled", color: "var(--color-ink-subtle)", bg: "var(--color-surface-track)" },
};

function fmtWhen(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "Asia/Kolkata",
  });
}

function Crit({ value }: { value: number }) {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`Criticality ${value} of 5`}>
      {Array.from({ length: 5 }, (_, i) => (
        <Star
          key={i}
          size={13}
          fill={i < value ? ACCENT : "transparent"}
          style={{ color: i < value ? ACCENT : "var(--color-hairline-strong)" }}
        />
      ))}
    </span>
  );
}

function SessionCard({ s, index, canManage }: { s: SessionListRow; index: number; canManage: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const status = STATUS_META[s.status] ?? STATUS_META.scheduled!;

  async function onToggleManual(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setBusy("manual");
    const res = await toggleManual(s.id, !s.inManual);
    setBusy(null);
    if (!res.ok) return fireToast({ message: res.error, type: "error" });
    fireToast({ message: s.inManual ? "Removed from manual." : "Added to the training manual.", type: "success" });
    router.refresh();
  }

  async function onRequestRecording(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setBusy("rec");
    const res = await requestRecording(s.id);
    setBusy(null);
    if (!res.ok) return fireToast({ message: res.error, type: "error" });
    fireToast({ message: "Recording requested.", type: "success" });
    router.refresh();
  }

  return (
    <Link
      href={`/training/calendar/${s.id}` as Route}
      className="wg-rise group block rounded-2xl border border-hairline bg-surface-card p-5 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{ animationDelay: `${index * 35}ms`, outlineColor: ACCENT, opacity: s.status === "cancelled" ? 0.7 : 1 }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-pill px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-[0.06em]" style={{ background: status.bg, color: status.color }}>
              {status.label}
            </span>
            <Crit value={s.criticality} />
            {s.inManual && (
              <span className="inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[11px] font-bold" style={{ background: `color-mix(in srgb, ${ACCENT} 12%, transparent)`, color: ACCENT_DEEP }}>
                <Star size={11} fill={ACCENT} style={{ color: ACCENT }} /> Manual
              </span>
            )}
          </div>
          <h3 className="mt-2 truncate text-[17px] font-bold text-ink-strong">{s.topic}</h3>
          {s.subject && <p className="truncate text-[13.5px] font-semibold text-ink-muted">{s.subject}</p>}
        </div>
        <ChevronRight size={18} className="mt-1 shrink-0 text-ink-subtle transition-transform group-hover:translate-x-0.5" />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[13px] font-semibold text-ink-soft">
        <span className="inline-flex items-center gap-1.5"><Clock size={14} className="text-ink-subtle" />{fmtWhen(s.scheduledAt)} · {s.durationMin}m</span>
        {s.mode === "online" ? (
          <span className="inline-flex items-center gap-1.5"><Video size={14} className="text-ink-subtle" />Online</span>
        ) : s.location ? (
          <span className="inline-flex items-center gap-1.5"><MapPin size={14} className="text-ink-subtle" />{s.location}</span>
        ) : null}
        <span className="inline-flex items-center gap-1.5"><Users size={14} className="text-ink-subtle" />{s.attendedCount}/{s.attendeeCount} attended</span>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 border-t border-hairline pt-3">
        <span className="inline-flex items-center gap-2 text-[13px] font-semibold text-ink-soft">
          {s.trainerName ? <EmployeeAvatar name={s.trainerName} size="sm" /> : null}
          {s.trainerName ?? "No trainer set"}
        </span>
        <div className="flex items-center gap-1.5" onClick={(e) => e.preventDefault()}>
          {!s.recordingRequested ? (
            <button
              type="button"
              onClick={onRequestRecording}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-lg border border-hairline px-2.5 py-1.5 text-[12px] font-bold text-ink-soft hover:border-ink-subtle disabled:opacity-50"
            >
              {busy === "rec" ? <Loader2 size={12} className="animate-spin" /> : <Film size={12} />} Recording
            </button>
          ) : (
            <span className="inline-flex items-center gap-1 text-[12px] font-bold text-ink-subtle"><Film size={12} /> Recording asked</span>
          )}
          {canManage && (
            <button
              type="button"
              onClick={onToggleManual}
              disabled={busy !== null}
              className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[12px] font-bold disabled:opacity-50"
              style={{ borderColor: s.inManual ? ACCENT : "var(--color-hairline)", color: s.inManual ? ACCENT_DEEP : "var(--color-ink-soft)" }}
            >
              {busy === "manual" ? <Loader2 size={12} className="animate-spin" /> : <Star size={12} fill={s.inManual ? ACCENT : "transparent"} style={{ color: ACCENT }} />}
              {s.inManual ? "In Manual" : "Manual"}
            </button>
          )}
        </div>
      </div>
    </Link>
  );
}

export function CalendarBoard({
  upcoming,
  past,
  canManage,
  subjectOptions,
  employeeOptions,
  maxSessionMinutes,
  onAddSubject,
}: {
  upcoming: SessionListRow[];
  past: SessionListRow[];
  canManage: boolean;
  subjectOptions: { id: string; name: string }[];
  employeeOptions: { id: string; name: string }[];
  maxSessionMinutes: number;
  onAddSubject?: AddSubject;
}) {
  const [creating, setCreating] = React.useState(false);
  const panelRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    if (creating) panelRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [creating]);

  return (
    <div className="flex flex-col gap-8">
      {canManage && (
        <div className="flex justify-end">
          {!creating ? (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="inline-flex items-center gap-2 rounded-xl px-5 py-3 text-[15px] font-bold text-white transition-transform active:scale-[0.99]"
              style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})`, boxShadow: `0 12px 30px -12px ${ACCENT}99` }}
            >
              <Plus size={17} strokeWidth={2.6} /> Schedule Training
            </button>
          ) : null}
        </div>
      )}

      {creating && (
        <section ref={panelRef} className="rounded-2xl border border-hairline bg-surface-card p-6 shadow-sm max-md:p-4">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-[19px] font-bold text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif" }}>Schedule a Training Session</h2>
            <button type="button" onClick={() => setCreating(false)} aria-label="Close" className="rounded-lg p-1.5 text-ink-subtle hover:bg-surface-soft">
              <X size={18} />
            </button>
          </div>
          <SessionForm
            mode="create"
            subjectOptions={subjectOptions}
            employeeOptions={employeeOptions}
            maxSessionMinutes={maxSessionMinutes}
            onAddSubject={onAddSubject}
            onCancel={() => setCreating(false)}
          />
        </section>
      )}

      <section>
        <h2 className="mb-3 text-[13px] font-bold uppercase tracking-[0.12em] text-ink-subtle">Upcoming</h2>
        {upcoming.length === 0 ? (
          <div className="rounded-2xl border border-solid border-hairline-strong bg-surface-soft p-8 text-center text-[14.5px] font-semibold text-ink-subtle">
            No upcoming sessions scheduled.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-4 max-lg:grid-cols-1">
            {upcoming.map((s, i) => (
              <SessionCard key={s.id} s={s} index={i} canManage={canManage} />
            ))}
          </div>
        )}
      </section>

      {past.length > 0 && (
        <section>
          <h2 className="mb-3 text-[13px] font-bold uppercase tracking-[0.12em] text-ink-subtle">Past sessions</h2>
          <div className="grid grid-cols-2 gap-4 max-lg:grid-cols-1">
            {past.map((s, i) => (
              <SessionCard key={s.id} s={s} index={i} canManage={canManage} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
