"use client";

import * as React from "react";

/**
 * THE ONE AUTOSAVE for every HR form.
 *
 * ── WHY A SHARED HOOK ──────────────────────────────────────────────────────
 * Before this, four forms autosaved and four did not, and no two of the four
 * agreed: the exit forms polled a dirty flag every 1400ms, the intake wizard
 * every 1200ms, evaluation-v2 debounced at 800ms and the management assessment
 * at 900ms. Each re-implemented the single-flight guard, and none of them
 * retried a failed save or told the user it had failed — a save that lost the
 * network simply vanished and the form went on looking saved. Standardising the
 * mechanism is the point of the exercise; the per-form cadences were differences
 * without reasons.
 *
 * ── DEBOUNCE *AND* MAX-WAIT ────────────────────────────────────────────────
 * A pure debounce never fires while someone is still typing, so a long answer
 * typed without pause is a long answer held entirely in the browser. `maxWaitMs`
 * forces a flush on a steady cadence regardless, which is what the old interval
 * pollers got right. A pure interval, conversely, writes on a fixed clock however
 * briefly the user paused — more requests for no more safety. Doing both is
 * strictly better than either alone.
 *
 * ── WHAT THIS CANNOT DO ────────────────────────────────────────────────────
 * It cannot guarantee a save completes when the tab is closing. `beforeunload`
 * does not await promises and a server action is not sendBeacon-able. So the
 * hook does the two things that ARE reliable — flush when the tab merely becomes
 * HIDDEN (navigating away, switching tabs, the phone locking), and warn on
 * unload while genuinely dirty — rather than pretending a close is safe.
 * Combined with a short debounce the practical exposure is under a second.
 */

/** What the indicator renders. `retrying` means a save FAILED and is queued. */
export type SaveState = "idle" | "saving" | "saved" | "retrying";

export interface AutosaveResult {
  ok: boolean;
  error?: string;
}

export interface UseAutosaveOptions<T> {
  /** Current form state. Compared by value, so a fresh object each render is fine. */
  data: T;
  /** Writes to the database. MUST be idempotent — it is called again on a retry. */
  save: (data: T) => Promise<AutosaveResult>;
  /** Quiet period after the last edit before writing. */
  delayMs?: number;
  /** Longest a change may sit unsaved while the user keeps typing. */
  maxWaitMs?: number;
  /** Skip empty/meaningless states, e.g. a wizard nobody has typed into yet. */
  skip?: (data: T) => boolean;
  /** Off for read-only viewers, or before the form knows whose record it is. */
  enabled?: boolean;
}

export interface UseAutosave {
  state: SaveState;
  /** When the last successful write landed — drives "Saved 14:32". */
  savedAt: Date | null;
  /** Message from the last failure; cleared by the next success. */
  error: string | null;
  /** True when edits exist that have not reached the server yet. */
  dirty: boolean;
  /**
   * Write NOW and report whether it landed. Submit must await this so it never
   * races an in-flight autosave — the failure this replaces is a Submit that
   * silently no-ops because an autosave already held the single-flight lock.
   */
  flush: () => Promise<boolean>;
}

const BACKOFF_MS = [1000, 2000, 4000, 8000, 15000];

/**
 * Value-identity for arbitrary form state.
 *
 * JSON.stringify is not key-order-stable across differently-built objects, but
 * within one form the shape is constructed the same way every render, so it is
 * stable where it is used. Anything unserialisable degrades to "always dirty",
 * which costs a redundant write — the safe direction to fail.
 */
function signature(v: unknown): string {
  try {
    return JSON.stringify(v) ?? "";
  } catch {
    return String(Date.now());
  }
}

