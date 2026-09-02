"use client";
import * as React from "react";
import { useRouter } from "next/navigation";
import * as Popover from "@radix-ui/react-popover";
import { AlertTriangle, Flame, ArrowDownUp, ChevronRight } from "lucide-react";
import Link from "next/link";
import type { Route } from "next";
import { AGE_BUCKETS, type AgeBucketId } from "@/db/enums";
import type { AgingRow, HeatmapCellTask } from "@/lib/types";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";

// Age-coded palette: cool/green for fresh, hot/red for old.
// Bars use a gradient pair for depth; deep is the saturated label color.
const BUCKET_COLOR: Record<
  AgeBucketId,
  { fill: string; deep: string; tint: string; light: string }
> = {
  "0-3":   { fill: "#86efac", deep: "#15803d", tint: "#dcfce7", light: "#bbf7d0" },
  "4-7":   { fill: "#4ade80", deep: "#15803d", tint: "#d1fae5", light: "#86efac" },
  "8-14":  { fill: "#bef264", deep: "#65a30d", tint: "#ecfccb", light: "#d9f99d" },
  "15-20": { fill: "#fcd34d", deep: "#b45309", tint: "#fef3c7", light: "#fde68a" },
  "21-30": { fill: "#fb923c", deep: "#c2410c", tint: "#ffedd5", light: "#fdba74" },
  "31-45": { fill: "#f87171", deep: "#b91c1c", tint: "#fee2e2", light: "#fca5a5" },
  "46-60": { fill: "#ef4444", deep: "#991b1b", tint: "#fecaca", light: "#f87171" },
  "60+":   { fill: "#b91c1c", deep: "#7f1d1d", tint: "#fecaca", light: "#ef4444" },
};

const BUCKET_WEIGHT: Record<AgeBucketId, number> = {
  "0-3": 1, "4-7": 2, "8-14": 3, "15-20": 5,
  "21-30": 7, "31-45": 10, "46-60": 14, "60+": 20,
};

const CRITICAL_BUCKETS: AgeBucketId[] = ["31-45", "46-60", "60+"];

function riskScore(row: AgingRow): number {
  if (row.total === 0) return 0;
  const weighted = AGE_BUCKETS.reduce(
    (s, b) => s + row.buckets[b.id] * BUCKET_WEIGHT[b.id],
    0,
  );
  const raw = weighted / row.total;
  return Math.round(((raw - 1) / 19) * 100);
}

type SortMode = "risk" | "total" | "oldest";

