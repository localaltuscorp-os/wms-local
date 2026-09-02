"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { unpinItem } from "@/app/(app)/profile/actions";
import { fireToast } from "@/lib/toast";
import { SectionHeader } from "@/components/profile/identity/avatar-and-name";

export interface PinRow {
  id: string;
  kind: "task" | "project" | "document";
  title: string;
  href: string;
  exists: boolean;
}

interface Props {
  initial: PinRow[];
}

export function PinnedShelf({ initial }: Props) {
  const router = useRouter();
  const [pins, setPins] = useState<PinRow[]>(initial);
  const [, startTransition] = useTransition();

  function onUnpin(pinId: string) {
    const prev = pins;
    setPins(pins.filter((p) => p.id !== pinId));
    startTransition(async () => {
      const res = await unpinItem(pinId);
      if (!res.ok) {
        setPins(prev);
        fireToast({ message: res.error });
        return;
      }
      router.refresh();
    });
  }

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
        title="Pinned items"
        description="Quick links to tasks, projects, or documents you come back to often. Pin from any task/project/document page (coming soon)."
        savedAt={null}
      />

      {pins.length === 0 ? (
        <p
          style={{
            margin: 0,
            fontSize: 15,
            color: "var(--color-ink-subtle)",
            lineHeight: 1.55,
          }}
        >
          No pins yet — open a task, project, or document and look for the
          pin icon to add it here.
        </p>
      ) : (
        <div style={{ display: "grid", gap: 8 }}>
          {pins.map((p) => (
            <div
              key={p.id}
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "12px 16px",
                background: p.exists
                  ? "rgba(15, 23, 42, 0.025)"
                  : "rgba(168, 4, 0, 0.04)",
                border: `1px solid ${
                  p.exists ? "rgba(15, 23, 42, 0.06)" : "rgba(168, 4, 0, 0.18)"
                }`,
                borderRadius: 10,
                gap: 12,
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  minWidth: 0,
                }}
              >
                <span
                  style={{
                    display: "inline-block",
                    fontSize: 11,
                    fontWeight: 700,
                    color: kindColor(p.kind),
                    background: kindBg(p.kind),
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    padding: "3px 9px",
                    borderRadius: 999,
                    whiteSpace: "nowrap",
                  }}
                >
                  {p.kind}
                </span>
                {p.exists ? (
                  <Link
                    href={p.href as Route}
                    style={{
                      fontSize: 15,
                      fontWeight: 600,
                      color: "var(--color-ink-strong)",
                      textDecoration: "none",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {p.title}
                  </Link>
                ) : (
                  <span
                    style={{
                      fontSize: 15,
                      fontWeight: 500,
                      color: "rgb(168, 4, 0)",
                    }}
                  >
                    {p.title}
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={() => onUnpin(p.id)}
                aria-label="Unpin"
                style={{
                  padding: "7px 12px",
                  fontSize: 12,
                  fontWeight: 600,
                  color: "var(--color-ink-subtle)",
                  background: "transparent",
                  border: "1px solid rgba(15, 23, 42, 0.12)",
                  borderRadius: 8,
                  cursor: "pointer",
                }}
              >
                Unpin
              </button>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function kindColor(k: PinRow["kind"]): string {
  if (k === "task") return "rgb(30, 58, 138)";
  if (k === "project") return "rgb(76, 29, 149)";
  return "rgb(20, 83, 45)";
}
function kindBg(k: PinRow["kind"]): string {
  if (k === "task") return "rgba(37, 99, 235, 0.14)";
  if (k === "project") return "rgba(124, 58, 237, 0.14)";
  return "rgba(22, 163, 74, 0.14)";
}
