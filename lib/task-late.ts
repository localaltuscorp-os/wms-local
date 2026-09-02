// "Done late" detection. A task's due date is stored as noon IST on the due
// day, so a raw timestamp comparison would mis-flag a task finished the same
// afternoon. We compare CALENDAR DAYS in IST instead — late means the task was
// completed on a day strictly after its due day, matching the app's "overdue"
// notion elsewhere. Derived (no stored flag); when the rewards system lands we
// can freeze it into a column so editing the due date can't game the score.

const TZ = "Asia/Kolkata";

/** yyyy-mm-dd for a Date in IST (lexicographic order == chronological). */
function istDay(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: TZ });
}

export function isDoneLate(args: {
  status: string;
  completedAt: Date | null;
  dueAt: Date | null;
}): boolean {
  if (args.status !== "done" && args.status !== "approved") return false;
  if (!args.completedAt || !args.dueAt) return false;
  return istDay(args.completedAt) > istDay(args.dueAt);
}
