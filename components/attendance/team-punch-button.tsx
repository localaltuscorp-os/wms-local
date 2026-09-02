"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, X, LogIn, LogOut } from "lucide-react";
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

  const label = kind === "in" ? "Check In" : "Check Out";
  const Icon = kind === "in" ? LogIn : LogOut;
  const accent = kind === "in" ? "#16a34a" : "var(--color-altus-red)";

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
        className="brand-btn wg-btn inline-flex items-center gap-1.5 rounded-pill px-3 py-1.5 text-[12.5px] font-bold transition-colors"
        style={{
          color: accent,
          boxShadow: `inset 0 0 0 1.5px color-mix(in srgb, ${accent} 35%, transparent)`,
          background: `color-mix(in srgb, ${accent} 5%, transparent)`,
        }}
      >
        <Icon size={12} strokeWidth={2.6} aria-hidden />
        {label}
      </button>
    );
  }

  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-xl p-1"
      style={{
        background: "var(--color-surface-soft)",
        boxShadow: "inset 0 0 0 1px var(--color-hairline)",
      }}
    >
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
        className="rounded-lg border-0 bg-white px-2 py-1 text-[13px] font-semibold tabular-nums outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-altus-red)]"
        style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)" }}
      />
      <button
        type="button"
        onClick={submit}
        disabled={pending}
        aria-label={`Confirm ${label.toLowerCase()}`}
        className="inline-flex size-7 items-center justify-center rounded-lg text-white transition-transform active:scale-95 disabled:opacity-60"
        style={{
          background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
          boxShadow: "0 4px 10px -4px rgba(225,6,0,0.5)",
        }}
      >
        <Check size={15} strokeWidth={2.6} />
      </button>
      <button
        type="button"
        onClick={() => setOpen(false)}
        disabled={pending}
        aria-label="Cancel"
        className="inline-flex size-7 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-white hover:text-ink-strong disabled:opacity-60"
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
