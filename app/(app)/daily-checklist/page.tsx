import { redirect } from "next/navigation";
import type { Route } from "next";

export const dynamic = "force-dynamic";

/**
 * "Daily Checklist" was merged into the unified "Plan My Day" page (Sir: they're
 * the same thing). This route now permanently redirects there so old links,
 * bookmarks, and the `c` shortcut all land on the single surface.
 */
export default function DailyChecklistPage() {
  redirect("/my-day" as Route);
}
