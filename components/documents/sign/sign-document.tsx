"use client";

import * as React from "react";
import {
  AlertTriangle,
  BadgeCheck,
  CheckCircle2,
  Download,
  Loader2,
  Lock,
  PenLine,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { fireToast } from "@/lib/toast";
import {
  startSignature,
  finalizeSignature,
  getSignatureAssetUrls,
} from "@/app/(app)/documents/sign/actions";
import {
  DOC_KIND_LABELS,
  type DocKind,
  type SignatureState,
} from "@/lib/documents/signing";
import { SignaturePad, type SignaturePadHandle } from "./signature-pad";
import { formatDate } from "@/lib/format";

/**
 * Documents · DigiLocker-VERIFIED signing block — the bottom-of-document "Sign
 * this document" experience and its flow state machine.
 *
 *   pending  → consent + "Verify with DigiLocker" (or calm not-configured notice)
 *   verified → display-back KYC identity card + draw/type signature + Confirm & Sign
 *   signed   → success state with a short-lived "Download signed PDF" link
 *
 * All identity data shown here is what DigiLocker returned (masked Aadhaar last-4
 * only — never a full 12-digit value). Brand tokens + wg-* motion, keyboard-first.
 */

const RED = "var(--color-altus-red)";
const RED_DEEP = "var(--color-altus-red-deep)";

function fmt(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${formatDate(d)} · ${d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}`;
}

export function SignDocument({
  docKind,
  docId,
  initialState,
  /** true when we just came back from the DigiLocker callback (?verified=1) */
  justVerified = false,
  /** an error message forwarded from the callback (?error=…) */
  callbackError = null,
}: {
  docKind: DocKind;
  docId: string;
  initialState: SignatureState;
  justVerified?: boolean;
  callbackError?: string | null;
}) {
  const [state, setState] = React.useState<SignatureState>(initialState);
  const [busy, setBusy] = React.useState(false);

  const label = DOC_KIND_LABELS[docKind];

  return (
    <section
      className="wg-rise rounded-2xl border border-hairline bg-surface-card p-5 shadow-sm sm:p-6"
      aria-labelledby="sign-doc-heading"
    >
      <header className="mb-4 flex items-center gap-2.5">
        <span
          className="grid size-9 place-items-center rounded-xl text-white"
          style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}
        >
          <ShieldCheck size={17} strokeWidth={2.2} />
        </span>
        <div>
          <h2
            id="sign-doc-heading"
            className="text-[15px] font-bold tracking-tight text-ink-strong"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Sign this {label}
          </h2>
          <p className="text-[12px] text-ink-soft">
            {state.method === "self" || !state.digilockerConfigured
              ? "Self-attested signature · identity not DigiLocker-verified"
              : "Identity verified via DigiLocker · Aadhaar e-KYC"}
          </p>
        </div>
      </header>

      {callbackError && state.status !== "signed" && (
        <Notice tone="error" icon={<AlertTriangle size={15} strokeWidth={2.2} />}>
          {callbackError}
        </Notice>
      )}

      {state.status === "pending" && (
        <PendingStep
          docKind={docKind}
          docId={docId}
          configured={state.digilockerConfigured}
          missingEnv={state.digilockerMissingEnv}
          busy={busy}
          setBusy={setBusy}
          onSelfVerified={(signatureId, name) =>
            setState((s) => ({
              ...s,
              status: "verified",
              method: "self",
              signatureId,
              identity: { ...s.identity, name, verifiedAt: new Date().toISOString() },
            }))
          }
        />
      )}

      {state.status === "verified" && state.signatureId && (
        <VerifiedStep
          signatureId={state.signatureId}
          state={state}
          justVerified={justVerified}
          busy={busy}
          setBusy={setBusy}
          onSigned={(pdfPath) =>
            setState((s) => ({
              ...s,
              status: "signed",
              signature: {
                ...s.signature,
                signedPdfPath: pdfPath,
                signedAt: new Date().toISOString(),
              },
            }))
          }
        />
      )}

      {state.status === "signed" && state.signatureId && (
        <SignedStep signatureId={state.signatureId} state={state} label={label} />
      )}
    </section>
  );
}

/* ── pending ─────────────────────────────────────────────────────────────── */

function PendingStep({
  docKind,
  docId,
  configured,
  missingEnv,
  busy,
  setBusy,
  onSelfVerified,
}: {
  docKind: DocKind;
  docId: string;
  configured: boolean;
  missingEnv: string[];
  busy: boolean;
  setBusy: (v: boolean) => void;
  /** Self-attested path (DigiLocker off): moves straight to the signature step. */
  onSelfVerified: (signatureId: string, name: string | null) => void;
}) {
  const [agreed, setAgreed] = React.useState(false);
  const label = DOC_KIND_LABELS[docKind].toLowerCase();

  async function verify() {
    if (!agreed || busy) return;
    setBusy(true);
    const res = await startSignature({ docKind, docId });
    if (!res.ok) {
      setBusy(false);
      fireToast({ message: res.error, type: "error" });
      return;
    }
    // DigiLocker off → self-attested: proceed straight to drawing the signature.
    if (!res.configured || !res.authUrl) {
      setBusy(false);
      onSelfVerified(res.signatureId, res.verifiedName ?? null);
      return;
    }
    // Hand off to DigiLocker's authorize page; the callback returns us here.
    window.location.assign(res.authUrl);
  }

  // ── DigiLocker not configured → self-attested signing ──
  if (!configured) {
    return (
      <div>
        <Notice tone="info" icon={<Lock size={15} strokeWidth={2.2} />}>
          <span className="font-semibold text-ink-strong">
            DigiLocker verification isn&apos;t set up yet.
          </span>{" "}
          You can still e-sign this {label} as a{" "}
          <span className="font-semibold text-ink-strong">self-attested</span>{" "}
          signature — your identity won&apos;t be Aadhaar-verified, and the signed
          PDF will clearly say so. It upgrades to full DigiLocker verification
          automatically once an admin adds the credentials
          {missingEnv.length > 0 ? ` (${missingEnv.join(", ")})` : ""}.
        </Notice>

        <label className="mb-5 flex cursor-pointer items-start gap-2.5 rounded-xl border border-hairline bg-surface-soft p-3.5 text-[13px] leading-snug text-ink-strong">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 size-4 shrink-0"
            style={{ accentColor: "var(--color-altus-red)" }}
          />
          <span>
            I have read this document and I willingly e-sign it. I understand this
            is a <span className="font-semibold">self-attested</span> signature, not
            DigiLocker-verified.
          </span>
        </label>

        <button
          type="button"
          onClick={verify}
          disabled={!agreed || busy}
          className="wg-btn wg-sheen inline-flex w-full items-center justify-center gap-2 rounded-pill px-4 py-3 text-[14px] font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-55"
          style={{
            background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})`,
            boxShadow:
              "0 8px 20px -10px color-mix(in srgb, var(--color-altus-red-deep) 70%, transparent), inset 0 1px 0 rgba(255,255,255,0.25)",
          }}
        >
          {busy ? (
            <Loader2 size={16} className="animate-spin" strokeWidth={2.4} />
          ) : (
            <PenLine size={16} strokeWidth={2.4} />
          )}
          {busy ? "Preparing…" : "I agree · Read & Self-Sign"}
        </button>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-4 text-[13.5px] leading-relaxed text-ink-soft">
        To sign, you&apos;ll first confirm who you are with{" "}
        <span className="font-semibold text-ink-strong">DigiLocker</span>. We
        receive your government-verified name, date of birth, gender, address and
        photo, plus a <span className="font-semibold text-ink-strong">masked</span>{" "}
        Aadhaar (last 4 digits only). Your full Aadhaar number is never shared with
        or stored by us.
      </p>

      <label className="mb-5 flex cursor-pointer items-start gap-2.5 rounded-xl border border-hairline bg-surface-soft p-3.5 text-[13px] leading-snug text-ink-strong">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 size-4 shrink-0"
          style={{ accentColor: "var(--color-altus-red)" }}
        />
        <span>
          I have read this document and I consent to verifying my identity via
          DigiLocker to electronically sign it.
        </span>
      </label>

      <button
        type="button"
        onClick={verify}
        disabled={!agreed || busy}
        className="wg-btn wg-sheen inline-flex w-full items-center justify-center gap-2 rounded-pill px-4 py-3 text-[14px] font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-55"
        style={{
          background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})`,
          boxShadow:
            "0 8px 20px -10px color-mix(in srgb, var(--color-altus-red-deep) 70%, transparent), inset 0 1px 0 rgba(255,255,255,0.25)",
        }}
      >
        {busy ? (
          <Loader2 size={16} className="animate-spin" strokeWidth={2.4} />
        ) : (
          <ShieldCheck size={16} strokeWidth={2.4} />
        )}
        {busy ? "Redirecting to DigiLocker…" : "I agree · Verify with DigiLocker"}
      </button>
    </div>
  );
}

/* ── verified ────────────────────────────────────────────────────────────── */

function VerifiedStep({
  signatureId,
  state,
  justVerified,
  busy,
  setBusy,
  onSigned,
}: {
  signatureId: string;
  state: SignatureState;
  justVerified: boolean;
  busy: boolean;
  setBusy: (v: boolean) => void;
  onSigned: (pdfPath: string) => void;
}) {
  const id = state.identity;
  const selfAttested = state.method === "self";
  const [mode, setMode] = React.useState<"drawn" | "typed">("drawn");
  const [typedName, setTypedName] = React.useState(id.name ?? "");
  const [hasInk, setHasInk] = React.useState(false);
  const [photoUrl, setPhotoUrl] = React.useState<string | null>(null);
  const padRef = React.useRef<SignaturePadHandle>(null);

  // Pull the DigiLocker photo (short-lived signed URL) if one was captured.
  React.useEffect(() => {
    let alive = true;
    if (!id.photoPath) return;
    void getSignatureAssetUrls({ signatureId }).then((res) => {
      if (alive && res.ok) setPhotoUrl(res.photoUrl);
    });
    return () => {
      alive = false;
    };
  }, [signatureId, id.photoPath]);

  const canSign =
    !busy && (mode === "typed" ? typedName.trim().length >= 2 : hasInk);

  async function confirm() {
    if (!canSign) return;

    let payload: Parameters<typeof finalizeSignature>[0];
    if (mode === "drawn") {
      const dataUrl = padRef.current?.toPngDataUrl();
      if (!dataUrl) {
        fireToast({ message: "Draw your signature to sign.", type: "error" });
        return;
      }
      payload = { signatureId, signatureKind: "drawn", signatureImageDataUrl: dataUrl };
    } else {
      payload = { signatureId, signatureKind: "typed", signatureText: typedName.trim() };
    }

    setBusy(true);
    const res = await finalizeSignature(payload);
    if (!res.ok) {
      setBusy(false);
      fireToast({ message: res.error, type: "error" });
      return;
    }
    fireToast({ message: "Signed. Your document has been archived.", type: "success" });
    setBusy(false);
    onSigned(res.pdfPath);
  }

  return (
    <div>
      {justVerified && !selfAttested && (
        <Notice tone="success" icon={<BadgeCheck size={15} strokeWidth={2.2} />}>
          Identity verified with DigiLocker. Review the details below, then sign.
        </Notice>
      )}
      {selfAttested && (
        <Notice tone="info" icon={<UserRound size={15} strokeWidth={2.2} />}>
          You&apos;re signing as a <span className="font-semibold text-ink-strong">self-attested</span> signer
          — your identity isn&apos;t DigiLocker-verified. The signed PDF records this.
        </Notice>
      )}

      {/* Display-back identity card */}
      <div className="mb-5 overflow-hidden rounded-2xl border border-hairline bg-surface-soft">
        <div
          className="flex items-center gap-2 px-4 py-2.5 text-[11.5px] font-bold uppercase tracking-wider text-white"
          style={{
            background: selfAttested
              ? "linear-gradient(135deg, #475569, #1e293b)"
              : `linear-gradient(135deg, ${RED}, ${RED_DEEP})`,
          }}
        >
          {selfAttested ? <UserRound size={14} strokeWidth={2.4} /> : <ShieldCheck size={14} strokeWidth={2.4} />}
          {selfAttested ? "Signatory · Self-attested" : "Verified identity · DigiLocker e-KYC"}
        </div>
        <div className="flex flex-col gap-4 p-4 sm:flex-row">
          <div className="shrink-0">
            {photoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photoUrl}
                alt="DigiLocker identity photo"
                className="size-20 rounded-xl border border-hairline object-cover"
              />
            ) : (
              <div className="grid size-20 place-items-center rounded-xl border border-hairline bg-surface-card text-ink-subtle">
                <UserRound size={30} strokeWidth={1.8} />
              </div>
            )}
          </div>
          <dl className="grid flex-1 grid-cols-1 gap-x-6 gap-y-2.5 sm:grid-cols-2">
            {selfAttested ? (
              <>
                <Field label="Name" value={id.name} />
                <Field label="Identity" value="Self-attested — not DigiLocker-verified" full />
              </>
            ) : (
              <>
                <Field label="Name" value={id.name} />
                <Field label="Date of birth" value={id.dob} />
                <Field label="Gender" value={id.gender} />
                <Field label="Aadhaar (masked)" value={id.maskedAadhaar} mono />
                <Field label="Address" value={id.address} full />
                <Field label="Verified at" value={fmt(id.verifiedAt)} />
                <Field label="DigiLocker ref" value={id.ref} mono />
              </>
            )}
          </dl>
        </div>
      </div>

      {/* Signature step */}
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-[13.5px] font-bold text-ink-strong">Add Your Signature</h3>
        <div className="inline-flex rounded-pill border border-hairline bg-surface-soft p-0.5">
          <ModeTab active={mode === "drawn"} onClick={() => setMode("drawn")}>
            Draw
          </ModeTab>
          <ModeTab active={mode === "typed"} onClick={() => setMode("typed")}>
            Type
          </ModeTab>
        </div>
      </div>

      {mode === "drawn" ? (
        <SignaturePad ref={padRef} onChange={setHasInk} disabled={busy} />
      ) : (
        <div>
          <label
            htmlFor="typed-signature"
            className="mb-1.5 block text-[12.5px] font-semibold text-ink-soft"
          >
            Type Your Full Legal Name
          </label>
          <input
            id="typed-signature"
            type="text"
            value={typedName}
            onChange={(e) => setTypedName(e.target.value)}
            placeholder="e.g. Hetesh Vichare"
            autoComplete="name"
            className="w-full rounded-xl border border-hairline bg-surface-soft px-3.5 py-3 text-ink-strong outline-none transition focus:border-[color:var(--color-altus-red)] focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--color-altus-red)_28%,transparent)]"
            style={{ fontFamily: "var(--font-display)", fontSize: 22 }}
          />
        </div>
      )}

      <p className="mb-4 mt-4 text-[12px] leading-relaxed text-ink-soft">
        {selfAttested
          ? "By signing, you confirm you have read this document and willingly e-sign it. This is a self-attested signature — your identity is not DigiLocker-verified — and is legally attributable to you."
          : "By signing, you confirm your DigiLocker-verified identity above is yours and you willingly e-sign this document. This signature is legally attributable to you."}
      </p>

      <button
        type="button"
        onClick={confirm}
        disabled={!canSign}
        className="wg-btn wg-sheen inline-flex w-full items-center justify-center gap-2 rounded-pill px-4 py-3 text-[14px] font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-55"
        style={{
          background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})`,
          boxShadow:
            "0 8px 20px -10px color-mix(in srgb, var(--color-altus-red-deep) 70%, transparent), inset 0 1px 0 rgba(255,255,255,0.25)",
        }}
      >
        {busy ? (
          <Loader2 size={16} className="animate-spin" strokeWidth={2.4} />
        ) : (
          <PenLine size={16} strokeWidth={2.4} />
        )}
        {busy ? "Signing…" : "Confirm & Sign"}
      </button>
    </div>
  );
}

