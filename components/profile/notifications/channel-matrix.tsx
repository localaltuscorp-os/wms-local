"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setNotificationPref } from "@/app/(app)/profile/actions";
import { fireToast } from "@/lib/toast";
import { SectionHeader } from "@/components/profile/identity/avatar-and-name";

type Kind =
  | "task_assigned"
  | "task_initiated"
  | "status_changed"
  | "approved"
  | "declined"
  | "reassigned"
  | "transferred"
  | "cancelled"
  | "commented";

type Channel = "email" | "slack" | "whatsapp" | "push";

const KINDS: { key: Kind; label: string; hint: string }[] = [
  { key: "task_assigned", label: "Task assigned", hint: "Someone assigns you a task" },
  { key: "task_initiated", label: "Task initiated", hint: "A task you initiated kicks off" },
  { key: "status_changed", label: "Status changed", hint: "A task's status moves" },
  { key: "approved", label: "Approved", hint: "Your task is approved" },
  { key: "declined", label: "Declined", hint: "Your task is declined" },
  { key: "reassigned", label: "Reassigned", hint: "Task moves between doers" },
  { key: "transferred", label: "Transferred", hint: "Task moves outside the team" },
  { key: "cancelled", label: "Cancelled", hint: "Task is cancelled" },
  { key: "commented", label: "Commented", hint: "Someone comments on your task" },
];

const CHANNELS: { key: Channel; label: string; subtext: string }[] = [
  { key: "email", label: "Email", subtext: "Resend" },
  { key: "slack", label: "Slack", subtext: "DM" },
  { key: "whatsapp", label: "WhatsApp", subtext: "" },
  { key: "push", label: "Push", subtext: "Browser" },
];

interface Props {
  initialMatrix: Record<string, boolean>;
  hasWhatsapp: boolean;
  hasPushSubscription: boolean;
}

