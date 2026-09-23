"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { LogIn, Loader2, CheckCircle2 } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { joinSession } from "@/app/(app)/training/calendar/actions";

const ATTENDED = ["attended", "present", "late", "partial", "left_halfway", "completed_via_recording"];

/** An invited attendee joins the live training — records their check-in time. */
export function JoinSessionButton({ sessionId, status }: { sessionId: string; status: string }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const joined = ATTENDED.includes(status);

  async function onJoin() {
    setBusy(true);
    const res = await joinSession(sessionId);
    setBusy(false);
    if (!res.ok) return fireToast({ message: res.error, type: "error" });
    fireToast({ message: "Joined — attendance recorded.", type: "success" });
    router.refresh();
  }

  if (joined) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-[14px] font-bold" style={{ background: "color-mix(in srgb, var(--color-green) 14%, transparent)", color: "var(--color-green-deep)" }}>
        <CheckCircle2 size={16} /> Attended
      </span>
    );
  }

  return (
    <button type="button" onClick={onJoin} disabled={busy}
      className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[14px] font-bold text-white disabled:opacity-60"
      style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}>
      {busy ? <Loader2 size={16} className="animate-spin" /> : <LogIn size={16} />} Join Training
    </button>
  );
}
