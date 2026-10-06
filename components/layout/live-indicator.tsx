"use client";

import { useTaskRealtime } from "@/components/layout/task-realtime-provider";

export function LiveIndicator() {
  const { connected } = useTaskRealtime();
  const realtimeDisabled = process.env.NEXT_PUBLIC_DISABLE_REALTIME !== "false";

  if (realtimeDisabled) return null;

  const dotColor = connected ? "var(--color-green)" : "var(--color-ink-subtle)";

  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        className="size-2.5 rounded-full"
        style={{
          backgroundColor: dotColor,
          boxShadow: connected ? `0 0 12px ${dotColor}` : "none",
          animation: connected ? "livePulse 1.8s ease-in-out infinite" : "none",
        }}
        aria-hidden
      />
      <span className="text-body-lg text-ink-muted">
        {connected ? "Live" : "Offline"}
      </span>
    </span>
  );
}
