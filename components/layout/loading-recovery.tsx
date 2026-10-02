"use client";

import { useEffect, useState } from "react";

const RECOVERY_DELAY_MS = 12_000;

/** Gives a genuinely stalled navigation an explicit escape without reload loops. */
export function LoadingRecovery() {
  const [show, setShow] = useState(false);

  useEffect(() => {
    const timer = window.setTimeout(() => setShow(true), RECOVERY_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, []);

  if (!show) return null;

  return (
    <div className="mt-4 flex flex-col items-center gap-2 text-center">
      <p className="text-sm text-ink-soft">This is taking longer than expected.</p>
      <button
        type="button"
        className="rounded-lg border border-black/10 bg-white px-4 py-2 text-sm font-semibold text-ink shadow-sm hover:bg-black/[0.03]"
        onClick={() => window.location.reload()}
      >
        Reload page
      </button>
    </div>
  );
}
