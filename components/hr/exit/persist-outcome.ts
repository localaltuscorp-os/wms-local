/**
 * The save outcome both Exit forms report, and the retry budget Submit spends
 * waiting for an autosave to let go.
 *
 * WHY A TRI-STATE rather than a boolean: `persist` refuses to run while another
 * save is in flight, and the forms autosave every {@link AUTOSAVE_INTERVAL_MS}.
 * With a boolean, "an autosave holds the lock" and "the server rejected this"
 * were the same `false` — so a Submit click landing inside an autosave produced
 * no toast, no error and no state change, and the user walked away believing
 * they had submitted. Naming the busy case is what lets Submit wait for its turn
 * instead of silently doing nothing.
 */
export type PersistOutcome = "ok" | "busy" | "failed";

/** Autosave cadence. The retry budget below is derived from it. */
export const AUTOSAVE_INTERVAL_MS = 1400;

/** Poll gap while waiting for an in-flight autosave to finish. */
export const SUBMIT_RETRY_DELAY_MS = 150;

/**
 * How many times Submit re-checks before giving up and saying so. Sized to
 * comfortably outlast one autosave round trip; past that, something is wrong
 * enough that the user should be told rather than left watching a spinner.
 */
export const SUBMIT_RETRY_ATTEMPTS = Math.ceil((AUTOSAVE_INTERVAL_MS * 2) / SUBMIT_RETRY_DELAY_MS);

/** The message shown when the retry budget runs out — shared so both forms agree. */
export const SUBMIT_BUSY_MESSAGE = "Still saving — try Submit again in a moment.";

/**
 * Scroll the field a failed Submit is complaining about into view and focus it.
 *
 * Both exit forms are long enough that the toast alone can name a field sitting
 * well off-screen — the interview's required date is at the top and its
 * signature at the very bottom. Matches `data-field` (see `FloatingInput`);
 * a key with no matching input is a silent no-op, so validation may name fields
 * that haven't opted in without breaking anything.
 */
export function focusField(key: string | undefined): void {
  if (!key || typeof document === "undefined") return;
  const el = document.querySelector<HTMLElement>(`[data-field="${CSS.escape(key)}"]`);
  if (!el) return;
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  el.focus({ preventScroll: true });
}
