"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { patchIdentity } from "@/app/(app)/profile/actions";
import { fireToast } from "@/lib/toast";
import { SectionHeader } from "./avatar-and-name";

const BIO_MAX = 280;
const TAG_MAX_LEN = 30;
const TAGS_MAX = 8;
const DEBOUNCE_MS = 500;

interface Props {
  initialBio: string | null;
  initialTags: string[];
}

export function BioAndTags({ initialBio, initialTags }: Props) {
  const [bio, setBio] = useState(initialBio ?? "");
  const [savedBio, setSavedBio] = useState(initialBio ?? "");
  const [tags, setTags] = useState<string[]>(initialTags);
  const [savedTags, setSavedTags] = useState<string[]>(initialTags);
  const [draft, setDraft] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [, startTransition] = useTransition();
  const bioTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Bio autosave (debounced)
  useEffect(() => {
    if (bio === savedBio) return;
    if (bio.length > BIO_MAX) return;
    if (bioTimerRef.current) clearTimeout(bioTimerRef.current);
    bioTimerRef.current = setTimeout(() => {
      startTransition(async () => {
        const res = await patchIdentity({ bio: bio.trim() || null });
        if (!res.ok) {
          fireToast({ message: res.error });
          setBio(savedBio);
          return;
        }
        setSavedBio(bio);
        setSavedAt(Date.now());
      });
    }, DEBOUNCE_MS);
    return () => {
      if (bioTimerRef.current) clearTimeout(bioTimerRef.current);
    };
  }, [bio, savedBio]);

  useEffect(() => {
    if (savedAt === null) return;
    const t = setTimeout(() => setSavedAt(null), 2500);
    return () => clearTimeout(t);
  }, [savedAt]);

  function commitTags(next: string[]) {
    const prev = savedTags;
    setTags(next);
    startTransition(async () => {
      const res = await patchIdentity({ tags: next });
      if (!res.ok) {
        fireToast({ message: res.error });
        setTags(prev);
        return;
      }
      setSavedTags(next);
      setSavedAt(Date.now());
    });
  }

  function addTag() {
    const v = draft.trim();
    if (!v) return;
    if (v.length > TAG_MAX_LEN) {
      fireToast({ message: `Tags must be ≤ ${TAG_MAX_LEN} chars.` });
      return;
    }
    if (tags.includes(v)) {
      setDraft("");
      return;
    }
    if (tags.length >= TAGS_MAX) {
      fireToast({ message: `Maximum ${TAGS_MAX} tags.` });
      return;
    }
    commitTags([...tags, v]);
    setDraft("");
  }

  function removeTag(t: string) {
    commitTags(tags.filter((x) => x !== t));
  }

  const showSaved = savedAt !== null && Date.now() - savedAt < 2500;
  const bioOver = bio.length > BIO_MAX;
  const bioCounterColor = bioOver
    ? "#DC2626"
    : bio.length > BIO_MAX * 0.85
      ? "#D97706"
      : "var(--color-ink-subtle)";

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
        title="Bio & expertise"
        description="A short note about you and what you're known for. Tags help teammates find the right person for the job."
        savedAt={showSaved ? savedAt : null}
      />

      <label htmlFor="profile-bio" style={fieldLabelStyle}>
        Bio
      </label>
      <textarea
        id="profile-bio"
        value={bio}
        onChange={(e) => setBio(e.target.value)}
        rows={3}
        placeholder="e.g. Operations lead. Owns Bahrain logistics + Mumbai-area FAB drawings."
        style={{
          width: "100%",
          padding: "14px 18px",
          fontSize: 16,
          color: "var(--color-ink-strong)",
          background: "var(--color-surface-input)",
          border: `1px solid ${
            bioOver ? "#DC2626" : "rgba(15, 23, 42, 0.08)"
          }`,
          borderRadius: 12,
          outline: "none",
          resize: "vertical",
          lineHeight: 1.55,
          fontFamily: "inherit",
        }}
      />
      <div
        style={{
          marginTop: 6,
          textAlign: "right",
          fontSize: 13,
          color: bioCounterColor,
          fontFamily: "var(--font-mono-display, ui-monospace, monospace)",
          fontWeight: 600,
        }}
      >
        {bio.length} / {BIO_MAX}
      </div>

      <div style={{ marginTop: 24 }}>
        <label htmlFor="profile-tag-input" style={fieldLabelStyle}>
          Ask me about
        </label>
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 8,
            padding: 10,
            background: "var(--color-surface-input)",
            border: "1px solid var(--color-hairline-strong)",
            borderRadius: 12,
            minHeight: 52,
            alignItems: "center",
          }}
        >
          {tags.map((t) => (
            <span
              key={t}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 8,
                padding: "7px 12px 7px 14px",
                fontSize: 14,
                fontWeight: 500,
                color: "rgb(30, 41, 59)",
                background: "var(--color-surface-card)",
                border: "1px solid var(--color-hairline-strong)",
                borderRadius: 999,
              }}
            >
              {t}
              <button
                type="button"
                aria-label={`Remove tag ${t}`}
                onClick={() => removeTag(t)}
                style={{
                  background: "none",
                  border: "none",
                  color: "var(--color-ink-subtle)",
                  fontSize: 16,
                  cursor: "pointer",
                  padding: 0,
                  lineHeight: 1,
                }}
              >
                ×
              </button>
            </span>
          ))}
          <input
            id="profile-tag-input"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addTag();
              } else if (
                e.key === "Backspace" &&
                draft === "" &&
                tags.length > 0
              ) {
                removeTag(tags[tags.length - 1]!);
              }
            }}
            placeholder={
              tags.length === 0
                ? "Type a tag and press Enter…"
                : tags.length >= TAGS_MAX
                  ? "Maximum reached"
                  : "Add another…"
            }
            disabled={tags.length >= TAGS_MAX}
            style={{
              flex: 1,
              minWidth: 160,
              border: "none",
              outline: "none",
              background: "transparent",
              fontSize: 15,
              color: "var(--color-ink-strong)",
              padding: "6px 8px",
            }}
          />
        </div>
        <p
          style={{
            margin: "8px 2px 0",
            fontSize: 13,
            color: "var(--color-ink-subtle)",
          }}
        >
          {tags.length} / {TAGS_MAX} tags · press Enter to add
        </p>
      </div>
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
