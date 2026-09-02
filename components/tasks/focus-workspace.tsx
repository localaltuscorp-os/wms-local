"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { motion, AnimatePresence } from "motion/react";
import { format, formatDistanceToNow } from "date-fns";
import {
  ArrowLeft,
  Play,
  Pause,
  RotateCcw,
  Maximize2,
  Minimize2,
  Check,
  Keyboard,
  X,
  Calendar,
  User,
  Send,
  Clock,
  Coffee,
  Zap,
} from "lucide-react";
import { setTaskStatus, addComment } from "@/app/(app)/tasks/actions";
import { fireToast } from "@/lib/toast";
import { PRIORITY_LABELS, type TaskStatus, type StatusColorToken } from "@/db/enums";

interface TaskShape {
  id: string;
  title: string;
  description: string | null;
  subject: string | null;
  notes: string | null;
  status: TaskStatus;
  priority: keyof typeof PRIORITY_LABELS;
  dueAt: Date;
  updatedAt: Date;
  doerName: string | null;
  initiatorName: string | null;
  creatorName: string | null;
}

interface Props {
  task: TaskShape;
  statusLabels: Record<TaskStatus, string>;
  statusTones: Record<TaskStatus, StatusColorToken>;
  isAdmin: boolean;
}

// Pomodoro presets (minutes). Classic 25/50, plus a short break and a
// long single-shot 90-minute deep-work session.
const TIMER_PRESETS = [
  { id: "25", label: "Focus", minutes: 25, kind: "focus" as const },
  { id: "50", label: "Deep", minutes: 50, kind: "focus" as const },
  { id: "90", label: "Flow", minutes: 90, kind: "focus" as const },
  { id: "5", label: "Break", minutes: 5, kind: "break" as const },
];
type TimerPreset = (typeof TIMER_PRESETS)[number];

export function FocusWorkspace({
  task,
  statusLabels,
  statusTones,
  isAdmin,
}: Props) {
  const router = useRouter();
  const [showShortcuts, setShowShortcuts] = React.useState(false);
  const [isFullscreen, setIsFullscreen] = React.useState(false);

  // Track when the user landed on this focus session — surfaced as a
  // gentle "Working on this for ~Xm" counter at the bottom of the hero.
  const sessionStart = React.useRef(Date.now());
  const [elapsedLabel, setElapsedLabel] = React.useState("just now");
  React.useEffect(() => {
    const tick = setInterval(() => {
      const ms = Date.now() - sessionStart.current;
      const mins = Math.floor(ms / 60000);
      if (mins < 1) setElapsedLabel("just now");
      else if (mins === 1) setElapsedLabel("1 min");
      else if (mins < 60) setElapsedLabel(`${mins} min`);
      else setElapsedLabel(`${Math.floor(mins / 60)}h ${mins % 60}m`);
    }, 30_000);
    return () => clearInterval(tick);
  }, []);

  // Keyboard shortcuts. Esc → back to task. ? → toggle shortcuts overlay.
  // F → fullscreen toggle. Number keys 1-4 → timer presets.
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Don't hijack when the user is typing into an input.
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) {
        if (e.key === "Escape") (t as HTMLElement).blur();
        return;
      }
      if (e.key === "Escape") {
        router.push(`/tasks/${task.id}` as Route);
      } else if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
        e.preventDefault();
        setShowShortcuts((s) => !s);
      } else if (e.key === "f" || e.key === "F") {
        toggleFullscreen();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router, task.id]);

  function toggleFullscreen() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => undefined);
      setIsFullscreen(true);
    } else {
      document.exitFullscreen?.().catch(() => undefined);
      setIsFullscreen(false);
    }
  }

  return (
    <main className="relative min-h-dvh overflow-hidden text-white">
      <BackgroundFX />

      {/* Top bar — minimal: back + fullscreen + shortcut hint */}
      <TopBar
        taskId={task.id}
        isFullscreen={isFullscreen}
        toggleFullscreen={toggleFullscreen}
        onShortcuts={() => setShowShortcuts(true)}
      />

      <div className="relative z-10 grid grid-cols-[280px_minmax(0,1fr)_320px] max-xl:grid-cols-[240px_minmax(0,1fr)_280px] max-lg:grid-cols-1 max-md:grid-cols-1 gap-8 max-md:gap-5 px-10 max-md:px-4 pt-24 pb-16 max-w-[1600px] mx-auto">
        {/* LEFT — Pomodoro timer */}
        <motion.aside
          initial={{ opacity: 0, x: -16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.15, ease: [0.2, 0.7, 0.3, 1] }}
        >
          <FocusTimer />
        </motion.aside>

        {/* CENTER — task hero */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.05, ease: [0.2, 0.7, 0.3, 1] }}
          className="min-w-0"
        >
          <TaskHero task={task} elapsedLabel={elapsedLabel} />
        </motion.div>

        {/* RIGHT — quick actions */}
        <motion.aside
          initial={{ opacity: 0, x: 16 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.5, delay: 0.2, ease: [0.2, 0.7, 0.3, 1] }}
        >
          <QuickActions
            task={task}
            statusLabels={statusLabels}
            statusTones={statusTones}
            isAdmin={isAdmin}
          />
        </motion.aside>
      </div>

      {/* Shortcuts overlay */}
      <AnimatePresence>
        {showShortcuts && (
          <ShortcutsOverlay onClose={() => setShowShortcuts(false)} />
        )}
      </AnimatePresence>

      {/* Floating "? for shortcuts" hint, bottom-right */}
      <button
        type="button"
        onClick={() => setShowShortcuts(true)}
        className="fixed bottom-5 right-5 z-30 inline-flex items-center gap-1.5 rounded-full px-3.5 py-2 text-[12px] font-semibold backdrop-blur transition-all hover:-translate-y-px"
        style={{
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.14)",
          color: "rgba(255,255,255,0.8)",
        }}
      >
        <Keyboard size={13} strokeWidth={2.2} />
        Shortcuts
        <kbd
          className="ml-1 rounded-md px-1.5 py-0.5 text-[10px] font-bold tabular-nums"
          style={{
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.18)",
          }}
        >
          ?
        </kbd>
      </button>
    </main>
  );
}

