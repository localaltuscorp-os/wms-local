"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Loader2, RotateCcw } from "lucide-react";

/**
 * A LOCAL error boundary for one section of a page.
 *
 * The app only had route-level `error.tsx` files, which is the failure this
 * exists to avoid: one throw inside the tasks table replaced the entire
 * dashboard — filters, toolbar, everything — with a full-page error screen.
 * Scoped here, the rest of the page stays interactive and only the broken
 * container is swapped for a retry card.
 *
 * WHAT THIS CAN AND CANNOT CATCH — worth being exact, because the difference
 * decides whether it helps:
 *   CAN  — anything thrown while RENDERING the client subtree below it: a row
 *          with an unexpected shape, a null where a Date was assumed, a bad
 *          format() call, a hook that throws.
 *   CANT — an error thrown in a SERVER component, or a fetch that times out
 *          server-side. React error boundaries never see those; Next routes
 *          them to the nearest `error.tsx`. Scoping THOSE needs a nested route
 *          segment with its own error.tsx, or moving the fetch client-side.
 *
 * Retry escalates: the button is disabled for a backoff window that doubles
 * each attempt (1s, 2s, 4s, 8s, capped at 30s), so hammering a struggling
 * backend is not one click away. `router.refresh()` re-runs the server render
 * for the route, and the `key` bump remounts the subtree so a client-side crash
 * clears too.
 */
const MAX_ATTEMPTS = 4;
const BACKOFF_CAP_MS = 30_000;

function backoffMs(attempt: number): number {
  return Math.min(BACKOFF_CAP_MS, 1000 * 2 ** Math.max(0, attempt - 1));
}

interface InnerProps {
  children: React.ReactNode;
  onError: (error: Error) => void;
  caught: boolean;
}

/** Only a class component can implement getDerivedStateFromError. It holds no
 *  state of its own — the retry policy lives in the function wrapper below,
 *  where hooks are available. */
class Catcher extends React.Component<InnerProps> {
  static getDerivedStateFromError() {
    return {};
  }
  override componentDidCatch(error: Error) {
    this.props.onError(error);
  }
  override render() {
    // Once the wrapper knows an error happened it renders the fallback INSTEAD
    // of this boundary, so `caught` short-circuits the subtree in the same
    // commit rather than re-throwing on the way out.
    return this.props.caught ? null : this.props.children;
  }
}

export function SectionErrorBoundary({
  children,
  label = "this section",
}: {
  children: React.ReactNode;
  /** Named in the message, e.g. "the tasks table". */
  label?: string;
}) {
  const router = useRouter();
  const [error, setError] = React.useState<Error | null>(null);
  const [attempt, setAttempt] = React.useState(0);
  const [retrying, setRetrying] = React.useState(false);
  const [cooldown, setCooldown] = React.useState(0);
  // Bumped on every retry so the subtree remounts from scratch.
  const [instance, setInstance] = React.useState(0);

  // Countdown tick for the backoff window.
  React.useEffect(() => {
    if (cooldown <= 0) return;
    const t = window.setTimeout(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => window.clearTimeout(t);
  }, [cooldown]);

  const onError = React.useCallback((e: Error) => {
    setError(e);
    setCooldown(Math.round(backoffMs(1) / 1000));
  }, []);

  function retry() {
    if (cooldown > 0 || retrying) return;
    const next = attempt + 1;
    setRetrying(true);
    setAttempt(next);
    setError(null);
    setInstance((i) => i + 1);
    // Re-runs the server render for this route, so a transient backend failure
    // gets a genuinely fresh payload rather than the same cached one.
    router.refresh();
    setCooldown(Math.round(backoffMs(next + 1) / 1000));
    window.setTimeout(() => setRetrying(false), 600);
  }

  if (error) {
    const exhausted = attempt >= MAX_ATTEMPTS;
    return (
      <div
        role="alert"
        className="wg-rise rounded-section border border-hairline bg-surface-card p-6 text-center"
        style={{ boxShadow: "0 1px 2px rgba(15, 23, 42, 0.04)" }}
      >
        <span className="mx-auto grid size-10 place-items-center rounded-full bg-amber-50 text-amber-600">
          <AlertTriangle size={19} strokeWidth={2.3} />
        </span>
        <p className="mt-3 text-[15px] font-bold text-ink-strong">
          Couldn&apos;t load {label}.
        </p>
        <p className="mx-auto mt-1 max-w-[46ch] text-[13px] font-medium text-ink-muted">
          The rest of the page is still working — only this section failed.
          {exhausted
            ? " It has failed repeatedly, so it is likely not a transient blip."
            : " This is usually a timeout and clears on a retry."}
        </p>

        {!exhausted ? (
          <button
            type="button"
            onClick={retry}
            disabled={cooldown > 0 || retrying}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-[#18181b] px-4 py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-black disabled:opacity-50"
          >
            {retrying ? (
              <Loader2 size={15} className="animate-spin" />
            ) : (
              <RotateCcw size={15} />
            )}
            {cooldown > 0 ? `Try again in ${cooldown}s` : "Try again"}
          </button>
        ) : (
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-white px-4 py-2.5 text-[13px] font-bold text-ink-strong transition-colors hover:bg-surface-soft"
          >
            <RotateCcw size={15} /> Reload the page
          </button>
        )}

        {attempt > 0 && (
          <p className="mt-2 text-[11.5px] font-semibold text-ink-subtle tabular-nums">
            Attempt {attempt} of {MAX_ATTEMPTS}
          </p>
        )}
      </div>
    );
  }

  return (
    <Catcher key={instance} caught={false} onError={onError}>
      {children}
    </Catcher>
  );
}
