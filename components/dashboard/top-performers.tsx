"use client";
import Link from "next/link";
import type { Route } from "next";
import { Trophy, Crown, Inbox } from "lucide-react";
import type { TopPerformer } from "@/lib/types";
import { useCountUp } from "@/lib/use-count-up";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";

const PODIUM_THEMES = [
  // GOLD
  {
    bar: "linear-gradient(90deg, #FBBF24, #D97706)",
    badge:
      "linear-gradient(135deg, #FCD34D 0%, #F59E0B 60%, #B45309 100%)",
    glow: "0 18px 40px -18px rgba(245, 158, 11, 0.55)",
    border: "#FDE68A",
    ring: "#F59E0B",
  },
  // SILVER
  {
    bar: "linear-gradient(90deg, #E5E7EB, #94A3B8)",
    badge:
      "linear-gradient(135deg, #F1F5F9 0%, #CBD5E1 55%, #64748B 100%)",
    glow: "0 18px 40px -18px rgba(100, 116, 139, 0.45)",
    border: "#E2E8F0",
    ring: "#94A3B8",
  },
  // BRONZE
  {
    bar: "linear-gradient(90deg, #FCA774, #B45309)",
    badge:
      "linear-gradient(135deg, #FED7AA 0%, #FB923C 55%, #B45309 100%)",
    glow: "0 18px 40px -18px rgba(180, 83, 9, 0.45)",
    border: "#FED7AA",
    ring: "#FB923C",
  },
];

// Everyone outside the podium — neutral slate, no medal glow. The medal
// look follows the TRUE rank, so a user filtered to themselves at #7 gets
// this, not a gold card pretending they're 1st.
const NEUTRAL_THEME = {
  bar: "linear-gradient(90deg, #CBD5E1, #94A3B8)",
  badge: "linear-gradient(135deg, #64748B 0%, #475569 60%, #1F2937 100%)",
  glow: "0 10px 24px -16px rgba(15, 23, 42, 0.3)",
  border: "var(--color-hairline-strong, #E2E8F0)",
  ring: "#64748B",
} satisfies (typeof PODIUM_THEMES)[number];

const themeForRank = (rank: number) => PODIUM_THEMES[rank - 1] ?? NEUTRAL_THEME;