/* ─────────────────────────────────────────────────────── Background ─ */

function BackgroundFX() {
  return (
    <>
      {/* Base gradient — warm-dark, mirrors login + projects hero */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          background:
            "radial-gradient(ellipse 100% 80% at 85% 110%, rgba(225, 6, 0, 0.45), transparent 55%), radial-gradient(ellipse 60% 60% at 10% 0%, rgba(168, 4, 0, 0.18), transparent 60%), radial-gradient(ellipse 60% 50% at 50% 50%, rgba(168, 85, 247, 0.08), transparent 70%), linear-gradient(135deg, #0E0B0A 0%, #1A0F0C 50%, #0B0708 100%)",
        }}
      />

      {/* Dot grid */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 opacity-[0.08]"
        style={{
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.5) 1px, transparent 1px)",
          backgroundSize: "32px 32px",
        }}
      />

      {/* Film grain */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 opacity-[0.05] mix-blend-overlay pointer-events-none"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 200 200'><filter id='n'><feTurbulence baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")",
        }}
      />

      {/* Soft drifting aura orbs */}
      <motion.div
        aria-hidden
        className="absolute -z-10 rounded-full pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{
          opacity: 0.6,
          x: [0, 30, -10, 0],
          y: [0, -20, 25, 0],
        }}
        transition={{
          opacity: { duration: 2 },
          x: { duration: 22, repeat: Infinity, ease: "easeInOut" },
          y: { duration: 18, repeat: Infinity, ease: "easeInOut" },
        }}
        style={{
          top: "-120px",
          left: "20%",
          width: "440px",
          height: "440px",
          background:
            "radial-gradient(circle, rgba(225, 6, 0, 0.25) 0%, transparent 60%)",
          filter: "blur(40px)",
        }}
      />
      <motion.div
        aria-hidden
        className="absolute -z-10 rounded-full pointer-events-none"
        initial={{ opacity: 0 }}
        animate={{
          opacity: 0.5,
          x: [0, -40, 20, 0],
          y: [0, 30, -15, 0],
        }}
        transition={{
          opacity: { duration: 2 },
          x: { duration: 26, repeat: Infinity, ease: "easeInOut" },
          y: { duration: 24, repeat: Infinity, ease: "easeInOut" },
        }}
        style={{
          bottom: "-160px",
          right: "10%",
          width: "560px",
          height: "560px",
          background:
            "radial-gradient(circle, rgba(168, 85, 247, 0.18) 0%, transparent 60%)",
          filter: "blur(50px)",
        }}
      />
    </>
  );
}

