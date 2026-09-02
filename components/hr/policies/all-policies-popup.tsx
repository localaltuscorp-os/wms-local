"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import Link from "next/link";
import type { Route } from "next";
import { ShieldCheck, X, ArrowUpRight, Clock, Check } from "lucide-react";
import { POLICY_CARDS, type PolicyCard } from "@/lib/hr/policies/registry";
import { getMyPolicySignStatus } from "@/app/(app)/hr/policies/sign-status";
import { formatDate } from "@/lib/format";

const RED = "#E10600";
const RED_DEEP = "#A80400";

/**
 * <AllPoliciesPopup> — the quick modal shown when a user clicks "All Policies".
 *
 * A grid of policy CARDS: authored ones (POSH, Anti-Harassment, Exit) open
 * `/hr/policies/<key>`; the CLASH card is greyed "coming soon" and inert. This
 * is a CONTROLLED component (`open` / `onClose`) that the HR landing mounts — the
 * Assemble phase wires the trigger. Keyboard-first: role="dialog" + aria-modal,
 * Esc and backdrop-click close, focus is trapped inside and returns to the
 * opener on close. NO framer-motion — CSS keyframes only. Load-neutral.
 */
export function AllPoliciesPopup({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<HTMLElement | null>(null);
  // The caller's own signed policies (key → ISO signedAt) so each card shows
  // ✓ Signed vs "Sign" at a glance — no need to open each one to check.
  const [signed, setSigned] = useState<Record<string, string>>({});
  // Keys the caller signed only an OLDER version of — a newer one is published,
  // so the card must NOT read as done.
  const [outdated, setOutdated] = useState<Record<string, true>>({});

  // Load (and refresh on every open, so a just-signed policy shows as signed).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    getMyPolicySignStatus()
      .then((r) => {
        if (cancelled) return;
        setSigned(r.signed);
        setOutdated(r.outdated ?? {});
      })
      .catch(() => {
        /* non-fatal — cards just fall back to the neutral "Read & sign" state */
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Trap focus + wire Esc while open; restore focus to the opener on close.
  useEffect(() => {
    if (!open) return;
    restoreRef.current = (document.activeElement as HTMLElement) ?? null;

    const focusables = () =>
      Array.from(
        panelRef.current?.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),[tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );

    // Focus the first control on the next frame (after the panel mounts).
    const raf = requestAnimationFrame(() => focusables()[0]?.focus());

    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      const active = document.activeElement as HTMLElement | null;
      if (e.shiftKey && active === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = prevOverflow;
      restoreRef.current?.focus?.();
    };
  }, [open, onClose]);

  const onBackdrop = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.target === e.currentTarget) onClose();
    },
    [onClose],
  );

  if (!open) return null;

  return (
    <div
      className="app-backdrop"
      onMouseDown={onBackdrop}
      role="presentation"
    >
      <style>{POPUP_CSS}</style>
      <div
        ref={panelRef}
        className="app-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-title"
      >
        <header className="app-head">
          <div className="app-head-titles">
            <span className="app-eyebrow">
              <ShieldCheck size={13} strokeWidth={2.6} aria-hidden /> Firm Policies
            </span>
            <h2 id="app-title" className="app-title">
              All Policies
            </h2>
            <p className="app-sub">
              Read and sign each policy on day one. Signed copies are archived to
              your document vault.
            </p>
          </div>
          <button type="button" className="app-close" onClick={onClose} aria-label="Close">
            <X size={18} strokeWidth={2.4} />
          </button>
        </header>

        <div className="app-grid">
          {POLICY_CARDS.map((card) => (
            <CardTile
              key={card.key}
              card={card}
              signedAt={signed[card.key]}
              outdated={Boolean(outdated[card.key])}
              onNavigate={onClose}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function CardTile({
  card,
  signedAt,
  outdated = false,
  onNavigate,
}: {
  card: PolicyCard;
  signedAt?: string;
  /** Signed, but a NEWER version has been published since. */
  outdated?: boolean;
  onNavigate: () => void;
}) {
  if (card.status === "coming-soon") {
    return (
      <div className="app-card app-card-soon" aria-disabled="true">
        <span className="app-badge app-badge-soon">{card.badge}</span>
        <span className="app-card-title">{card.title}</span>
        <span className="app-card-blurb">{card.blurb}</span>
        <span className="app-chip app-chip-soon">
          <Clock size={11} strokeWidth={2.6} aria-hidden /> Coming soon
        </span>
      </div>
    );
  }
  // A stale signature is not "done" — the card prompts for the new version.
  const isSigned = Boolean(signedAt) && !outdated;
  return (
    <Link
      href={`/hr/policies/${card.key}` as Route}
      className={`app-card app-card-ready${isSigned ? " app-card-signed" : ""}`}
      onClick={onNavigate}
    >
      <span className="app-badge">{card.badge}</span>
      <span className="app-card-title">{card.title}</span>
      <span className="app-card-blurb">{card.blurb}</span>
      {isSigned ? (
        <span className="app-chip app-chip-signed">
          <Check size={12} strokeWidth={3} aria-hidden /> Signed · {formatDate(signedAt!)}
        </span>
      ) : (
        <span className="app-chip app-chip-ready">
          {outdated ? "New version · sign again" : "Read & sign"}{" "}
          <ArrowUpRight size={12} strokeWidth={2.8} aria-hidden />
        </span>
      )}
    </Link>
  );
}

const POPUP_CSS = `
.app-backdrop{
  position:fixed;inset:0;z-index:80;
  display:flex;align-items:center;justify-content:center;padding:24px;
  background:rgba(15,23,42,.5);backdrop-filter:blur(4px);
  animation:app-fade .16s ease;
}
@keyframes app-fade{from{opacity:0;}to{opacity:1;}}
.app-panel{
  width:100%;max-width:760px;max-height:88vh;overflow:auto;
  background:#fff;border-radius:22px;
  border:1px solid var(--color-hairline, #e2e8f0);
  box-shadow:0 40px 100px -30px rgba(15,23,42,.55);
  animation:app-rise .2s cubic-bezier(.2,.8,.2,1);
}
@keyframes app-rise{from{opacity:0;transform:translateY(12px) scale(.98);}to{opacity:1;transform:none;}}
.app-head{
  display:flex;align-items:flex-start;justify-content:space-between;gap:16px;
  padding:22px 24px 16px;border-bottom:1px solid var(--color-hairline, #e2e8f0);
}
.app-head-titles{min-width:0;}
.app-eyebrow{
  display:inline-flex;align-items:center;gap:6px;
  font-family:var(--font-display, system-ui, sans-serif);
  font-size:10.5px;font-weight:800;letter-spacing:.16em;text-transform:uppercase;
  color:${RED_DEEP};
}
.app-title{
  margin:6px 0 2px;font-family:var(--font-display, Georgia, serif);
  font-weight:900;font-size:24px;letter-spacing:-.02em;
  color:var(--color-ink-strong, #0f172a);
}
.app-sub{
  margin:0;max-width:52ch;font-size:13px;line-height:1.55;font-weight:500;
  color:var(--color-ink-muted, #64748b);
}
.app-close{
  flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;
  width:36px;height:36px;border-radius:10px;cursor:pointer;
  background:var(--color-surface-soft, #f8fafc);
  border:1px solid var(--color-hairline, #e2e8f0);
  color:var(--color-ink-muted, #64748b);transition:background .12s ease, color .12s ease;
}
.app-close:hover{background:#fee2e2;color:${RED_DEEP};}
.app-close:focus-visible{outline:2px solid ${RED};outline-offset:2px;}

.app-grid{
  display:grid;grid-template-columns:1fr 1fr;gap:14px;padding:20px 24px 26px;
}
.app-card{
  display:flex;flex-direction:column;gap:6px;position:relative;
  padding:16px 18px;border-radius:16px;text-decoration:none;
  border:1px solid var(--color-hairline, #e2e8f0);
  background:#fff;transition:transform .14s ease, box-shadow .14s ease, border-color .14s ease;
}
.app-card-ready{cursor:pointer;}
.app-card-ready:hover{
  transform:translateY(-2px);
  border-color:color-mix(in srgb, ${RED} 40%, transparent);
  box-shadow:0 18px 36px -22px rgba(168,4,0,.55);
}
.app-card-ready:focus-visible{outline:2px solid ${RED};outline-offset:2px;}
.app-card-soon{opacity:.62;background:var(--color-surface-soft, #f8fafc);}
.app-badge{
  display:inline-flex;align-items:center;justify-content:center;
  width:38px;height:38px;border-radius:11px;margin-bottom:2px;
  font-family:var(--font-display, system-ui, sans-serif);
  font-weight:900;font-size:14px;color:#fff;letter-spacing:.02em;
  background:linear-gradient(135deg, ${RED}, ${RED_DEEP});
  box-shadow:0 8px 18px -8px rgba(168,4,0,.7);
}
.app-badge-soon{background:linear-gradient(135deg,#94a3b8,#64748b);box-shadow:none;}
.app-card-title{
  font-family:var(--font-display, Georgia, serif);
  font-weight:800;font-size:15.5px;line-height:1.25;letter-spacing:-.01em;
  color:var(--color-ink-strong, #0f172a);
}
.app-card-blurb{
  font-size:12.5px;line-height:1.5;font-weight:500;
  color:var(--color-ink-muted, #64748b);
}
.app-chip{
  display:inline-flex;align-items:center;gap:4px;margin-top:6px;
  font-family:var(--font-display, system-ui, sans-serif);
  font-size:11px;font-weight:800;letter-spacing:.02em;
}
.app-chip-ready{color:${RED_DEEP};}
.app-chip-soon{color:var(--color-ink-muted, #94a3b8);}
.app-chip-signed{color:var(--color-green-deep, #15803d);}
/* A signed policy reads as "done" — a soft green edge + tint instead of the red
   call-to-action, so the eye skips straight to the ones still to sign. */
.app-card-signed{
  border-color:color-mix(in srgb, var(--color-green-deep, #15803d) 40%, transparent) !important;
  background:color-mix(in srgb, var(--color-green-deep, #15803d) 5%, white);
}

@media (max-width:640px){
  .app-grid{grid-template-columns:1fr;}
}
`;

export default AllPoliciesPopup;
