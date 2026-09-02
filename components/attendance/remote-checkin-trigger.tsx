"use client";

import * as React from "react";
import { MapPinned } from "lucide-react";
import { RemoteCheckInDialog } from "./remote-checkin-dialog";

/** "Working remotely?" entry point — opens the evidence-backed remote check-in. */
export function RemoteCheckInTrigger({ hasCheckedIn, hasCheckedOut }: { hasCheckedIn: boolean; hasCheckedOut: boolean }) {
  const [open, setOpen] = React.useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="wg-btn flex w-full items-center gap-3 rounded-2xl bg-surface-card px-5 py-3.5 text-left transition hover:-translate-y-px"
        style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline), 0 8px 24px -18px rgba(15,23,42,0.3)" }}
      >
        <span className="inline-grid size-10 shrink-0 place-items-center rounded-xl text-white" style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}>
          <MapPinned size={19} strokeWidth={2.3} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[14.5px] font-black text-ink-strong">Working from home or on-site?</span>
          <span className="block text-[12.5px] font-medium text-ink-subtle">Log attendance with location, reason & a photo</span>
        </span>
        <span className="shrink-0 rounded-pill px-3 py-1.5 text-[12.5px] font-bold text-white" style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}>Log It →</span>
      </button>
      {open && <RemoteCheckInDialog hasCheckedIn={hasCheckedIn} hasCheckedOut={hasCheckedOut} onClose={() => setOpen(false)} />}
    </>
  );
}
