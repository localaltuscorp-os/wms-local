"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setDigestAndQuietPrefs } from "@/app/(app)/profile/actions";
import { fireToast } from "@/lib/toast";
import { SectionHeader } from "@/components/profile/identity/avatar-and-name";

type Frequency = "off" | "daily" | "weekly";

interface Props {
  initial: {
    digestFrequency: Frequency;
    digestTime: string;
    quietHoursStart: string | null;
    quietHoursEnd: string | null;
    mentionEscalation: boolean;
  };
}

/** Normalize a Postgres `time` column ("HH:MM:SS") to HH:MM for the form. */
function trimTime(v: string | null | undefined): string {
  if (!v) return "";
  return v.slice(0, 5);
}

export function DigestAndQuiet({ initial }: Props) {
  const router = useRouter();
  const [frequency, setFrequency] = useState<Frequency>(initial.digestFrequency);
  const [time, setTime] = useState(trimTime(initial.digestTime));
  const [qStart, setQStart] = useState(trimTime(initial.quietHoursStart));
  const [qEnd, setQEnd] = useState(trimTime(initial.quietHoursEnd));
  const [escalation, setEscalation] = useState(initial.mentionEscalation);
  const [, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);

  function save(patch: Parameters<typeof setDigestAndQuietPrefs>[0]) {
    startTransition(async () => {
      const res = await setDigestAndQuietPrefs(patch);
      if (!res.ok) {
        fireToast({ message: res.error });
        return;
      }
      setSavedAt(Date.now());
      router.refresh();
    });
  }

  const showSaved = savedAt !== null && Date.now() - savedAt < 2500;

  const cardStyle: React.CSSProperties = {
    background: "var(--color-surface-card)",
    border: "1px solid var(--color-hairline)",
    borderRadius: 16,
    padding: 32,
  };

  return (
    <>
      <section style={cardStyle}>
        <SectionHeader
          title="Daily / weekly digest"
          description="When on, a single summary email replaces per-event notifications for low-priority kinds."
          savedAt={showSaved ? savedAt : null}
        />

        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 20 }}>
          {(["off", "daily", "weekly"] as Frequency[]).map((opt) => (
            <button
              key={opt}
              type="button"
              role="radio"
              aria-checked={frequency === opt}
              onClick={() => {
                if (opt === frequency) return;
                setFrequency(opt);
                save({ digestFrequency: opt });
              }}
              style={{
                padding: "10px 18px",
                fontSize: 14,
                fontWeight: 600,
                color: frequency === opt ? "white" : "var(--color-ink-soft)",
                background:
                  frequency === opt
                    ? "linear-gradient(135deg, #E10600, #A80400)"
                    : "rgba(15, 23, 42, 0.04)",
                border: `1px solid ${
                  frequency === opt
                    ? "transparent"
                    : "rgba(15, 23, 42, 0.08)"
                }`,
                borderRadius: 10,
                cursor: "pointer",
                textTransform: "capitalize",
              }}
            >
              {opt}
            </button>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "auto 1fr", gap: "10px 18px", alignItems: "center", maxWidth: 360 }}>
          <label
            htmlFor="digest-time"
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "var(--color-ink-soft)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Deliver at
          </label>
          <input
            id="digest-time"
            type="time"
            value={time}
            disabled={frequency === "off"}
            onChange={(e) => {
              setTime(e.target.value);
              save({ digestTime: e.target.value });
            }}
            style={{
              width: 140,
              padding: "10px 14px",
              fontSize: 15,
              fontWeight: 600,
              color: "var(--color-ink-strong)",
              background:
                frequency === "off" ? "rgba(15, 23, 42, 0.04)" : "rgba(15, 23, 42, 0.025)",
              border: "1px solid var(--color-hairline-strong)",
              borderRadius: 10,
              outline: "none",
              opacity: frequency === "off" ? 0.5 : 1,
            }}
          />
        </div>
      </section>

      <section style={cardStyle}>
        <SectionHeader
          title="Quiet hours"
          description="During this window we buffer non-urgent notifications into your next digest. @-mentions still arrive immediately if escalation is on."
          savedAt={showSaved ? savedAt : null}
        />

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "auto auto",
            gap: "10px 18px",
            alignItems: "center",
            maxWidth: 420,
          }}
        >
          <label
            htmlFor="quiet-start"
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "var(--color-ink-soft)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            From
          </label>
          <input
            id="quiet-start"
            type="time"
            value={qStart}
            onChange={(e) => {
              setQStart(e.target.value);
              if (e.target.value && qEnd) {
                save({
                  quietHoursStart: e.target.value,
                  quietHoursEnd: qEnd,
                });
              }
            }}
            style={timeInputStyle}
          />
          <label
            htmlFor="quiet-end"
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "var(--color-ink-soft)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Until
          </label>
          <input
            id="quiet-end"
            type="time"
            value={qEnd}
            onChange={(e) => {
              setQEnd(e.target.value);
              if (e.target.value && qStart) {
                save({
                  quietHoursStart: qStart,
                  quietHoursEnd: e.target.value,
                });
              }
            }}
            style={timeInputStyle}
          />
        </div>
        {(qStart || qEnd) && (
          <button
            type="button"
            onClick={() => {
              setQStart("");
              setQEnd("");
              save({ quietHoursStart: null, quietHoursEnd: null });
            }}
            style={{
              marginTop: 16,
              padding: "8px 14px",
              fontSize: 13,
              fontWeight: 600,
              color: "var(--color-ink-soft)",
              background: "transparent",
              border: "1px solid rgba(15, 23, 42, 0.14)",
              borderRadius: 10,
              cursor: "pointer",
            }}
          >
            Clear quiet hours
          </button>
        )}
      </section>

      <section style={cardStyle}>
        <SectionHeader
          title="Mention escalation"
          description="When someone @-mentions you, every channel you've enabled at the channel level fires — even if you've muted that event kind in the matrix above."
          savedAt={showSaved ? savedAt : null}
        />
        <button
          type="button"
          role="switch"
          aria-checked={escalation}
          onClick={() => {
            const next = !escalation;
            setEscalation(next);
            save({ mentionEscalation: next });
          }}
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 14,
            padding: "10px 16px",
            background: "var(--color-surface-input)",
            border: "1px solid var(--color-hairline-strong)",
            borderRadius: 12,
            cursor: "pointer",
          }}
        >
          <span
            style={{
              display: "inline-block",
              width: 44,
              height: 24,
              borderRadius: 999,
              background: escalation ? "#16A34A" : "rgba(15, 23, 42, 0.18)",
              position: "relative",
              transition: "background 0.18s ease",
            }}
          >
            <span
              aria-hidden
              style={{
                position: "absolute",
                top: 2,
                left: escalation ? 22 : 2,
                width: 20,
                height: 20,
                borderRadius: 999,
                background: "var(--color-surface-card)",
                boxShadow: "0 1px 3px rgba(15, 23, 42, 0.2)",
                transition: "left 0.18s ease",
              }}
            />
          </span>
          <span style={{ fontSize: 15, fontWeight: 600, color: "var(--color-ink-strong)" }}>
            {escalation ? "Mentions always escalate" : "Mentions follow the matrix"}
          </span>
        </button>
      </section>
    </>
  );
}

const timeInputStyle: React.CSSProperties = {
  width: 140,
  padding: "10px 14px",
  fontSize: 15,
  fontWeight: 600,
  color: "var(--color-ink-strong)",
  background: "var(--color-surface-input)",
  border: "1px solid var(--color-hairline-strong)",
  borderRadius: 10,
  outline: "none",
};
