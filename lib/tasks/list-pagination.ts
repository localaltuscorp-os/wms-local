/**
 * WHEN THE TASK LIST GOES BACK TO PAGE ONE.
 *
 * Lives in its own module, with no imports, because the rule is worth testing
 * and `task-table.tsx` cannot be imported from a unit test — it reaches
 * `lib/env` through its module graph and demands a DATABASE_URL to be loaded
 * at all.
 */

/**
 * Is the row set that just arrived a DIFFERENT LIST, or the same one edited?
 *
 * The task list pages client-side and used to reset to page one whenever its
 * `rows` prop changed IDENTITY. Every inline edit in the table calls
 * `router.refresh()`, which hands down a brand-new array — so setting one
 * row's Doer Status while standing on page 2 threw you back to page 1, with
 * the row you had just touched now off-screen.
 *
 * Array identity was never the question. "Is this a different list?" is a
 * question about CONTENT, so it is asked of the ids.
 *
 * OVERLAP, rather than exact equality, is the test — because an edit can
 * legitimately remove its own row (marking something Done while the list is
 * filtered to Pending) and that must not count as a new list either. Any row
 * you were already looking at surviving into the new set means you are still
 * in the same list; the caller's page clamp keeps the page honest if it
 * shrank. Only a wholly disjoint set — a real filter change — earns page one.
 *
 * `prev === null` is the first render, which is already on page one.
 */
export function isDifferentList(prev: Set<string> | null, next: Set<string>): boolean {
  if (prev === null) return false;
  for (const id of next) if (prev.has(id)) return false;
  return true;
}
