"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, X } from "lucide-react";
import { superAdminQuickPunch } from "@/app/(app)/attendance/actions";
import { fireToast } from "@/lib/toast";

/**
 * Super-admin-only inline "Check in" / "Check out" control on the team
 * attendance list (today only). Collapsed it's a small pill; tapping reveals a
 * time field prefilled with the current time so the super-admin sets the real
 * arrival/leave time, then confirms. Stamps the punch via superAdminQuickPunch
 * (which re-enforces super-admin + today server-side).
 */
export function TeamPunchButton({
  employeeId,
  logDate,
  kind,
  name,
  tz,
}: {
  employeeId: string;
  logDate: string;
  kind: "in" | "out";
  name: string;
  tz: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [time, setTime] = React.useState("");
  const [pending, startTransition] = React.useTransition();

  const label = kind === "in" ? "Check in" : "Check out";

  function begin() {
    setTime(nowInTz(tz));
    setOpen(true);
  }

  function submit() {
    if (!/^\d{2}:\d{2}$/.test(time)) {
      fireToast({ message: "Enter a valid time.", type: "error" });
      return;
    }
    startTransition(async () => {
      const res = await superAdminQuickPunch({ employeeId, logDate, kind, timeHHmm: time });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({
        message: `${name} ${kind === "in" ? "checked in" : "checked out"} at ${time}.`,
      });
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={begin}
        className="rounded-pill border px-2.5 py-1 text-[12.5px] font-semibold text-ink-soft transition-colors hover:bg-surface-soft hover:text-ink-strong"
        style={{ borderColor: "var(--color-hairline-strong)" }}
      >
        {label}
      </button>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5">
      <input
        type="time"
        autoFocus
        value={time}
        disabled={pending}
        onChange={(e) => setTime(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") setOpen(false);
        }}
        aria-label={`${label} time for ${name}`}
        className="rounded-md border px-2 py-1 text-[13px] tabular-nums bg-white"
        style={{ borderColor: "var(--color-hairline-strong)" }}
      />
      <button
        type="button"
        onClick={submit}
        disabled={pending}
        aria-label={`Confirm ${label.toLowerCase()}`}
        className="inline-flex size-7 items-center justify-center rounded-md text-white transition-transform active:scale-95 disabled:opacity-60"
        style={{ background: "var(--color-altus-red)" }}
      >
        <Check size={15} strokeWidth={2.6} />
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        disabled={pending}
        aria-label="Cancel"
        className="inline-flex size-7 items-center justify-center rounded-md text-ink-soft transition-colors hover:bg-surface-soft disabled:opacity-60"
      >
        <X size={15} strokeWidth={2.4} />
      </button>
    </span>
  );
}

/** Current wall-clock "HH:mm" in the given IANA timezone. */
function nowInTz(tz: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: tz,
  }).format(new Date());
}
