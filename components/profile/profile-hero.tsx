"use client";

import { Avatar } from "@/components/ui/avatar";
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
        {/* Shared <Avatar>. The pair this replaces branched on whether a URL
            EXISTED, not on whether it loaded — so a 404 showed the browser's
            broken-image frame at 112px instead of the red initials disc right
            beside it in the code. The white ring and drop shadow move onto the
            wrapper so the framing is identical either way. */}
        <Avatar
          name={name}
          avatarUrl={avatarUrl}
          size={112}
          className="text-[40px]"
        />
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