/* ────────────────────────────────────────────────────────── Top bar ─ */

function TopBar({
  taskId,
  isFullscreen,
  toggleFullscreen,
  onShortcuts: _onShortcuts,
}: {
  taskId: string;
  isFullscreen: boolean;
  toggleFullscreen: () => void;
  onShortcuts: () => void;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.2, 0.7, 0.3, 1] }}
      className="absolute top-0 inset-x-0 z-20 px-8 max-md:px-4 py-5 flex items-center justify-between gap-4"
    >
      <div className="flex items-center gap-3">
        <Link
          href={`/tasks/${taskId}` as Route}
          className="inline-flex items-center gap-2 rounded-full px-3.5 py-2 text-[13px] font-semibold backdrop-blur transition-all hover:-translate-y-px"
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.14)",
            color: "rgba(255,255,255,0.92)",
          }}
        >
          <ArrowLeft size={14} strokeWidth={2.4} />
          Back
          <kbd
            className="ml-1 rounded px-1.5 py-0.5 text-[10px] font-bold"
            style={{
              background: "rgba(255,255,255,0.10)",
              color: "rgba(255,255,255,0.7)",
            }}
          >
            Esc
          </kbd>
        </Link>
        <span
          className="inline-flex items-center gap-2"
          style={{
            color: "rgba(255,255,255,0.55)",
            fontSize: 11.5,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            fontWeight: 700,
            fontFamily: "var(--font-mono)",
          }}
        >
          <span
            aria-hidden
            className="inline-block size-1.5 rounded-full"
            style={{
              background: "#E10600",
              boxShadow: "0 0 8px rgba(225, 6, 0, 0.75)",
            }}
          />
          Focus mode
        </span>
      </div>

      <button
        type="button"
        onClick={toggleFullscreen}
        aria-label={isFullscreen ? "Exit fullscreen" : "Enter fullscreen"}
        className="inline-flex items-center justify-center size-9 rounded-full backdrop-blur transition-all hover:-translate-y-px"
        style={{
          background: "rgba(255,255,255,0.06)",
          border: "1px solid rgba(255,255,255,0.14)",
          color: "rgba(255,255,255,0.85)",
        }}
        title="Fullscreen (F)"
      >
        {isFullscreen ? (
          <Minimize2 size={15} strokeWidth={2.2} />
        ) : (
          <Maximize2 size={15} strokeWidth={2.2} />
        )}
      </button>
    </motion.div>
  );
}

/* ───────────────────────────────────────────────────────── Hero ─ */

