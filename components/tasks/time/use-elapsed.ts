"use client";

import * as React from "react";

/**
 * Ticking elapsed-seconds since `startedAtIso`, updated every second while the
 * tab is visible. Returns 0 when `startedAtIso` is null. Optionally capped so a
 * forgotten timer never renders an absurd number before the auto-close cron
 * finalises it server-side.
 */
export function useElapsedSeconds(startedAtIso: string | null, capSeconds?: number): number {
  const [now, setNow] = React.useState(() => Date.now());

  React.useEffect(() => {
    if (!startedAtIso) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [startedAtIso]);

  if (!startedAtIso) return 0;
  const started = new Date(startedAtIso).getTime();
  const raw = Math.max(0, Math.floor((now - started) / 1000));
  return capSeconds != null ? Math.min(raw, capSeconds) : raw;
}
