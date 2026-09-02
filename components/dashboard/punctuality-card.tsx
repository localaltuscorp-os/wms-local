"use client";

import * as React from "react";
import { CheckCircle2, Clock, CalendarCheck } from "lucide-react";
import type { Punctuality } from "@/lib/types";

const GREEN = "var(--color-green-deep, #15803D)";
const RED = "var(--color-red-deep, #B91C1C)";

/** Colour a per-person on-time rate: green ≥80, amber 60–79, red below. */
function rateColor(rate: number): string {
  if (rate >= 80) return GREEN;
  if (rate >= 60) return "var(--color-amber-deep, #B45309)";
  return RED;
}

/**
 * D16 — "Delivered on time vs late". A done task is on time when it was finished
 * on or before its REVISED due date (effective due). Admins additionally see the
 * per-person breakdown; everyone else sees the team summary only.
 */
export function PunctualityCard({
  data,
  isAdmin,
}: {
  data: Punctuality;
  isAdmin: boolean;
}) {
  const { onTime, late, dated, undated, onTimeRate, byPerson } = data;
  const onTimeW = dated > 0 ? (onTime / dated) * 100 : 0;

  return (
    <section
      className="rounded-2xl border bg-surface-card p-6 max-md:p-4"
      style={{ borderColor: "var(--color-hairline-strong)", boxShadow: "0 1px 2px rgba(15,23,42,0.05)" }}
      aria-label="On-time delivery"
    >
      <div className="flex items-center gap-2.5">
        <span
          className="inline-flex size-8 items-center justify-center rounded-full"
          style={{ background: "color-mix(in srgb, var(--color-altus-red) 12%, transparent)", color: "var(--color-altus-red)" }}
        >
          <CalendarCheck size={17} strokeWidth={2.4} />
        </span>
        <div>
          <h2 className="text-[15px] font-black tracking-tight text-ink-strong leading-none">Delivered on Time</h2>
          <p className="mt-1 text-[12px] font-semibold text-ink-subtle leading-none">
            Done tasks · measured against the revised due date
          </p>
        </div>
      </div>

      {dated === 0 ? (
        <p className="mt-6 text-[14px] font-semibold text-ink-subtle">
          {undated > 0
            ? `${undated} delivered task${undated === 1 ? "" : "s"} in range, but none carry a completion date to measure.`
            : "No delivered tasks in this range yet."}
        </p>
      ) : (
        <div className="mt-5 grid grid-cols-[minmax(0,300px)_1fr] gap-7 max-lg:grid-cols-1 max-lg:gap-5">
          {/* ── Summary ── */}
          <div>
            <div className="flex items-end gap-2.5">
              <span
                className="tabular-nums leading-none"
                style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: 52, letterSpacing: "-0.02em", color: GREEN }}
              >
                {onTimeRate}%
              </span>
              <span className="mb-1.5 text-[13px] font-bold text-ink-soft">on time</span>
            </div>

            {/* split bar */}
            <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full" style={{ background: "color-mix(in srgb, var(--color-red-deep) 16%, transparent)" }}>
              <span className="h-full transition-all" style={{ width: `${onTimeW}%`, background: GREEN }} />
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-[13px] font-bold">
              <span className="inline-flex items-center gap-1.5" style={{ color: GREEN }}>
                <CheckCircle2 size={14} strokeWidth={2.6} /> On time
                <span className="tabular-nums text-ink-strong">{onTime}</span>
              </span>
              <span className="inline-flex items-center gap-1.5" style={{ color: RED }}>
                <Clock size={14} strokeWidth={2.6} /> Late
                <span className="tabular-nums text-ink-strong">{late}</span>
              </span>
            </div>

            {undated > 0 && (
              <p className="mt-2.5 text-[12px] font-semibold text-ink-subtle">
                {undated} done without a completion date — not counted.
              </p>
            )}
          </div>

          {/* ── Per-person (admins only) ── */}
          {isAdmin && byPerson.length > 0 && (
            <div className="min-w-0">
              <p className="mb-2.5 text-[10.5px] font-black uppercase tracking-[0.12em] text-ink-subtle">
                By person · busiest first
              </p>
              <ul className="flex flex-col gap-2.5">
                {byPerson.slice(0, 8).map((p) => {
                  const w = p.done > 0 ? (p.onTime / p.done) * 100 : 0;
                  return (
                    <li key={p.employeeId} className="flex items-center gap-3">
                      <span className="w-[34%] shrink-0 truncate text-[13.5px] font-bold text-ink-strong" title={p.employeeName}>
                        {p.employeeName}
                      </span>
                      <span className="relative h-2.5 flex-1 overflow-hidden rounded-full" style={{ background: "color-mix(in srgb, var(--color-red-deep) 16%, transparent)" }}>
                        <span className="absolute inset-y-0 left-0" style={{ width: `${w}%`, background: GREEN }} />
                      </span>
                      <span className="w-11 shrink-0 text-right text-[13px] font-black tabular-nums" style={{ color: rateColor(p.rate) }}>
                        {p.rate}%
                      </span>
                      <span className="w-16 shrink-0 text-right text-[11.5px] font-semibold tabular-nums text-ink-subtle">
                        {p.late > 0 ? `${p.late} late` : `${p.done} done`}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  );
}