export function TopPerformersSection({
  performers,
}: {
  performers: TopPerformer[];
}) {
  const top3 = performers.slice(0, 3);
  const rest = performers.slice(3, 10);

  return (
    <section
      className="rounded-section bg-surface-card border border-hairline p-7 flex flex-col"
      style={{
        boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)",
        opacity: 0,
        animation: "fadeUp 500ms ease-out 500ms forwards",
      }}
    >
      <header className="mb-5 flex items-start gap-3">
        <span
          aria-hidden
          className="mt-1 inline-flex size-10 shrink-0 items-center justify-center rounded-xl"
          style={{
            background: "color-mix(in srgb, var(--color-amber) 14%, transparent)",
            color: "var(--color-amber-deep)",
          }}
        >
          <Trophy size={20} strokeWidth={2.2} />
        </span>
        <div>
          <h2 className="text-display-lg text-ink-strong">Top Performers</h2>
          <p className="text-body-lg text-ink-subtle mt-0.5">
            Ranked by completed tasks — click any card to see their work
          </p>
        </div>
      </header>

      {performers.length === 0 ? (
        <EmptyState />
      ) : (
        <>
          {/* PODIUM — first three entries as featured cards. The medal
              styling keys off each person's TRUE rank, not their position
              in this (possibly filtered) list. */}
          <div className="grid grid-cols-3 gap-3 max-md:grid-cols-1">
            {top3.map((p, i) => (
              <PodiumCard key={p.employeeId} performer={p} stagger={i} />
            ))}
          </div>

          {/* LEADERBOARD — remaining entries in compact rows */}
          {rest.length > 0 && (
            <ol className="mt-4 flex flex-col gap-1.5">
              {rest.map((p) => (
                <LeaderRow key={p.employeeId} performer={p} />
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  );
}

function PodiumCard({
  performer,
  stagger,
}: {
  performer: TopPerformer;
  /** Position in the rendered list — only used to stagger the count-up. */
  stagger: number;
}) {
  const theme = themeForRank(performer.rank);
  const animated = useCountUp(performer.doneCount, 900 + stagger * 120);
  return (
    <Link
      href={`/tasks?initiator=${performer.employeeId}` as Route}
      aria-label={`Open ${performer.employeeName}'s tasks (rank ${performer.rank}, ${performer.doneCount} done)`}
      className="podium-card group relative block cursor-pointer rounded-leader overflow-hidden bg-surface-card"
      style={{
        border: `1.5px solid ${theme.border}`,
        boxShadow: theme.glow,
      }}
    >
      {/* Top color bar — medal gradient */}
      <span
        aria-hidden
        className="absolute inset-x-0 top-0"
        style={{
          height: 5,
          background: theme.bar,
        }}
      />

      {/* Crown marks the TRUE #1 only (SVG, not emoji) */}
      {performer.rank === 1 && (
        <span
          aria-hidden
          className="absolute right-3 top-3"
          style={{ color: theme.ring }}
        >
          <Crown size={18} strokeWidth={2.4} fill="currentColor" />
        </span>
      )}

      <div className="p-5 pt-6 flex flex-col items-center text-center gap-3">
        {/* Avatar with initials + numbered rank badge */}
        <span className="relative inline-block">
          <EmployeeAvatar
            name={performer.employeeName}
            size="lg"
            background={theme.badge}
          />
          <span
            aria-hidden
            className="absolute -bottom-1 -right-1 inline-flex size-6 items-center justify-center rounded-full font-black text-white tabular-nums"
            style={{
              background: theme.badge,
              fontSize: 12,
              border: "2px solid var(--color-surface-card)",
              boxShadow: "0 2px 6px rgba(15, 23, 42, 0.25)",
            }}
          >
            {performer.rank}
          </span>
        </span>

        {/* Name */}
        <span
          className="block leading-tight text-ink-strong font-bold"
          style={{ fontSize: 17, maxWidth: "100%" }}
        >
          {performer.employeeName}
        </span>

        {/* Done count — huge */}
        <span
          className="tabular-nums leading-none text-ink-strong font-black"
          style={{
            fontFamily: "var(--font-display), system-ui, sans-serif",
            fontSize: 56,
            letterSpacing: "-0.03em",
          }}
        >
          {animated}
        </span>

        <span
          className="uppercase font-bold tracking-[0.14em]"
          style={{
            fontFamily: "var(--font-mono-display), ui-monospace, monospace",
            fontSize: 12,
            color: "var(--color-ink-muted)",
          }}
        >
          Tasks Done
        </span>
      </div>
    </Link>
  );
}

function LeaderRow({ performer }: { performer: TopPerformer }) {
  const rank = performer.rank;
  return (
    <li>
      <Link
        href={`/tasks?initiator=${performer.employeeId}` as Route}
        className="leader-row group flex cursor-pointer items-center gap-3 px-3 py-2.5 rounded-chip transition-all"
        style={{
          background: "var(--color-surface-soft)",
          border: "1px solid transparent",
        }}
      >
        <span
          className="inline-flex items-center justify-center size-7 rounded-full font-bold tabular-nums shrink-0"
          style={{
            fontFamily: "var(--font-mono-display), ui-monospace, monospace",
            fontSize: 12,
            background: "var(--color-surface-card)",
            color: "var(--color-ink-muted)",
            border: "1px solid var(--color-hairline)",
          }}
        >
          {rank}
        </span>
        <EmployeeAvatar name={performer.employeeName} size="sm" />
        <span
          className="flex-1 text-ink-strong font-bold truncate"
          style={{ fontSize: 16 }}
        >
          {performer.employeeName}
        </span>
        <span
          className="tabular-nums font-black text-ink-strong"
          style={{
            fontFamily: "var(--font-display), system-ui, sans-serif",
            fontSize: 22,
            letterSpacing: "-0.01em",
          }}
        >
          {performer.doneCount}
        </span>
      </Link>
    </li>
  );
}

function EmptyState() {
  return (
    <div
      className="flex flex-col items-center justify-center text-center py-8"
      style={{
        background: "var(--color-surface-soft)",
        border: "1px dashed var(--color-hairline-strong)",
        borderRadius: 14,
      }}
    >
      <span
        aria-hidden
        className="inline-flex size-12 items-center justify-center rounded-full"
        style={{
          background: "rgba(15, 23, 42, 0.05)",
          color: "var(--color-ink-muted)",
        }}
      >
        <Inbox size={24} strokeWidth={2} />
      </span>
      <p
        className="mt-3 font-bold"
        style={{ fontSize: 17, color: "var(--color-ink-strong)" }}
      >
        Nobody has finished tasks yet
      </p>
      <p
        className="mt-1"
        style={{ fontSize: 14, color: "var(--color-ink-muted)" }}
      >
        Once tasks start hitting Done or Approved, top performers will show up
        here.
      </p>
    </div>
  );
}
