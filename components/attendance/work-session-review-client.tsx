"use client";

import * as React from "react";
import {
  Video,
  MonitorPlay,
  Camera,
  Clock,
  TriangleAlert,
  ImageOff,
  X,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { formatDate } from "@/lib/format";

const RED = "#E10600";
const RED_DEEP = "#A80400";

export interface ReviewShot {
  id: string;
  takenAt: string; // ISO
  url: string | null;
}

export interface ReviewFlag {
  label: string;
  tone: "warn" | "alert";
}

export interface ReviewSession {
  id: string;
  startedAt: string; // ISO
  endedAt: string | null; // ISO
  source: "meet" | "capture";
  status: string;
  totalMinutes: number | null;
  screenshotCount: number;
  meetConferenceRecord: string | null;
  flags: ReviewFlag[];
  /** Optional note when this session overlaps one of the other source. */
  overlapNote: string | null;
  shots: ReviewShot[];
}

const TIME_FMT = new Intl.DateTimeFormat("en-IN", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});

function fmtDate(iso: string): string {
  return formatDate(new Date(iso));
}
function fmtTime(iso: string): string {
  return TIME_FMT.format(new Date(iso));
}
function fmtHours(min: number | null): string {
  if (min == null) return "—";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

const CARD_SHADOW =
  "inset 0 0 0 1px var(--color-hairline), 0 6px 24px -18px rgba(15,23,42,0.25)";

/** Meet vs Capture pill — source is the single most important glance for a reviewer. */
function SourceBadge({ source }: { source: "meet" | "capture" }) {
  const meet = source === "meet";
  const Icon = meet ? Video : MonitorPlay;
  return (
    <span
      className="inline-flex shrink-0 items-center gap-1.5 rounded-pill px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.06em]"
      style={
        meet
          ? { background: "color-mix(in srgb, #2563eb 12%, transparent)", color: "#1d4ed8" }
          : { background: "color-mix(in srgb, #E10600 12%, transparent)", color: RED_DEEP }
      }
    >
      <Icon size={12} strokeWidth={2.5} />
      {meet ? "Meet" : "Capture"}
    </span>
  );
}

function StatusPill({ status }: { status: string }) {
  const open = status === "open";
  return (
    <span
      className="shrink-0 rounded-pill px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.06em]"
      style={
        open
          ? { background: "color-mix(in srgb, #E10600 12%, transparent)", color: RED_DEEP }
          : { background: "color-mix(in srgb, #16a34a 12%, transparent)", color: "#15803d" }
      }
    >
      {open ? "Live" : status}
    </span>
  );
}

interface Lightbox {
  session: ReviewSession;
  index: number;
}

export function WorkSessionReviewClient({
  personName,
  sessions,
}: {
  personName: string;
  sessions: ReviewSession[];
}) {
  const [box, setBox] = React.useState<Lightbox | null>(null);

  const shownShots = box?.session.shots ?? [];
  const current = box ? shownShots[box.index] : undefined;

  const move = React.useCallback((delta: number) => {
    setBox((b) => {
      if (!b) return b;
      const n = b.session.shots.length;
      if (n === 0) return b;
      return { ...b, index: (b.index + delta + n) % n };
    });
  }, []);

  React.useEffect(() => {
    if (!box) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setBox(null);
      else if (e.key === "ArrowRight") move(1);
      else if (e.key === "ArrowLeft") move(-1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [box, move]);

  if (sessions.length === 0) {
    return (
      <div
        className="wg-rise rounded-[22px] bg-surface-card px-6 py-10 text-center"
        style={{ boxShadow: CARD_SHADOW }}
      >
        <p className="text-[13.5px] font-medium text-ink-subtle">
          No work sessions logged for {personName} in the last 30 days.
        </p>
      </div>
    );
  }

  return (
    <>
      <ul className="flex flex-col gap-3">
        {sessions.map((s, i) => (
          <li
            key={s.id}
            className="wg-rise rounded-[20px] bg-surface-card p-4 max-md:p-3.5"
            style={{ boxShadow: CARD_SHADOW, animationDelay: `${Math.min(i, 8) * 40}ms` }}
          >
            {/* Header row */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <SourceBadge source={s.source} />
              <div className="min-w-0">
                <div className="text-[13.5px] font-bold text-ink-strong">{fmtDate(s.startedAt)}</div>
                <div className="text-[11.5px] font-medium text-ink-subtle">
                  {fmtTime(s.startedAt)}
                  {s.endedAt ? ` – ${fmtTime(s.endedAt)}` : " – ongoing"}
                </div>
              </div>
              <div className="ml-auto flex items-center gap-2.5">
                <span className="inline-flex items-center gap-1.5 text-[13px] font-bold text-ink-strong">
                  <Clock size={14} strokeWidth={2.4} className="text-ink-subtle" />
                  <span className="tabular-nums">{fmtHours(s.totalMinutes)}</span>
                </span>
                {s.source === "capture" && (
                  <span className="inline-flex items-center gap-1 text-[12px] font-semibold text-ink-subtle">
                    <Camera size={13} strokeWidth={2.3} /> {s.screenshotCount}
                  </span>
                )}
                <StatusPill status={s.status} />
              </div>
            </div>

            {/* Flags + overlap note */}
            {(s.flags.length > 0 || s.overlapNote) && (
              <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                {s.flags.map((f) => (
                  <span
                    key={f.label}
                    className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[11.5px] font-bold"
                    style={
                      f.tone === "alert"
                        ? { background: "color-mix(in srgb, #E10600 10%, transparent)", color: RED_DEEP }
                        : { background: "color-mix(in srgb, #d97706 12%, transparent)", color: "#b45309" }
                    }
                  >
                    <TriangleAlert size={12} strokeWidth={2.5} />
                    {f.label}
                  </span>
                ))}
                {s.overlapNote && (
                  <span
                    className="inline-flex items-center rounded-pill px-2.5 py-1 text-[11.5px] font-semibold"
                    style={{ background: "var(--color-surface-soft)", color: "var(--color-ink-subtle)", boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
                  >
                    {s.overlapNote}
                  </span>
                )}
              </div>
            )}

            {/* Capture screenshots strip */}
            {s.source === "capture" && s.shots.length > 0 && (
              <div
                className="mt-3 flex gap-2 overflow-x-auto pb-1"
                style={{ scrollbarWidth: "thin" }}
              >
                {s.shots.map((shot, idx) => (
                  <button
                    key={shot.id}
                    type="button"
                    onClick={() => shot.url && setBox({ session: s, index: idx })}
                    disabled={!shot.url}
                    title={`${fmtTime(shot.takenAt)}${shot.url ? "" : " — unavailable"}`}
                    className="group relative size-[72px] shrink-0 overflow-hidden rounded-xl focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 disabled:cursor-default"
                    style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)", background: "var(--color-surface-soft)" }}
                  >
                    {shot.url ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={shot.url}
                        alt={`Screenshot at ${fmtTime(shot.takenAt)}`}
                        className="size-full object-cover transition-transform duration-200 group-hover:scale-[1.06]"
                        loading="lazy"
                      />
                    ) : (
                      <span className="grid size-full place-items-center text-ink-subtle">
                        <ImageOff size={18} strokeWidth={2} />
                      </span>
                    )}
                    <span
                      className="pointer-events-none absolute inset-x-0 bottom-0 px-1 py-0.5 text-center text-[9px] font-bold text-white"
                      style={{ background: "linear-gradient(to top, rgba(0,0,0,0.55), transparent)" }}
                    >
                      {fmtTime(shot.takenAt)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>

      {/* Lightbox */}
      {box && current && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Screenshot preview"
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center p-4"
          style={{ background: "rgba(8,10,15,0.82)", backdropFilter: "blur(4px)" }}
          onClick={() => setBox(null)}
        >
          <div className="mb-3 flex items-center gap-3 text-white">
            <SourceBadge source={box.session.source} />
            <span className="text-[13px] font-semibold">
              {fmtDate(box.session.startedAt)} · {fmtTime(current.takenAt)}
            </span>
            <span className="text-[12px] font-medium opacity-70">
              {box.index + 1} / {box.session.shots.length}
            </span>
          </div>

          <div
            className="relative flex max-h-[78vh] max-w-[92vw] items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            {box.session.shots.length > 1 && (
              <button
                type="button"
                onClick={() => move(-1)}
                aria-label="Previous screenshot"
                className="absolute left-2 z-10 grid size-10 place-items-center rounded-full text-white focus:outline-none focus-visible:ring-2"
                style={{ background: "rgba(0,0,0,0.45)" }}
              >
                <ChevronLeft size={22} strokeWidth={2.4} />
              </button>
            )}
            {current.url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={current.url}
                alt={`Screenshot at ${fmtTime(current.takenAt)}`}
                className="max-h-[78vh] max-w-[92vw] rounded-lg object-contain"
                style={{ boxShadow: "0 24px 60px -20px rgba(0,0,0,0.7)" }}
              />
            ) : (
              <div className="grid size-40 place-items-center rounded-lg bg-white/10 text-white/70">
                <ImageOff size={28} />
              </div>
            )}
            {box.session.shots.length > 1 && (
              <button
                type="button"
                onClick={() => move(1)}
                aria-label="Next screenshot"
                className="absolute right-2 z-10 grid size-10 place-items-center rounded-full text-white focus:outline-none focus-visible:ring-2"
                style={{ background: "rgba(0,0,0,0.45)" }}
              >
                <ChevronRight size={22} strokeWidth={2.4} />
              </button>
            )}
          </div>

          <button
            type="button"
            onClick={() => setBox(null)}
            aria-label="Close preview"
            className="mt-4 inline-flex items-center gap-1.5 rounded-pill bg-white/12 px-4 py-2 text-[13px] font-bold text-white focus:outline-none focus-visible:ring-2"
          >
            <X size={15} strokeWidth={2.5} /> Close
          </button>
        </div>
      )}
    </>
  );
}
