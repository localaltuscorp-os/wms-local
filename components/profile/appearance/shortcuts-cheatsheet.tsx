"use client";

import { SectionHeader } from "@/components/profile/identity/avatar-and-name";
import { SHORTCUT_GROUPS as GROUPS } from "@/lib/shortcuts";

export function ShortcutsCheatsheet() {
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
        title="Keyboard shortcuts"
        description="Speed-ups for power users. Press ? from anywhere to see this overlay."
        savedAt={null}
      />

      <div style={{ display: "grid", gap: 24 }}>
        {GROUPS.map((g) => (
          <div key={g.title}>
            <h3
              style={{
                margin: "0 0 12px",
                fontSize: 13,
                fontWeight: 700,
                color: "var(--color-ink-soft)",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              {g.title}
            </h3>
            <div
              style={{
                display: "grid",
                gap: 1,
                background: "rgba(15, 23, 42, 0.06)",
                border: "1px solid var(--color-hairline)",
                borderRadius: 12,
                overflow: "hidden",
              }}
            >
              {g.rows.map((s, i) => (
                <div
                  key={i}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "12px 16px",
                    background: "var(--color-surface-card)",
                  }}
                >
                  <span
                    style={{
                      fontSize: 15,
                      color: "var(--color-ink-strong)",
                      fontWeight: 500,
                    }}
                  >
                    {s.description}
                  </span>
                  <span style={{ display: "inline-flex", gap: 4 }}>
                    {s.keys.map((k, ki) => (
                      <kbd
                        key={ki}
                        style={{
                          fontFamily:
                            "var(--font-mono-display, ui-monospace, monospace)",
                          fontSize: 13,
                          fontWeight: 700,
                          color: "var(--color-ink-strong)",
                          background: "rgba(15, 23, 42, 0.06)",
                          border: "1px solid rgba(15, 23, 42, 0.12)",
                          borderRadius: 6,
                          padding: "3px 10px",
                          minWidth: 24,
                          textAlign: "center",
                          boxShadow: "0 1px 0 rgba(15, 23, 42, 0.08)",
                        }}
                      >
                        {k}
                      </kbd>
                    ))}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
