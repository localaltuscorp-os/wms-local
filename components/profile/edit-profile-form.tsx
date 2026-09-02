"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { User, ImageIcon, Check } from "lucide-react";
import { updateMyProfile } from "@/app/(app)/profile/actions";

interface Props {
  initial: {
    name: string;
    avatarUrl: string | null;
  };
}

/**
 * Self-serve profile edits — display name + avatar URL. No file upload;
 * paste a public image URL (Gravatar, ImgBB, any CDN). Empty URL clears
 * the avatar back to initials. Lives inside /profile right above the
 * notification channel preferences card.
 */
export function EditProfileForm({ initial }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(initial.name);
  const [avatarUrl, setAvatarUrl] = useState(initial.avatarUrl ?? "");
  const [error, setError] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(null);

  const dirty =
    name.trim() !== initial.name ||
    avatarUrl.trim() !== (initial.avatarUrl ?? "");

  const initials = (name || initial.name)
    .split(" ")
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  const previewUrl = avatarUrl.trim() || null;

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const result = await updateMyProfile({
        name: name.trim(),
        avatarUrl: avatarUrl.trim(),
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSavedAt(Date.now());
      router.refresh();
    });
  }

  return (
    <form
      onSubmit={onSubmit}
      className="rounded-lg border border-[#E2E8F0] bg-white p-5"
    >
      <h2 className="text-[13px] uppercase tracking-wide text-[#94A3B8] font-bold mb-4">
        Edit profile
      </h2>

      <div className="flex items-center gap-4 mb-5">
        <span
          className="inline-flex rounded-full shrink-0"
          style={{
            background: "rgba(15, 23, 42, 0.08)",
            padding: 2,
          }}
        >
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={previewUrl}
              alt="Avatar preview"
              className="h-16 w-16 rounded-full object-cover block"
              onError={(e) => {
                // Hide broken images so the initials fall-through still reads
                (e.target as HTMLImageElement).style.display = "none";
              }}
            />
          ) : (
            <span
              className="h-16 w-16 rounded-full flex items-center justify-center text-[20px] font-semibold text-white"
              style={{
                background: "linear-gradient(135deg, #475569, #1f2937)",
              }}
            >
              {initials}
            </span>
          )}
        </span>
        <div className="text-[13px] text-[#64748B]" style={{ lineHeight: 1.55 }}>
          <p className="mb-1">
            <strong className="text-[#0F172A]">Tip:</strong> Paste a public
            image URL (Gravatar, ImgBB, Cloudinary, etc.).
          </p>
          <p>Leave blank to fall back to initials.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <label className="block">
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-[#334155] mb-1.5">
            <User size={13} strokeWidth={2.4} />
            Display name
          </span>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={120}
            required
            className="w-full rounded-md border border-[#E2E8F0] px-3.5 py-2.5 text-[15px] bg-white outline-none focus:border-[#94A3B8]"
            placeholder="Your name"
          />
        </label>

        <label className="block">
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-[#334155] mb-1.5">
            <ImageIcon size={13} strokeWidth={2.4} />
            Avatar URL
          </span>
          <input
            type="url"
            value={avatarUrl}
            onChange={(e) => setAvatarUrl(e.target.value)}
            maxLength={2000}
            className="w-full rounded-md border border-[#E2E8F0] px-3.5 py-2.5 text-[15px] bg-white outline-none focus:border-[#94A3B8]"
            placeholder="https://…"
          />
        </label>
      </div>

      {error && (
        <p className="mt-3 text-[14px]" style={{ color: "var(--color-red-deep)" }}>
          {error}
        </p>
      )}

      <div className="mt-5 flex items-center justify-end gap-3">
        {savedAt && !dirty && !pending && (
          <span className="inline-flex items-center gap-1.5 text-[13px] text-[#16a34a]">
            <Check size={13} strokeWidth={2.6} />
            Saved
          </span>
        )}
        <button
          type="submit"
          disabled={pending || !dirty}
          className="px-5 py-2.5 rounded-md text-[14px] font-medium text-white disabled:opacity-50 disabled:cursor-not-allowed"
          style={{
            background:
              "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))",
          }}
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
      </div>
    </form>
  );
}