function TaskHero({ task, elapsedLabel }: { task: TaskShape; elapsedLabel: string }) {
  const overdue =
    task.dueAt.getTime() < Date.now() &&
    !["approved", "cancelled", "transferred"].includes(task.status);

  return (
    <article className="max-w-[820px]">
      {/* Eyebrow chips */}
      <div className="flex flex-wrap items-center gap-2 mb-6">
        {task.subject && (
          <Chip>{task.subject}</Chip>
        )}
        <Chip muted>{PRIORITY_LABELS[task.priority]}</Chip>
        <span
          className="inline-flex items-center gap-1.5"
          style={{
            color: overdue ? "rgba(255, 130, 130, 0.95)" : "rgba(255,255,255,0.55)",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          <Calendar size={13} strokeWidth={2.4} />
          {overdue ? "Overdue · " : "Due "}
          {format(task.dueAt, "EEE, MMM d")}
        </span>
      </div>

      {/* Title — big, but not movie-poster */}
      <h1
        style={{
          fontFamily: "var(--font-serif)",
          fontStyle: "italic",
          fontWeight: 500,
          fontSize: "clamp(36px, 4.2vw, 56px)",
          lineHeight: 1.08,
          letterSpacing: "-0.022em",
          color: "#fff",
          textWrap: "balance",
          textShadow: "0 2px 12px rgba(0,0,0,0.4)",
        }}
      >
        {task.title}
      </h1>

      {/* Description body — readable prose */}
      {task.description && (
        <p
          className="mt-7 whitespace-pre-wrap"
          style={{
            color: "rgba(255,255,255,0.86)",
            fontSize: 18,
            lineHeight: 1.62,
            maxWidth: "68ch",
            letterSpacing: "-0.003em",
          }}
        >
          {task.description}
        </p>
      )}

      {/* Internal notes as a glass card */}
      {task.notes && (
        <div
          className="mt-7 rounded-section px-6 py-5"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.10)",
            backdropFilter: "blur(8px)",
            maxWidth: "68ch",
          }}
        >
          <div
            className="mb-2.5"
            style={{
              color: "rgba(255,255,255,0.55)",
              fontSize: 11.5,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              fontWeight: 700,
            }}
          >
            Internal notes
          </div>
          <p
            className="whitespace-pre-wrap"
            style={{
              color: "rgba(255,255,255,0.82)",
              fontSize: 16,
              lineHeight: 1.6,
            }}
          >
            {task.notes}
          </p>
        </div>
      )}

      {/* Attribution + session-elapsed */}
      <div
        className="mt-9 pt-6 flex flex-wrap items-center gap-x-8 gap-y-3"
        style={{ borderTop: "1px solid rgba(255,255,255,0.08)" }}
      >
        <Attribution label="Doer" name={task.doerName} />
        <Attribution label="Initiator" name={task.initiatorName} />
        {task.creatorName && (
          <Attribution
            label="Created"
            name={task.creatorName}
            sub={formatDistanceToNow(task.updatedAt, { addSuffix: true })}
          />
        )}
        <span
          className="inline-flex items-center gap-2 ml-auto"
          style={{
            color: "rgba(255,255,255,0.55)",
            fontSize: 12,
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            fontWeight: 700,
          }}
        >
          <Clock size={13} strokeWidth={2.4} />
          Focused for {elapsedLabel}
        </span>
      </div>
    </article>
  );
}

function Chip({
  children,
  muted = false,
}: {
  children: React.ReactNode;
  muted?: boolean;
}) {
  return (
    <span
      className="inline-flex items-center rounded-full px-3 py-1.5"
      style={{
        background: muted ? "rgba(255,255,255,0.05)" : "rgba(225, 6, 0, 0.12)",
        color: muted ? "rgba(255,255,255,0.78)" : "rgba(255, 184, 184, 0.95)",
        border: muted
          ? "1px solid rgba(255,255,255,0.12)"
          : "1px solid rgba(225, 6, 0, 0.32)",
        fontSize: 12.5,
        fontWeight: 700,
        letterSpacing: "0.04em",
      }}
    >
      {children}
    </span>
  );
}

function Attribution({
  label,
  name,
  sub,
}: {
  label: string;
  name: string | null;
  sub?: string;
}) {
  if (!name) return null;
  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        className="inline-flex items-center justify-center size-7 rounded-full"
        style={{
          background: "rgba(255,255,255,0.08)",
          border: "1px solid rgba(255,255,255,0.16)",
          color: "rgba(255,255,255,0.85)",
        }}
      >
        <User size={12} strokeWidth={2.2} />
      </span>
      <span className="leading-tight">
        <span
          className="block"
          style={{
            color: "rgba(255,255,255,0.5)",
            fontSize: 10.5,
            letterSpacing: "0.16em",
            textTransform: "uppercase",
            fontWeight: 700,
          }}
        >
          {label}
        </span>
        <span
          className="block mt-0.5"
          style={{
            color: "#fff",
            fontSize: 14,
            fontWeight: 600,
          }}
        >
          {name}
          {sub && (
            <span
              style={{
                color: "rgba(255,255,255,0.5)",
                fontWeight: 400,
                marginLeft: 6,
                fontSize: 12.5,
              }}
            >
              · {sub}
            </span>
          )}
        </span>
      </span>
    </span>
  );
}

