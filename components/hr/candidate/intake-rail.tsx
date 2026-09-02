"use client";

import type * as React from "react";
import { Check, CircleCheck } from "lucide-react";

const RED = "var(--color-altus-red)";
const RED_DEEP = "var(--color-altus-red-deep)";
const GREEN = "#16a34a";

type StepStatus = "active" | "done" | "error" | "idle";

/**
 * Left rail for the Candidate Interview Form. Each step is a crisply-outlined
 * "box" with distinct idle / active / done / error states (section number +
 * title + status glyph). The active box clearly stands out (brand-tinted fill,
 * 2px red outline, left accent bar, lift). Pure CSS transitions, keyboard
 * navigable. Mobile collapses to a horizontal progress strip.
 */
export function IntakeRail({
  steps,
  activeIndex,
  onSelect,
}: {
  steps: { label: string; status: StepStatus }[];
  activeIndex: number;
  onSelect: (index: number) => void;
}) {
  const lastIndex = steps.length - 1;
  const doneCount = steps.filter((s) => s.status === "done").length;

  return (
    <>
      {/* ── Desktop vertical rail ── */}
      <nav
        aria-label="Form sections"
        className="flex h-full w-[292px] shrink-0 flex-col overflow-y-auto border-r border-hairline bg-[#fbfafc] px-3.5 py-6 max-md:hidden"
      >
        <div className="px-2 pb-5">
          <h2
            className="text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 800,
              fontSize: 20,
              letterSpacing: "-0.02em",
            }}
          >
            Registration
          </h2>
          <p className="mt-1 text-[12.5px] font-semibold text-ink-muted">
            {doneCount} of {steps.length} sections complete
          </p>
        </div>

        <div className="flex flex-col gap-2">
          {steps.map((s, i) => {
            const isLast = i === lastIndex;
            const box = boxStyle(s.status);
            return (
              <div key={i}>
                {isLast && (
                  <div className="mx-1 my-2 flex items-center gap-2">
                    <span className="h-px flex-1 bg-hairline" />
                    <span className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-ink-subtle">Finish</span>
                    <span className="h-px flex-1 bg-hairline" />
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => onSelect(i)}
                  aria-current={s.status === "active" ? "step" : undefined}
                  className="group relative flex w-full items-center gap-3 rounded-[14px] px-3 py-3 text-left transition-[background-color,border-color,box-shadow,transform] duration-200 hover:-translate-y-px focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-altus-red/40"
                  style={box}
                >
                  {s.status === "active" && (
                    <span
                      aria-hidden
                      className="absolute left-0 top-1/2 h-7 w-[3px] -translate-y-1/2 rounded-r-full"
                      style={{ background: RED }}
                    />
                  )}
                  <RailChip status={s.status} index={i} isLast={isLast} />
                  <span
                    className={`min-w-0 flex-1 line-clamp-2 text-[14px] leading-snug ${
                      s.status === "active" ? "font-bold" : "font-semibold"
                    }`}
                    style={{
                      color:
                        s.status === "active" || s.status === "error"
                          ? RED_DEEP
                          : s.status === "done"
                            ? "var(--color-ink-strong)"
                            : "var(--color-ink-soft)",
                    }}
                  >
                    {s.label}
                  </span>
                  <StatusGlyph status={s.status} />
                </button>
              </div>
            );
          })}
        </div>
      </nav>

      {/* ── Mobile horizontal progress strip ── */}
      <div className="md:hidden">
        <div className="flex items-center gap-2 overflow-x-auto border-b border-hairline bg-white px-4 py-3">
          {steps.map((s, i) => {
            const isActive = i === activeIndex;
            return (
              <button
                key={i}
                type="button"
                onClick={() => onSelect(i)}
                aria-current={isActive ? "step" : undefined}
                aria-label={`Step ${i + 1}: ${s.label}`}
                className="flex shrink-0 items-center gap-1.5 rounded-full py-1 pl-1 pr-3 transition-colors"
                style={isActive ? { background: "color-mix(in srgb, var(--color-altus-red) 9%, white)" } : undefined}
              >
                <RailDot status={s.status} index={i} isLast={i === lastIndex} />
                {isActive && (
                  <span className="max-w-[120px] truncate text-[12px] font-bold text-altus-red-deep">
                    {s.label}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}

/** Per-status box outline / fill / elevation for the desktop rail. */
function boxStyle(status: StepStatus): React.CSSProperties {
  switch (status) {
    case "active":
      return {
        background: "color-mix(in srgb, var(--color-altus-red) 8%, white)",
        border: "2px solid var(--color-altus-red)",
        boxShadow: "0 12px 26px -14px color-mix(in srgb, var(--color-altus-red) 60%, transparent)",
      };
    case "done":
      return {
        background: "#fff",
        border: "1.5px solid color-mix(in srgb, #16a34a 34%, var(--color-hairline))",
      };
    case "error":
      return {
        background: "color-mix(in srgb, var(--color-altus-red) 5%, white)",
        border: "1.5px solid color-mix(in srgb, var(--color-altus-red) 55%, var(--color-hairline))",
      };
    default:
      return { background: "#fff", border: "1.5px solid var(--color-hairline)" };
  }
}

function chipBg(status: StepStatus): string {
  if (status === "done") return GREEN;
  if (status === "error" || status === "active") return RED;
  return "var(--color-surface-soft, #eceaef)";
}

function RailChip({ status, index, isLast }: { status: StepStatus; index: number; isLast: boolean }) {
  const idle = status === "idle";
  return (
    <span
      className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] transition-colors"
      style={{
        background: chipBg(status),
        color: idle ? "var(--color-ink-soft)" : "#fff",
        boxShadow: status === "active" ? "0 6px 14px -6px color-mix(in srgb, var(--color-altus-red) 75%, transparent)" : undefined,
      }}
    >
      {status === "done" ? (
        <Check size={15} strokeWidth={3} />
      ) : status === "error" ? (
        <span className="text-[14px] font-black leading-none">!</span>
      ) : isLast ? (
        <CircleCheck size={16} />
      ) : (
        <span className="text-[12.5px] font-black leading-none">{index + 1}</span>
      )}
    </span>
  );
}

/** Small right-aligned status indicator on each desktop box. */
function StatusGlyph({ status }: { status: StepStatus }) {
  if (status === "active") {
    return <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: RED }} />;
  }
  if (status === "done") {
    return <CircleCheck aria-hidden size={16} className="shrink-0" style={{ color: GREEN }} />;
  }
  if (status === "error") {
    return <span aria-hidden className="text-[13px] font-black leading-none text-altus-red">!</span>;
  }
  return <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--color-hairline)" }} />;
}

function RailDot({ status, index, isLast }: { status: StepStatus; index: number; isLast: boolean }) {
  const idle = status === "idle";
  return (
    <span
      className="grid h-7 w-7 shrink-0 place-items-center rounded-full"
      style={{ background: chipBg(status), color: idle ? "var(--color-ink-subtle)" : "#fff" }}
    >
      {status === "done" ? (
        <Check size={13} strokeWidth={3} />
      ) : status === "error" ? (
        <span className="text-[12px] font-black leading-none">!</span>
      ) : isLast ? (
        <CircleCheck size={14} />
      ) : (
        <span className="text-[11px] font-bold leading-none">{index + 1}</span>
      )}
    </span>
  );
}
