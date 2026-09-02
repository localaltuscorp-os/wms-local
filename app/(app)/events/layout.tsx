import { notFound } from "next/navigation";
import { monthlyEventsEnabled } from "@/lib/monthly-events/flag";

/**
 * Monthly Events Master module gate. The whole `/events` surface ships behind
 * the `MONTHLY_EVENTS_OFF` kill-switch — when disabled, every route 404s. Access
 * (admin vs viewer) is re-asserted inside each page (layout gates are unreliable
 * on prod), so this layout only enforces the flag and passes children through.
 */
export default function EventsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!monthlyEventsEnabled()) notFound();
  return <>{children}</>;
}
