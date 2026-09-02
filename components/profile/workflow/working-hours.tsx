"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setWorkingHours } from "@/app/(app)/profile/actions";
import { fireToast } from "@/lib/toast";
import { SectionHeader } from "@/components/profile/identity/avatar-and-name";
import { Select } from "@/components/ui/select";

const TZ_OPTIONS = [
  "Asia/Kolkata",
  "Asia/Dubai",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Europe/London",
  "Europe/Berlin",
  "Europe/Paris",
  "America/New_York",
  "America/Los_Angeles",
  "UTC",
];

const DAY_LABELS = [
  { i: 1, short: "Mon" },
  { i: 2, short: "Tue" },
  { i: 3, short: "Wed" },
  { i: 4, short: "Thu" },
  { i: 5, short: "Fri" },
  { i: 6, short: "Sat" },
  { i: 7, short: "Sun" },
];

interface Props {
  initial: {
    timezone: string;
    workingHoursStart: string;
    workingHoursEnd: string;
    workingDays: number[];
  };
}

function trimTime(v: string): string {
  return v.slice(0, 5);
}

export function WorkingHours({ initial }: Props) {
  const router = useRouter();
  const [tz, setTz] = useState(initial.timezone);
  const [start, setStart] = useState(trimTime(initial.workingHoursStart));
  const [end, setEnd] = useState(trimTime(initial.workingHoursEnd));
  const [days, setDays] = useState<number[]>(initial.workingDays);
  const [, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);

  function save(patch: Parameters<typeof setWorkingHours>[0]) {
    startTransition(async () => {
      const res = await setWorkingHours(patch);
      if (!res.ok) {
        fireToast({ message: res.error });
        return;
      }
      setSavedAt(Date.now());
      router.refresh();
    });
  }

  function flipDay(d: number) {
    const next = days.includes(d)
      ? days.filter((x) => x !== d)
      : [...days, d].sort((a, b) => a - b);
    setDays(next);
    save({ workingDays: next });
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
        title="Working hours"
        description="Used for due-time defaults, quiet-hours math, and digest delivery. Notifications outside these hours respect your quiet-hours setting."
        savedAt={showSaved ? savedAt : null}
      />

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          gap: "16px 18px",
          alignItems: "center",
          maxWidth: 520,
        }}
      >
        <Label htmlFor="wh-tz">Timezone</Label>
        <Select
          id="wh-tz"
          value={tz}
          onValueChange={(v) => {
            setTz(v);
            save({ timezone: v });
          }}
          searchable
          searchPlaceholder="Search timezone…"
          options={[
            ...TZ_OPTIONS.map((t) => ({ value: t, label: t })),
            ...(!TZ_OPTIONS.includes(tz) ? [{ value: tz, label: tz }] : []),
          ]}
        />

        <Label htmlFor="wh-start">Start</Label>
        <input
          id="wh-start"
          type="time"
          value={start}
          onChange={(e) => {
            setStart(e.target.value);
            save({ workingHoursStart: e.target.value });
          }}
          style={inputStyle}
        />

        <Label htmlFor="wh-end">End</Label>
        <input
          id="wh-end"
          type="time"
          value={end}
          onChange={(e) => {
            setEnd(e.target.value);
            save({ workingHoursEnd: e.target.value });
          }}
          style={inputStyle}
        />
      </div>

      <div style={{ marginTop: 22 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 700,
            color: "var(--color-ink-soft)",
            textTransform: "uppercase",
            letterSpacing: "0.08em",
            marginBottom: 10,
          }}
        >
          Working days
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {DAY_LABELS.map((d) => {
            const on = days.includes(d.i);
            return (
              <button
                key={d.i}
                type="button"
                aria-pressed={on}
                onClick={() => flipDay(d.i)}
                style={{
                  padding: "10px 16px",
                  fontSize: 14,
                  fontWeight: 600,
                  color: on ? "white" : "var(--color-ink-soft)",
                  background: on
                    ? "linear-gradient(135deg, #E10600, #A80400)"
                    : "rgba(15, 23, 42, 0.04)",
                  border: `1px solid ${
                    on ? "transparent" : "rgba(15, 23, 42, 0.08)"
                  }`,
                  borderRadius: 10,
                  cursor: "pointer",
                  minWidth: 60,
                }}
              >
                {d.short}
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function Label({
  htmlFor,
  children,
}: {
  htmlFor: string;
  children: React.ReactNode;
}) {
  return (
    <label
      htmlFor={htmlFor}
      style={{
        fontSize: 13,
        fontWeight: 700,
        color: "var(--color-ink-soft)",
        textTransform: "uppercase",
        letterSpacing: "0.08em",
      }}
    >
      {children}
    </label>
  );
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 280,
  padding: "11px 14px",
  fontSize: 15,
  fontWeight: 600,
  color: "var(--color-ink-strong)",
  background: "var(--color-surface-input)",
  border: "1px solid var(--color-hairline-strong)",
  borderRadius: 10,
  outline: "none",
};
