"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { setOoo } from "@/app/(app)/profile/actions";
import { fireToast } from "@/lib/toast";
import { SectionHeader } from "@/components/profile/identity/avatar-and-name";
import { Select } from "@/components/ui/select";

export interface ColleagueOption {
  id: string;
  name: string;
  role: string;
  department: string | null;
}

interface Props {
  initial: {
    oooStart: string | null;
    oooEnd: string | null;
    oooDelegateId: string | null;
  };
  colleagues: ColleagueOption[];
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function OooControls({ initial, colleagues }: Props) {
  const router = useRouter();
  const initiallyOn = !!initial.oooStart && !!initial.oooEnd;
  const [enabled, setEnabled] = useState(initiallyOn);
  const [start, setStart] = useState(initial.oooStart ?? todayIso());
  const [end, setEnd] = useState(
    initial.oooEnd ??
      new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
  );
  const [delegate, setDelegate] = useState(initial.oooDelegateId ?? "");
  const [, startTransition] = useTransition();
  const [savedAt, setSavedAt] = useState<number | null>(null);

  function commit(next: {
    enabled: boolean;
    oooStart?: string | null;
    oooEnd?: string | null;
    oooDelegateId?: string | null;
  }) {
    startTransition(async () => {
      const res = await setOoo(next);
      if (!res.ok) {
        fireToast({ message: res.error });
        return;
      }
      setSavedAt(Date.now());
      router.refresh();
    });
  }

  function flip() {
    const next = !enabled;
    setEnabled(next);
    if (next) {
      commit({ enabled: true, oooStart: start, oooEnd: end, oooDelegateId: delegate || null });
    } else {
      commit({ enabled: false });
    }
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
        title="Out of office"
        description="Set a window when you're away. New tasks assigned to you can be copied to a delegate; the dashboard shows a banner so teammates see your status."
        savedAt={showSaved ? savedAt : null}
      />

      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        onClick={flip}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 14,
          padding: "10px 18px",
          background: enabled
            ? "rgba(217, 119, 6, 0.08)"
            : "rgba(15, 23, 42, 0.025)",
          border: `1px solid ${
            enabled ? "rgba(217, 119, 6, 0.32)" : "rgba(15, 23, 42, 0.08)"
          }`,
          borderRadius: 12,
          cursor: "pointer",
          marginBottom: enabled ? 22 : 0,
        }}
      >
        <span
          style={{
            display: "inline-block",
            width: 44,
            height: 24,
            borderRadius: 999,
            background: enabled ? "#D97706" : "rgba(15, 23, 42, 0.18)",
            position: "relative",
            transition: "background 0.18s ease",
          }}
        >
          <span
            aria-hidden
            style={{
              position: "absolute",
              top: 2,
              left: enabled ? 22 : 2,
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
          {enabled ? "Out of office now" : "I'm in"}
        </span>
      </button>

      {enabled && (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "auto 1fr",
            gap: "16px 18px",
            alignItems: "center",
            maxWidth: 480,
          }}
        >
          <Label htmlFor="ooo-start">From</Label>
          <input
            id="ooo-start"
            type="date"
            value={start}
            min={todayIso()}
            onChange={(e) => {
              setStart(e.target.value);
              commit({
                enabled: true,
                oooStart: e.target.value,
                oooEnd: end,
                oooDelegateId: delegate || null,
              });
            }}
            style={dateInputStyle}
          />
          <Label htmlFor="ooo-end">Until</Label>
          <input
            id="ooo-end"
            type="date"
            value={end}
            min={start}
            onChange={(e) => {
              setEnd(e.target.value);
              commit({
                enabled: true,
                oooStart: start,
                oooEnd: e.target.value,
                oooDelegateId: delegate || null,
              });
            }}
            style={dateInputStyle}
          />
          <Label htmlFor="ooo-delegate">Delegate</Label>
          <Select
            id="ooo-delegate"
            value={delegate}
            onValueChange={(v) => {
              setDelegate(v);
              commit({
                enabled: true,
                oooStart: start,
                oooEnd: end,
                oooDelegateId: v || null,
              });
            }}
            searchable
            options={[
              { value: "", label: "No delegate" },
              ...colleagues.map((c) => ({
                value: c.id,
                label: `${c.name}${c.department ? ` · ${c.department}` : ""}`,
              })),
            ]}
          />
        </div>
      )}
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

const dateInputStyle: React.CSSProperties = {
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