/* ── signed ──────────────────────────────────────────────────────────────── */

function SignedStep({
  signatureId,
  state,
  label,
}: {
  signatureId: string;
  state: SignatureState;
  label: string;
}) {
  const [downloading, setDownloading] = React.useState(false);

  async function download() {
    if (downloading) return;
    setDownloading(true);
    const res = await getSignatureAssetUrls({ signatureId });
    setDownloading(false);
    if (!res.ok || !res.pdfUrl) {
      fireToast({
        message: res.ok ? "Signed PDF isn't available yet." : res.error,
        type: "error",
      });
      return;
    }
    window.open(res.pdfUrl, "_blank", "noopener,noreferrer");
  }

  return (
    <div className="text-center">
      <div
        className="mx-auto mb-4 grid size-14 place-items-center rounded-full text-white"
        style={{ background: "linear-gradient(135deg, #16a34a, #0f7a37)" }}
      >
        <CheckCircle2 size={28} strokeWidth={2.2} />
      </div>
      <h3
        className="text-[17px] font-bold text-ink-strong"
        style={{ fontFamily: "var(--font-display)" }}
      >
        {label} signed
      </h3>
      <p className="mx-auto mt-1 max-w-sm text-[13px] text-ink-soft">
        Signed on{" "}
        <span className="font-semibold text-ink-strong">
          {fmt(state.signature.signedAt)}
        </span>{" "}
        and archived to your private document vault
        {state.identity.name ? (
          <>
            {" "}
            as{" "}
            <span className="font-semibold text-ink-strong">
              {state.identity.name}
            </span>
          </>
        ) : null}
        .
      </p>

      <button
        type="button"
        onClick={download}
        disabled={downloading}
        className="wg-btn mt-5 inline-flex items-center justify-center gap-2 rounded-pill border border-hairline bg-surface-card px-5 py-2.5 text-[13.5px] font-bold text-ink-strong shadow-sm transition hover:bg-surface-soft disabled:cursor-not-allowed disabled:opacity-55"
      >
        {downloading ? (
          <Loader2 size={15} className="animate-spin" strokeWidth={2.4} />
        ) : (
          <Download size={15} strokeWidth={2.4} />
        )}
        Download Signed PDF
      </button>
    </div>
  );
}

