"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { LogIn, LogOut, Check, Trash2, X, Loader2, Pencil } from "lucide-react";
import { superAdminSetPunch } from "@/app/(app)/attendance/actions";
import { fireToast } from "@/lib/toast";

/**
 * Super-admin inline punch editor. Shows the current check-in/out (or "set"),
 * and on click opens a small time editor (rendered in a PORTAL with fixed
 * positioning so it never clips inside the scrolling roster or overlaps rows) to
 * SET/REPLACE or CLEAR the punch for that employee + day — any date, past or
 * today. Calls `superAdminSetPunch` (guarded server-side) and refreshes. Used by
 * the Team roster (others) and the calendar day popover (own attendance).
 */
export function PunchEditControl({
  employeeId,
  logDate,
  kind,
  current,
  compact,
}: {
  employeeId: string;
  logDate: string;
  kind: "in" | "out";
  /** current time as "HH:mm" (24h) or null when there's no punch */
  current: string | null;
  compact?: boolean;
}) {
  const router = useRouter();
  const anchorRef = React.useRef<HTMLButtonElement>(null);
  const [open, setOpen] = React.useState(false);
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(null);
  const [time, setTime] = React.useState(current ?? (kind === "in" ? "10:00" : "19:00"));
  const [busy, setBusy] = React.useState(false);

  const POP_W = 196;
  const POP_H = 108;

  const place = React.useCallback(() => {
    const r = anchorRef.current?.getBoundingClientRect();
    if (!r) return;
    const above = r.bottom + POP_H + 8 > window.innerHeight;
    const left = Math.min(Math.max(8, r.right - POP_W), window.innerWidth - POP_W - 8);
    const top = above ? r.top - POP_H - 8 : r.bottom + 8;
    setPos({ top, left });
  }, []);

  function openEditor() {
    setTime(current ?? (kind === "in" ? "10:00" : "19:00"));
    place();
    setOpen(true);
  }

  // Reposition on resize; close on any scroll (so it never drifts off the chip).
  React.useEffect(() => {
    if (!open) return;
    const onScroll = () => setOpen(false);
    const onResize = () => place();
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onResize);
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("keydown", onKey);
    };
  }, [open, place]);

  const Icon = kind === "in" ? LogIn : LogOut;
  const accent = kind === "in" ? "#16a34a" : "#b91c1c";

  async function commit(clear: boolean) {
    if (busy) return;
    if (!clear && !/^\d{2}:\d{2}$/.test(time)) {
      fireToast({ message: "Pick a valid time.", type: "error" });
      return;
    }
    setBusy(true);
    const res = await superAdminSetPunch({ employeeId, logDate, kind, timeHHmm: clear ? null : time });
    setBusy(false);
    if (!res.ok) {
      fireToast({ message: res.error ?? "Couldn't save that.", type: "error" });
      return;
    }
    fireToast({ message: clear ? `Check-${kind} cleared.` : `Check-${kind} set to ${time}.` });
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      {current ? (
        <button
          ref={anchorRef}
          type="button"
          onClick={openEditor}
          className="group inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[12.5px] font-bold tabular-nums transition-colors"
          style={{ background: `color-mix(in srgb, ${accent} 9%, transparent)`, color: accent }}
          title={`Edit check-${kind}`}
        >
          <Icon size={12} strokeWidth={2.6} />
          {current}
          <Pencil size={11} strokeWidth={2.4} className="opacity-45 transition-opacity group-hover:opacity-90" />
        </button>
      ) : (
        <button
          ref={anchorRef}
          type="button"
          onClick={openEditor}
          className="inline-flex items-center gap-1 rounded-pill border border-dashed px-2.5 py-1 text-[12px] font-bold text-ink-subtle transition-colors hover:text-ink-strong"
          style={{ borderColor: "var(--color-hairline-strong)" }}
          title={`Set check-${kind}`}
        >
          <Icon size={12} strokeWidth={2.4} /> {compact ? "set" : `Set ${kind}`}
        </button>
      )}

      {open && pos && typeof document !== "undefined" &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[120]" onClick={() => setOpen(false)} aria-hidden />
            <div
              role="dialog"
              className="fixed z-[121] w-[196px] rounded-xl border border-hairline bg-surface-card p-2.5"
              style={{ top: pos.top, left: pos.left, boxShadow: "0 22px 50px -18px rgba(15,23,42,.6)" }}
              onClick={(e) => e.stopPropagation()}
            >
              <div className="mb-2 flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide" style={{ color: accent }}>
                <Icon size={12} strokeWidth={2.6} /> Check-{kind}
              </div>
              <div className="flex items-center gap-1.5">
                <input
                  type="time"
                  value={time}
                  autoFocus
                  onChange={(e) => setTime(e.target.value)}
                  disabled={busy}
                  className="h-8 flex-1 rounded-lg border border-hairline-strong bg-white px-2 text-[13px] font-semibold text-ink-strong outline-none focus:border-[var(--color-altus-red)]"
                />
                <button
                  type="button"
                  onClick={() => commit(false)}
                  disabled={busy}
                  aria-label="Save"
                  className="grid size-8 shrink-0 place-items-center rounded-lg text-white disabled:opacity-50"
                  style={{ background: "#15803d" }}
                >
                  {busy ? <Loader2 size={14} className="animate-spin" /> : <Check size={15} strokeWidth={2.8} />}
                </button>
              </div>
              <div className="mt-2 flex items-center justify-between">
                {current ? (
                  <button
                    type="button"
                    onClick={() => commit(true)}
                    disabled={busy}
                    className="inline-flex items-center gap-1 text-[11.5px] font-bold text-altus-red disabled:opacity-50"
                  >
                    <Trash2 size={12} strokeWidth={2.4} /> Clear
                  </button>
                ) : <span />}
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  className="inline-flex items-center gap-1 text-[11.5px] font-bold text-ink-subtle hover:text-ink-strong"
                >
                  <X size={12} strokeWidth={2.4} /> Cancel
                </button>
              </div>
            </div>
          </>,
          document.body,
        )}
    </>
  );
}
