import { Clock3 } from "lucide-react";

/**
 * PART-TIME weekly hours card — "you have done 19.5 of your 27 hours this week".
 *
 * A part-timer is paid hourly against a weekly target, so their hours ARE their
 * pay. Before this, the target existed only inside the salary engine: the shortfall
 * first became visible as a smaller payslip at the end of the month, with no way
 * to catch it while the week could still be fixed. Shown only for part-timers.
 */
export function PartTimeWeekCard({
  workedMinutes,
  targetMinutes,
  payAtTarget,
}: {
  workedMinutes: number;
  targetMinutes: number;
  /** ₹ earned at the full weekly target — the number the hours are worth. */
  payAtTarget?: number | null;
}) {
  const worked = Math.round((workedMinutes / 60) * 10) / 10;
  const target = Math.round((targetMinutes / 60) * 10) / 10;
  const pct = targetMinutes > 0 ? Math.min(100, (workedMinutes / targetMinutes) * 100) : 0;
  const remaining = Math.max(0, Math.round(((targetMinutes - workedMinutes) / 60) * 10) / 10);
  const done = remaining === 0;

  return (
    <div className="rounded-2xl border border-hairline bg-white p-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <span
          className="grid h-8 w-8 shrink-0 place-items-center rounded-xl"
          style={{ background: "color-mix(in srgb, var(--color-altus-red) 10%, white)", color: "var(--color-altus-red-deep)" }}
        >
          <Clock3 size={16} strokeWidth={2.4} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-bold text-ink-strong">This week&apos;s hours</p>
          <p className="text-[12px] font-medium text-ink-muted">
            {done
              ? `Target met — ${worked}h of ${target}h.`
              : `${worked}h of ${target}h · ${remaining}h to go.`}
          </p>
        </div>
        <span
          className="shrink-0 text-[19px] font-black tabular-nums"
          style={{ color: done ? "#15803d" : "var(--color-altus-red-deep)" }}
        >
          {Math.round(pct)}%
        </span>
      </div>

      <div
        className="mt-3 h-2 w-full overflow-hidden rounded-full"
        style={{ background: "var(--color-surface-track)" }}
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${worked} of ${target} hours this week`}
      >
        <div
          className="h-full rounded-full transition-[width]"
          style={{
            width: `${Math.max(pct, pct > 0 ? 3 : 0)}%`,
            background: done
              ? "#7FB77E"
              : "linear-gradient(90deg, var(--color-altus-red), var(--color-altus-red-deep))",
          }}
        />
      </div>

      {payAtTarget != null && payAtTarget > 0 && (
        <p className="mt-2 text-[11.5px] font-medium text-ink-subtle">
          Full week earns ₹{payAtTarget.toLocaleString("en-IN")} — pay is prorated to the hours actually worked.
        </p>
      )}
    </div>
  );
}
