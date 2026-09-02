"use client";

import { AvailabilityPill } from "./availability-pill";

interface Props {
  name: string;
  email: string;
  role: string;
  department: string | null;
  avatarUrl: string | null;
  availability: "available" | "focused" | "heads_down" | "away";
  isAdmin: boolean;
  stats: {
    openCount: number;
    completedThisWeek: number;
    streakDays: number;
  };
}

export function ProfileHero({
  name,
  email,
  role,
  department,
  avatarUrl,
  availability,
  isAdmin,
  stats,
}: Props) {
  const initials = name
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const subtitleParts = [
    isAdmin ? "Admin" : null,
    role === "both" ? "Doer · Initiator" : role === "doer" ? "Doer" : "Initiator",
    department,
  ].filter(Boolean);

  return (
    <header
      className="profile-hero"
      style={{
        background: "var(--color-surface-card)",
        borderRadius: 20,
        border: "1px solid var(--color-hairline)",
        boxShadow:
          "0 1px 0 rgba(255, 255, 255, 0.65) inset, 0 14px 32px -20px rgba(15, 23, 42, 0.18)",
        padding: 36,
        display: "grid",
        gridTemplateColumns: "auto 1fr auto",
        gap: 36,
        alignItems: "center",
      }}
    >
      <div style={{ position: "relative", flexShrink: 0 }}>
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt={name}
            width={112}
            height={112}
            style={{
              width: 112,
              height: 112,
              borderRadius: 999,
              objectFit: "cover",
              border: "3px solid white",
              boxShadow: "0 12px 28px -12px rgba(15, 23, 42, 0.35)",
              background: "var(--color-surface-stripe)",
            }}
          />
        ) : (
          <div
            aria-hidden
            style={{
              width: 112,
              height: 112,
              borderRadius: 999,
              display: "grid",
              placeItems: "center",
              background:
                "linear-gradient(135deg, #FCA5A5 0%, #E10600 60%, #A80400 100%)",
              color: "white",
              fontFamily: "var(--font-mono-display, ui-monospace, monospace)",
              fontWeight: 700,
              fontSize: 40,
              letterSpacing: "0.05em",
              border: "3px solid white",
              boxShadow: "0 12px 28px -12px rgba(15, 23, 42, 0.35)",
            }}
          >
            {initials}
          </div>
        )}
      </div>

      <div style={{ minWidth: 0 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            flexWrap: "wrap",
            gap: 14,
            marginBottom: 8,
          }}
        >
          <h1
            style={{
              fontSize: 36,
              fontWeight: 700,
              color: "var(--color-ink-strong)",
              letterSpacing: "-0.025em",
              margin: 0,
              lineHeight: 1.05,
            }}
          >
            {name}
          </h1>
          <AvailabilityPill initial={availability} />
        </div>

        <p
          style={{
            margin: 0,
            color: "var(--color-ink-muted)",
            fontSize: 16,
            fontWeight: 500,
            letterSpacing: "-0.005em",
          }}
        >
          {subtitleParts.join(" · ")}
        </p>
        <p
          style={{
            margin: "4px 0 0",
            color: "var(--color-ink-subtle)",
            fontSize: 14,
          }}
        >
          {email}
        </p>
      </div>

      <div
        className="profile-hero-stats"
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, minmax(140px, 1fr))",
          gap: 14,
          alignSelf: "center",
        }}
      >
        <Stat label="Open tasks" value={stats.openCount} accent="#0F172A" />
        <Stat
          label="Done this week"
          value={stats.completedThisWeek}
          accent="#16A34A"
        />
        <Stat
          label="Day streak"
          value={stats.streakDays}
          suffix={stats.streakDays >= 3 ? " 🔥" : ""}
          accent="#E10600"
        />
      </div>

      <style>{`
        @media (max-width: 1024px) {
          .profile-hero {
            grid-template-columns: auto 1fr !important;
          }
          .profile-hero-stats {
            grid-column: 1 / -1;
          }
        }
        @media (max-width: 640px) {
          .profile-hero {
            grid-template-columns: 1fr !important;
            padding: 24px !important;
            gap: 20px !important;
          }
          .profile-hero h1 {
            font-size: 26px !important;
          }
        }
      `}</style>
    </header>
  );
}

function Stat({
  label,
  value,
  accent,
  suffix = "",
}: {
  label: string;
  value: number;
  accent: string;
  suffix?: string;
}) {
  return (
    <div
      style={{
        background: "var(--color-surface-stripe)",
        border: "1px solid rgba(15, 23, 42, 0.05)",
        borderRadius: 12,
        padding: "16px 18px",
      }}
    >
      <div
        style={{
          fontFamily: "var(--font-mono-display, ui-monospace, monospace)",
          fontWeight: 700,
          color: accent,
          fontSize: 30,
          letterSpacing: "-0.025em",
          lineHeight: 1.05,
        }}
      >
        {value}
        <span style={{ fontSize: 24 }}>{suffix}</span>
      </div>
      <div
        style={{
          marginTop: 6,
          fontSize: 12,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--color-ink-soft)",
          fontWeight: 700,
        }}
      >
        {label}
      </div>
    </div>
  );
}