export function AgingHeatmap({
  rows,
  cellTasks,
}: {
  rows: AgingRow[];
  cellTasks: Record<string, Record<string, HeatmapCellTask[]>>;
}) {
  const [sortMode, setSortMode] = React.useState<SortMode>("risk");

  const enriched = React.useMemo(
    () => rows.map((r) => ({ ...r, risk: riskScore(r) })),
    [rows],
  );

  const sorted = React.useMemo(() => {
    const copy = [...enriched];
    if (sortMode === "total") copy.sort((a, b) => b.total - a.total);
    else if (sortMode === "risk") copy.sort((a, b) => b.risk - a.risk);
    else
      copy.sort(
        (a, b) =>
          CRITICAL_BUCKETS.reduce((s, k) => s + b.buckets[k], 0) -
          CRITICAL_BUCKETS.reduce((s, k) => s + a.buckets[k], 0),
      );
    return copy;
  }, [enriched, sortMode]);

  const top12 = sorted.slice(0, 12);
  const maxTotal = Math.max(...top12.map((r) => r.total), 1);

  const totalAging = enriched.reduce((s, r) => s + r.total, 0);
  const criticalTotal = enriched.reduce(
    (s, r) => s + CRITICAL_BUCKETS.reduce((acc, k) => acc + r.buckets[k], 0),
    0,
  );

  return (
    <section
      className="mx-auto max-w-[1600px] px-12 max-md:px-4 mt-12 mb-16"
      style={{
        opacity: 0,
        animation: "fadeUp 500ms ease-out 900ms forwards",
      }}
    >
      <div
        className="aging-shell rounded-section p-8 max-md:p-5 relative overflow-hidden"
        style={{
          background:
            "linear-gradient(160deg, #fffefb 0%, #fef7ed 60%, #fef2f2 100%)",
          border: "1px solid var(--color-hairline)",
          boxShadow:
            "0 1px 3px rgba(15, 23, 42, 0.04), 0 20px 50px -28px rgba(225, 6, 0, 0.15)",
        }}
      >
        {/* Heat wash backdrop */}
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 30% 60% at 100% 100%, rgba(239, 68, 68, 0.10), transparent 60%), radial-gradient(ellipse 30% 60% at 0% 0%, rgba(34, 197, 94, 0.08), transparent 60%)",
          }}
        />

        <div className="relative">
          <header className="mb-6 flex items-start justify-between gap-6 max-md:flex-col max-md:gap-3">
            <div>
              <h2 className="flex items-center gap-2.5 text-ink-strong">
                <Flame
                  className="size-8"
                  style={{ color: "#dc2626" }}
                  strokeWidth={2.25}
                />
                <span
                  className="uppercase font-black tracking-[0.04em]"
                  style={{
                    fontFamily: "var(--font-display), system-ui, sans-serif",
                    fontSize: 30,
                    letterSpacing: "-0.02em",
                  }}
                >
                  Aging Heatmap
                </span>
              </h2>
              <p className="mt-1.5 font-semibold" style={{ fontSize: 17, color: "var(--color-ink-muted)" }}>
                {enriched.length} {enriched.length === 1 ? "person" : "people"}
                {" · "}
                <span className="tabular-nums" style={{ color: "var(--color-ink-strong)" }}>
                  {totalAging}
                </span>{" "}
                pending {totalAging === 1 ? "task" : "tasks"} aging — click any lane to see them
              </p>
            </div>
            <SortControl value={sortMode} onChange={setSortMode} />
          </header>

          {criticalTotal > 0 && <AlertBanner count={criticalTotal} />}

          <Legend />

          {top12.length === 0 ? (
            <p className="mt-6 font-semibold" style={{ fontSize: 17, color: "var(--color-ink-muted)" }}>
              No pending tasks for the current filter.
            </p>
          ) : (
            <div className="mt-6 space-y-2">
              <LaneHeader />
              {top12.map((r, i) => (
                <Lane
                  key={r.employeeId}
                  row={r}
                  maxTotal={maxTotal}
                  index={i}
                  employeeTasks={cellTasks[r.employeeId] ?? {}}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

function SortControl({
  value,
  onChange,
}: {
  value: SortMode;
  onChange: (m: SortMode) => void;
}) {
  const options: { id: SortMode; label: string }[] = [
    { id: "risk", label: "Risk" },
    { id: "total", label: "Total" },
    { id: "oldest", label: "Oldest" },
  ];
  return (
    <div
      className="inline-flex items-center gap-1 p-1 rounded-chip bg-surface-card border border-hairline"
      role="tablist"
      aria-label="Sort aging table"
    >
      <ArrowDownUp className="size-4 text-ink-subtle ml-1.5 mr-0.5" />
      {options.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.id)}
            className="px-4 py-2 rounded-pill font-bold transition-all duration-200 tabular-nums"
            style={{
              fontSize: 14,
              background: active ? "var(--color-ink-strong)" : "transparent",
              color: active ? "#ffffff" : "var(--color-ink-muted)",
              boxShadow: active ? "0 4px 10px rgba(15,23,42,0.18)" : "none",
            }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function AlertBanner({ count }: { count: number }) {
  return (
    <div
      className="mt-1 mb-3 flex items-center gap-3 rounded-chip px-5 py-3.5"
      style={{
        background:
          "linear-gradient(90deg, rgba(225, 6, 0, 0.12), rgba(225, 6, 0, 0.04))",
        borderLeft: "4px solid #dc2626",
        boxShadow: "0 4px 14px -8px rgba(220, 38, 38, 0.45)",
      }}
    >
      <AlertTriangle className="size-6 shrink-0" style={{ color: "#A80400" }} />
      <p style={{ fontSize: 17, color: "var(--color-ink-strong)" }}>
        <span className="tabular-nums font-black" style={{ fontSize: 22 }}>
          {count}
        </span>
        <span className="font-semibold" style={{ color: "var(--color-ink-soft)" }}>
          {" "}
          {count === 1 ? "task is" : "tasks are"} aging more than 30 days —
          escalate or close
        </span>
      </p>
    </div>
  );
}

function Legend() {
  return (
    <div className="mt-4 flex items-center gap-1.5 flex-wrap">
      <span
        className="uppercase font-bold tracking-[0.10em] mr-1.5"
        style={{
          fontFamily: "var(--font-mono-display), ui-monospace, monospace",
          fontSize: 13,
          color: "var(--color-ink-muted)",
        }}
      >
        Age
      </span>
      {AGE_BUCKETS.map((b) => {
        const c = BUCKET_COLOR[b.id];
        return (
          <div
            key={b.id}
            className="inline-flex items-center gap-1.5 rounded-pill px-3 py-1"
            style={{
              background: c.tint,
              border: `1px solid ${c.light}`,
            }}
          >
            <span
              className="inline-block size-2.5 rounded-full"
              style={{ background: c.fill, boxShadow: `0 0 6px ${c.fill}` }}
            />
            <span
              className="font-black tabular-nums"
              style={{ fontSize: 13, color: c.deep }}
            >
              {b.id}d
            </span>
          </div>
        );
      })}
    </div>
  );
}

function LaneHeader() {
  return (
    <div
      className="grid items-center gap-4 px-3 pb-2 max-md:hidden"
      style={{ gridTemplateColumns: "260px 88px 1fr 64px 28px" }}
    >
      <span
        className="uppercase font-bold tracking-[0.10em]"
        style={{
          fontFamily: "var(--font-mono-display), ui-monospace, monospace",
          fontSize: 12,
          color: "var(--color-ink-muted)",
        }}
      >
        Employee
      </span>
      <span
        className="text-center uppercase font-bold tracking-[0.10em]"
        style={{
          fontFamily: "var(--font-mono-display), ui-monospace, monospace",
          fontSize: 12,
          color: "var(--color-ink-muted)",
        }}
      >
        Risk
      </span>
      <span
        className="uppercase font-bold tracking-[0.10em]"
        style={{
          fontFamily: "var(--font-mono-display), ui-monospace, monospace",
          fontSize: 12,
          color: "var(--color-ink-muted)",
        }}
      >
        Pending by age (oldest →)
      </span>
      <span
        className="text-right uppercase font-bold tracking-[0.10em]"
        style={{
          fontFamily: "var(--font-mono-display), ui-monospace, monospace",
          fontSize: 12,
          color: "var(--color-ink-muted)",
        }}
      >
        Total
      </span>
      <span aria-hidden />
    </div>
  );
}

function Lane({
  row,
  maxTotal,
  index,
  employeeTasks,
}: {
  row: AgingRow & { risk: number };
  maxTotal: number;
  index: number;
  employeeTasks: Record<string, HeatmapCellTask[]>;
}) {
  const router = useRouter();
  const lengthPct = (row.total / maxTotal) * 100;
  const target = `/tasks?emp=${row.employeeId}` as Route;

  return (
    <div
      role="link"
      tabIndex={0}
      aria-label={`Open ${row.employeeName}'s aging tasks (risk ${row.risk}, ${row.total} pending)`}
      onClick={() => router.push(target)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          router.push(target);
        }
      }}
      // Tier-3 mobile fix — at 390px the 260+88+1fr+64+28 grid (≈624px min)
      // overflows the section by ~250px. We collapse to a 2-row stacked
      // layout via `aging-lane-mobile` (set in globals.css) on `max-md`.
      className="aging-lane aging-lane-mobile grid items-center gap-4 px-3 py-3.5 rounded-chip transition-all max-md:gap-2 max-md:px-2 max-md:py-3"
      style={{
        gridTemplateColumns: "260px 88px 1fr 64px 28px",
        background: "var(--color-surface-card)",
        border: "1px solid var(--color-hairline)",
        opacity: 0,
        animation: `fadeUp 420ms ease-out ${index * 50 + 200}ms forwards`,
        cursor: "pointer",
      }}
    >
      {/* Employee — avatar + name */}
      <div className="flex items-center gap-3 min-w-0">
        <EmployeeAvatar name={row.employeeName} size="md" />
        <span
          className="text-ink-strong truncate font-bold"
          style={{ fontSize: 17 }}
        >
          {row.employeeName}
        </span>
      </div>

      {/* Risk score */}
      <RiskChip score={row.risk} />

      {/* Heat bar */}
      <div
        className="relative rounded-bar bg-surface-soft overflow-hidden"
        style={{
          height: 52,
          border: "1px solid var(--color-hairline)",
        }}
      >
        <div
          className="absolute inset-y-0 left-0 flex"
          style={{
            width: `${lengthPct}%`,
            transition: "width 600ms cubic-bezier(0.16, 1, 0.3, 1)",
          }}
        >
          {AGE_BUCKETS.map((b) => {
            const v = row.buckets[b.id];
            if (v === 0) return null;
            const segPct = (v / row.total) * 100;
            return (
              <Segment
                key={b.id}
                bucketId={b.id}
                bucketLabel={b.label}
                count={v}
                widthPct={segPct}
                employeeName={row.employeeName}
                tasks={employeeTasks[b.id] ?? []}
              />
            );
          })}
        </div>
      </div>

      {/* Total */}
      <span
        className="text-right tabular-nums text-ink-strong font-black"
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontSize: 26,
          letterSpacing: "-0.02em",
        }}
      >
        {row.total}
      </span>

      {/* Chevron — telegraphs click target */}
      <span
        className="aging-lane-chevron inline-flex items-center justify-center"
        aria-hidden
        style={{ color: "var(--color-ink-subtle)" }}
      >
        <ChevronRight size={20} strokeWidth={2.4} />
      </span>
    </div>
  );
}

function RiskChip({ score }: { score: number }) {
  const tone = score >= 60 ? "red" : score >= 35 ? "amber" : "green";
  const palette = {
    red: {
      bg: "linear-gradient(135deg, #fecaca, #f87171)",
      fg: "#7f1d1d",
      dot: "#dc2626",
      glow: "0 4px 12px rgba(220, 38, 38, 0.35)",
    },
    amber: {
      bg: "linear-gradient(135deg, #fef3c7, #fbbf24)",
      fg: "#78350f",
      dot: "#d97706",
      glow: "0 4px 12px rgba(217, 119, 6, 0.30)",
    },
    green: {
      bg: "linear-gradient(135deg, #d1fae5, #34d399)",
      fg: "#064e3b",
      dot: "#059669",
      glow: "0 4px 12px rgba(5, 150, 105, 0.25)",
    },
  }[tone];
  return (
    <div
      className="inline-flex items-center justify-center gap-2 rounded-pill px-3 py-1.5 mx-auto"
      style={{
        background: palette.bg,
        minWidth: 76,
        boxShadow: palette.glow,
        border: "1px solid rgba(255,255,255,0.5)",
      }}
      title={`Aging risk score: ${score}/100`}
    >
      <span
        className="size-2 rounded-full"
        style={{
          background: palette.dot,
          boxShadow: tone === "red" ? `0 0 8px ${palette.dot}` : "none",
        }}
      />
      <span
        className="font-black tabular-nums"
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontSize: 17,
          color: palette.fg,
          letterSpacing: "-0.01em",
        }}
      >
        {score}
      </span>
    </div>
  );
}

function Segment({
  bucketId,
  bucketLabel,
  count,
  widthPct,
  employeeName,
  tasks,
}: {
  bucketId: AgeBucketId;
  bucketLabel: string;
  count: number;
  widthPct: number;
  employeeName: string;
  tasks: HeatmapCellTask[];
}) {
  const c = BUCKET_COLOR[bucketId];
  const showLabel = widthPct > 8;
  const isCritical = CRITICAL_BUCKETS.includes(bucketId);

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          // Crucial: keep the segment click from bubbling up to the lane's
          // navigation handler so the popover opens instead of redirecting.
          onClick={(e) => e.stopPropagation()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") e.stopPropagation();
          }}
          className="aging-segment h-full flex items-center justify-center text-white transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 hover:brightness-110 hover:scale-y-110 origin-bottom"
          style={{
            width: `${widthPct}%`,
            background: `linear-gradient(180deg, ${c.light}, ${c.fill})`,
            minWidth: 0,
            outlineColor: c.deep,
            animation: isCritical
              ? "heatPulse 2.4s ease-in-out infinite"
              : "none",
            fontFamily: "var(--font-display), system-ui, sans-serif",
            fontWeight: 900,
            fontSize: 17,
            textShadow: "0 1px 2px rgba(0,0,0,0.28)",
          }}
          aria-label={`${employeeName}, ${bucketLabel}: ${count} pending`}
        >
          {showLabel && <span className="tabular-nums">{count}</span>}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="top"
          align="center"
          sideOffset={10}
          collisionPadding={12}
          className="z-[100] bg-surface-card border rounded-section overflow-hidden max-h-[var(--radix-popover-content-available-height)] flex flex-col"
          style={{
            borderColor: c.deep,
            borderWidth: 2,
            boxShadow:
              "0 24px 56px -16px rgba(15, 23, 42, 0.24), 0 8px 24px -8px rgba(15, 23, 42, 0.14)",
            // Fixed, bounded width so a long task title can never stretch the
            // popover off-screen — titles wrap inside instead. Never exceeds
            // the viewport minus the 12px collision gutter on each side.
            width: "min(420px, calc(100vw - 24px))",
            maxWidth: "calc(100vw - 24px)",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header — coloured band with the bucket label */}
          <div
            className="px-5 py-4 shrink-0"
            style={{
              background: `linear-gradient(135deg, ${c.fill}, ${c.deep})`,
              color: "#ffffff",
            }}
          >
            <p
              className="font-black leading-tight"
              style={{
                fontFamily: "var(--font-display), system-ui, sans-serif",
                fontSize: 22,
                letterSpacing: "-0.01em",
              }}
            >
              {employeeName}
            </p>
            <p
              className="uppercase tracking-[0.12em] font-bold mt-1.5 opacity-95"
              style={{
                fontFamily: "var(--font-mono-display), ui-monospace, monospace",
                fontSize: 13,
              }}
            >
              {bucketLabel} · {tasks.length}{" "}
              {tasks.length === 1 ? "task" : "tasks"}
            </p>
          </div>

          {/* Task list — each title wraps to 2 lines (with long URLs/emails
              broken) so nothing spills out of the popover. The list scrolls
              when there are many tasks. */}
          <ul className="flex flex-col flex-1 min-h-0 p-2 overflow-y-auto bg-surface-card">
            {tasks.length === 0 && (
              <li
                className="py-4 px-3 font-semibold"
                style={{ fontSize: 16, color: "var(--color-ink-muted)" }}
              >
                No tasks.
              </li>
            )}
            {tasks.map((t) => (
              <li key={t.id}>
                <Link
                  href={`/tasks/${t.id}` as Route}
                  className="aging-popover-row flex items-start justify-between gap-3 py-3 px-3 rounded-chip transition-colors"
                >
                  <span
                    className="text-ink-strong font-bold min-w-0"
                    style={{
                      fontSize: 15.5,
                      lineHeight: 1.4,
                      overflowWrap: "anywhere",
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                      overflow: "hidden",
                    }}
                  >
                    {t.title}
                  </span>
                  <span
                    className="tabular-nums font-black shrink-0 rounded-pill px-2.5 py-1 mt-0.5"
                    style={{
                      fontFamily: "var(--font-display), system-ui, sans-serif",
                      fontSize: 15,
                      color: c.deep,
                      background: c.tint,
                      border: `1px solid ${c.light}`,
                    }}
                  >
                    {t.ageDays}d
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          <Popover.Arrow style={{ fill: c.deep }} width={14} height={8} />
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