export function ChannelMatrix({
  initialMatrix,
  hasWhatsapp,
  hasPushSubscription,
}: Props) {
  const router = useRouter();
  const [matrix, setMatrix] = useState<Record<string, boolean>>(initialMatrix);
  const [, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  function key(kind: Kind, channel: Channel) {
    return `${kind}|${channel}`;
  }

  // When the matrix doesn't have an explicit value for a cell, we render
  // it as "enabled" (the default state — matches dispatch fallback).
  function isOn(kind: Kind, channel: Channel) {
    const k = key(kind, channel);
    if (Object.prototype.hasOwnProperty.call(matrix, k)) return matrix[k]!;
    return true;
  }

  function isChannelLocked(channel: Channel): string | null {
    if (channel === "whatsapp" && !hasWhatsapp) {
      return "Ask your admin to register your WhatsApp number.";
    }
    if (channel === "push" && !hasPushSubscription) {
      return "Enable browser push below first.";
    }
    return null;
  }

  async function flip(kind: Kind, channel: Channel) {
    const next = !isOn(kind, channel);
    const k = key(kind, channel);
    const prevMatrix = matrix;
    setMatrix({ ...matrix, [k]: next });
    setBusyKey(k);
    startTransition(async () => {
      const res = await setNotificationPref({ kind, channel, enabled: next });
      setBusyKey(null);
      if (!res.ok) {
        setMatrix(prevMatrix);
        fireToast({ message: res.error });
        return;
      }
      setSavedAt(Date.now());
      router.refresh();
    });
  }

  function flipColumn(channel: Channel, nextValue: boolean) {
    const locked = isChannelLocked(channel);
    if (locked) {
      fireToast({ message: locked });
      return;
    }
    const prevMatrix = matrix;
    const patch: Record<string, boolean> = { ...matrix };
    for (const k of KINDS) {
      patch[key(k.key, channel)] = nextValue;
    }
    setMatrix(patch);
    startTransition(async () => {
      // Fire individual writes in parallel; report any failure but keep
      // the optimistic UI changes that succeeded.
      const results = await Promise.all(
        KINDS.map((kRow) =>
          setNotificationPref({
            kind: kRow.key,
            channel,
            enabled: nextValue,
          }),
        ),
      );
      const failed = results.filter((r) => !r.ok);
      if (failed.length > 0) {
        setMatrix(prevMatrix);
        fireToast({
          message: `Couldn't update ${failed.length} ${
            failed.length === 1 ? "row" : "rows"
          }. Refresh and try again.`,
        });
        return;
      }
      setSavedAt(Date.now());
      router.refresh();
    });
  }

  const showSaved = savedAt !== null && Date.now() - savedAt < 2500;

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
        title="Notification matrix"
        description="Tick which kinds of events reach you on which channels. Off cells stay quiet — except when you're @-mentioned (see Mention escalation below)."
        savedAt={showSaved ? savedAt : null}
      />

      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "separate",
            borderSpacing: 0,
            fontSize: 14,
          }}
        >
          <thead>
            <tr>
              <th
                style={{
                  textAlign: "left",
                  padding: "10px 14px",
                  fontSize: 13,
                  fontWeight: 700,
                  color: "var(--color-ink-soft)",
                  textTransform: "uppercase",
                  letterSpacing: "0.06em",
                  borderBottom: "1px solid var(--color-hairline-strong)",
                }}
              >
                Event
              </th>
              {CHANNELS.map((c) => {
                const locked = isChannelLocked(c.key);
                const allOn = KINDS.every((k) => isOn(k.key, c.key));
                return (
                  <th
                    key={c.key}
                    style={{
                      padding: "10px 8px",
                      textAlign: "center",
                      borderBottom: "1px solid var(--color-hairline-strong)",
                      minWidth: 96,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        color: "var(--color-ink-strong)",
                        letterSpacing: "-0.005em",
                      }}
                    >
                      {c.label}
                    </div>
                    {c.subtext && (
                      <div
                        style={{
                          fontSize: 11,
                          fontWeight: 500,
                          color: "var(--color-ink-subtle)",
                          marginTop: 1,
                        }}
                      >
                        {c.subtext}
                      </div>
                    )}
                    <button
                      type="button"
                      onClick={() => flipColumn(c.key, !allOn)}
                      disabled={!!locked}
                      title={
                        locked ??
                        (allOn ? "Turn off all" : "Turn on all")
                      }
                      style={{
                        marginTop: 6,
                        background: "transparent",
                        border: "none",
                        color: locked
                          ? "rgb(148, 163, 184)"
                          : "rgb(225, 6, 0)",
                        fontSize: 11,
                        fontWeight: 600,
                        cursor: locked ? "not-allowed" : "pointer",
                        padding: 0,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      {locked ? "Locked" : allOn ? "All off" : "All on"}
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {KINDS.map((k, ki) => (
              <tr key={k.key}>
                <td
                  style={{
                    padding: "14px 14px",
                    borderBottom:
                      ki === KINDS.length - 1
                        ? "none"
                        : "1px solid rgba(15, 23, 42, 0.04)",
                    verticalAlign: "top",
                  }}
                >
                  <div
                    style={{
                      fontSize: 15,
                      fontWeight: 600,
                      color: "var(--color-ink-strong)",
                    }}
                  >
                    {k.label}
                  </div>
                  <div
                    style={{
                      marginTop: 2,
                      fontSize: 13,
                      color: "var(--color-ink-subtle)",
                    }}
                  >
                    {k.hint}
                  </div>
                </td>
                {CHANNELS.map((c) => {
                  const on = isOn(k.key, c.key);
                  const locked = isChannelLocked(c.key);
                  const busy = busyKey === key(k.key, c.key);
                  return (
                    <td
                      key={c.key}
                      style={{
                        textAlign: "center",
                        padding: "14px 8px",
                        borderBottom:
                          ki === KINDS.length - 1
                            ? "none"
                            : "1px solid rgba(15, 23, 42, 0.04)",
                      }}
                    >
                      <button
                        type="button"
                        role="switch"
                        aria-checked={on && !locked}
                        aria-label={`${k.label} via ${c.label}`}
                        disabled={!!locked || busy}
                        onClick={() => flip(k.key, c.key)}
                        title={locked ?? undefined}
                        style={{
                          width: 42,
                          height: 24,
                          borderRadius: 999,
                          background: locked
                            ? "rgba(148, 163, 184, 0.25)"
                            : on
                              ? "#16A34A"
                              : "rgba(15, 23, 42, 0.12)",
                          border: "none",
                          position: "relative",
                          cursor: locked ? "not-allowed" : "pointer",
                          transition: "background 0.18s ease",
                          opacity: busy ? 0.55 : 1,
                        }}
                      >
                        <span
                          aria-hidden
                          style={{
                            position: "absolute",
                            top: 2,
                            left: on && !locked ? 20 : 2,
                            width: 20,
                            height: 20,
                            borderRadius: 999,
                            background: "var(--color-surface-card)",
                            boxShadow: "0 1px 3px rgba(15, 23, 42, 0.2)",
                            transition: "left 0.18s ease",
                          }}
                        />
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
