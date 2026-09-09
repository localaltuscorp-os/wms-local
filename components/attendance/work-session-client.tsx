"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  MonitorPlay,
  MonitorStop,
  Loader2,
  ShieldAlert,
  Camera,
  CircleDot,
  Clock,
} from "lucide-react";
import { fireToast } from "@/lib/toast";
import { formatDate } from "@/lib/format";
import {
  startWorkSession,
  addWorkSessionShot,
  endWorkSession,
} from "@/app/(app)/attendance/work-session/actions";

const RED = "#E10600";
const RED_DEEP = "#A80400";

/** How often, in ms, a live session grabs a screen frame (also once on start). */
const SHOT_INTERVAL_MS = 10 * 60 * 1000; // one screenshot every 10 minutes
const SHOT_MAX_WIDTH = 1280;             // downscale wide screens to bound file size
const SHOT_QUALITY = 0.5;                // JPEG quality (~60–80 KB/frame at 1280px)

export interface RecentSession {
  id: string;
  startedAt: string; // ISO
  endedAt: string | null; // ISO
  totalMinutes: number | null;
  screenshotCount: number;
  status: "open" | "closed" | "reconciled";
}

function fmtElapsed(totalSeconds: number): string {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}

const DT_TIME_FMT = new Intl.DateTimeFormat("en-IN", {
  hour: "2-digit",
  minute: "2-digit",
  hour12: true,
});
function fmtDateTime(iso: string): string {
  const d = new Date(iso);
  return `${formatDate(d)} · ${DT_TIME_FMT.format(d)}`;
}

function fmtMinutes(min: number | null): string {
  if (min == null) return "—";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
}

