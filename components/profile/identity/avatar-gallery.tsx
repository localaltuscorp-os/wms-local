"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { updateMyProfile } from "@/app/(app)/profile/actions";
import { fireToast } from "@/lib/toast";

/**
 * Twelve preset avatars — hand-authored SVGs in `public/avatars/`.
 * Featureless peach faces with distinct hair + colourful business
 * attire, matching the user's reference image. Stored as plain
 * static files so the browser caches aggressively.
 */
const PRESET_URLS = Array.from(
  { length: 12 },
  (_, i) => `/avatars/preset-${(i + 1).toString().padStart(2, "0")}.svg`,
);

interface Props {
  initialName: string;
  currentUrl: string | null;
  onPicked: (url: string) => void;
}

export function AvatarGallery({ initialName, currentUrl, onPicked }: Props) {
  const router = useRouter();
  const [pickingUrl, setPickingUrl] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  async function choose(url: string) {
    if (url === currentUrl) return;
    setPickingUrl(url);
    startTransition(async () => {
      const res = await updateMyProfile({
        name: initialName,
        avatarUrl: url,
      });
      setPickingUrl(null);
      if (!res.ok) {
        fireToast({ message: res.error });
        return;
      }
      onPicked(url);
      router.refresh();
    });
  }

  return (
    <div>
      <div
        style={{
          display: "flex",
          alignItems: "baseline",
          justifyContent: "space-between",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <h3
          style={{
            margin: 0,
            fontSize: 14,
            fontWeight: 700,
            color: "var(--color-ink-strong)",
            letterSpacing: "-0.005em",
          }}
        >
          Or pick a character
        </h3>
        <span
          style={{
            fontSize: 13,
            color: "var(--color-ink-subtle)",
          }}
        >
          No upload required
        </span>
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(72px, 1fr))",
          gap: 12,
        }}
      >
        {PRESET_URLS.map((url, i) => {
          const active = url === currentUrl;
          const busy = pickingUrl === url;
          return (
            <button
              key={url}
              type="button"
              aria-label={`Use avatar ${i + 1}`}
              aria-pressed={active}
              onClick={() => choose(url)}
              disabled={busy}
              style={{
                position: "relative",
                aspectRatio: "1 / 1",
                padding: 0,
                borderRadius: 16,
                background: active
                  ? "linear-gradient(135deg, rgba(225,6,0,0.12), rgba(168,4,0,0.08))"
                  : "rgba(15, 23, 42, 0.03)",
                border: `2px solid ${
                  active ? "#E10600" : "rgba(15, 23, 42, 0.06)"
                }`,
                cursor: busy ? "wait" : "pointer",
                overflow: "hidden",
                transition: "transform 0.18s ease, border-color 0.18s ease",
              }}
              onMouseEnter={(e) => {
                if (!active && !busy) {
                  e.currentTarget.style.transform = "translateY(-2px)";
                  e.currentTarget.style.borderColor =
                    "rgba(225, 6, 0, 0.35)";
                }
              }}
              onMouseLeave={(e) => {
                if (!active && !busy) {
                  e.currentTarget.style.transform = "translateY(0)";
                  e.currentTarget.style.borderColor =
                    "rgba(15, 23, 42, 0.06)";
                }
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt=""
                width={64}
                height={64}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "cover",
                  display: "block",
                }}
              />
              {active && (
                <span
                  aria-hidden
                  style={{
                    position: "absolute",
                    top: 4,
                    right: 4,
                    width: 22,
                    height: 22,
                    borderRadius: 999,
                    background: "#E10600",
                    color: "white",
                    display: "grid",
                    placeItems: "center",
                    fontSize: 13,
                    fontWeight: 700,
                    boxShadow: "0 2px 6px rgba(225, 6, 0, 0.45)",
                  }}
                >
                  ✓
                </span>
              )}
              {busy && (
                <span
                  aria-live="polite"
                  style={{
                    position: "absolute",
                    inset: 0,
                    background: "rgba(15, 23, 42, 0.55)",
                    color: "white",
                    fontSize: 11,
                    fontWeight: 600,
                    display: "grid",
                    placeItems: "center",
                  }}
                >
                  …
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
