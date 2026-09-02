"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { patchIdentity } from "@/app/(app)/profile/actions";
import { fireToast } from "@/lib/toast";
import { SectionHeader } from "@/components/profile/identity/avatar-and-name";
import { accentVars } from "@/lib/appearance";

/** Apply a density/accent change to <html> immediately for instant feedback,
 *  independent of the server round-trip + route refresh. */
function applyAppearanceLive(patch: { density?: Density; accent?: string }) {
  if (typeof document === "undefined") return;
  const el = document.documentElement;
  if (patch.density) el.setAttribute("data-density", patch.density);
  if (patch.accent && /^#[0-9a-fA-F]{6}$/.test(patch.accent)) {
    for (const [k, v] of Object.entries(accentVars(patch.accent))) {
      el.style.setProperty(k, v);
    }
  }
}

type Density = "cozy" | "compact";

const ACCENT_PRESETS = [
  { label: "Altus red", value: "#E10600" },
  { label: "Forest", value: "#16A34A" },
  { label: "Royal", value: "#2563EB" },
  { label: "Sunset", value: "#D97706" },
  { label: "Plum", value: "#7C3AED" },
  { label: "Slate", value: "#475569" },
];

interface Props {
  initial: {
    density: Density;
    accent: string;
  };
}

export function AppearanceControls({ initial }: Props) {
  const router = useRouter();
  const [density, setDensity] = useState<Density>(initial.density);
  const [accent, setAccent] = useState<string>(initial.accent);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [, startTransition] = useTransition();

  function save(patch: Parameters<typeof patchIdentity>[0]) {
    applyAppearanceLive(patch); // instant visible feedback
    startTransition(async () => {
      const res = await patchIdentity(patch);
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
          title="Density"
          description="Cozy keeps things readable; compact fits more on screen."
          savedAt={showSaved ? savedAt : null}
        />
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          {(["cozy", "compact"] as Density[]).map((opt) => {
            const active = density === opt;
            return (
              <button
                key={opt}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  if (opt === density) return;
                  setDensity(opt);
                  save({ density: opt });
                }}
                style={{
                  padding: "16px 22px",
                  fontSize: 15,
                  fontWeight: 600,
                  color: active ? "white" : "#0F172A",
                  background: active
                    ? "linear-gradient(135deg, #0F172A, #1E293B)"
                    : "rgba(15, 23, 42, 0.025)",
                  border: `1px solid ${
                    active ? "transparent" : "rgba(15, 23, 42, 0.08)"
                  }`,
                  borderRadius: 12,
                  cursor: "pointer",
                  textTransform: "capitalize",
                  minWidth: 120,
                }}
              >
                {opt}
              </button>
            );
          })}
        </div>
      </section>

      <section style={cardStyle}>
        <SectionHeader
          title="Accent colour"
          description="Tints buttons, focus rings, and the streak flame. Pick a preset or paste a custom hex."
          savedAt={showSaved ? savedAt : null}
        />
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
            gap: 12,
            marginBottom: 18,
          }}
        >
          {ACCENT_PRESETS.map((p) => {
            const active = p.value.toLowerCase() === accent.toLowerCase();
            return (
              <button
                key={p.value}
                type="button"
                aria-pressed={active}
                onClick={() => {
                  if (active) return;
                  setAccent(p.value);
                  save({ accent: p.value });
                }}
                style={{
                  padding: 14,
                  background: "var(--color-surface-input)",
                  border: `2px solid ${
                    active ? p.value : "rgba(15, 23, 42, 0.06)"
                  }`,
                  borderRadius: 12,
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <div
                  style={{
                    width: "100%",
                    height: 36,
                    borderRadius: 8,
                    background: p.value,
                    marginBottom: 8,
                  }}
                />
                <div
                  style={{
                    fontSize: 12,
                    fontWeight: 600,
                    color: "var(--color-ink-strong)",
                  }}
                >
                  {p.label}
                </div>
                <div
                  style={{
                    fontSize: 11,
                    color: "var(--color-ink-subtle)",
                    fontFamily:
                      "var(--font-mono-display, ui-monospace, monospace)",
                  }}
                >
                  {p.value}
                </div>
              </button>
            );
          })}
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            flexWrap: "wrap",
          }}
        >
          <label
            htmlFor="accent-custom"
            style={{
              fontSize: 13,
              fontWeight: 700,
              color: "var(--color-ink-soft)",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            Custom hex
          </label>
          <input
            id="accent-custom"
            type="text"
            value={accent}
            placeholder="#E10600"
            maxLength={7}
            onChange={(e) => setAccent(e.target.value)}
            onBlur={() => {
              if (/^#[0-9a-fA-F]{6}$/.test(accent) && accent !== initial.accent) {
                save({ accent });
              }
            }}
            style={{
              fontFamily: "var(--font-mono-display, ui-monospace, monospace)",
              width: 130,
              padding: "10px 14px",
              fontSize: 15,
              fontWeight: 600,
              color: "var(--color-ink-strong)",
              background: "var(--color-surface-input)",
              border: "1px solid var(--color-hairline-strong)",
              borderRadius: 10,
              outline: "none",
            }}
          />
          <input
            type="color"
            value={/^#[0-9a-fA-F]{6}$/.test(accent) ? accent : "#E10600"}
            onChange={(e) => {
              setAccent(e.target.value);
              save({ accent: e.target.value });
            }}
            style={{
              width: 44,
              height: 44,
              border: "1px solid var(--color-hairline-strong)",
              borderRadius: 10,
              cursor: "pointer",
              background: "transparent",
            }}
          />
        </div>
      </section>
    </>
  );
}
