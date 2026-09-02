import { Sparkles, ThumbsUp, TriangleAlert } from "lucide-react";
import {
  generateAttendanceInsights,
  type AttendanceInsights,
} from "@/lib/ai/attendance-insights";
import type { AttendanceAnalytics } from "@/lib/queries/salary-attendance-analytics";

// WS-5 Salary — AI pros/cons read-out on the attendance analytics.
//
// `AttendanceAiInsights` is an ASYNC server component: it awaits the LLM (or the
// deterministic fallback) itself, so the parent can wrap it in <Suspense> and
// stream it in AFTER the (instant) discipline matrix — the metrics never wait on
// the model. `AttendanceAiInsightsView` is the pure presentational half.

const GREEN = "var(--color-altus-red-deep)";
const RED = "var(--color-altus-red)";

export async function AttendanceAiInsights({ data }: { data: AttendanceAnalytics }) {
  const insights = await generateAttendanceInsights({
    employeeName: data.employeeName,
    month: data.month,
    thisMonth: data.thisMonth,
    last3Months: data.last3Months,
    ytd: data.ytd,
    exGratiaRemarks: data.exGratiaRemarks.map((r) => r.reason),
    deductionRemarks: data.deductionRemarks.map((r) => r.reason),
  });
  return <AttendanceAiInsightsView insights={insights} />;
}

export function AttendanceAiInsightsView({ insights }: { insights: AttendanceInsights }) {
  return (
    <section
      aria-label="AI attendance read-out"
      className="wg-rise admin-panel px-6 py-5 max-md:px-4"
      style={{ animationDelay: "140ms" }}
    >
      <div className="flex items-center gap-2">
        <span
          className="inline-grid size-7 place-items-center rounded-[10px] text-white"
          style={{ background: `linear-gradient(135deg, var(--color-altus-red), ${GREEN})` }}
          aria-hidden
        >
          <Sparkles size={15} strokeWidth={2.4} />
        </span>
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-subtle">
          AI read-out
        </span>
        <span
          className="ml-auto rounded-pill px-2 py-[2px] text-[10px] font-bold uppercase tracking-[0.1em]"
          style={{
            color: "var(--color-ink-subtle)",
            background: "var(--color-surface-track)",
          }}
        >
          {insights.source === "ai" ? "AI" : "Rules-based"}
        </span>
      </div>

      <p
        className="mt-3 text-ink-strong"
        style={{
          fontFamily: "var(--font-serif), system-ui, sans-serif",
          fontStyle: "italic",
          fontSize: 16,
          lineHeight: 1.45,
        }}
      >
        {insights.summary}
      </p>

      <div className="mt-4 grid grid-cols-2 gap-4 max-sm:grid-cols-1">
        <PointList
          title="Pros"
          icon={<ThumbsUp size={13} strokeWidth={2.5} />}
          accent={GREEN}
          points={insights.pros}
          emptyText="No standout positives."
        />
        <PointList
          title="Cons"
          icon={<TriangleAlert size={13} strokeWidth={2.5} />}
          accent={RED}
          points={insights.cons}
          emptyText="No concerns flagged."
        />
      </div>
    </section>
  );
}

function PointList({
  title,
  icon,
  accent,
  points,
  emptyText,
}: {
  title: string;
  icon: React.ReactNode;
  accent: string;
  points: string[];
  emptyText: string;
}) {
  return (
    <div
      className="rounded-2xl px-4 py-3.5"
      style={{
        background: `color-mix(in srgb, ${accent} 6%, transparent)`,
        boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${accent} 18%, transparent)`,
      }}
    >
      <div className="flex items-center gap-1.5" style={{ color: accent }}>
        {icon}
        <span className="text-[11px] font-bold uppercase tracking-[0.12em]">{title}</span>
      </div>
      {points.length === 0 ? (
        <p className="mt-2 text-[13px] text-ink-subtle">{emptyText}</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1.5">
          {points.map((p, i) => (
            <li key={i} className="flex items-start gap-2 text-[13.5px] leading-snug text-ink-soft">
              <span
                className="mt-[7px] size-1.5 shrink-0 rounded-full"
                style={{ background: accent }}
                aria-hidden
              />
              {p}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
