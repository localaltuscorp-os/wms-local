"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  revokeAllSessions,
  revokeSession,
} from "@/app/(app)/profile/actions";
import { fireToast } from "@/lib/toast";
import { SectionHeader } from "./avatar-and-name";

export interface SessionRow {
  id: string;
  /** ISO timestamp — props cross the RSC boundary as strings. */
  createdAt: string;
  /** ISO timestamp — props cross the RSC boundary as strings. */
  lastSeenAt: string;
  userAgent: string | null;
  country: string | null;
  city: string | null;
  isThisDevice: boolean;
}

interface Props {
  sessions: SessionRow[];
}

export function SessionsCard({ sessions }: Props) {
  const router = useRouter();
  const [busy, startTransition] = useTransition();
  const [revokingId, setRevokingId] = useState<string | null>(null);

  function fmtAgo(iso: string): string {
    const d = new Date(iso);
    const diff = Date.now() - d.getTime();
    const mins = Math.round(diff / 60_000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.round(hrs / 24);
    if (days < 30) return `${days}d ago`;
    return d.toLocaleDateString();
  }

  function fmtDevice(ua: string | null): string {
    if (!ua) return "Unknown device";
    if (/iPhone/i.test(ua)) return "iPhone";
    if (/iPad/i.test(ua)) return "iPad";
    if (/Android/i.test(ua)) return "Android";
    if (/Mac OS X|Macintosh/i.test(ua)) return "Mac";
    if (/Windows NT/i.test(ua)) return "Windows";
    if (/Linux/i.test(ua)) return "Linux";
    return "Browser";
  }

  function fmtBrowser(ua: string | null): string {
    if (!ua) return "";
    if (/Edg\//i.test(ua)) return "Edge";
    if (/OPR\/|Opera/i.test(ua)) return "Opera";
    if (/Chrome\//i.test(ua)) return "Chrome";
    if (/Safari\//i.test(ua)) return "Safari";
    if (/Firefox\//i.test(ua)) return "Firefox";
    return "";
  }

  function onRevoke(id: string) {
    if (!confirm("Sign out this session?")) return;
    setRevokingId(id);
    startTransition(async () => {
      const res = await revokeSession(id);
      setRevokingId(null);
      if (!res.ok) {
        fireToast({ message: res.error });
        return;
      }
      fireToast({ message: "Session revoked." });
      router.refresh();
    });
  }

  function onRevokeAll() {
    if (
      !confirm(
        "Sign out everywhere? You'll be redirected to the login page.",
      )
    )
      return;
    startTransition(async () => {
      const res = await revokeAllSessions();
      if (!res.ok) {
        fireToast({ message: res.error });
        return;
      }
      fireToast({ message: "Signed out everywhere." });
      // Force a refresh; middleware will redirect to /login on next request.
      router.refresh();
      setTimeout(() => window.location.assign("/login"), 400);
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
        title="Active sessions"
        description="Each device you've signed in from. Revoke any session you don't recognise."
        savedAt={null}
      />

      {sessions.length === 0 ? (
        <p style={{ color: "var(--color-ink-subtle)", fontSize: 15, margin: 0 }}>
          No tracked sessions yet — sign out and back in to see this device
          listed.
        </p>
      ) : (
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
          {sessions.map((s) => {
            const device = fmtDevice(s.userAgent);
            const browser = fmtBrowser(s.userAgent);
            const where = [s.city, s.country].filter(Boolean).join(", ");
            return (
              <div
                key={s.id}
                style={{
                  background: "var(--color-surface-card)",
                  padding: "18px 20px",
                  display: "grid",
                  gridTemplateColumns: "1fr auto",
                  gap: 16,
                  alignItems: "center",
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      flexWrap: "wrap",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 16,
                        fontWeight: 600,
                        color: "var(--color-ink-strong)",
                      }}
                    >
                      {device}
                      {browser && (
                        <span
                          style={{ color: "var(--color-ink-subtle)", fontWeight: 500 }}
                        >
                          {" "}· {browser}
                        </span>
                      )}
                    </span>
                    {s.isThisDevice && (
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          color: "rgb(20, 83, 45)",
                          background: "rgba(22, 163, 74, 0.14)",
                          padding: "3px 10px",
                          borderRadius: 999,
                          letterSpacing: "0.05em",
                        }}
                      >
                        THIS DEVICE
                      </span>
                    )}
                  </div>
                  <div
                    style={{
                      marginTop: 5,
                      fontSize: 14,
                      color: "var(--color-ink-subtle)",
                    }}
                  >
                    Last seen {fmtAgo(s.lastSeenAt)}
                    {where && ` · ${where}`}
                  </div>
                </div>
                {!s.isThisDevice && (
                  <button
                    type="button"
                    onClick={() => onRevoke(s.id)}
                    disabled={busy && revokingId === s.id}
                    style={{
                      padding: "9px 16px",
                      fontSize: 13,
                      fontWeight: 600,
                      color: "rgb(168, 4, 0)",
                      background: "transparent",
                      border: "1px solid rgba(168, 4, 0, 0.24)",
                      borderRadius: 10,
                      cursor: "pointer",
                    }}
                  >
                    {busy && revokingId === s.id ? "Revoking…" : "Revoke"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ marginTop: 24 }}>
        <button
          type="button"
          onClick={onRevokeAll}
          disabled={busy}
          style={{
            padding: "13px 22px",
            fontSize: 15,
            fontWeight: 600,
            color: "white",
            background: busy
              ? "rgba(15, 23, 42, 0.18)"
              : "linear-gradient(135deg, #DC2626, #991B1B)",
            border: "none",
            borderRadius: 10,
            cursor: busy ? "not-allowed" : "pointer",
          }}
        >
          Sign out everywhere
        </button>
        <p
          style={{
            margin: "10px 2px 0",
            fontSize: 13,
            color: "var(--color-ink-subtle)",
          }}
        >
          Invalidates all sessions, including this one. Use if a device is
          lost or you suspect your account is compromised.
        </p>
      </div>
    </section>
  );
}
