"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { patchIdentity } from "@/app/(app)/profile/actions";
import { fireToast } from "@/lib/toast";

type Availability = "available" | "focused" | "heads_down" | "away";

const PRESENTATION: Record<
  Availability,
  { label: string; dot: string; ring: string; text: string }
> = {
  available: {
    label: "Available",
    dot: "var(--color-green, #16A34A)",
    ring: "rgba(22, 163, 74, 0.18)",
    text: "rgb(20, 83, 45)",
  },
  focused: {
    label: "Focused",
    dot: "#2563EB",
    ring: "rgba(37, 99, 235, 0.18)",
    text: "rgb(30, 58, 138)",
  },
  heads_down: {
    label: "Heads-down",
    dot: "#7C3AED",
    ring: "rgba(124, 58, 237, 0.18)",
    text: "rgb(76, 29, 149)",
  },
  away: {
    label: "Away",
    dot: "#94A3B8",
    ring: "rgba(148, 163, 184, 0.22)",
    text: "var(--color-ink-muted)",
  },
};

const ORDER: Availability[] = ["available", "focused", "heads_down", "away"];

interface Props {
  initial: Availability;
  size?: "sm" | "md";
}

export function AvailabilityPill({ initial, size = "md" }: Props) {
  const [value, setValue] = useState<Availability>(initial);
  const [open, setOpen] = useState(false);
  const [, startTransition] = useTransition();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);

  // On open, move focus to the selected option. On close, restore to trigger.
  useEffect(() => {
    if (open) {
      const optionEls = listboxRef.current?.querySelectorAll<HTMLButtonElement>(
        '[role="option"]',
      );
      const selectedIdx = ORDER.indexOf(value);
      optionEls?.[selectedIdx >= 0 ? selectedIdx : 0]?.focus();
    } else {
      triggerRef.current?.focus();
    }
    // Only react to open/close; value is the selection at open time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function onListKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      setOpen(false);
      return;
    }
    if (
      e.key !== "ArrowDown" &&
      e.key !== "ArrowUp" &&
      e.key !== "Home" &&
      e.key !== "End"
    ) {
      return;
    }
    e.preventDefault();
    const optionEls = listboxRef.current?.querySelectorAll<HTMLButtonElement>(
      '[role="option"]',
    );
    if (!optionEls || optionEls.length === 0) return;
    const count = optionEls.length;
    const current = document.activeElement;
    let idx = -1;
    for (let i = 0; i < count; i++) {
      if (optionEls[i] === current) {
        idx = i;
        break;
      }
    }
    let nextIdx: number;
    if (e.key === "Home") {
      nextIdx = 0;
    } else if (e.key === "End") {
      nextIdx = count - 1;
    } else if (e.key === "ArrowDown") {
      nextIdx = idx < 0 ? 0 : (idx + 1) % count;
    } else {
      nextIdx = idx < 0 ? count - 1 : (idx - 1 + count) % count;
    }
    optionEls[nextIdx]?.focus();
  }

  const pres = PRESENTATION[value];
  const pad = size === "sm" ? "6px 10px" : "8px 14px";
  const font = size === "sm" ? 12 : 13;

  function choose(next: Availability) {
    if (next === value) {
      setOpen(false);
      return;
    }
    const previous = value;
    setValue(next);
    setOpen(false);
    startTransition(async () => {
      const res = await patchIdentity({ availability: next });
      if (!res.ok) {
        setValue(previous);
        fireToast({ message: res.error });
      }
    });
  }

  return (
    <div style={{ position: "relative", display: "inline-block" }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Availability: ${pres.label}. Click to change.`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          padding: pad,
          borderRadius: 999,
          background: pres.ring,
          color: pres.text,
          fontSize: font,
          fontWeight: 600,
          letterSpacing: "0.01em",
          border: "1px solid transparent",
          cursor: "pointer",
          transition: "transform 0.15s ease, box-shadow 0.15s ease",
        }}
      >
        <span
          aria-hidden
          style={{
            width: 8,
            height: 8,
            borderRadius: 999,
            background: pres.dot,
            boxShadow: `0 0 0 3px ${pres.ring}`,
          }}
        />
        {pres.label}
        <span
          aria-hidden
          style={{
            fontSize: 10,
            opacity: 0.55,
            marginLeft: 2,
            transform: open ? "rotate(180deg)" : "rotate(0deg)",
            transition: "transform 0.18s ease",
          }}
        >
          ▾
        </span>
      </button>

      {open && (
        <>
          {/* click-away */}
          <div
            onClick={() => setOpen(false)}
            style={{
              position: "fixed",
              inset: 0,
              zIndex: 30,
            }}
          />
          <div
            ref={listboxRef}
            role="listbox"
            onKeyDown={onListKeyDown}
            style={{
              position: "absolute",
              top: "calc(100% + 6px)",
              left: 0,
              minWidth: 200,
              background: "var(--color-surface-card)",
              borderRadius: 12,
              border: "1px solid var(--color-hairline-strong)",
              boxShadow:
                "0 12px 32px -8px rgba(15, 23, 42, 0.18), 0 2px 6px rgba(15, 23, 42, 0.06)",
              padding: 6,
              zIndex: 40,
            }}
          >
            {ORDER.map((opt) => {
              const p = PRESENTATION[opt];
              const active = opt === value;
              return (
                <button
                  key={opt}
                  type="button"
                  role="option"
                  aria-selected={active}
                  onClick={() => choose(opt)}
                  style={{
                    display: "flex",
                    width: "100%",
                    alignItems: "center",
                    gap: 10,
                    padding: "9px 11px",
                    borderRadius: 8,
                    fontSize: 14,
                    fontWeight: active ? 600 : 500,
                    color: "var(--color-ink-strong)",
                    background: active ? "rgba(15, 23, 42, 0.045)" : "transparent",
                    border: "none",
                    cursor: "pointer",
                    textAlign: "left",
                    transition: "background 0.12s ease",
                  }}
                  onMouseEnter={(e) =>
                    ((e.currentTarget.style.background =
                      "rgba(15, 23, 42, 0.045)"))
                  }
                  onMouseLeave={(e) =>
                    ((e.currentTarget.style.background = active
                      ? "rgba(15, 23, 42, 0.045)"
                      : "transparent"))
                  }
                >
                  <span
                    aria-hidden
                    style={{
                      width: 9,
                      height: 9,
                      borderRadius: 999,
                      background: p.dot,
                      boxShadow: `0 0 0 3px ${p.ring}`,
                    }}
                  />
                  <span style={{ flex: 1 }}>{p.label}</span>
                  {active && (
                    <span
                      aria-hidden
                      style={{ fontSize: 13, color: "#16A34A" }}
                    >
                      ✓
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
