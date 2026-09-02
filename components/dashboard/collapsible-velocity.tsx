"use client";
import * as React from "react";
import { Plus, Minus } from "lucide-react";
import type { VelocityPoint } from "@/lib/types";
import { VelocityHero } from "./velocity-hero";

/**
 * Task Velocity as a collapsed-by-default section at the bottom of the
 * dashboard. The chart is heavy, so it's NOT mounted until the user opens it
 * (click the + on the header bar) — the body only renders while `open`, so the
 * VelocityChart never costs anything on a normal dashboard load.
 */
export function CollapsibleVelocity({ data }: { data: VelocityPoint[] }) {
  const [open, setOpen] = React.useState(false);

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
          aria-controls="velocity-body"
          className="w-full flex items-center justify-between gap-4 p-8 max-md:p-5 text-left transition-colors hover:bg-surface-subtle/40"
        >
          <div className="min-w-0">
            <h2 className="text-display-lg text-ink-strong">
              <span aria-hidden className="mr-2">📈</span>Task Velocity
            </h2>
            <p className="text-body-lg text-ink-subtle mt-1">
              New vs finished tasks per week.{" "}
              <span className="font-semibold text-ink-soft">
                {open ? "Click to hide." : "Click to view the chart."}
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
          <div id="velocity-body" className="border-t border-hairline">
            <VelocityHero data={data} embedded />
          </div>
        )}
      </div>
    </section>
  );
}
