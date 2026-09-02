"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { requestDataExport } from "@/app/(app)/profile/actions";
import { fireToast } from "@/lib/toast";
import { SectionHeader } from "./avatar-and-name";

export interface DataExportRow {
  id: string;
  /** ISO timestamp — props cross the RSC boundary as strings. */
  requestedAt: string;
  /** ISO timestamp or null — props cross the RSC boundary as strings. */
  completedAt: string | null;
  filePath: string | null;
  status: "pending" | "processing" | "done" | "failed";
  error: string | null;
}

interface Props {
  recent: DataExportRow[];
}

export function DataExportCard({ recent }: Props) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [optimistic, setOptimistic] = useState<DataExportRow[]>([]);

  function onRequest() {
    if (
      !confirm(
        "Request a copy of all your data (tasks, comments, audit, preferences)? You'll get an email with a download link within a few minutes.",
      )
    )
      return;

    const placeholder: DataExportRow = {
      id: `temp-${Date.now()}`,
      requestedAt: new Date().toISOString(),
      completedAt: null,
      filePath: null,
      status: "pending",
      error: null,
    };
    setOptimistic((prev) => [placeholder, ...prev]);

    startTransition(async () => {
      const res = await requestDataExport();
      setOptimistic((prev) =>
        prev.filter((p) => p.id !== placeholder.id),
      );
      if (!res.ok) {
        fireToast({ message: res.error });
        return;
      }
      fireToast({ message: "Export queued — we'll email you the link." });
      router.refresh();
    });
  }

  const merged = [...optimistic, ...recent];

  function statusBadge(s: DataExportRow["status"]) {
    const m: Record<
      DataExportRow["status"],
      { text: string; bg: string; fg: string }
    > = {
      pending: {
        text: "Queued",
        bg: "rgba(217, 119, 6, 0.12)",
        fg: "rgb(146, 64, 14)",
      },
      processing: {
        text: "Preparing",
        bg: "rgba(37, 99, 235, 0.12)",
        fg: "rgb(30, 58, 138)",
      },
      done: {
        text: "Ready",
        bg: "rgba(22, 163, 74, 0.12)",
        fg: "rgb(20, 83, 45)",
      },
      failed: {
        text: "Failed",
        bg: "rgba(220, 38, 38, 0.12)",
        fg: "rgb(127, 29, 29)",
      },
    };
    const c = m[s];
    return (
      <span
        style={{
          padding: "2px 8px",
          borderRadius: 999,
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.04em",
          color: c.fg,
          background: c.bg,
          textTransform: "uppercase",
        }}
      >
        {c.text}
      </span>
    );
  }

  function fmt(iso: string | null) {
    if (!iso) return "—";
    return new Date(iso).toLocaleString();
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
        title="Download your data"
        description="Get a copy of everything we have on you: tasks, comments, audit events, and preferences. Required by DPDP."
        savedAt={null}
      />

      <button
        type="button"
        onClick={onRequest}
        disabled={busy}
        style={{
          padding: "13px 22px",
          fontSize: 15,
          fontWeight: 600,
          color: "white",
          background: busy
            ? "rgba(15, 23, 42, 0.18)"
            : "linear-gradient(135deg, #0F172A, #1E293B)",
          border: "none",
          borderRadius: 10,
          cursor: busy ? "not-allowed" : "pointer",
        }}
      >
        {busy ? "Requesting…" : "Request my data"}
      </button>

      {merged.length > 0 && (
        <div style={{ marginTop: 18 }}>
          <h3
            style={{
              margin: "0 0 8px",
              fontSize: 12,
              fontWeight: 600,
              color: "var(--color-ink-subtle)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Recent exports
          </h3>
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 1,
              background: "rgba(15, 23, 42, 0.06)",
              border: "1px solid var(--color-hairline)",
              borderRadius: 12,
              overflow: "hidden",
            }}
          >
            {merged.map((r) => (
              <div
                key={r.id}
                style={{
                  background: "var(--color-surface-card)",
                  padding: "12px 16px",
                  display: "grid",
                  gridTemplateColumns: "1fr auto auto",
                  gap: 12,
                  alignItems: "center",
                }}
              >
                <div>
                  <div
                    style={{
                      fontSize: 13,
                      color: "var(--color-ink-strong)",
                      fontWeight: 500,
                    }}
                  >
                    Requested {fmt(r.requestedAt)}
                  </div>
                  {r.completedAt && (
                    <div
                      style={{
                        marginTop: 2,
                        fontSize: 12,
                        color: "var(--color-ink-subtle)",
                      }}
                    >
                      Ready {fmt(r.completedAt)}
                    </div>
                  )}
                  {r.error && r.status === "failed" && (
                    <div
                      style={{
                        marginTop: 2,
                        fontSize: 12,
                        color: "rgb(168, 4, 0)",
                      }}
                    >
                      {r.error}
                    </div>
                  )}
                </div>
                {statusBadge(r.status)}
                <span style={{ fontSize: 12, color: "var(--color-ink-subtle)" }}>
                  {r.status === "done" ? "Check email" : ""}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
