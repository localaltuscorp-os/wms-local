"use client";

import { useEffect, useRef, useState } from "react";

export type ProfileTabKey =
  | "identity"
  | "notifications"
  | "workflow"
  | "performance"
  | "appearance";

const TABS: { key: ProfileTabKey; label: string; mobileLabel: string }[] = [
  { key: "identity", label: "Identity", mobileLabel: "Identity" },
  { key: "notifications", label: "Notifications", mobileLabel: "Notifs" },
  { key: "workflow", label: "Workflow", mobileLabel: "Workflow" },
  { key: "performance", label: "Performance", mobileLabel: "Perf" },
  { key: "appearance", label: "Appearance", mobileLabel: "Look" },
];

function tabFromHash(): ProfileTabKey {
  if (typeof window === "undefined") return "identity";
  const raw = window.location.hash.replace(/^#/, "");
  return TABS.some((t) => t.key === raw) ? (raw as ProfileTabKey) : "identity";
}

interface Props {
  onChange: (tab: ProfileTabKey) => void;
}

export function ProfileTabs({ onChange }: Props) {
  const [active, setActive] = useState<ProfileTabKey>("identity");
  const stripRef = useRef<HTMLDivElement>(null);

  // Sync from URL hash on mount + when user uses back/forward.
  useEffect(() => {
    function sync() {
      const next = tabFromHash();
      setActive(next);
      onChange(next);
    }
    sync();
    window.addEventListener("hashchange", sync);
    return () => window.removeEventListener("hashchange", sync);
  }, [onChange]);

  // Center the active tab in the scrollable strip on mobile.
  useEffect(() => {
    const el = stripRef.current?.querySelector<HTMLButtonElement>(
      `[data-tab="${active}"]`,
    );
    el?.scrollIntoView({ inline: "center", block: "nearest", behavior: "smooth" });
  }, [active]);

  function pick(next: ProfileTabKey) {
    if (next === active) return;
    setActive(next);
    onChange(next);
    if (typeof window !== "undefined") {
      const url = new URL(window.location.href);
      url.hash = next;
      window.history.replaceState(null, "", url);
    }
  }

  function onKeyDown(e: React.KeyboardEvent) {
    const i = TABS.findIndex((t) => t.key === active);
    if (e.key === "ArrowRight" && i < TABS.length - 1) {
      e.preventDefault();
      pick(TABS[i + 1]!.key);
    } else if (e.key === "ArrowLeft" && i > 0) {
      e.preventDefault();
      pick(TABS[i - 1]!.key);
    } else if (e.key === "Home") {
      e.preventDefault();
      pick(TABS[0]!.key);
    } else if (e.key === "End") {
      e.preventDefault();
      pick(TABS[TABS.length - 1]!.key);
    }
  }

  return (
    <div
      ref={stripRef}
      role="tablist"
      aria-label="Profile sections"
      onKeyDown={onKeyDown}
      className="profile-tabs"
      style={{
        display: "flex",
        gap: 4,
        borderBottom: "1px solid var(--color-hairline-strong)",
        overflowX: "auto",
        scrollSnapType: "x mandatory",
        scrollbarWidth: "none",
        msOverflowStyle: "none",
        padding: "0 4px",
      }}
    >
      {TABS.map((t) => {
        const isActive = t.key === active;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={`profile-panel-${t.key}`}
            id={`profile-tab-${t.key}`}
            data-tab={t.key}
            tabIndex={isActive ? 0 : -1}
            onClick={() => pick(t.key)}
            style={{
              position: "relative",
              padding: "16px 22px",
              fontSize: 16,
              fontWeight: isActive ? 700 : 500,
              color: isActive ? "#0F172A" : "var(--color-ink-subtle)",
              background: "transparent",
              border: "none",
              cursor: "pointer",
              whiteSpace: "nowrap",
              scrollSnapAlign: "center",
              transition: "color 0.15s ease",
              letterSpacing: "-0.005em",
            }}
            onMouseEnter={(e) => {
              if (!isActive) e.currentTarget.style.color = "#0F172A";
            }}
            onMouseLeave={(e) => {
              if (!isActive)
                e.currentTarget.style.color = "var(--color-ink-subtle)";
            }}
          >
            <span className="profile-tab-label-full">{t.label}</span>
            <span className="profile-tab-label-mobile">{t.mobileLabel}</span>
            {isActive && (
              <span
                aria-hidden
                style={{
                  position: "absolute",
                  bottom: -1,
                  left: 16,
                  right: 16,
                  height: 3,
                  background: "#E10600",
                  borderRadius: 3,
                }}
              />
            )}
          </button>
        );
      })}
      <style>{`
        .profile-tabs::-webkit-scrollbar { display: none; }
        .profile-tab-label-mobile { display: none; }
        @media (max-width: 540px) {
          .profile-tab-label-full { display: none; }
          .profile-tab-label-mobile { display: inline; }
        }
      `}</style>
    </div>
  );
}
