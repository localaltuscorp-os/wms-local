"use client";

/**
 * LAST WORDS BEFORE AN IDLE SIGN-OUT.
 *
 * The idle timer signs the user out and hard-navigates away. Anything a form
 * still holds in the browser at that moment - an edit inside the autosave
 * debounce, a save waiting on a retry - would be lost, and once the session is
 * revoked it can no longer be written. So forms register a flush here, and the
 * idle timer runs them all (bounded by a timeout) BEFORE it signs out.
 */
type Task = () => Promise<unknown>;

const tasks = new Set<Task>();

/** Register work to run before an idle sign-out. Returns the unregister function. */
export function registerBeforeLogout(task: Task): () => void {
  tasks.add(task);
  return () => {
    tasks.delete(task);
  };
}

/** Run every registered task, waiting at most `timeoutMs`. Never throws. */
export async function runBeforeLogout(timeoutMs = 2500): Promise<void> {
  if (tasks.size === 0) return;
  const all = Promise.allSettled([...tasks].map((t) => t()));
  await Promise.race([all, new Promise((r) => setTimeout(r, timeoutMs))]);
}
