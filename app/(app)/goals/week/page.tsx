import { redirect } from "next/navigation";
import type { Route } from "next";

export const dynamic = "force-dynamic";

/** /goals/week — retired canvas week page. The Weekly level now IS the real
 *  weekly board at /goals/weekly (WeeklyCascadeBoard over `weekly_goals`, with
 *  its own week nav) — permanent alias so old links keep working. */
export default async function WeekAliasPage({
  searchParams,
}: {
  searchParams: Promise<{ emp?: string; week?: string }>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  if (sp.emp) qs.set("emp", sp.emp);
  if (sp.week) qs.set("week", sp.week);
  const suffix = qs.size > 0 ? `?${qs.toString()}` : "";
  redirect(`/goals/weekly${suffix}` as Route);
}
