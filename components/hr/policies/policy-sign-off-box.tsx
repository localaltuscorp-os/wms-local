"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, PenLine, Upload, Trash2 } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { formatDateHr } from "@/lib/format";
import { getSupabaseClient } from "@/lib/supabase/browser";
import {
  createPolicySignOffUploadUrl,
  signPolicyWithSignature,
} from "@/app/(app)/hr/policies/sign-off-actions";

const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif";

/**
 * EMPLOYEE POLICY SIGN-OFF — print your name, the date, attach your signature.
 *
 * Sits UNDER the policy body, beside the DigiLocker "Sign" action in the
 * toolbar rather than instead of it: DigiLocker yields a verified identity and
 * an archived PDF and stays the stronger route, and this is the one that always
 * works. The heading says which is which so nobody thinks they have done the
 * other.
 *
 * The same three lines, in the same order, as the letters a person signs
 * (lib/hr/letters/sign-off.ts) and the candidate policy box — one shape for
 * "how this firm takes a signature".
 *
 * The image goes STRAIGHT to Supabase on a one-shot signed URL; only its
 * storage key is posted with the signature. The date is shown, not typed: what
 * is filed is the moment the signature is recorded, and an editable date would
 * let somebody put a different day on their own acknowledgement while the row
 * said otherwise.
 */
export function PolicySignOffBox({
  policyKey,
  title,
  signedName,
  signedAt,
  hasSignature,
}: {
  policyKey: string;
  title: string;
  /** From a previous sign-off, so the box shows what they signed as. */
  signedName: string | null;
  signedAt: string | null;
  hasSignature: boolean;
}) {
  const router = useRouter();
  const [name, setName] = React.useState(signedName ?? "");
  const [path, setPath] = React.useState(hasSignature ? "on-file" : "");
  const [preview, setPreview] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement | null>(null);

  React.useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  async function upload(file: File) {
    if (uploading) return;
    setUploading(true);
    try {
      const url = await createPolicySignOffUploadUrl({ mime: file.type || null, size: file.size });
      if (!url.ok) {
        fireToast({ message: url.error, type: "error" });
        return;
      }
      const { error } = await getSupabaseClient()
        .storage.from(url.bucket)
        .uploadToSignedUrl(url.path, url.token, file, {
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
      setPath(url.path);
      fireToast({ message: "Signature uploaded.", type: "success" });
    } finally {
      setUploading(false);
    }
  }

  function clear() {
    setPreview((old) => {
      if (old) URL.revokeObjectURL(old);
      return null;
    });
    setPath("");
    if (fileRef.current) fileRef.current.value = "";
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    // "on-file" is a marker, not a path: a previous signature cannot be
    // re-submitted from the browser (the server would refuse the prefix
    // anyway), so signing again means attaching again.
    if (path === "on-file") {
      fireToast({ message: "Attach your signature again to re-sign.", type: "error" });
      return;
    }
    setBusy(true);
    const res = await signPolicyWithSignature({ key: policyKey, signedName: name, signaturePath: path });
    setBusy(false);
    if (!res.ok) {
      fireToast({ message: res.error, type: "error" });
      return;
    }
    fireToast({ message: `You've signed the ${title}.`, type: "success" });
    router.refresh();
  }

  const ready = name.trim().length >= 2 && path.length > 0 && path !== "on-file";

  return (
    <form
      onSubmit={submit}
      className="no-print mt-6 rounded-2xl border border-hairline-strong bg-white p-5"
      aria-label={`Sign the ${title}`}
    >
      <h3 className="text-[15px] font-bold text-ink-strong">Sign with your signature</h3>
      <p className="mt-1 text-[12.5px] leading-[1.55] text-ink-muted">
        Print your name, check the date, and attach an image of your signature. If you would
        rather sign with DigiLocker, use <strong>Sign</strong> at the top of this page — that
        route verifies your identity and files a signed PDF.
      </p>

      {signedName && signedAt ? (
        <p className="mt-3 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-[13px] font-bold text-emerald-800">
          <Check size={16} />
          Signed as {signedName} on {formatDateHr(signedAt)}.
        </p>
      ) : null}

      <label htmlFor={`pso-${policyKey}`} className="mt-4 block text-[13px] font-bold text-ink-strong">
        Print your name
      </label>
      <input
        id={`pso-${policyKey}`}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Your full name"
        autoComplete="name"
        className="mt-1.5 w-full rounded-lg border border-hairline-strong bg-white px-3 py-2 text-[14px] text-ink-strong outline-none focus:border-altus-red"
      />

      <div className="mt-4">
        <p className="text-[13px] font-bold text-ink-strong">Date</p>
        <p className="mt-1 text-[14px] font-semibold tabular-nums text-ink-strong">
          {formatDateHr(new Date())}
        </p>
      </div>

      <div className="mt-4">
        <p className="text-[13px] font-bold text-ink-strong">
          Attach your signature{" "}
          <span style={{ color: "var(--color-altus-red)" }} aria-hidden>
            *
          </span>
          <span className="sr-only">(required)</span>
        </p>
        <p className="mt-1 text-[12.5px] leading-[1.55] text-ink-muted">
          Sign on a plain sheet of paper, photograph it, and upload the photo. JPG, PNG or WebP,
          up to 8 MB. A printed name on its own is not a signature.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-4">
          <div className="grid h-[72px] w-[168px] shrink-0 place-items-center overflow-hidden rounded-xl border border-hairline-strong bg-surface-subtle">
            {uploading ? (
              <Loader2 size={18} className="animate-spin text-ink-subtle" />
            ) : preview ? (
              // eslint-disable-next-line @next/next/no-img-element -- a blob: URL from the picked File; next/image cannot optimise it.
              <img src={preview} alt="The signature you just uploaded" className="h-full w-full object-contain" />
            ) : path === "on-file" ? (
              <span className="px-2 text-center text-[11.5px] font-semibold text-ink-muted">
                Signature on file
              </span>
            ) : (
              <span className="px-2 text-center text-[11.5px] text-ink-subtle">No signature yet</span>
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
              disabled={uploading}
              onClick={() => fileRef.current?.click()}
              className="inline-flex items-center gap-2 rounded-lg border border-hairline-strong bg-white px-3.5 py-2 text-[13px] font-bold text-ink-strong disabled:opacity-60"
            >
              <Upload size={15} strokeWidth={2.3} />
              {path ? "Replace signature" : "Upload signature"}
            </button>
            {path && path !== "on-file" && (
              <button
                type="button"
                disabled={uploading}
                onClick={clear}
                className="inline-flex items-center gap-2 rounded-lg border border-hairline-strong bg-white px-3.5 py-2 text-[13px] font-bold text-altus-red disabled:opacity-60"
              >
                <Trash2 size={15} strokeWidth={2.3} /> Remove
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3 max-sm:flex-col max-sm:items-stretch">
        <button
          type="submit"
          disabled={busy || uploading || !ready}
          className="inline-flex items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-[13.5px] font-bold text-white disabled:opacity-60"
          style={{ background: "var(--color-altus-red)" }}
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : <PenLine size={15} />}
          {signedAt ? "Re-sign" : "Sign"}
        </button>
        {!ready && (
          <span className="text-[12.5px] font-semibold text-ink-muted">
            {name.trim().length < 2
              ? "Print your name and attach your signature to sign."
              : "Attach your signature to sign."}
          </span>
        )}
      </div>
    </form>
  );
}