export function useAutosave<T>({
  data,
  save,
  delayMs = 800,
  maxWaitMs = 5000,
  skip,
  enabled = true,
}: UseAutosaveOptions<T>): UseAutosave {
  const [state, setState] = React.useState<SaveState>("idle");
  const [savedAt, setSavedAt] = React.useState<Date | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [dirty, setDirty] = React.useState(false);

  // Refs, not state: the timers and the save loop must read the LATEST values
  // without re-subscribing, and re-running an effect per keystroke would cancel
  // the very max-wait timer that exists to survive continuous typing.
  const dataRef = React.useRef(data);
  const saveRef = React.useRef(save);
  const skipRef = React.useRef(skip);

  const inFlight = React.useRef(false);
  const dirtyRef = React.useRef(false);
  const debounceT = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxWaitT = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryT = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const attempt = React.useRef(0);
  /** Signature of the last state written successfully — the dirty test. */
  const savedSig = React.useRef<string | null>(null);
  const mounted = React.useRef(true);

  // Mutually recursive (run retries, a partial save re-schedules), so they are
  // held in refs and the callbacks below only ever read the current one.
  const runRef = React.useRef<() => Promise<boolean>>(async () => false);
  const scheduleRef = React.useRef<() => void>(() => {});

  const clearTimers = React.useCallback(() => {
    if (debounceT.current) {
      clearTimeout(debounceT.current);
      debounceT.current = null;
    }
    if (maxWaitT.current) {
      clearTimeout(maxWaitT.current);
      maxWaitT.current = null;
    }
    if (retryT.current) {
      clearTimeout(retryT.current);
      retryT.current = null;
    }
  }, []);

  /** Debounce, with a max-wait ceiling armed on the FIRST edit of a burst. */
  const schedule = React.useCallback(() => {
    if (!enabled) return;
    if (debounceT.current) clearTimeout(debounceT.current);
    debounceT.current = setTimeout(() => {
      void runRef.current();
    }, delayMs);
    if (!maxWaitT.current) {
      maxWaitT.current = setTimeout(() => {
        void runRef.current();
      }, maxWaitMs);
    }
  }, [enabled, delayMs, maxWaitMs]);

  /** Only ever called with the freshest data. Reports whether the write landed. */
  const run = React.useCallback(async (): Promise<boolean> => {
    if (!enabled) return false;
    // Busy is not failure: the trailing save below picks the change up, and
    // Submit's flush() polls rather than giving up.
    if (inFlight.current) return false;

    const snapshot = dataRef.current;
    const sig = signature(snapshot);
    if (sig === savedSig.current) return true; // nothing changed since the last write
    if (skipRef.current?.(snapshot)) return true;

    clearTimers();
    inFlight.current = true;
    if (mounted.current) setState("saving");
    try {
      const res = await saveRef.current(snapshot);
      if (res.ok) {
        savedSig.current = sig;
        attempt.current = 0;
        // The user may have typed WHILE the request was in flight, so compare
        // against the current value rather than the snapshot just sent.
        const stillDirty = signature(dataRef.current) !== sig;
        dirtyRef.current = stillDirty;
        if (mounted.current) {
          setError(null);
          setSavedAt(new Date());
          setDirty(stillDirty);
          setState(stillDirty ? "saving" : "saved");
        }
        if (stillDirty) scheduleRef.current();
        return true;
      }
      queueRetry(res.error ?? "Could not save.");
      return false;
    } catch (e) {
      queueRetry(e instanceof Error ? e.message : "Could not save.");
      return false;
    } finally {
      inFlight.current = false;
    }

    /** Record the failure and queue a retry with backoff. */
    function queueRetry(message: string) {
      dirtyRef.current = true;
      const i = Math.min(attempt.current, BACKOFF_MS.length - 1);
      attempt.current += 1;
      if (mounted.current) {
        setError(message);
        setDirty(true);
        setState("retrying");
      }
      if (retryT.current) clearTimeout(retryT.current);
      retryT.current = setTimeout(() => {
        void runRef.current();
      }, BACKOFF_MS[i]);
    }
  }, [enabled, clearTimers]);

  // Keep the "latest" refs current in a COMMIT-phase effect rather than during
  // render. Writing a ref while rendering is a real hazard under concurrent
  // React — a render that is thrown away still leaves its write behind — and it
  // is safe to defer here because nothing reads these refs until a timer, an
  // event listener or flush() fires, all of which happen after commit.
  React.useEffect(() => {
    dataRef.current = data;
    saveRef.current = save;
    skipRef.current = skip;
    runRef.current = run;
    scheduleRef.current = schedule;
  });

  // Watch the data BY VALUE. This is the only place dirtiness originates, so a
  // caller can never forget to call a markDirty().
  const sig = signature(data);
  React.useEffect(() => {
    if (!enabled) return;
    // Seed on first run: an initial load is not an edit.
    if (savedSig.current === null) {
      savedSig.current = sig;
      return;
    }
    if (sig === savedSig.current) return;
    dirtyRef.current = true;
    setDirty(true);
    schedule();
  }, [sig, enabled, schedule]);

  const flush = React.useCallback(async (): Promise<boolean> => {
    clearTimers();
    // Wait out an autosave that already holds the lock rather than reporting a
    // false failure — this is what makes Submit-during-autosave reliable.
    for (let i = 0; i < 40 && inFlight.current; i++) {
      await new Promise((r) => setTimeout(r, 50));
    }
    return runRef.current();
  }, [clearTimers]);

  // Flush when the tab becomes hidden — navigating away, a tab switch, the phone
  // locking. This is the reliable half of "the user left"; see the header.
  React.useEffect(() => {
    if (!enabled || typeof document === "undefined") return;
    const onHide = () => {
      if (document.visibilityState === "hidden" && dirtyRef.current) void runRef.current();
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      // A save cannot be awaited here, so ask rather than lose it silently.
      e.preventDefault();
      e.returnValue = "";
    };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [enabled]);

  // Last chance on unmount (a client-side route change).
  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      clearTimers();
      if (dirtyRef.current) void runRef.current();
    };
  }, [clearTimers]);

  return { state, savedAt, error, dirty, flush };
}