export function WorkSessionClient({ recentSessions }: { recentSessions: RecentSession[] }) {
  const router = useRouter();

  const [phase, setPhase] = React.useState<"idle" | "starting" | "live" | "stopping">("idle");
  const [elapsed, setElapsed] = React.useState(0);
  const [shotCount, setShotCount] = React.useState(0);
  const [error, setError] = React.useState<string | null>(null);

  const videoRef = React.useRef<HTMLVideoElement | null>(null);
  const canvasRef = React.useRef<HTMLCanvasElement | null>(null);
  const streamRef = React.useRef<MediaStream | null>(null);
  const sessionIdRef = React.useRef<string | null>(null);
  const tickRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const shotRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const endingRef = React.useRef(false);

  // Release everything the browser is holding — stream tracks + both timers.
  const teardown = React.useCallback(() => {
    if (tickRef.current) {
      clearInterval(tickRef.current);
      tickRef.current = null;
    }
    if (shotRef.current) {
      clearInterval(shotRef.current);
      shotRef.current = null;
    }
    const stream = streamRef.current;
    if (stream) {
      for (const t of stream.getTracks()) t.stop();
      streamRef.current = null;
    }
    if (videoRef.current) videoRef.current.srcObject = null;
  }, []);

  React.useEffect(() => teardown, [teardown]);

  /** Draw the current frame → JPEG data-URL → server. Best-effort; never throws. */
  const captureShot = React.useCallback(async () => {
    const sessionId = sessionIdRef.current;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!sessionId || !video || !canvas) return;
    const vw = video.videoWidth;
    const vh = video.videoHeight;
    if (!vw || !vh) return; // frame not ready yet
    // Downscale to keep screenshots small (storage-friendly): cap width at
    // SHOT_MAX_WIDTH, preserve aspect ratio, and encode at a lower JPEG quality.
    // A retention cron also auto-deletes shots older than the retention window.
    const scale = Math.min(1, SHOT_MAX_WIDTH / vw);
    const w = Math.round(vw * scale);
    const h = Math.round(vh * scale);
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, w, h);
    let dataUrl: string;
    try {
      dataUrl = canvas.toDataURL("image/jpeg", SHOT_QUALITY);
    } catch {
      return;
    }
    const res = await addWorkSessionShot(sessionId, dataUrl);
    if (res.ok) setShotCount((n) => n + 1);
  }, []);

  const stop = React.useCallback(async () => {
    if (endingRef.current) return;
    const sessionId = sessionIdRef.current;
    endingRef.current = true;
    setPhase("stopping");
    teardown();
    if (sessionId) {
      const res = await endWorkSession(sessionId);
      if (!res.ok) fireToast({ message: res.error, type: "error" });
      else fireToast({ message: "Session ended.", type: "success" });
    }
    sessionIdRef.current = null;
    endingRef.current = false;
    setPhase("idle");
    setElapsed(0);
    setShotCount(0);
    router.refresh();
  }, [router, teardown]);

  const start = React.useCallback(async () => {
    if (phase !== "idle") return;
    setError(null);

    // Ask for the screen FIRST — no DB row until the user actually grants it.
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
    } catch (err) {
      const name = err instanceof DOMException ? err.name : "";
      const msg =
        name === "NotAllowedError"
          ? "Screen-share permission was denied. Allow it to start a session."
          : "Couldn't start screen sharing on this device.";
      setError(msg);
      fireToast({ message: msg, type: "error" });
      return;
    }

    setPhase("starting");
    streamRef.current = stream;
    const video = videoRef.current;
    if (video) {
      video.srcObject = stream;
      video.play().catch(() => {});
    }

    // Browser "Stop sharing" button (or the track otherwise ending) → close out.
    const track = stream.getVideoTracks()[0];
    if (track) track.addEventListener("ended", () => void stop());

    const res = await startWorkSession();
    if (!res.ok) {
      setError(res.error);
      fireToast({ message: res.error, type: "error" });
      teardown();
      setPhase("idle");
      return;
    }

    sessionIdRef.current = res.sessionId;
    setPhase("live");
    setElapsed(0);
    setShotCount(0);
    fireToast({ message: "Session started — screen sharing is live.", type: "success" });

    // Elapsed timer.
    tickRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    // One shot shortly after start (give the video a beat to produce a frame),
    // then every SHOT_INTERVAL_MS.
    setTimeout(() => void captureShot(), 1500);
    shotRef.current = setInterval(() => void captureShot(), SHOT_INTERVAL_MS);
  }, [phase, stop, teardown, captureShot]);

  // Keep the live panel mounted through "stopping" so the button can show its
  // "Ending…" state (TS narrows `phase` to this alias inside the branch).
  const live = phase === "live" || phase === "stopping";
  const busy = phase === "starting" || phase === "stopping";

  return (
    <div className="flex flex-col gap-5">
      {/* ── Capture control ── */}
      <section
        className="wg-rise rounded-[22px] bg-surface-card p-5 max-md:p-4"
        style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline), 0 6px 24px -18px rgba(15,23,42,0.25)" }}
      >
        <div className="mb-4 flex items-center gap-2.5">
          <span
            className="inline-grid size-9 place-items-center rounded-xl"
            style={{ background: "color-mix(in srgb, #E10600 10%, transparent)", color: RED_DEEP }}
          >
            <MonitorPlay size={18} strokeWidth={2.3} />
          </span>
          <div>
            <h2
              className="text-ink-strong"
              style={{
                fontFamily: "var(--font-display), system-ui, sans-serif",
                fontWeight: 900,
                fontSize: 19,
                letterSpacing: "-0.02em",
                lineHeight: 1.1,
              }}
            >
              Work Session
            </h2>
            <p className="text-[12.5px] font-medium text-ink-subtle">
              Share your screen to log a project work session
            </p>
          </div>
        </div>

        {/* Live state */}
        {live ? (
          <div className="flex flex-col gap-4">
            <div
              className="flex items-center justify-between gap-3 rounded-2xl px-4 py-3"
              style={{ background: "color-mix(in srgb, #E10600 7%, transparent)", boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
            >
              <div className="flex items-center gap-2.5">
                <CircleDot size={16} className="animate-pulse" style={{ color: RED }} strokeWidth={2.6} />
                <span className="text-[13.5px] font-bold" style={{ color: RED_DEEP }}>
                  Screen sharing
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-ink-strong">
                <Clock size={15} strokeWidth={2.4} className="text-ink-subtle" />
                <span className="text-[17px] font-black tabular-nums" aria-live="polite">
                  {fmtElapsed(elapsed)}
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 text-[12.5px] font-semibold text-ink-subtle">
              <Camera size={14} strokeWidth={2.3} />
              {shotCount === 0 ? "Capturing first screenshot…" : `${shotCount} screenshot${shotCount === 1 ? "" : "s"} captured`}
            </div>

            <button
              type="button"
              onClick={() => void stop()}
              disabled={busy}
              className="wg-btn inline-flex items-center justify-center gap-2 rounded-pill px-5 py-2.5 text-[13.5px] font-bold text-white disabled:opacity-60"
              style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})`, boxShadow: `0 8px 20px -10px ${RED_DEEP}` }}
            >
              {phase === "stopping" ? <Loader2 size={15} className="animate-spin" /> : <MonitorStop size={15} strokeWidth={2.5} />}
              {phase === "stopping" ? "Ending…" : "Stop Session"}
            </button>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <button
              type="button"
              onClick={() => void start()}
              disabled={busy}
              className="wg-btn wg-sheen inline-flex items-center justify-center gap-2 rounded-pill px-5 py-3 text-[14px] font-bold text-white disabled:opacity-60"
              style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})`, boxShadow: `0 8px 20px -10px ${RED_DEEP}` }}
            >
              {phase === "starting" ? <Loader2 size={16} className="animate-spin" /> : <MonitorPlay size={16} strokeWidth={2.5} />}
              {phase === "starting" ? "Starting…" : "Start Session"}
            </button>
            {error && (
              <div
                className="flex items-start gap-2 rounded-xl px-3.5 py-2.5 text-[12.5px] font-semibold"
                style={{ background: "color-mix(in srgb, #E10600 8%, transparent)", color: RED_DEEP }}
              >
                <ShieldAlert size={15} strokeWidth={2.4} className="mt-px shrink-0" />
                <span>{error}</span>
              </div>
            )}
            <p className="text-[12px] font-medium text-ink-subtle">
              We take a screenshot when you start and every 5 minutes while sharing. Stop anytime from here or the browser bar.
            </p>
          </div>
        )}

        {/* Off-screen capture plumbing. */}
        <video ref={videoRef} muted playsInline className="hidden" aria-hidden />
        <canvas ref={canvasRef} className="hidden" aria-hidden />
      </section>

      {/* ── Recent sessions ── */}
      <section
        className="wg-rise rounded-[22px] bg-surface-card p-5 max-md:p-4"
        style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline), 0 6px 24px -18px rgba(15,23,42,0.25)", animationDelay: "80ms" }}
      >
        <h3
          className="mb-3 text-ink-strong"
          style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 15.5, letterSpacing: "-0.01em" }}
        >
          Recent sessions
        </h3>
        {recentSessions.length === 0 ? (
          <p className="text-[13px] font-medium text-ink-subtle">No sessions yet — start one above.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {recentSessions.map((s) => {
              const open = s.status === "open";
              return (
                <li
                  key={s.id}
                  className="flex items-center justify-between gap-3 rounded-xl px-3.5 py-2.5"
                  style={{ background: "var(--color-surface-soft)", boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
                >
                  <div className="min-w-0">
                    <div className="text-[13px] font-bold text-ink-strong">{fmtDateTime(s.startedAt)}</div>
                    <div className="flex items-center gap-2 text-[11.5px] font-medium text-ink-subtle">
                      <span className="inline-flex items-center gap-1">
                        <Camera size={11} strokeWidth={2.4} /> {s.screenshotCount}
                      </span>
                      <span aria-hidden>·</span>
                      <span>{fmtMinutes(s.totalMinutes)}</span>
                    </div>
                  </div>
                  <span
                    className="shrink-0 rounded-pill px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.06em]"
                    style={
                      open
                        ? { background: "color-mix(in srgb, #E10600 12%, transparent)", color: RED_DEEP }
                        : { background: "color-mix(in srgb, #16a34a 12%, transparent)", color: "#15803d" }
                    }
                  >
                    {open ? "Live" : s.status}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
