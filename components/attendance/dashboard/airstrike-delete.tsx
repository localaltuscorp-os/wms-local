"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Trash2 } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { wipeAllAttendance } from "@/app/(app)/attendance/dashboard/actions";

function isTypingTarget(el: EventTarget | null): boolean {
  const t = el as HTMLElement | null;
  if (!t) return false;
  return (
    t.tagName === "INPUT" ||
    t.tagName === "TEXTAREA" ||
    t.tagName === "SELECT" ||
    Boolean(t.isContentEditable)
  );
}

/**
 * AIRSTRIKE — the hidden company-wide attendance reset.
 *
 * Nothing renders until a super-admin presses `*` on the report; the button
 * then sits beside Legend as plain "Delete". Pressing `*` again hides it, so an
 * accidental reveal is one keystroke away from being undone.
 *
 * Only ever mounted for super-admins (the page decides that), and the server
 * action re-checks it — this is a discoverability gate, never the guard.
 *
 * ── ONE CLICK, NO CONFIRMATION (changed 2026-08-31, on request) ─────────────
 * This used to open a dialog that kept its button disabled until the word
 * DELETE had been typed in full. That dialog is gone: the click wipes.
 *
 * Which makes `*` the ONLY thing between a stray click and every employee's
 * attendance history, for every month, irreversibly. Two things therefore
 * carry more weight than they used to and should not be quietly dropped: the
 * button stays hidden until deliberately revealed, and it refuses both a
 * second click and a re-hide while a wipe is in flight.
 */
export function AirstrikeDelete() {
  const router = useRouter();
  const [armed, setArmed] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  // Read inside the keydown listener, which is registered exactly once. Putting
  // `busy` in the dependency array would tear the listener down and re-add it
  // on every wipe.
  const busyRef = React.useRef(false);
  React.useEffect(() => {
    busyRef.current = busy;
  }, [busy]);

  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "*") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isTypingTarget(e.target)) return;
      e.preventDefault();
      // Never yank the button out from under a wipe that is already running.
      if (busyRef.current) return;
      setArmed((a) => !a);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function onDelete() {
    if (busy) return;
    setBusy(true);
    void (async () => {
      const res = await wipeAllAttendance();
      setBusy(false);
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }

      const punches = res.deleted.punches ?? 0;
      const total = Object.values(res.deleted).reduce((a, b) => a + b, 0);
      setArmed(false);

      // A skipped table is neither success nor failure: everything that exists
      // was cleared, but this database is behind the migrations in the tree.
      // Nothing else in the app will ever say so — the other readers of these
      // tables swallow the error and carry on — so it gets said here.
      const missing = res.skipped.length
        ? ` Absent from this database and skipped: ${res.skipped.join(", ")} — that schema is behind its migrations.`
        : "";

      fireToast({
        message: `Attendance reset — ${punches} ${punches === 1 ? "punch" : "punches"} and ${total} records deleted across every employee.${missing}`,
        type: res.skipped.length ? "info" : "success",
      });
      router.refresh();
    })();
  }

  if (!armed) return null;

  return (
    <button
      type="button"
      onClick={onDelete}
      disabled={busy}
      title="Delete every employee's attendance records — all months, irreversible"
      className="wg-btn inline-flex items-center gap-1.5 rounded-full border py-2 px-3.5 text-[13px] font-semibold transition-colors outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/60 focus-visible:ring-offset-1 disabled:opacity-50 disabled:cursor-not-allowed"
      style={{
        borderColor: "color-mix(in srgb, var(--color-red-deep) 35%, transparent)",
        background: "var(--color-red-bg)",
        color: "var(--color-red-deep)",
      }}
    >
      {busy ? (
        <Loader2 size={14} strokeWidth={2.2} className="animate-spin" />
      ) : (
        <Trash2 size={14} strokeWidth={2.2} />
      )}
      {busy ? "Deleting…" : "Delete"}
    </button>
  );
}
