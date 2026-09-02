import Link from "next/link";
import type { Route } from "next";
import { ArrowRight, CalendarDays, AlertTriangle, CheckCircle2 } from "lucide-react";
import type { MyDayCounts } from "@/lib/queries/my-day";

interface Props {
  firstName: string;
  counts: MyDayCounts;
}

/**
 * Compact per-user "Your day" card on the dashboard top. Mirrors the
 * full agenda banner at /tasks/agenda but condensed to a single row of
 * three stats — due today / overdue / done today — with a CTA to the
 * full agenda. Hidden via the dashboard's empty-state branch.
 *
 * Renders as a quiet card; not the dashboard's centerpiece.
 */
export function MyDayCard({ firstName, counts }: Props) {
  const { dueToday, overdue, doneToday } = counts;

  // Quiet behaviour: if the user has literally nothing happening today
  // and no overdue items, we hide the card so we don't show a wall of
  // zeros. Done-today still shows as encouragement when > 0.
  if (dueToday === 0 && overdue === 0 && doneToday === 0) return null;

  return (
    <section className="mx-auto max-w-[1600px] px-12 max-md:px-4 mt-6">
      <Link
        href={"/tasks/agenda" as Route}
        className="group block rounded-section border border-hairline bg-surface-card px-6 py-4 transition-shadow hover:shadow-md"
        style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
      >
        <div className="flex items-center justify-between gap-6 flex-wrap">
          <div className="flex items-center gap-6 flex-wrap">
            <div>
              <div className="text-[11.5px] uppercase tracking-[0.10em] font-bold text-ink-subtle">
                Your day
              </div>
              <div className="text-[16px] font-semibold text-ink-strong mt-0.5">
                {firstName}
              </div>
            </div>
            <Stat
              icon={<CalendarDays size={14} strokeWidth={2.4} />}
              tone="blue"
              value={dueToday}
              label={dueToday === 1 ? "due today" : "due today"}
            />
            {overdue > 0 && (
              <Stat
                icon={<AlertTriangle size={14} strokeWidth={2.4} />}
                tone="red"
                value={overdue}
                label={overdue === 1 ? "overdue" : "overdue"}
              />
            )}
            <Stat
              icon={<CheckCircle2 size={14} strokeWidth={2.4} />}
              tone="green"
              value={doneToday}
              label={doneToday === 1 ? "done today" : "done today"}
            />
          </div>
          <span className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-ink-soft group-hover:text-ink-strong transition-colors">
            Open My Day
            <ArrowRight size={14} strokeWidth={2.4} />
          </span>
        </div>
      </Link>
    </section>
  );
}

function Stat({
  icon,
  tone,
  value,
  label,
}: {
  icon: React.ReactNode;
  tone: "blue" | "red" | "green";
  value: number;
  label: string;
}) {
  return (
    <div
      className="inline-flex items-center gap-2 rounded-full px-3 py-1.5"
      style={{
        background: `var(--color-${tone}-bg)`,
        color: `var(--color-${tone}-deep)`,
      }}
    >
      {icon}
      <span className="font-bold tabular-nums text-[15px]">{value}</span>
      <span className="text-[12.5px] opacity-80">{label}</span>
    </div>
  );
}
