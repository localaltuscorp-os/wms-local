"use client";

import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import { NOTIFICATION_KINDS, type NotificationKind } from "@/db/schema";
import {
  NOTIFICATION_CHANNELS,
  type NotificationChannel,
  type NotificationMatrix,
} from "@/lib/notifications/resolve-channels";
import { updateNotificationMatrixAction } from "@/app/(admin)/admin/settings/actions";

const KIND_LABEL: Record<NotificationKind, string> = {
  task_assigned:  "Task assigned",
  task_initiated: "Task initiated",
  status_changed: "Status changed",
  approved:       "Approved",
  declined:       "Not approved",
  reassigned:     "Reassigned",
  transferred:    "Transferred",
  cancelled:      "Cancelled",
  commented:      "Comment posted",
  overdue_digest: "Daily overdue digest",
  weekly_goals_assigned:      "Weekly goals — Monday briefing",
  weekly_goals_fill_reminder: "Weekly goals — fill % done",
  weekly_goals_incomplete:    "Weekly goals — unmarked nudge",
  // Attendance Phase A — inbox-only kinds.
  attendance_late:        "Attendance: late check-in",
  attendance_late_waived: "Attendance: late waived",
  attendance_half_day:    "Attendance: half day",
  attendance_device:      "Attendance: new device",
  attendance_late_deduction: "Attendance: late deduction",
};

const CHANNEL_LABEL: Record<NotificationChannel, string> = {
  email:    "Email",
  slack:    "Slack",
  whatsapp: "WhatsApp",
  push:     "Push",
};

export function SettingsTabNotifications({
  initial,
}: {
  initial: NotificationMatrix;
}) {
  const [matrix, setMatrix] = useState<NotificationMatrix>(initial);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(kind: NotificationKind, channel: NotificationChannel) {
    setMatrix((prev) => {
      const current = new Set(prev[kind] ?? [...NOTIFICATION_CHANNELS]);
      if (current.has(channel)) current.delete(channel);
      else current.add(channel);
      return { ...prev, [kind]: Array.from(current) };
    });
  }

  function save() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const r = await updateNotificationMatrixAction({ matrix });
      if (r.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
      } else {
        setError(r.error);
      }
    });
  }

  return (
    <div className="max-w-3xl">
      <h2 className="text-display-xs mb-2">Notifications</h2>
      <p className="text-body text-ink-subtle mb-6">
        Pick which channels deliver each kind of notification. Empty rows
        mean that event is silent.
      </p>

      <div className="overflow-x-auto rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white/70 backdrop-blur-sm">
        <table className="w-full min-w-[480px] text-sm">
          <thead>
            <tr className="border-b border-[rgba(15,23,42,0.06)] text-left">
              <th className="px-4 py-3 text-[10px] font-bold uppercase tracking-[0.18em] text-ink-subtle">
                Event
              </th>
              {NOTIFICATION_CHANNELS.map((c) => (
                <th
                  key={c}
                  className="px-3 py-3 text-center text-[10px] font-bold uppercase tracking-[0.18em] text-ink-subtle"
                >
                  {CHANNEL_LABEL[c]}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {NOTIFICATION_KINDS.map((k, i) => {
              const active = new Set(matrix[k] ?? [...NOTIFICATION_CHANNELS]);
              return (
                <tr
                  key={k}
                  className={i % 2 ? "bg-[rgba(15,23,42,0.02)]" : ""}
                >
                  <td className="px-4 py-2">{KIND_LABEL[k]}</td>
                  {NOTIFICATION_CHANNELS.map((c) => (
                    <td key={c} className="px-3 py-2 text-center">
                      <input
                        type="checkbox"
                        checked={active.has(c)}
                        onChange={() => toggle(k, c)}
                        aria-label={`${KIND_LABEL[k]} via ${CHANNEL_LABEL[c]}`}
                      />
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={save}
          disabled={pending}
          className="inline-flex items-center gap-1.5 rounded-md bg-[var(--color-altus-red)] px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {pending ? "Saving…" : "Save changes"}
        </button>
        {saved && (
          <span className="inline-flex items-center gap-1 text-sm text-emerald-700">
            <Check className="h-4 w-4" /> Saved
          </span>
        )}
        {error && <span className="text-sm text-red-600">{error}</span>}
      </div>
    </div>
  );
}
