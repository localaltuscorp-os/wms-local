"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarCheck2, Link2, Unlink, Loader2, RefreshCw } from "lucide-react";
import { fireToast } from "@/lib/toast";
import {
  disconnectGoogleCalendar,
  syncGoogleCalendarNow,
} from "@/app/(app)/profile/actions";

/**
 * Connect / disconnect a personal Google Calendar. When connected, tasks
 * assigned to this person automatically appear on their calendar.
 *
 * Connect is a full-page OAuth redirect (`/api/google/connect`); disconnect is
 * a server action. The `?google=…` query param (set by the OAuth callback)
 * surfaces a one-time status toast.
 */
export function GoogleCalendarCard({
  connected,
  email,
}: {
  connected: boolean;
  email: string | null;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, start] = React.useTransition();
  const [syncing, startSync] = React.useTransition();

  // Surface the OAuth callback result once, then clean the URL.
  React.useEffect(() => {
    const status = params.get("google");
    if (!status) return;
    const msg: Record<string, string> = {
      connected: "Google Calendar connected — your tasks will sync.",
      denied: "Google Calendar connection was cancelled.",
      error: "Couldn't connect Google Calendar. Please try again.",
      unconfigured: "Google Calendar isn't configured on the server yet.",
    };
    if (msg[status]) fireToast({ message: msg[status] });
    router.replace("/profile");
  }, [params, router]);

  function disconnect() {
    start(async () => {
      await disconnectGoogleCalendar();
      fireToast({ message: "Google Calendar disconnected." });
      router.refresh();
    });
  }

  function syncNow() {
    startSync(async () => {
      const res = await syncGoogleCalendarNow();
      if (!res.ok) {
        fireToast({ message: res.error });
        return;
      }
      fireToast({
        message:
          res.synced === 0
            ? "No active tasks to sync — nothing assigned to you right now."
            : `Synced ${res.synced} of ${res.attempted} task${res.attempted === 1 ? "" : "s"} to your calendar.`,
      });
    });
  }

  return (
    <div
      className="rounded-section bg-surface-card p-6 max-md:p-5"
      style={{ border: "1px solid var(--color-hairline)", boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}
    >
      <div className="flex items-start gap-3.5">
        <span
          className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl"
          style={{
            background: "color-mix(in srgb, var(--color-blue) 12%, transparent)",
            color: "var(--color-blue-deep)",
          }}
        >
          <CalendarCheck2 size={22} strokeWidth={2.2} />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-[16px] font-bold text-ink-strong">Google Calendar</h3>
          <p className="mt-1 text-[14px] text-ink-soft leading-relaxed">
            {connected
              ? "Connected — tasks assigned to you are added to your Google Calendar automatically, and stay in sync as they change."
              : "Connect your Google Calendar so tasks assigned to you appear there automatically when they're created."}
          </p>

          {connected ? (
            <div className="mt-4 flex items-center gap-3 flex-wrap">
              <span
                className="inline-flex items-center gap-2 rounded-pill px-3 py-1.5 text-[13px] font-bold"
                style={{
                  background: "var(--color-green-bg)",
                  color: "var(--color-green-deep)",
                  border: "1px solid color-mix(in srgb, var(--color-green) 30%, transparent)",
                }}
              >
                <span className="h-2 w-2 rounded-full" style={{ background: "var(--color-green)" }} />
                {email ? `Connected as ${email}` : "Connected"}
              </span>
              <button
                type="button"
                onClick={syncNow}
                disabled={syncing || pending}
                className="inline-flex items-center gap-1.5 rounded-pill border border-hairline-strong px-3.5 py-1.5 text-[13px] font-bold text-ink-soft hover:border-altus-red hover:text-altus-red transition-colors disabled:opacity-50"
              >
                {syncing ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <RefreshCw size={14} strokeWidth={2.4} />
                )}
                {syncing ? "Syncing…" : "Sync now"}
              </button>
              <button
                type="button"
                onClick={disconnect}
                disabled={pending || syncing}
                className="inline-flex items-center gap-1.5 rounded-pill border border-hairline-strong px-3.5 py-1.5 text-[13px] font-bold text-ink-soft hover:border-altus-red hover:text-altus-red transition-colors disabled:opacity-50"
              >
                {pending ? <Loader2 size={14} className="animate-spin" /> : <Unlink size={14} strokeWidth={2.4} />}
                Disconnect
              </button>
            </div>
          ) : (
            <a
              href="/api/google/connect"
              className="mt-4 inline-flex items-center gap-2 rounded-pill px-4 py-2.5 text-[14px] font-bold text-white transition-all hover:brightness-110"
              style={{ background: "linear-gradient(135deg, var(--color-blue), var(--color-blue-deep))" }}
            >
              <Link2 size={16} strokeWidth={2.4} />
              Connect Google Calendar
            </a>
          )}
        </div>
      </div>
    </div>
  );
}
