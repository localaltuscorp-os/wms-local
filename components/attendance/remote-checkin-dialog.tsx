"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  X, Home, Building2, MapPinned, MoreHorizontal, LocateFixed, Loader2,
  Camera, Check, LogIn, LogOut, type LucideIcon,
} from "lucide-react";
import { fireToast } from "@/lib/toast";
import { punchRemote } from "@/app/(app)/attendance/actions";

const GREEN = "#E10600";
const GREEN_DEEP = "#A80400";

const MODES: { key: string; label: string; Icon: LucideIcon }[] = [
  { key: "wfh", label: "Work from Home", Icon: Home },
  { key: "client_site", label: "Client Site", Icon: Building2 },
  { key: "field", label: "Field Visit", Icon: MapPinned },
  { key: "other", label: "Other", Icon: MoreHorizontal },
];

export function RemoteCheckInDialog({
  hasCheckedIn,
  hasCheckedOut,
  onClose,
}: {
  hasCheckedIn: boolean;
  hasCheckedOut: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const [mounted, setMounted] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [kind, setKind] = React.useState<"in" | "out">(hasCheckedIn && !hasCheckedOut ? "out" : "in");
  const [mode, setMode] = React.useState("wfh");
  const [reason, setReason] = React.useState("");
  const [photo, setPhoto] = React.useState<File | null>(null);
  const [photoUrl, setPhotoUrl] = React.useState<string | null>(null);
  const [loc, setLoc] = React.useState<{ lat: number; lng: number; acc: number } | null>(null);
  const [locBusy, setLocBusy] = React.useState(false);

  React.useEffect(() => setMounted(true), []);
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);
  React.useEffect(() => () => { if (photoUrl) URL.revokeObjectURL(photoUrl); }, [photoUrl]);

  function getLocation() {
    if (!navigator.geolocation) { fireToast({ message: "Location not supported on this device.", type: "error" }); return; }
    setLocBusy(true);
    navigator.geolocation.getCurrentPosition(
      (p) => { setLoc({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy }); setLocBusy(false); },
      () => { setLocBusy(false); fireToast({ message: "Couldn't get location — allow access and retry.", type: "error" }); },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 10000 },
    );
  }
  function pickPhoto(f: File | null) {
    if (photoUrl) URL.revokeObjectURL(photoUrl);
    setPhoto(f);
    setPhotoUrl(f ? URL.createObjectURL(f) : null);
  }

  async function submit() {
    if (busy) return;
    if (!loc) { fireToast({ message: "Capture your location first.", type: "error" }); return; }
    if (!reason.trim()) { fireToast({ message: "Add a reason / note.", type: "error" }); return; }
    if (!photo) { fireToast({ message: "Attach a photo.", type: "error" }); return; }
    setBusy(true);
    const fd = new FormData();
    fd.set("kind", kind); fd.set("workMode", mode); fd.set("reason", reason.trim());
    fd.set("lat", String(loc.lat)); fd.set("lng", String(loc.lng)); fd.set("accuracyM", String(loc.acc));
    fd.set("photo", photo);
    const res = await punchRemote(fd);
    setBusy(false);
    if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
    fireToast({ message: `Remote ${kind === "in" ? "check-in" : "check-out"} logged`, type: "success" });
    router.refresh();
    onClose();
  }

  if (!mounted) return null;
  const canOut = hasCheckedIn && !hasCheckedOut;

  return createPortal(
    <div className="fixed inset-0 z-[190] flex items-center justify-center p-4" style={{ background: "rgba(15,23,42,0.55)", backdropFilter: "blur(4px)" }} onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="wg-rise flex max-h-[92vh] w-full max-w-[500px] flex-col overflow-hidden rounded-[24px] bg-surface-card" style={{ boxShadow: "0 40px 90px -30px rgba(15,23,42,0.5), inset 0 0 0 1px var(--color-hairline)" }}>
        <div className="flex items-center gap-3 px-6 py-4" style={{ background: `linear-gradient(135deg, ${GREEN}, ${GREEN_DEEP})` }}>
          <MapPinned size={19} className="text-white" strokeWidth={2.3} />
          <div className="min-w-0 flex-1">
            <div className="text-[15.5px] font-black text-white">Remote / On-Site Check-In</div>
            <div className="text-[12px] font-semibold text-white/80">Log attendance from anywhere — with evidence</div>
          </div>
          <button type="button" onClick={() => !busy && onClose()} className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/15 text-white hover:bg-white/25" aria-label="Close"><X size={17} strokeWidth={2.4} /></button>
        </div>

        <div className="flex flex-col gap-4 overflow-y-auto p-6">
          {/* in / out */}
          <div className="flex gap-2">
            {(["in", "out"] as const).map((k) => {
              const on = kind === k; const disabled = k === "out" ? !canOut : hasCheckedIn;
              return (
                <button key={k} type="button" disabled={disabled} onClick={() => setKind(k)} className="flex-1 inline-flex items-center justify-center gap-2 rounded-xl py-2.5 text-[13.5px] font-bold transition disabled:opacity-40"
                  style={on ? { background: `color-mix(in srgb, ${GREEN} 14%, transparent)`, color: GREEN_DEEP, boxShadow: `inset 0 0 0 1.5px ${GREEN}` } : { background: "var(--color-surface-soft)", color: "var(--color-ink-muted)", boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
                  {k === "in" ? <LogIn size={15} /> : <LogOut size={15} />}{k === "in" ? "Check In" : "Check Out"}
                </button>
              );
            })}
          </div>

          {/* work mode */}
          <div>
            <div className="mb-1.5 text-[12px] font-bold uppercase tracking-[0.1em] text-ink-subtle">Where are you working?</div>
            <div className="grid grid-cols-2 gap-2">
              {MODES.map((m) => {
                const on = mode === m.key;
                return (
                  <button key={m.key} type="button" onClick={() => setMode(m.key)} className="inline-flex items-center gap-2 rounded-xl px-3 py-2.5 text-[13px] font-bold transition"
                    style={on ? { background: `color-mix(in srgb, ${GREEN} 12%, transparent)`, color: GREEN_DEEP, boxShadow: `inset 0 0 0 1.5px ${GREEN}` } : { background: "var(--color-surface-soft)", color: "var(--color-ink-muted)", boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
                    <m.Icon size={15} strokeWidth={2.3} /> {m.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* location */}
          <div>
            <div className="mb-1.5 text-[12px] font-bold uppercase tracking-[0.1em] text-ink-subtle">Location <span className="text-[color:var(--color-altus-red)]">*</span></div>
            {loc ? (
              <div className="flex items-center gap-2 rounded-xl bg-surface-soft px-3.5 py-2.5 text-[13px] font-semibold text-ink-strong" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
                <Check size={15} className="text-[color:var(--color-green-deep)]" strokeWidth={2.6} />
                <span className="tabular-nums">{loc.lat.toFixed(5)}, {loc.lng.toFixed(5)}</span>
                <span className="ml-auto text-[11.5px] font-medium text-ink-subtle">±{Math.round(loc.acc)}m</span>
                <button type="button" onClick={getLocation} className="text-[12px] font-bold text-[color:var(--color-green-deep)]">Refresh</button>
              </div>
            ) : (
              <button type="button" onClick={getLocation} disabled={locBusy} className="inline-flex w-full items-center justify-center gap-2 rounded-xl py-2.5 text-[13.5px] font-bold text-white disabled:opacity-60" style={{ background: `linear-gradient(135deg, ${GREEN}, ${GREEN_DEEP})` }}>
                {locBusy ? <Loader2 size={15} className="animate-spin" /> : <LocateFixed size={15} strokeWidth={2.4} />}{locBusy ? "Locating…" : "Enable location"}
              </button>
            )}
          </div>

          {/* reason */}
          <div>
            <div className="mb-1.5 text-[12px] font-bold uppercase tracking-[0.1em] text-ink-subtle">Reason / note <span className="text-[color:var(--color-altus-red)]">*</span></div>
            <textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} rows={2} placeholder="e.g. Client meeting at Andheri site" className="w-full resize-y rounded-xl px-3.5 py-2.5 text-[14px] font-medium text-ink-strong bg-white outline-none focus:border-[#E10600]" style={{ border: "2px solid var(--color-hairline-strong)" }} />
          </div>

          {/* photo */}
          <div>
            <div className="mb-1.5 text-[12px] font-bold uppercase tracking-[0.1em] text-ink-subtle">Photo evidence <span className="text-[color:var(--color-altus-red)]">*</span></div>
            <label className="relative flex cursor-pointer items-center gap-3 rounded-xl border-2 border-solid border-hairline-strong bg-surface-soft px-3.5 py-3">
              {photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={photoUrl} alt="evidence" className="h-14 w-14 rounded-lg object-cover" />
              ) : (
                <span className="inline-grid h-14 w-14 place-items-center rounded-lg bg-white text-ink-subtle" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}><Camera size={20} /></span>
              )}
              <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-ink-muted">{photo ? photo.name : "Take / choose a photo"}</span>
              <input type="file" accept="image/*" capture="environment" onChange={(e) => pickPhoto(e.target.files?.[0] ?? null)} className="absolute inset-0 cursor-pointer opacity-0" />
            </label>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-hairline px-6 py-3">
          <button type="button" onClick={() => !busy && onClose()} className="bg-surface-card rounded-pill px-4 py-2 text-[13.5px] font-bold text-ink-muted hover:text-ink-strong">Cancel</button>
          <button type="button" onClick={submit} disabled={busy} className="wg-btn wg-sheen inline-flex items-center gap-2 rounded-pill px-5 py-2.5 text-[13.5px] font-bold text-white disabled:opacity-60" style={{ background: `linear-gradient(135deg, ${GREEN}, ${GREEN_DEEP})`, boxShadow: `0 8px 20px -10px ${GREEN_DEEP}` }}>
            {busy ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} strokeWidth={2.6} />}{busy ? "Logging…" : `Log ${kind === "in" ? "check-in" : "check-out"}`}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
