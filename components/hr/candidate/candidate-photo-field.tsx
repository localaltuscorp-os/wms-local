"use client";

import * as React from "react";
import { Camera, Upload, Loader2, Check, Trash2 } from "lucide-react";
import { getSupabaseClient } from "@/lib/supabase/browser";
import { fireToast } from "@/lib/toast";
import { SelfieCapture } from "@/components/hr/candidate/selfie-capture";

/** What the wizard hands us to mint a signed upload URL (HR or candidate). */
export type PhotoUploadUrlFn = (input: {
  mime?: string | null;
  size?: number | null;
}) => Promise<
  { ok: true; path: string; token: string; bucket: string } | { ok: false; error: string }
>;

const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif";

/**
 * CANDIDATE PHOTO — the first thing asked for in Personal Details.
 *
 * ── THE BYTES DO NOT GO THROUGH THE SERVER ───────────────────────────────
 * The picked file is PUT straight to Supabase Storage with a one-shot signed
 * URL, and only the resulting storage key comes back into the form. A Server
 * Action carrying the image instead would push a multi-megabyte body through
 * the Next function on every save — the slow path, and the one with a hard body
 * limit that makes a phone photo fail outright.
 *
 * ── OPTIONAL, DELIBERATELY ───────────────────────────────────────────────
 * This form USED to have photo and signature uploads, and they were removed on
 * 2026-08-20 because they counted as required: a fully completed form could not
 * be submitted without them, which read to the person filling it as "the form
 * won't save". So this one asks and does not insist — the value is an ordinary
 * answer key (`personal.photo`), not a gate on submitting.
 *
 * ── WHY A RESUMED DRAFT SHOWS "PHOTO ATTACHED" AND NOT THE PHOTO ─────────
 * The documents bucket is private, so displaying a stored photo needs a signed
 * read URL minted server-side. Rather than an extra round-trip on every mount
 * of step 1, a saved photo states plainly that it is there and offers Replace.
 * A freshly picked one previews locally from the File itself.
 */
export function CandidatePhotoField({
  value,
  onChange,
  uploadUrl,
}: {
  /** The stored storage key, or "" when none. */
  value: string;
  onChange: (path: string) => void;
  uploadUrl: PhotoUploadUrlFn;
}) {
  const [busy, setBusy] = React.useState(false);
  const [preview, setPreview] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement | null>(null);

  // An object URL is a document-lifetime handle; revoke the previous one rather
  // than leaking one per re-pick.
  React.useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  const upload = React.useCallback(
    async (file: File) => {
      if (busy) return;
      setBusy(true);
      try {
        const signed = await uploadUrl({ mime: file.type || null, size: file.size });
        if (!signed.ok) {
          fireToast({ message: signed.error, type: "error" });
          return;
        }
        const { error } = await getSupabaseClient()
          .storage.from(signed.bucket)
          .uploadToSignedUrl(signed.path, signed.token, file, {
            contentType: file.type || "image/jpeg",
          });
        if (error) {
          fireToast({ message: `Upload failed: ${error.message}`, type: "error" });
          return;
        }
        setPreview((old) => {
          if (old) URL.revokeObjectURL(old);
          return URL.createObjectURL(file);
        });
        onChange(signed.path);
        fireToast({ message: "Photo attached.", type: "success" });
      } finally {
        setBusy(false);
      }
    },
    [busy, onChange, uploadUrl],
  );

  function clear() {
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
    onChange("");
    if (fileRef.current) fileRef.current.value = "";
  }

  const has = value.trim().length > 0;

  return (
    <section className="mt-8 rounded-2xl border border-hairline bg-white p-6 shadow-[0_1px_2px_rgba(15,23,42,0.04)] max-sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-[15px] font-bold text-ink-strong">Candidate Photo</h4>
          <p className="mt-1 text-[13px] leading-relaxed text-ink-muted">
            A passport-style photograph or a professional selfie — plain background, face
            clearly visible. JPG, PNG or WebP, up to 8 MB.
          </p>
        </div>
        {has && !busy && (
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-pill px-2.5 py-1 text-[12px] font-bold" style={{ background: "color-mix(in srgb, #16a34a 12%, white)", color: "#15803d" }}>
            <Check size={13} strokeWidth={2.6} /> Attached
          </span>
        )}
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-4">
        {/* The tile: the local preview, or a plain "saved" state for a resumed
            draft whose photo lives in a private bucket. */}
        <div
          className="grid h-[104px] w-[104px] shrink-0 place-items-center overflow-hidden rounded-xl border border-hairline-strong bg-surface-subtle text-center"
          aria-live="polite"
        >
          {busy ? (
            <Loader2 size={20} className="animate-spin text-ink-subtle" />
          ) : preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- a blob: URL from the picked File; next/image cannot optimise it.
            <img src={preview} alt="The photo you just attached" className="h-full w-full object-cover" />
          ) : has ? (
            <span className="px-2 text-[11.5px] font-semibold text-ink-muted">Photo on file</span>
          ) : (
            <Camera size={22} strokeWidth={1.9} className="text-ink-subtle" />
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileRef}
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void upload(f);
            }}
          />
          <button
            type="button"
            disabled={busy}
            onClick={() => fileRef.current?.click()}
            className="inline-flex h-10 items-center gap-2 rounded-lg border border-hairline-strong bg-white px-3.5 text-[13.5px] font-bold text-ink-strong disabled:opacity-60"
          >
            <Upload size={15} strokeWidth={2.3} /> {has ? "Replace photo" : "Upload photo"}
          </button>
          {/* Reuses the existing device-camera capture, which had been built
              and then left unmounted when the old uploads were removed. */}
          <SelfieCapture onCapture={(f) => void upload(f)} />
          {has && (
            <button
              type="button"
              disabled={busy}
              onClick={clear}
              className="inline-flex h-10 items-center gap-2 rounded-lg border border-hairline-strong bg-white px-3.5 text-[13.5px] font-bold text-altus-red disabled:opacity-60"
            >
              <Trash2 size={15} strokeWidth={2.3} /> Remove
            </button>
          )}
        </div>
      </div>
    </section>
  );
}
