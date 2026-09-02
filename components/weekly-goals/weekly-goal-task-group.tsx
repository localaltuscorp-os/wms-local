import Link from "next/link";
import type { Route } from "next";
import { ArrowUpRight } from "lucide-react";
import type { VirtualTaskRow } from "@/lib/weekly-goals/as-task-row";
import { PRIORITY_LABELS, type TaskPriority } from "@/db/enums";
import { WeeklyGoalBadge } from "@/components/weekly-goals/weekly-goal-badge";

/**
 * Pinned "This week's goals" group, surfaced ABOVE the regular task table on
 * the Tasks list and My Day (design §10). Each row is a read-only projection of
 * a weekly goal — badged "Weekly Goal", visually distinct (Altus accent), and a
 * deep link into the Weekly Goals workspace (the single edit/review surface).
 *
 * These rows are NEVER counted in the task stat cards / dashboard KPIs — they
 * are a display-only overlay, kept entirely separate from `TaskListRow`.
 */

const PRIORITY_TONE: Record<TaskPriority, string> = {
  imp_urgent: "red",
  imp_not_urgent: "amber",
  not_imp_urgent: "orange",
  not_imp_not_urgent: "slate",
};

function pctTone(pct: number): string {
  if (pct >= 100) return "green";
  if (pct >= 50) return "blue";
  if (pct > 0) return "amber";
  return "slate";
}

export function WeeklyGoalTaskGroup({
  goals,
  /** When true (admin "all" scope), show each row's doer name. */
  showDoer = false,
  className = "",
}: {
  goals: VirtualTaskRow[];
  showDoer?: boolean;
  className?: string;
}) {
  if (goals.length === 0) return null;

  return (
    <section
      className={`rounded-section overflow-hidden ${className}`}
      style={{
        border:
          "1px solid color-mix(in srgb, var(--color-altus-red) 22%, var(--color-hairline))",
        background:
          "linear-gradient(180deg, color-mix(in srgb, var(--color-altus-red) 4%, white), var(--color-surface-card))",
        boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)",
      }}
    >
      <header className="flex items-center justify-between gap-3 px-4 py-3 max-md:px-3">
        <div className="flex items-center gap-2.5 min-w-0">
          <WeeklyGoalBadge />
          <h2
            className="font-bold text-ink-strong truncate"
            style={{ fontSize: 16 }}
          >
            This Week&apos;s Goals
          </h2>
          <span
            className="shrink-0 tabular-nums font-bold rounded-pill px-2 py-0.5"
            style={{
              fontSize: 12.5,
              background:
                "color-mix(in srgb, var(--color-altus-red) 12%, transparent)",
              color: "var(--color-altus-red-deep)",
            }}
          >
            {goals.length}
          </span>
        </div>
        <Link
          href={"/goals/weekly" as Route}
          className="shrink-0 inline-flex items-center gap-1 font-semibold text-altus-red-deep hover:underline"
          style={{ fontSize: 13.5 }}
        >
          Open Weekly Goals
          <ArrowUpRight size={15} strokeWidth={2.4} />
        </Link>
      </header>

      <ul className="divide-y divide-hairline border-t border-hairline">
        {goals.map((g) => {
          const prioTone = PRIORITY_TONE[g.priority] ?? "slate";
          const tone = pctTone(g.pct);
          const meta = [
            g.client?.trim(),
            g.subject?.trim(),
            showDoer ? g.doerName?.trim() : null,
          ].filter((p): p is string => !!p);
          return (
            <li key={g.id}>
              <Link
                href={g.href as Route}
                className="group flex items-center gap-3 px-4 py-3 max-md:px-3 transition-colors hover:bg-[color-mix(in_srgb,var(--color-altus-red)_5%,transparent)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-altus-red/40"
              >
                {/* Priority accent rail */}
                <span
                  aria-hidden
                  className="shrink-0 self-stretch rounded-full"
                  style={{
                    width: 4,
                    background: `var(--color-${prioTone})`,
                  }}
                />
                <div className="min-w-0 flex-1">
                  <div
                    className="font-semibold text-ink-strong truncate group-hover:text-altus-red-deep transition-colors"
                    style={{ fontSize: 15 }}
                  >
                    {g.title}
                  </div>
                  {meta.length > 0 && (
                    <div
                      className="mt-0.5 truncate text-ink-soft"
                      style={{ fontSize: 13 }}
                    >
                      {meta.join(" · ")}
                    </div>
                  )}
                </div>

                <span
                  className="shrink-0 hidden sm:inline-flex items-center rounded-pill px-2.5 py-1 font-bold whitespace-nowrap"
                  style={{
                    fontSize: 12,
                    color: `var(--color-${prioTone}-deep)`,
                    background: `color-mix(in srgb, var(--color-${prioTone}) 14%, transparent)`,
                  }}
                >
                  {PRIORITY_LABELS[g.priority]}
                </span>

                {/* Effective % */}
                <span
                  className="shrink-0 inline-flex items-center gap-2"
                  title={`${g.pct}% complete`}
                >
                  <span
                    aria-hidden
                    className="hidden sm:block rounded-full overflow-hidden"
                    style={{
                      width: 56,
                      height: 6,
                      background: "var(--color-hairline)",
                    }}
                  >
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${Math.max(0, Math.min(100, g.pct))}%`,
                        background: `var(--color-${tone})`,
                      }}
                    />
                  </span>
                  <span
                    className="tabular-nums font-bold text-right"
                    style={{
                      fontSize: 13.5,
                      width: 38,
                      color: `var(--color-${tone}-deep)`,
                    }}
                  >
                    {g.pct}%
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
