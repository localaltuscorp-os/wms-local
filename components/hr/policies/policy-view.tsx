"use client";

import { useState } from "react";
import { Building2, Download, Printer, Loader2, PenLine, CheckCircle2 } from "lucide-react";
import { PolicyDocument } from "@/components/hr/policies/policy-document";
import { ENTITY_LIST, type EntityId } from "@/lib/hr/entities";
import type { PolicyDoc } from "@/lib/hr/policies/types";
import { fireToast } from "@/lib/toast";
import { formatDate } from "@/lib/format";

const RED = "#E10600";
const RED_DEEP = "#A80400";

/**
 * The interactive policy reading + signing surface. Renders the frozen policy on
 * the shared <Letterhead> via <PolicyDocument>, lets the reader swap the paying
 * entity (re-brands the letterhead), Export a PDF (browser print → Save as PDF —
 * long policies print across pages via the letterhead's print CSS), and Sign /
 * Acknowledge on day one: this files a policy acknowledgement + starts a pending
 * signature (via /api/hr/policies/acknowledge), then hands off to the universal
 * DigiLocker signing surface.
 *
 * Keyboard-first: the Sign action autofocuses; Tab walks the toolbar; every
 * control is reachable and Enter-activated. NO framer-motion — CSS only, and the
 * only server touch is a fetch (so this client bundle stays load-neutral).
 */
export function PolicyView({
  doc,
  signedAt,
  outdated = false,
}: {
  doc: PolicyDoc;
  signedAt?: string | null;
  /** Signed, but only an OLDER version — a newer one has been published since. */
  outdated?: boolean;
}) {
  const [entity, setEntity] = useState<EntityId>(doc.entityDefault ?? "altus-corp");
  const [signing, setSigning] = useState(false);
  // A stale signature must NOT read as done — it prompts to sign the new version.
  const isSigned = Boolean(signedAt) && !outdated;

  async function signAcknowledge() {
    setSigning(true);
    try {
      const r = await fetch("/api/hr/policies/acknowledge", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ key: doc.key, entity }),
      });
      const res = (await r.json().catch(() => ({ ok: false }))) as
        | { ok: true; docId: string }
        | { ok: false; error?: string };
      if (!res.ok) {
        fireToast({ message: res.error ?? "Could not start signing.", type: "error" });
        setSigning(false);
        return;
      }
      // Hand off to the universal DigiLocker-verified signing surface.
      window.location.href = `/documents/sign?kind=letter&doc=${encodeURIComponent(res.docId)}`;
    } catch {
      fireToast({ message: "Could not start signing.", type: "error" });
      setSigning(false);
    }
  }

  return (
    <div className="apv-wrap">
      <style>{VIEW_CSS}</style>

      {/* ── Toolbar (does not print) ─────────────────────────────── */}
      <div className="apv-toolbar no-print">
        <label className="apv-pick">
          <Building2 size={15} strokeWidth={2.2} aria-hidden />
          <span className="apv-pick-label">Issuing Entity</span>
          <select
            value={entity}
            onChange={(e) => setEntity(e.target.value as EntityId)}
            aria-label="Issuing entity"
          >
            {ENTITY_LIST.map((e) => (
              <option key={e.id} value={e.id}>
                {e.displayName}
              </option>
            ))}
          </select>
        </label>

        <div className="apv-actions">
          <button type="button" className="apv-btn apv-btn-ghost" onClick={() => window.print()}>
            <Printer size={15} strokeWidth={2.2} /> Print
          </button>
          <button type="button" className="apv-btn apv-btn-ghost" onClick={() => window.print()}>
            <Download size={15} strokeWidth={2.2} /> Export PDF
          </button>
          {isSigned ? (
            <>
              {/* Already signed — show it clearly so no one signs twice just to
                  check. Re-signing stays possible but is demoted to a ghost. */}
              <span className="apv-signed" role="status">
                <CheckCircle2 size={16} strokeWidth={2.4} aria-hidden /> Signed · {formatDate(signedAt!)}
              </span>
              <button
                type="button"
                className="apv-btn apv-btn-ghost"
                onClick={signAcknowledge}
                disabled={signing}
              >
                {signing ? <Loader2 size={15} className="apv-spin" /> : <PenLine size={15} strokeWidth={2.4} />}
                {signing ? "Starting…" : "Sign again"}
              </button>
            </>
          ) : (
            <>
              {/* Signed an OLDER version — say so, then prompt for the new one. */}
              {outdated && signedAt && (
                <span
                  className="apv-signed"
                  role="status"
                  style={{ background: "color-mix(in srgb, #f59e0b 14%, white)", color: "#b45309" }}
                  title={`You signed version ${formatDate(signedAt)} — a newer version has been published.`}
                >
                  <PenLine size={15} strokeWidth={2.4} aria-hidden /> New version · last signed {formatDate(signedAt)}
                </span>
              )}
              <button
                type="button"
                className="apv-btn apv-btn-primary"
                onClick={signAcknowledge}
                disabled={signing}
                autoFocus
              >
                {signing ? <Loader2 size={15} className="apv-spin" /> : <PenLine size={15} strokeWidth={2.4} />}
                {signing ? "Starting…" : outdated ? "Sign the new version" : "Read & Sign"}
              </button>
            </>
          )}
        </div>
      </div>

      {/* ── The policy on its letterhead ─────────────────────────── */}
      <div className="apv-stage">
        <PolicyDocument doc={doc} entity={entity} />
      </div>
    </div>
  );
}

