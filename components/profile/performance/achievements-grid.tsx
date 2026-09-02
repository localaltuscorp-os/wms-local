"use client";

import {
  ACHIEVEMENT_CATEGORY_LABELS,
  type AchievementCategory,
  type AchievementDefinition,
} from "@/lib/achievements/definitions";
import { SectionHeader } from "@/components/profile/identity/avatar-and-name";

/**
 * Serializable view of an achievement definition — the subset that crosses
 * the RSC→client boundary. Excludes `evaluate` (a function, non-serializable).
 */
export type AchievementView = Pick<
  AchievementDefinition,
  "key" | "name" | "description" | "icon" | "category"
>;

export interface AchievementRow {
  def: AchievementView;
  earned: boolean;
  earnedAt: string | null;
  progress: { current: number; target: number };
}

const CATEGORY_ORDER: AchievementCategory[] = [
  "velocity",
  "quality",
  "reliability",
  "documentation",
  "helpfulness",
];

export function AchievementsGrid({ rows }: { rows: AchievementRow[] }) {
  const earnedCount = rows.filter((r) => r.earned).length;

  return (
    <section
      style={{
        background: "var(--color-surface-card)",
        border: "1px solid var(--color-hairline)",
        borderRadius: 16,
        padding: 32,
      }}
    >
      <SectionHeader
        title={`Achievements · ${earnedCount} / ${rows.length}`}
        description="Badges unlock automatically as you hit milestones. Hover any badge for the criteria."
        savedAt={null}
      />

      <div style={{ display: "grid", gap: 24 }}>
        {CATEGORY_ORDER.map((cat) => {
          const inCat = rows.filter((r) => r.def.category === cat);
          if (inCat.length === 0) return null;
          return (
            <div key={cat}>
              <h3
                style={{
                  margin: "0 0 10px",
                  fontSize: 13,
                  fontWeight: 700,
                  color: "var(--color-ink-soft)",
                  textTransform: "uppercase",
                  letterSpacing: "0.08em",
                }}
              >
                {ACHIEVEMENT_CATEGORY_LABELS[cat]}
              </h3>
              <div
                style={{
                  display: "grid",
                  gap: 12,
                  gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
                }}
              >
                {inCat.map((r) => (
                  <BadgeCard key={r.def.key} row={r} />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function BadgeCard({ row }: { row: AchievementRow }) {
  const pct = Math.min(
    100,
    Math.round((row.progress.current / Math.max(1, row.progress.target)) * 100),
  );
  return (
    <div
      title={row.def.description}
      style={{
        padding: 16,
        borderRadius: 12,
        background: row.earned
          ? "linear-gradient(135deg, rgba(225, 6, 0, 0.06), rgba(168, 4, 0, 0.04))"
          : "rgba(15, 23, 42, 0.03)",
        border: `1px solid ${
          row.earned ? "rgba(225, 6, 0, 0.18)" : "rgba(15, 23, 42, 0.05)"
        }`,
        position: "relative",
        opacity: row.earned ? 1 : 0.82,
      }}
    >
      <div
        style={{
          fontSize: 32,
          lineHeight: 1,
          marginBottom: 10,
          filter: row.earned ? "none" : "grayscale(0.85)",
        }}
        aria-hidden
      >
        {row.def.icon}
      </div>
      <div
        style={{
          fontSize: 15,
          fontWeight: 700,
          color: "var(--color-ink-strong)",
          marginBottom: 2,
          letterSpacing: "-0.005em",
        }}
      >
        {row.def.name}
      </div>
      <div
        style={{
          fontSize: 12,
          color: "var(--color-ink-subtle)",
          lineHeight: 1.45,
          marginBottom: 10,
        }}
      >
        {row.def.description}
      </div>
      {row.earned ? (
        <div
          style={{
            fontSize: 11,
            fontWeight: 700,
            color: "rgb(20, 83, 45)",
            background: "rgba(22, 163, 74, 0.14)",
            padding: "3px 9px",
            borderRadius: 999,
            display: "inline-block",
            letterSpacing: "0.05em",
          }}
        >
          ✓ EARNED
        </div>
      ) : (
        <div>
          <div
            style={{
              height: 4,
              background: "rgba(15, 23, 42, 0.06)",
              borderRadius: 999,
              overflow: "hidden",
            }}
          >
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
              fontSize: 11,
              fontFamily: "var(--font-mono-display, ui-monospace, monospace)",
              color: "var(--color-ink-subtle)",
              fontWeight: 600,
            }}
          >
            {row.progress.current} / {row.progress.target}
          </div>
        </div>
      )}
    </div>
  );
}