/* ── shared bits ─────────────────────────────────────────────────────────── */

function Field({
  label,
  value,
  mono = false,
  full = false,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
  full?: boolean;
}) {
  return (
    <div className={full ? "sm:col-span-2" : undefined}>
      <dt className="text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">
        {label}
      </dt>
      <dd
        className={`mt-0.5 text-[13px] text-ink-strong ${mono ? "font-mono tracking-tight" : "font-medium"}`}
      >
        {value && value.trim() ? value : "—"}
      </dd>
    </div>
  );
}

function ModeTab({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`rounded-pill px-3.5 py-1.5 text-[12.5px] font-semibold transition ${
        active ? "text-white shadow-sm" : "text-ink-soft hover:text-ink-strong"
      }`}
      style={active ? { background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` } : undefined}
    >
      {children}
    </button>
  );
}

function Notice({
  tone,
  icon,
  children,
}: {
  tone: "info" | "error" | "success";
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const styles: Record<typeof tone, { bg: string; border: string; fg: string }> = {
    info: {
      bg: "color-mix(in srgb, var(--color-altus-red) 5%, var(--color-surface-card))",
      border: "color-mix(in srgb, var(--color-altus-red) 22%, transparent)",
      fg: "var(--color-altus-red-deep)",
    },
    error: {
      bg: "color-mix(in srgb, #dc2626 7%, var(--color-surface-card))",
      border: "color-mix(in srgb, #dc2626 26%, transparent)",
      fg: "#b91c1c",
    },
    success: {
      bg: "color-mix(in srgb, #16a34a 8%, var(--color-surface-card))",
      border: "color-mix(in srgb, #16a34a 26%, transparent)",
      fg: "#15803d",
    },
  };
  const s = styles[tone];
  return (
    <div
      className="mb-4 flex items-start gap-2.5 rounded-xl border p-3.5 text-[13px] leading-relaxed text-ink-soft"
      style={{ background: s.bg, borderColor: s.border }}
    >
      <span className="mt-0.5 shrink-0" style={{ color: s.fg }}>
        {icon}
      </span>
      <div>{children}</div>
    </div>
  );
}