const VIEW_CSS = `
.apv-wrap{width:100%;}
.apv-toolbar{
  position:sticky;top:0;z-index:20;
  display:flex;flex-wrap:wrap;align-items:flex-end;gap:14px;
  padding:12px 16px;margin-bottom:20px;
  background:color-mix(in srgb, var(--color-surface-soft, #f8fafc) 92%, transparent);
  backdrop-filter:blur(8px);
  border:1px solid var(--color-hairline, #e2e8f0);
  border-radius:16px;
}
.apv-pick{display:flex;flex-direction:column;gap:4px;position:relative;padding-left:22px;}
.apv-pick svg{position:absolute;left:0;top:26px;color:${RED_DEEP};}
.apv-pick-label{
  font-family:var(--font-display, system-ui, sans-serif);
  font-size:10.5px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;
  color:var(--color-ink-muted, #64748b);
}
.apv-pick select{
  appearance:none;-webkit-appearance:none;
  min-width:220px;max-width:320px;
  padding:8px 30px 8px 12px;
  font-size:14px;font-weight:600;color:var(--color-ink-strong, #0f172a);
  background:#fff;border:1px solid var(--color-hairline-strong, #cbd5e1);border-radius:10px;
  background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2394a3b8' stroke-width='2.4'><path d='M6 9l6 6 6-6'/></svg>");
  background-repeat:no-repeat;background-position:right 8px center;
  cursor:pointer;
}
.apv-pick select:focus{outline:none;border-color:${RED};box-shadow:0 0 0 3px rgba(225,6,0,.14);}
.apv-actions{margin-left:auto;display:flex;flex-wrap:wrap;gap:10px;align-items:center;}
.apv-btn{
  display:inline-flex;align-items:center;gap:7px;
  padding:9px 16px;border-radius:11px;
  font-family:var(--font-display, system-ui, sans-serif);
  font-size:13.5px;font-weight:700;cursor:pointer;
  border:1px solid transparent;transition:transform .12s ease, box-shadow .12s ease, border-color .12s ease;
}
.apv-btn:disabled{opacity:.55;cursor:default;}
.apv-btn-ghost{background:#fff;color:var(--color-ink-strong, #0f172a);border-color:var(--color-hairline-strong, #cbd5e1);}
.apv-btn-ghost:not(:disabled):hover{border-color:var(--color-ink-muted, #94a3b8);transform:translateY(-1px);}
.apv-btn-primary{color:#fff;background:linear-gradient(135deg, ${RED}, ${RED_DEEP});box-shadow:0 10px 22px -12px rgba(168,4,0,.8);}
.apv-btn-primary:not(:disabled):hover{transform:translateY(-1px);}
.apv-btn:focus-visible{outline:2px solid ${RED};outline-offset:2px;}
.apv-spin{animation:apv-spin 1s linear infinite;}
@keyframes apv-spin{to{transform:rotate(360deg);}}
.apv-signed{
  display:inline-flex;align-items:center;gap:7px;
  padding:9px 14px;border-radius:11px;
  font-family:var(--font-display, system-ui, sans-serif);
  font-size:13.5px;font-weight:800;
  color:var(--color-green-deep, #15803d);
  background:color-mix(in srgb, var(--color-green-deep, #15803d) 10%, white);
  border:1px solid color-mix(in srgb, var(--color-green-deep, #15803d) 32%, transparent);
}

.apv-stage{display:flex;justify-content:center;padding-bottom:40px;}

@media (max-width:720px){
  .apv-pick select{min-width:160px;}
  .apv-actions{width:100%;margin-left:0;}
}
@media print{
  .no-print{display:none !important;}
  .apv-stage{padding:0;}
}
`;

export default PolicyView;
