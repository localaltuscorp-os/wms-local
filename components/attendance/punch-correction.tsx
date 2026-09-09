"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Pencil, Check, X, Loader2, Clock3 } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { correctOwnPunch, ownPunchCorrectionWindow } from "@/app/(app)/attendance/actions";

/**
 * "I mistyped my check-in" — the employee's own 15-minute correction control.
 *
 * ── THIS COMPONENT ENFORCES NOTHING ────────────────────────────────────────
 * The countdown here is a COURTESY. It exists so somebody who has two minutes
 * left can see that, and so the control stops being offered once it would only
 * produce a refusal. The rule itself lives in `authorizeAttendanceMutation`,
 * which re-derives the window from the punch's stored `logged_at` and the server
 * clock on every call. A tampered timer, a paused tab, a hand-written POST — all
 * get the same answer from the server.
 *
 * That is why the remaining time is FETCHED rather than computed from a prop:
 * the server is asked how long is left, and the browser only renders it. A
 * client-side `Date.now()` against a server-rendered punch time would drift with
 * the user's own clock, and would disagree with the decision that actually
 * matters.
 */
export function PunchCorrection({
  logDate,
  kind,
  label,
}: {
  logDate: string;
  kind: "in" | "out";
  /** What the punch currently reads, e.g. "10:00". */
  label: string;
}) {
  const router = useRouter();
  const [secondsLeft, setSecondsLeft] = React.useState<number | null>(null);
  const [open, setOpen] = React.useState(false);
  const [time, setTime] = React.useState(label);
  const [busy, setBusy] = React.useState(false);

  // Ask the SERVER how long is left. Once, on mount — the local countdown below
  // then ticks that number down, so the display stays live without one request
  // per second.
  React.useEffect(() => {
    let cancelled = false;
    ownPunchCorrectionWindow({ kind, logDate })
      .then((r) => {
        if (cancelled || !r.ok) return;
        setSecondsLeft(r.open ? r.secondsRemaining : 0);
        if (r.currentHHmm) setTime(r.currentHHmm);
      })
      .catch(() => {
        /* the control simply does not appear; the action would refuse anyway */
      });
    return () => {
      cancelled = true;
    };
  }, [kind, logDate]);

  React.useEffect(() => {
    if (secondsLeft === null || secondsLeft <= 0) return;
    const t = setInterval(() => setSecondsLeft((s) => (s === null ? null : Math.max(0, s - 1))), 1000);
    return () => clearInterval(t);
  }, [secondsLeft]);

  if (secondsLeft === null || secondsLeft <= 0) return null;

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");

  async function save() {
    if (busy) return;
    setBusy(true);
    const res = await correctOwnPunch({ kind, timeHHmm: time, logDate });
    setBusy(false);
    if (!res.ok) return fireToast({ message: res.error, type: "error" });
    fireToast({ message: "Punch corrected.", type: "success" });
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-1.5 rounded-pill border border-hairline-strong bg-white px-2.5 py-1 text-[11.5px] font-bold text-ink-muted transition-colors hover:border-altus-red hover:text-ink-strong"
        title={`You can correct this ${kind === "in" ? "check-in" : "check-out"} for another ${mm}:${ss}`}
      >
        <Pencil size={11} /> Fix
        <span className="tabular-nums opacity-70">
          {mm}:{ss}
        </span>
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <Clock3 size={12} className="text-ink-subtle" />
      <input
        type="time"
        value={time}
        onChange={(e) => setTime(e.target.value)}
        className="rounded-lg border border-hairline-strong bg-white px-2 py-1 text-[12px] font-bold tabular-nums text-ink-strong outline-none focus:border-altus-red"
      />
      <button
        type="button"
        onClick={save}
        disabled={busy}
        className="grid size-6 place-items-center rounded-lg text-white disabled:opacity-60"
        style={{ background: "var(--color-green-deep, #15803d)" }}
        aria-label="Save correction"
      >
        {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        className="grid size-6 place-items-center rounded-lg border border-hairline-strong text-ink-muted"
        aria-label="Cancel"
      >
        <X size={12} />
      </button>
    </span>
  );
}
