"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, PenLine, Upload, Trash2 } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { getSupabaseClient } from "@/lib/supabase/browser";
import { signPolicyAsCandidate, createPolicySignatureUploadUrl } from "@/app/c/policies/actions";
import { formatDateHr } from "@/lib/format";

const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif";

/**
 * THE CANDIDATE'S SIGN BOX — a typed name AND a photo of their signature, no
 * login.
 *
 * Deliberately NOT the employee's <PolicyView> signing control: that one starts
 * a DigiLocker-verified signature and archives a signed PDF, neither of which an
 * account-less candidate can do. This states plainly what is being recorded —
 * their name, their signature image, the policy, the moment — so nobody signs
 * believing they did something stronger than they did.
 *
 * ── THE IMAGE IS REQUIRED, AND THE BROWSER IS NOT WHERE THAT IS DECIDED ───
 * Sign stays disabled until both a name and an uploaded signature exist, but
 * the rule itself lives in `signPolicyAsCandidate` — a disabled button is a
 * courtesy, not an enforcement point.
 *
 * ── THE UPLOAD GOES STRAIGHT TO SUPABASE ─────────────────────────────────
 * The file is PUT to a one-shot signed URL and only its storage key is sent
 * back with the signature. The bytes never cross the Next server: candidates
 * fill this on a phone, and pushing a camera photo through a Server Action is
 * the slow path and the one with a hard body limit.
 *
 * ── ALREADY SIGNED IS NOT LOCKED ─────────────────────────────────────────
 * The box keeps showing what they signed as and when, with the name pre-filled
 * and the stored signature counted as present, because the promise made at the
 * top of this flow is that a candidate may come back and correct what they
 * sent. Signing again updates the one row, image included.
 */
export function CandidatePolicySignBox({
  policyKey,
  title,
  signedAt,
  signedName,
  signaturePath,
  outdated,
}: {
  policyKey: string;
  title: string;
  signedAt: string | null;
  signedName: string | null;
  /** Storage key of a signature already on file, if any. */
  signaturePath: string | null;
  outdated: boolean;
}) {
  const router = useRouter();
  const [name, setName] = React.useState(signedName ?? "");
  const [path, setPath] = React.useState(signaturePath ?? "");
  const [preview, setPreview] = React.useState<string | null>(null);
  const [uploading, setUploading] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const fileRef = React.useRef<HTMLInputElement | null>(null);
  const signed = !!signedAt && !outdated;

  React.useEffect(() => {
    return () => {
      if (preview) URL.revokeObjectURL(preview);
    };
  }, [preview]);

  async function upload(file: File) {
    if (uploading) return;
    setUploading(true);
    try {
      const url = await createPolicySignatureUploadUrl({ mime: file.type || null, size: file.size });
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
    setBusy(true);
    const res = await signPolicyAsCandidate({
      key: policyKey,
      signedName: name,
      signaturePath: path,
    });
    setBusy(false);
    if (!res.ok) {
      fireToast({ message: res.error, type: "error" });
      return;
    }
    fireToast({ message: `You've signed the ${title}.`, type: "success" });
    router.refresh();
  }

  const ready = name.trim().length >= 2 && path.trim().length > 0;

  return (
    <form
      onSubmit={submit}
      className="mt-6 rounded-2xl border border-hairline-strong bg-white p-5"
      aria-label={`Sign the ${title}`}
    >
      {signed ? (
        <p className="mb-4 flex items-center gap-2 rounded-xl bg-emerald-50 px-3 py-2 text-[13px] font-bold text-emerald-800">
          <Check size={16} />
          Signed as {signedName} on {formatDateHr(signedAt)}. You can change this below.
        </p>
      ) : outdated ? (
        <p className="mb-4 rounded-xl bg-amber-50 px-3 py-2 text-[13px] font-bold text-amber-900">
          You signed an earlier version of this policy. Please read it again and sign.
        </p>
      ) : null}

      <label htmlFor={`sign-${policyKey}`} className="block text-[13px] font-bold text-ink-strong">
        Print your name
      </label>
      <p className="mt-1 text-[12.5px] leading-[1.55] text-ink-muted">
        By typing your name you confirm you have read the {title} and agree to it. We record your
        name, your signature, the policy version and the date and time.
      </p>

      <input
        id={`sign-${policyKey}`}
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Your full name"
        autoComplete="name"
        className="mt-3 w-full rounded-lg border border-hairline-strong bg-white px-3 py-2 text-[14px] text-ink-strong outline-none focus:border-altus-red"
      />

      {/* ── THE DATE ──────────────────────────────────────────────────────
          Today's date, stated in the module's DD-MMM-YYYY form, and NOT an
          input.

          What gets filed is the moment the signature is actually recorded
          (`signed_at`, set server-side). Offering an editable date here would
          let somebody type a different day onto their own acknowledgement -
          a backdated consent, agreed at a date nobody can check - while the
          row said something else. So the line shows the date this signature
          will carry, and the record and the page cannot disagree. */}
      <div className="mt-4">
        <p className="text-[13px] font-bold text-ink-strong">Date</p>
        <p className="mt-1 text-[14px] font-semibold tabular-nums text-ink-strong">
          {formatDateHr(new Date())}
        </p>
      </div>

      {/* ── THE SIGNATURE IMAGE ───────────────────────────────────────────
          Its own block under the name, with the requirement said out loud:
          the Sign button is disabled without it, and a disabled button that
          does not explain itself reads as a broken page. */}
      <div className="mt-5 border-t border-hairline pt-4">
        <p className="text-[13px] font-bold text-ink-strong">
          Upload your signature{" "}
          <span style={{ color: "var(--color-altus-red)" }} aria-hidden>
            *
          </span>
          <span className="sr-only">(required)</span>
        </p>
        <p className="mt-1 text-[12.5px] leading-[1.55] text-ink-muted">
          Sign on a plain sheet of paper, photograph it, and upload the photo. JPG, PNG or WebP,
          up to 8 MB. This is required — the policy cannot be signed without it.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-4">
          <div className="grid h-[72px] w-[168px] shrink-0 place-items-center overflow-hidden rounded-xl border border-hairline-strong bg-surface-subtle">
            {uploading ? (
              <Loader2 size={18} className="animate-spin text-ink-subtle" />
            ) : preview ? (
              // eslint-disable-next-line @next/next/no-img-element -- a blob: URL from the picked File; next/image cannot optimise it.
              <img src={preview} alt="The signature you just uploaded" className="h-full w-full object-contain" />
            ) : path ? (
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
            {path && (
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
          {signed ? "Update signature" : "Sign"}
        </button>
        {!ready && (
          <span className="text-[12.5px] font-semibold text-ink-muted">
            {name.trim().length < 2
              ? "Type your full name and upload your signature to sign."
              : "Upload your signature to sign."}
          </span>
        )}
      </div>
    </form>
  );
}
