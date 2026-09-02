import { redirect } from "next/navigation";
import type { Route } from "next";

export const dynamic = "force-dynamic";

/**
 * `/goals/plan` → `/my-day`.
 *
 * Plan My Day MOVED to the WMS room (2026-08); it is no longer a Goals page and
 * the Goals rail no longer lists it. This stub stays so the URL keeps working —
 * it is bookmarked, it is linked from the Goals hub cards' history, and several
 * in-app redirects pointed here for a long time.
 *
 * Query is forwarded verbatim: `?d=` (which day), `?emp=` (whose day) and
 * `?day=` (personal space) all still land on the right board.
 */
export default async function GoalsPlanRedirect({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(sp)) {
    const v = Array.isArray(value) ? value[0] : value;
    if (typeof v === "string" && v !== "") qs.set(key, v);
  }
  const q = qs.toString();
  redirect((q ? `/my-day?${q}` : "/my-day") as Route);
}
