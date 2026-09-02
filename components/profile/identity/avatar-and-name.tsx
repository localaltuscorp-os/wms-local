"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { fireToast } from "@/lib/toast";
import { AvatarGallery } from "./avatar-gallery";

interface Props {
  initialName: string;
  initialAvatarUrl: string | null;
}

export function AvatarAndName({ initialName, initialAvatarUrl }: Props) {
  const router = useRouter();
  // Display name is assigned by an admin and final — not self-editable here.
  const name = initialName;
  const [avatarUrl, setAvatarUrl] = useState<string | null>(initialAvatarUrl);
  const [uploading, setUploading] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const showSaved = savedAt !== null && Date.now() - savedAt < 2500;
  useEffect(() => {
    if (savedAt === null) return;
    const t = setTimeout(() => setSavedAt(null), 2500);
    return () => clearTimeout(t);
  }, [savedAt]);

  async function onUpload(file: File) {
    if (!file.type.startsWith("image/")) {
      fireToast({ message: "Pick an image file (JPEG, PNG, or WebP)." });
      return;
    }
    setUploading(true);
    try {
      const form = new FormData();
      form.set("file", file);
      const res = await fetch("/api/profile/avatar", {
        method: "POST",
        body: form,
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      setAvatarUrl(json.url as string);
      setSavedAt(Date.now());
      router.refresh();
    } catch (err) {
      fireToast({
        message: `Upload failed: ${
          err instanceof Error ? err.message : "unknown"
        }`,
      });
    } finally {
      setUploading(false);
    }
  }

  async function onRemove() {
    if (!confirm("Remove your avatar?")) return;
    setUploading(true);
    try {
      const res = await fetch("/api/profile/avatar", { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error ?? `HTTP ${res.status}`);
      }
      setAvatarUrl(null);
      setSavedAt(Date.now());
      router.refresh();
    } catch (err) {
      fireToast({
        message: `Remove failed: ${
          err instanceof Error ? err.message : "unknown"
        }`,
      });
    } finally {
      setUploading(false);
    }
  }

  const initials = (name || initialName)
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

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
        title="Photo & name"
        description="Upload a picture, pick a character, or stick with your initials. Your display name is set by your administrator and can't be changed here."
        savedAt={showSaved ? savedAt : null}
      />

      <div
        className="profile-photo-row"
        style={{
          display: "grid",
          gridTemplateColumns: "auto 1fr",
          gap: 36,
          alignItems: "start",
        }}
      >
        <div style={{ position: "relative" }}>
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={avatarUrl}
              alt={name}
              width={128}
              height={128}
              style={{
                width: 128,
                height: 128,
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
                width: 128,
                height: 128,
                borderRadius: 999,
                display: "grid",
                placeItems: "center",
                background:
                  "linear-gradient(135deg, #FCA5A5 0%, #E10600 60%, #A80400 100%)",
                color: "white",
                fontFamily:
                  "var(--font-mono-display, ui-monospace, monospace)",
                fontWeight: 700,
                fontSize: 44,
                letterSpacing: "0.05em",
                border: "3px solid white",
                boxShadow: "0 12px 28px -12px rgba(15, 23, 42, 0.35)",
              }}
            >
              {initials}
            </div>
          )}
          {uploading && (
            <div
              aria-live="polite"
              style={{
                position: "absolute",
                inset: 0,
                borderRadius: 999,
                background: "rgba(15, 23, 42, 0.55)",
                color: "white",
                display: "grid",
                placeItems: "center",
                fontSize: 14,
                fontWeight: 600,
              }}
            >
              Saving…
            </div>
          )}
        </div>

        <div style={{ minWidth: 0 }}>
          <label style={fieldLabelStyle}>Display name</label>
          {/* Read-only — the name is admin-assigned and final. */}
          <div
            style={{
              width: "100%",
              padding: "14px 18px",
              fontSize: 19,
              fontWeight: 600,
              color: "var(--color-ink-strong)",
              background: "var(--color-surface-soft)",
              border: "1px solid var(--color-hairline)",
              borderRadius: 12,
              letterSpacing: "-0.005em",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <span
              style={{
                minWidth: 0,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {name}
            </span>
            <span
              style={{
                fontSize: 12,
                fontWeight: 700,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--color-ink-subtle)",
                whiteSpace: "nowrap",
              }}
            >
              Set by admin
            </span>
          </div>
          <div
            style={{
              marginTop: 14,
              display: "flex",
              gap: 10,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              style={btnStyle("primary")}
            >
              {uploading ? "Uploading…" : "Upload photo"}
            </button>
            {avatarUrl && (
              <button
                type="button"
                onClick={onRemove}
                disabled={uploading}
                style={btnStyle("ghost")}
              >
                Remove
              </button>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUpload(f);
                e.target.value = "";
              }}
            />
            <span
              style={{
                fontSize: 13,
                color: "var(--color-ink-subtle)",
              }}
            >
              JPEG, PNG, or WebP · 2MB max
            </span>
          </div>
        </div>
      </div>

      <div
        style={{
          marginTop: 28,
          paddingTop: 24,
          borderTop: "1px solid var(--color-hairline)",
        }}
      >
        <AvatarGallery
          initialName={name}
          currentUrl={avatarUrl}
          onPicked={(url) => {
            setAvatarUrl(url);
            setSavedAt(Date.now());
          }}
        />
      </div>

      <style>{`
        @media (max-width: 640px) {
          .profile-photo-row {
            grid-template-columns: 1fr !important;
            gap: 24px !important;
            justify-items: center;
            text-align: center;
          }
        }
      `}</style>
    </section>
  );
}

const fieldLabelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 700,
  color: "var(--color-ink-soft)",
  textTransform: "uppercase",
  letterSpacing: "0.08em",
  marginBottom: 8,
};

function btnStyle(kind: "primary" | "ghost"): React.CSSProperties {
  if (kind === "primary") {
    return {
      padding: "11px 18px",
      fontSize: 14,
      fontWeight: 600,
      color: "white",
      background: "linear-gradient(135deg, #E10600, #A80400)",
      border: "none",
      borderRadius: 10,
      cursor: "pointer",
      letterSpacing: "0.01em",
    };
  }
  return {
    padding: "11px 18px",
    fontSize: 14,
    fontWeight: 600,
    color: "var(--color-ink-soft)",
    background: "transparent",
    border: "1px solid rgba(15, 23, 42, 0.14)",
    borderRadius: 10,
    cursor: "pointer",
  };
}

export function SectionHeader({
  title,
  description,
  savedAt,
}: {
  title: string;
  description?: string;
  savedAt: number | null;
}) {
  return (
    <div
      style={{
        marginBottom: 22,
        display: "flex",
        alignItems: "flex-start",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <div>
        <h2
          style={{
            margin: 0,
            fontSize: 19,
            fontWeight: 700,
            color: "var(--color-ink-strong)",
            letterSpacing: "-0.015em",
          }}
        >
          {title}
        </h2>
        {description && (
          <p
            style={{
              margin: "6px 0 0",
              fontSize: 14,
              color: "var(--color-ink-subtle)",
              lineHeight: 1.55,
              maxWidth: 560,
            }}
          >
            {description}
          </p>
        )}
      </div>
      <span
        aria-live="polite"
        style={{
          fontSize: 13,
          fontWeight: 600,
          color: savedAt ? "#16A34A" : "transparent",
          transition: "opacity 0.3s ease",
          opacity: savedAt ? 1 : 0,
          whiteSpace: "nowrap",
          paddingTop: 4,
        }}
      >
        ✓ Saved
      </span>
    </div>
  );
}
