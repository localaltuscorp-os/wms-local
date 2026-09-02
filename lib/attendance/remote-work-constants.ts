/**
 * The org's standard working day, for an "All day" remote-work request (0209).
 *
 * ── WHY THIS IS ITS OWN FILE ───────────────────────────────────────────────
 * `lib/attendance/remote-work.ts` is `server-only`, and the request form is a
 * client component that has to render "All day (10:30 – 19:30)" and prefill its
 * time inputs. Copying the two strings into the component is how the form and
 * the server quietly come to disagree about what "all day" means. One module,
 * no I/O, imported by both.
 *
 * These decide what a NEW all-day request STORES. They never reinterpret an old
 * one: the times are written onto the row, so if the office day ever moves,
 * every request already agreed keeps meaning the hours it was agreed for.
 */
export const ALL_DAY_START = "10:30";
export const ALL_DAY_END = "19:30";
