"use client";

import * as React from "react";
import { Plus, Minus, CheckCircle2, Clock } from "lucide-react";
import type { DoneOnTime, PunctualityBasis } from "@/lib/types";

const GREEN = "var(--color-green-deep, #15803D)";
const RED = "var(--color-red-deep, #B91C1C)";

/** Colour a per-person on-time rate: green ≥80, amber 60–79, red below. */
function rateColor(rate: number): string {
  if (rate >= 80) return GREEN;
  if (rate >= 60) return "var(--color-amber-deep, #B45309)";
  return RED;
}

/** Early / on-time bands are green; late bands (ids starting `l`) are red. */
function bandIsLate(id: string): boolean {
  return id.startsWith("l");
}

/**
 * Done — On time & aging. A collapsed-by-default section (the body is not
 * mounted until opened, like NotApprovedSection). The `Original ⇄ Revised`
 * toggle switches which due-date basis we measure against; for the active
 * basis we show the on-time summary (lifted from PunctualityCard) plus a
 * 12-band signed early/late histogram and the admin-only per-person list.
 */
export function DoneAgingSection({
  data,
  isAdmin,
}: {
  data: DoneOnTime;
  isAdmin: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [basis, setBasis] = React.useState<"original" | "revised">("revised");

  const active: PunctualityBasis = data[basis];

  return (
    <section className="mx-auto max-w-[1600px] px-12 max-md:px-4 mt-12 max-md:mt-6">
      <div
        className="bg-surface-card rounded-section overflow-hidden"
        style={{
          border: "1px solid var(--color-hairline)",
          boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)",
        }}
      >
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-controls="done-aging-body"
          className="w-full flex items-center justify-between gap-4 p-8 max-md:p-5 text-left transition-colors hover:bg-surface-subtle/40"
        >
          <div className="min-w-0">
            <h2 className="text-display-lg text-ink-strong">
              <span aria-hidden className="mr-2">📦</span>Done — On Time &amp; Aging
            </h2>
            <p className="text-body-lg text-ink-subtle mt-1">
              On-time delivery and how early/late, by original or revised due date.{" "}
              <span className="font-semibold text-ink-soft">
                {open ? "Click to hide." : "Click to view."}
              </span>
            </p>
          </div>
          <span
            aria-hidden
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full transition-all"
            style={{
              background: open
                ? "var(--color-altus-red)"
                : "color-mix(in srgb, var(--color-altus-red) 12%, transparent)",
              color: open ? "#fff" : "var(--color-altus-red)",
            }}
          >
            {open ? (
              <Minus size={22} strokeWidth={2.6} />
            ) : (
              <Plus size={22} strokeWidth={2.6} />
            )}
          </span>
        </button>

        {open && (
          <div
            id="done-aging-body"
            className="border-t border-hairline p-8 max-md:p-5"
          >
            <BasisToggle value={basis} onChange={setBasis} />
            <div className="mt-6">
              <BasisView basis={active} isAdmin={isAdmin} />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function BasisToggle({
  value,
  onChange,
}: {
  value: "original" | "revised";
  onChange: (v: "original" | "revised") => void;
}) {
  const options: { id: "original" | "revised"; label: string }[] = [
    { id: "original", label: "Original" },
    { id: "revised", label: "Revised" },
  ];
  return (
    <div
      className="inline-flex items-center gap-1 p-1 rounded-chip bg-surface-card border border-hairline"
      role="tablist"
      aria-label="Due-date basis"
    >
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

function BasisView({
  basis,
  isAdmin,
}: {
  basis: PunctualityBasis;
  isAdmin: boolean;
}) {
  const { onTime, late, dated, undated, onTimeRate, byPerson, histogram } = basis;

  if (dated === 0) {
    return (
      <p className="text-[14px] font-semibold text-ink-subtle">
        {undated > 0
          ? `${undated} delivered task${undated === 1 ? "" : "s"} in range, but none carry a completion date to measure.`
          : "No delivered tasks in this range yet."}
      </p>
    );
  }

  const onTimeW = (onTime / dated) * 100;
  const maxBand = Math.max(...histogram.map((b) => b.count), 1);

  return (
    <div className="flex flex-col gap-8">
      {/* ── On-time summary ── */}
      <div className="grid grid-cols-[minmax(0,300px)_1fr] gap-7 max-lg:grid-cols-1 max-lg:gap-5">
        <div>
          <div className="flex items-end gap-2.5">
            <span
              className="tabular-nums leading-none"
              style={{
                fontFamily: "var(--font-display), system-ui, sans-serif",
                fontWeight: 900,
                fontSize: 52,
                letterSpacing: "-0.02em",
                color: GREEN,
              }}
            >
              {onTimeRate}%
            </span>
            <span className="mb-1.5 text-[13px] font-bold text-ink-soft">on time</span>
          </div>

          {/* split bar */}
          <div
            className="mt-3 flex h-3 w-full overflow-hidden rounded-full"
            style={{ background: "color-mix(in srgb, var(--color-red-deep) 16%, transparent)" }}
          >
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

      {/* ── 12-band signed early/late histogram ── */}
      <div>
        <p className="mb-3 text-[10.5px] font-black uppercase tracking-[0.12em] text-ink-subtle">
          How early or late · {dated} dated {dated === 1 ? "task" : "tasks"}
        </p>
        <ul className="flex flex-col gap-2">
          {histogram.map((b) => {
            const late = bandIsLate(b.id);
            const color = late ? RED : GREEN;
            const w = (b.count / maxBand) * 100;
            return (
              <li key={b.id} className="flex items-center gap-3">
                <span
                  className="w-[26%] shrink-0 truncate text-[13px] font-bold text-ink-strong"
                  title={b.label}
                >
                  {b.label}
                </span>
                <span
                  className="relative h-3 flex-1 overflow-hidden rounded-full"
                  style={{ background: "color-mix(in srgb, var(--color-ink-strong) 8%, transparent)" }}
                >
                  <span
                    className="absolute inset-y-0 left-0 transition-all"
                    style={{ width: `${w}%`, background: color }}
                  />
                </span>
                <span
                  className="w-10 shrink-0 text-right text-[13px] font-black tabular-nums"
                  style={{ color: b.count > 0 ? color : "var(--color-ink-subtle)" }}
                >
                  {b.count}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
