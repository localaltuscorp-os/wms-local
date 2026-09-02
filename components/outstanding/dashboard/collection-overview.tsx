"use client";
import { HBars } from "@/components/charts/h-bars";
import { Donut } from "@/components/charts/donut";
import { formatInr } from "@/lib/format";

interface Collections {
  totalCollected: number;
  topMode: string;
  topCollector: string;
  topClients: { name: string; amount: number }[];
  byMode: { name: string; amount: number }[];
}

// A small, legible palette for the by-mode donut (light theme).
const DONUT_PALETTE = [
  "var(--color-blue)",
  "var(--color-green)",
  "var(--color-purple)",
  "var(--color-orange)",
  "var(--color-altus-red)",
  "var(--color-blue-deep)",
  "var(--color-green-deep)",
  "var(--color-purple-deep)",
];

export function CollectionOverview({ collections }: { collections: Collections }) {
  const { totalCollected, topMode, topCollector, topClients, byMode } = collections;

  const clientBars = topClients
    .slice(0, 8)
    .map((c) => ({ label: c.name, value: c.amount }));

  const modeSlices = byMode.map((m, i) => ({
    label: m.name,
    value: m.amount,
    color: DONUT_PALETTE[i % DONUT_PALETTE.length]!,
  }));

  return (
    <section
      className="mt-7 rounded-section bg-surface-card border border-hairline p-7 max-md:p-5"
      style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
    >
      <h2 className="text-display-lg text-ink-strong">Collection Overview</h2>

      {totalCollected === 0 ? (
        <p
          className="mt-3 font-semibold"
          style={{ fontSize: 14, color: "var(--color-ink-subtle)" }}
        >
          No collections recorded for this range.
        </p>
      ) : (
        <>
          <div className="mt-5 grid grid-cols-3 gap-3 max-sm:grid-cols-1">
            <Tile
              label="Total Collected"
              value={formatInr(totalCollected)}
              valueColor="var(--color-green-deep)"
            />
            <Tile label="Top Payment Mode" value={topMode} />
            <Tile label="Top Collector" value={topCollector} />
          </div>

          <div className="mt-6 grid grid-cols-2 gap-6 max-lg:grid-cols-1">
            <div>
              <h3
                className="uppercase font-bold tracking-[0.06em] text-ink-subtle"
                style={{ fontSize: 11 }}
              >
                Top Clients by Amount Collected
              </h3>
              {clientBars.length === 0 ? (
                <p
                  className="mt-3 font-semibold"
                  style={{ fontSize: 13, color: "var(--color-ink-subtle)" }}
                >
                  No client data.
                </p>
              ) : (
                <div className="mt-4">
                  <HBars
                    data={clientBars}
                    defaultColor="var(--color-green)"
                    height={Math.max(160, clientBars.length * 40)}
                  />
                </div>
              )}
            </div>

            <div>
              <h3
                className="uppercase font-bold tracking-[0.06em] text-ink-subtle"
                style={{ fontSize: 11 }}
              >
                By Payment Mode
              </h3>
              {modeSlices.length === 0 ? (
                <p
                  className="mt-3 font-semibold"
                  style={{ fontSize: 13, color: "var(--color-ink-subtle)" }}
                >
                  No payment-mode data.
                </p>
              ) : (
                <div className="mt-4 flex items-center gap-6 flex-wrap">
                  <Donut data={modeSlices} size={200} centerLabel="Collected" />
                  <ul className="flex flex-col gap-2 min-w-[140px]">
                    {modeSlices.map((s) => (
                      <li key={s.label} className="flex items-center gap-2.5">
                        <span
                          className="inline-block rounded-sm shrink-0"
                          style={{ width: 12, height: 12, background: s.color }}
                          aria-hidden
                        />
                        <span
                          className="font-semibold text-ink-soft"
                          style={{ fontSize: 13 }}
                        >
                          {s.label}
                        </span>
                        <span
                          className="ml-auto tabular-nums font-bold text-ink-strong"
                          style={{ fontSize: 13 }}
                        >
                          {formatInr(s.value)}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

function Tile({
  label,
  value,
  valueColor,
}: {
  label: string;
  value: string;
  valueColor?: string;
}) {
  return (
    <div
      className="rounded-chip border border-hairline p-4"
      style={{ background: "var(--color-surface-track)" }}
    >
      <p
        className="uppercase font-bold tracking-[0.06em] text-ink-subtle"
        style={{ fontSize: 11 }}
      >
        {label}
      </p>
      <p
        className="mt-1.5 font-black tabular-nums"
        style={{
          fontFamily: "var(--font-display), system-ui, sans-serif",
          fontSize: 24,
          letterSpacing: "-0.02em",
          color: valueColor ?? "var(--color-ink-strong)",
        }}
      >
        {value}
      </p>
    </div>
  );
}