/* ─────────────────────────────────────────────── Focus timer (left) ─ */

function FocusTimer() {
  const [preset, setPreset] = React.useState<TimerPreset>(TIMER_PRESETS[0]!);
  const [state, setState] = React.useState<"idle" | "running" | "paused" | "done">("idle");
  const [remaining, setRemaining] = React.useState(preset.minutes * 60);
  const totalRef = React.useRef(preset.minutes * 60);

  // Reset remaining when preset changes (if not running).
  React.useEffect(() => {
    if (state === "idle") {
      setRemaining(preset.minutes * 60);
      totalRef.current = preset.minutes * 60;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset.id]);

  // Tick down once per second when running. Persist via setInterval +
  // local state — accurate enough for a focus timer; no wall-clock drift
  // correction since we're not building a stopwatch.
  React.useEffect(() => {
    if (state !== "running") return;
    const t = setInterval(() => {
      setRemaining((r) => {
        if (r <= 1) {
          setState("done");
          // Best-effort notify — fires once when the timer hits 0.
          if (typeof window !== "undefined" && "Notification" in window) {
            try {
              new Notification(`${preset.label} session complete`, {
                body: "Time's up — take a moment.",
              });
            } catch {
              /* ignore */
            }
          }
          return 0;
        }
        return r - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [state, preset.label]);

  const mins = Math.floor(remaining / 60);
  const secs = remaining % 60;
  const total = totalRef.current;
  const progress = total > 0 ? 1 - remaining / total : 0;

  // SVG ring math: stroke-dashoffset technique.
  const R = 78;
  const C = 2 * Math.PI * R;
  const offset = C * (1 - progress);

  function start() {
    setState("running");
    // Ask for notification permission on first start.
    if (typeof window !== "undefined" && "Notification" in window) {
      if (Notification.permission === "default") {
        Notification.requestPermission().catch(() => undefined);
      }
    }
  }
  function pause() {
    setState("paused");
  }
  function reset() {
    setState("idle");
    setRemaining(preset.minutes * 60);
    totalRef.current = preset.minutes * 60;
  }

  const accent = preset.kind === "break" ? "#10b981" : "#E10600";

  return (
    <div
      className="rounded-section px-6 py-7 relative overflow-hidden"
      style={{
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)",
        border: "1px solid rgba(255,255,255,0.10)",
        backdropFilter: "blur(12px)",
        boxShadow: "0 16px 40px rgba(0,0,0,0.30)",
      }}
    >
      <div
        className="mb-5 flex items-center gap-2"
        style={{
          color: "rgba(255,255,255,0.55)",
          fontSize: 11,
          letterSpacing: "0.22em",
          textTransform: "uppercase",
          fontWeight: 700,
          fontFamily: "var(--font-mono)",
        }}
      >
        {preset.kind === "break" ? (
          <Coffee size={12} strokeWidth={2.4} />
        ) : (
          <Zap size={12} strokeWidth={2.4} />
        )}
        {preset.kind === "break" ? "Break timer" : "Pomodoro"}
      </div>

      {/* Ring with central time */}
      <div className="relative mx-auto" style={{ width: 200, height: 200 }}>
        <svg width="200" height="200" viewBox="0 0 200 200">
          <circle
            cx="100"
            cy="100"
            r={R}
            stroke="rgba(255,255,255,0.10)"
            strokeWidth={6}
            fill="none"
          />
          <motion.circle
            cx="100"
            cy="100"
            r={R}
            stroke={accent}
            strokeWidth={6}
            fill="none"
            strokeLinecap="round"
            transform="rotate(-90 100 100)"
            strokeDasharray={C}
            animate={{
              strokeDashoffset: offset,
              filter: state === "running"
                ? `drop-shadow(0 0 8px ${accent})`
                : "none",
            }}
            transition={{ duration: 0.6, ease: "easeOut" }}
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span
            className="tabular-nums"
            style={{
              fontFamily: "var(--font-serif)",
              fontSize: 44,
              fontWeight: 500,
              fontStyle: "italic",
              color: "#fff",
              letterSpacing: "-0.02em",
              lineHeight: 1,
            }}
          >
            {String(mins).padStart(2, "0")}:{String(secs).padStart(2, "0")}
          </span>
          <span
            className="mt-1"
            style={{
              color: "rgba(255,255,255,0.55)",
              fontSize: 11,
              letterSpacing: "0.18em",
              textTransform: "uppercase",
              fontWeight: 700,
            }}
          >
            {state === "done" ? "Complete" : state === "running" ? "Running" : state === "paused" ? "Paused" : preset.label}
          </span>
        </div>
      </div>

      {/* Controls */}
      <div className="mt-6 flex items-center justify-center gap-2">
        {state !== "running" ? (
          <button
            type="button"
            onClick={start}
            disabled={state === "done"}
            className="inline-flex items-center gap-1.5 rounded-pill px-4 py-2 text-[13px] font-bold text-white disabled:opacity-40 transition-all hover:-translate-y-px"
            style={{
              background: `linear-gradient(135deg, ${accent}, ${accent}dd)`,
              boxShadow: `0 8px 20px -8px ${accent}80`,
            }}
          >
            <Play size={14} strokeWidth={2.6} fill="currentColor" />
            {state === "paused" ? "Resume" : "Start"}
          </button>
        ) : (
          <button
            type="button"
            onClick={pause}
            className="inline-flex items-center gap-1.5 rounded-pill px-4 py-2 text-[13px] font-bold transition-all hover:-translate-y-px"
            style={{
              background: "rgba(255,255,255,0.10)",
              border: "1px solid rgba(255,255,255,0.20)",
              color: "#fff",
            }}
          >
            <Pause size={14} strokeWidth={2.6} fill="currentColor" />
            Pause
          </button>
        )}
        <button
          type="button"
          onClick={reset}
          aria-label="Reset"
          className="size-9 inline-flex items-center justify-center rounded-full transition-all hover:-translate-y-px"
          style={{
            background: "rgba(255,255,255,0.06)",
            border: "1px solid rgba(255,255,255,0.14)",
            color: "rgba(255,255,255,0.78)",
          }}
        >
          <RotateCcw size={13} strokeWidth={2.4} />
        </button>
      </div>

      {/* Preset switcher */}
      <div className="mt-6 grid grid-cols-4 gap-1.5">
        {TIMER_PRESETS.map((p) => {
          const active = p.id === preset.id;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                setPreset(p);
                setState("idle");
              }}
              className="rounded-md py-2 text-[11px] font-bold transition-all"
              style={{
                background: active
                  ? "rgba(255,255,255,0.12)"
                  : "rgba(255,255,255,0.03)",
                border: active
                  ? "1px solid rgba(255,255,255,0.22)"
                  : "1px solid rgba(255,255,255,0.08)",
                color: active ? "#fff" : "rgba(255,255,255,0.65)",
                letterSpacing: "0.04em",
              }}
            >
              {p.minutes}m
              <span
                className="block mt-0.5"
                style={{
                  fontSize: 9.5,
                  letterSpacing: "0.12em",
                  textTransform: "uppercase",
                  opacity: 0.7,
                }}
              >
                {p.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────── Quick actions (right) ─ */

function QuickActions({
  task,
  statusLabels,
  statusTones,
  isAdmin: _isAdmin,
}: {
  task: TaskShape;
  statusLabels: Record<TaskStatus, string>;
  statusTones: Record<TaskStatus, StatusColorToken>;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [comment, setComment] = React.useState("");
  const [commentSent, setCommentSent] = React.useState(false);

  function changeStatus(next: TaskStatus) {
    startTransition(async () => {
      const res = await setTaskStatus(
        task.id,
        next,
        task.updatedAt.toISOString(),
      );
      if (!res.ok) {
        fireToast({
          message: res.error === "stale" ? "Task was updated elsewhere — refreshing." : res.message ?? "Could not update status.",
        });
        if (res.error === "stale") router.refresh();
        return;
      }
      fireToast({ message: `Status set to ${statusLabels[next]}.` });
      router.refresh();
    });
  }

  function postComment(e: React.FormEvent) {
    e.preventDefault();
    if (!comment.trim()) return;
    startTransition(async () => {
      const res = await addComment(task.id, { body: comment });
      if (!res.ok) {
        fireToast({
          message: res.error === "forbidden" ? "You don't have permission to comment." : res.message ?? "Comment failed.",
        });
        return;
      }
      fireToast({ message: "Comment posted." });
      setComment("");
      setCommentSent(true);
      setTimeout(() => setCommentSent(false), 1200);
      router.refresh();
    });
  }

  const currentTone = statusTones[task.status] ?? "amber";

  return (
    <div className="flex flex-col gap-4">
      {/* Mark done — primary action */}
      <button
        type="button"
        onClick={() => changeStatus("done")}
        disabled={pending || task.status === "done"}
        className="group relative w-full rounded-section overflow-hidden text-left px-5 py-5 disabled:opacity-50 transition-all hover:-translate-y-px"
        style={{
          background: "linear-gradient(135deg, #10b981 0%, #047857 100%)",
          boxShadow: "0 14px 32px -12px rgba(16, 185, 129, 0.45), inset 0 1px 0 rgba(255,255,255,0.18)",
          border: "1px solid rgba(16, 185, 129, 0.55)",
        }}
      >
        <div className="flex items-center gap-3">
          <span
            className="inline-flex items-center justify-center size-10 rounded-xl"
            style={{
              background: "rgba(255,255,255,0.18)",
              border: "1px solid rgba(255,255,255,0.24)",
            }}
          >
            <Check size={18} strokeWidth={2.8} />
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-white" style={{ fontSize: 15, fontWeight: 700, letterSpacing: "-0.005em" }}>
              {task.status === "done" ? "Already done" : "Mark as done"}
            </span>
            <span className="block mt-0.5" style={{ color: "rgba(255,255,255,0.85)", fontSize: 12.5 }}>
              Lock the work as complete
            </span>
          </span>
        </div>
      </button>

      {/* Status quick switcher */}
      <div
        className="rounded-section px-5 py-5"
        style={{
          background: "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)",
          border: "1px solid rgba(255,255,255,0.10)",
          backdropFilter: "blur(12px)",
        }}
      >
        <div
          className="mb-3"
          style={{
            color: "rgba(255,255,255,0.55)",
            fontSize: 11,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            fontWeight: 700,
            fontFamily: "var(--font-mono)",
          }}
        >
          Status
        </div>
        <div
          className="flex items-center gap-2 px-3 py-2.5 rounded-pill"
          style={{
            background: `color-mix(in srgb, var(--color-${currentTone}) 15%, transparent)`,
            border: `1px solid color-mix(in srgb, var(--color-${currentTone}) 35%, transparent)`,
          }}
        >
          <span
            aria-hidden
            className="inline-block size-2 rounded-full"
            style={{
              background: `var(--color-${currentTone})`,
              boxShadow: `0 0 8px var(--color-${currentTone})`,
            }}
          />
          <span style={{ color: "#fff", fontSize: 14, fontWeight: 700, letterSpacing: "-0.005em" }}>
            {statusLabels[task.status]}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1.5 mt-3">
          {(
            [
              "initiated",
              "follow_up",
              "need_info",
              "on_hold",
            ] as TaskStatus[]
          )
            .filter((s) => s !== task.status)
            .slice(0, 4)
            .map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => changeStatus(s)}
                disabled={pending}
                className="rounded-md py-2 text-[11.5px] font-semibold transition-all hover:-translate-y-px disabled:opacity-40"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(255,255,255,0.10)",
                  color: "rgba(255,255,255,0.82)",
                  letterSpacing: "0.02em",
                }}
              >
                {statusLabels[s]}
              </button>
            ))}
        </div>
      </div>

      {/* Quick comment composer */}
      <form
        onSubmit={postComment}
        className="rounded-section px-5 py-5"
        style={{
          background: "linear-gradient(180deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)",
          border: "1px solid rgba(255,255,255,0.10)",
          backdropFilter: "blur(12px)",
        }}
      >
        <div
          className="mb-3"
          style={{
            color: "rgba(255,255,255,0.55)",
            fontSize: 11,
            letterSpacing: "0.22em",
            textTransform: "uppercase",
            fontWeight: 700,
            fontFamily: "var(--font-mono)",
          }}
        >
          Quick comment
        </div>
        <textarea
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="Note for the team…"
          rows={3}
          className="w-full resize-none outline-none px-3 py-2.5 rounded-md"
          style={{
            background: "rgba(0,0,0,0.20)",
            border: "1px solid rgba(255,255,255,0.10)",
            color: "#fff",
            fontSize: 13.5,
            lineHeight: 1.5,
          }}
        />
        <div className="mt-2.5 flex items-center justify-between">
          <span
            style={{
              color: "rgba(255,255,255,0.45)",
              fontSize: 11,
              fontFamily: "var(--font-mono)",
            }}
          >
            {comment.trim() ? `${comment.trim().length} char` : ""}
          </span>
          <button
            type="submit"
            disabled={pending || !comment.trim()}
            className="inline-flex items-center gap-1.5 rounded-pill px-3.5 py-1.5 text-[12.5px] font-bold transition-all hover:-translate-y-px disabled:opacity-40"
            style={{
              background: commentSent
                ? "linear-gradient(135deg, #10b981, #047857)"
                : "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
              color: "#fff",
              boxShadow: "0 6px 18px -8px rgba(225, 6, 0, 0.45)",
            }}
          >
            {commentSent ? (
              <>
                <Check size={12} strokeWidth={2.6} /> Sent
              </>
            ) : (
              <>
                <Send size={12} strokeWidth={2.4} /> Post
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}

/* ───────────────────────────────────────────────── Shortcuts modal ─ */

const SHORTCUTS = [
  { key: "Esc", desc: "Back to task" },
  { key: "F", desc: "Toggle fullscreen" },
  { key: "?", desc: "Show / hide this overlay" },
];

function ShortcutsOverlay({ onClose }: { onClose: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-40 flex items-center justify-center px-4"
      style={{
        background: "rgba(0,0,0,0.55)",
        backdropFilter: "blur(8px)",
      }}
      onClick={onClose}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 12 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 12 }}
        transition={{ duration: 0.25, ease: [0.2, 0.7, 0.3, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="rounded-section overflow-hidden max-w-[440px] w-full"
        style={{
          background:
            "linear-gradient(180deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%)",
          border: "1px solid rgba(255,255,255,0.16)",
          backdropFilter: "blur(20px)",
          boxShadow: "0 32px 80px rgba(0,0,0,0.5)",
        }}
      >
        <div className="px-6 py-5 flex items-center justify-between border-b" style={{ borderColor: "rgba(255,255,255,0.10)" }}>
          <div className="flex items-center gap-2.5">
            <Keyboard size={16} strokeWidth={2.2} style={{ color: "rgba(255,255,255,0.85)" }} />
            <span
              style={{
                color: "#fff",
                fontSize: 14,
                fontWeight: 700,
                letterSpacing: "0.04em",
              }}
            >
              Keyboard shortcuts
            </span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex items-center justify-center size-7 rounded-full"
            style={{
              background: "rgba(255,255,255,0.06)",
              border: "1px solid rgba(255,255,255,0.12)",
              color: "rgba(255,255,255,0.7)",
            }}
          >
            <X size={13} strokeWidth={2.4} />
          </button>
        </div>
        <div className="px-6 py-5 flex flex-col gap-3">
          {SHORTCUTS.map((s) => (
            <div key={s.key} className="flex items-center justify-between">
              <span style={{ color: "rgba(255,255,255,0.82)", fontSize: 13.5 }}>
                {s.desc}
              </span>
              <kbd
                className="rounded px-2.5 py-1 text-[12px] font-bold tabular-nums"
                style={{
                  background: "rgba(255,255,255,0.10)",
                  border: "1px solid rgba(255,255,255,0.18)",
                  color: "#fff",
                  fontFamily: "var(--font-mono)",
                }}
              >
                {s.key}
              </kbd>
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}
