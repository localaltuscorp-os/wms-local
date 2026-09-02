import { Clock, Target, CheckCircle2, CalendarCheck, Award } from "lucide-react";
import type { CriteriaMetrics } from "@/lib/profile/criteria-metrics";

/**
 * Criteria-driven achievements, in the old badge-grid format (ALL CAPS).
 *
 * Each performance criterion is matched by keyword to a live, auto-computed
 * measure — e.g. "project completion on time" → tasks finished on/before their
 * due date — so the card shows real progress (12 / 15 ON TIME) rather than a
 * static badge. Criteria with no measurable signal (e.g. "client satisfaction")
 * are shown as TRACKED.
 */
type Metric =
  | { kind: "progress"; current: number; target: number; suffix: string; Icon: typeof Clock }
  | { kind: "count"; value: number; suffix: string; Icon: typeof Clock }
  | { kind: "none" };

function metricFor(text: string, m: CriteriaMetrics): Metric {
  const t = text.toLowerCase();
  // On-time / timeliness wins first (so "project completion ON TIME" measures
  // on-time delivery, not raw completion).
  if (/(on[ -]?time|timely|timeliness|deadline|punctual|time delivery|completion on time)/.test(t))
    return { kind: "progress", current: m.tasksOnTime, target: Math.max(m.tasksWithDue, m.tasksOnTime), suffix: "on time", Icon: Clock };
  if (/(% of target|target achiev|conversion rate|\bgoal|\bkpi\b)/.test(t))
    return { kind: "progress", current: m.goalsCompleted, target: Math.max(m.goalsTotal, m.goalsCompleted), suffix: "goals met", Icon: Target };
  if (/(attendance|present|punctual)/.test(t))
    return { kind: "count", value: m.attendanceDays, suffix: "days present", Icon: CalendarCheck };
  if (/(completion|complete|delivery|execution|assigned work|\btask|resolution|issue|bug|project|reporting|report)/.test(t))
    return { kind: "count", value: m.tasksCompleted, suffix: "completed", Icon: CheckCircle2 };
  return { kind: "none" };
}

export function CriteriaAchievements({
  criteria,
  metrics,
}: {
  criteria: string | null;
  metrics: CriteriaMetrics;
}) {
  const points = (criteria ?? "")
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  return (
    <section
      style={{
        background: "var(--color-surface-card)",
        border: "1px solid var(--color-hairline)",
        borderRadius: 16,
        padding: 32,
      }}
    >
      <div className="flex items-center gap-2 mb-1">
        <Award size={18} style={{ color: "var(--color-altus-red)" }} />
        <h3 className="text-[16px] font-black text-ink-strong">Achievements</h3>
      </div>
      <p className="text-[13px] text-ink-subtle mb-5">
        Live performance against your criteria — figures update automatically.
      </p>

      {points.length === 0 ? (
        <p className="text-[14px] text-ink-subtle">
          No criteria set yet — once performance criteria are added, they appear here as achievements.
        </p>
      ) : (
        <div
          style={{
            display: "grid",
            gap: 12,
            gridTemplateColumns: "repeat(auto-fill, minmax(190px, 1fr))",
          }}
        >
          {points.map((point, i) => (
            <BadgeCard key={i} name={point} metric={metricFor(point, metrics)} />
          ))}
        </div>
      )}
    </section>
  );
}

function BadgeCard({ name, metric }: { name: string; metric: Metric }) {
  const Icon = metric.kind === "none" ? Award : metric.Icon;
  const pct =
    metric.kind === "progress"
      ? Math.min(100, Math.round((metric.current / Math.max(1, metric.target)) * 100))
      : 0;

  return (
    <div
      style={{
        padding: 16,
        borderRadius: 12,
        background: "linear-gradient(135deg, rgba(225, 6, 0, 0.06), rgba(168, 4, 0, 0.04))",
        border: "1px solid rgba(225, 6, 0, 0.18)",
        position: "relative",
      }}
    >
      <div style={{ color: "var(--color-altus-red)", marginBottom: 10 }} aria-hidden>
        <Icon size={26} strokeWidth={2.1} />
      </div>
      <div
        style={{
          fontSize: 12.5,
          fontWeight: 800,
          color: "var(--color-ink-strong)",
          marginBottom: 10,
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          lineHeight: 1.3,
        }}
      >
        {name}
      </div>

      {metric.kind === "progress" ? (
        <div>
          <div style={{ height: 5, background: "rgba(15, 23, 42, 0.06)", borderRadius: 999, overflow: "hidden" }}>
            <div
              style={{
                width: `${pct}%`,
                height: "100%",
                background: "linear-gradient(90deg, #E10600, #A80400)",
                transition: "width 0.4s ease",
              }}
            />
          </div>
          <div
            style={{
              marginTop: 6,
              fontSize: 11.5,
              fontWeight: 800,
              color: "var(--color-ink-soft)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {metric.current} / {metric.target} {metric.suffix}
          </div>
        </div>
      ) : metric.kind === "count" ? (
        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
          <span
            style={{
              fontSize: 24,
              fontWeight: 900,
              color: "var(--color-ink-strong)",
              fontVariantNumeric: "tabular-nums",
              lineHeight: 1,
            }}
          >
            {metric.value}
          </span>
          <span
            style={{
              fontSize: 11.5,
              fontWeight: 800,
              color: "var(--color-ink-soft)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
            }}
          >
            {metric.suffix}
          </span>
        </div>
      ) : (
        <div
          style={{
            fontSize: 11,
            fontWeight: 800,
            color: "var(--color-ink-subtle)",
            background: "rgba(15, 23, 42, 0.05)",
            padding: "3px 9px",
            borderRadius: 999,
            display: "inline-block",
            letterSpacing: "0.06em",
          }}
        >
          TRACKED
        </div>
      )}
    </div>
  );
}
