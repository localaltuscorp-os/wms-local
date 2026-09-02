"use client";

import Link from "next/link";
import type { Route } from "next";
import { SectionHeader } from "@/components/profile/identity/avatar-and-name";

export interface ActivityRowProp {
  id: string;
  at: string;
  kind: "task" | "comment" | "document";
  summary: string;
  href: string | null;
}

function relTime(iso: string): string {
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return d.toLocaleDateString();
}

const KIND_COLOR: Record<ActivityRowProp["kind"], string> = {
  task: "rgb(37, 99, 235)",
  comment: "rgb(124, 58, 237)",
  document: "rgb(22, 163, 74)",
};

const KIND_BG: Record<ActivityRowProp["kind"], string> = {
  task: "rgba(37, 99, 235, 0.12)",
  comment: "rgba(124, 58, 237, 0.12)",
  document: "rgba(22, 163, 74, 0.12)",
};

export function ActivityFeed({ rows }: { rows: ActivityRowProp[] }) {
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
        title="Recent activity"
        description="Everything you did in the last 30 days. Updates as you work."
        savedAt={null}
      />

      {rows.length === 0 ? (
        <p style={{ margin: 0, fontSize: 15, color: "var(--color-ink-subtle)" }}>
          No activity in the last 30 days.
        </p>
      ) : (
        <ol
          style={{
            listStyle: "none",
            padding: 0,
            margin: 0,
            display: "grid",
            gap: 10,
          }}
        >
          {rows.map((r) => {
            const body = (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "auto 1fr auto",
                  gap: 14,
                  padding: "14px 16px",
                  background: "var(--color-surface-input)",
                  border: "1px solid var(--color-hairline)",
                  borderRadius: 12,
                  alignItems: "center",
                }}
              >
                <span
                  style={{
                    display: "inline-block",
                    fontSize: 11,
                    fontWeight: 700,
                    color: KIND_COLOR[r.kind],
                    background: KIND_BG[r.kind],
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    padding: "3px 9px",
                    borderRadius: 999,
                  }}
                >
                  {r.kind}
                </span>
                <span
                  style={{
                    fontSize: 15,
                    fontWeight: 500,
                    color: "var(--color-ink-strong)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                  }}
                >
                  {r.summary}
                </span>
                <span
                  style={{
                    fontSize: 12,
                    color: "var(--color-ink-subtle)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {relTime(r.at)}
                </span>
              </div>
            );
            return (
              <li key={r.id}>
                {r.href ? (
                  <Link href={r.href as Route} style={{ textDecoration: "none" }}>
                    {body}
                  </Link>
                ) : (
                  body
                )}
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
