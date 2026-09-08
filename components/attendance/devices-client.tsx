"use client";

import * as React from "react";
import { Loader2, Search, ShieldCheck, ShieldX, Smartphone } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { formatDate } from "@/lib/format";
import { approveDevice, revokeDevice } from "@/app/(app)/attendance/devices/actions";

interface DeviceRow {
  id: string;
  employeeId: string;
  employeeName: string;
  /** 'laptop' | 'phone'. Descriptive only — either kind may fill either slot. */
  kind: string;
  label: string | null;
  platform: string | null;
  status: string;
  createdAt: string | Date;
  lastUsedAt: string | Date | null;
  approvedAt: string | Date | null;
}

const RED = "var(--color-altus-red)";

function StatusPill({ status }: { status: string }) {
  const map: Record<string, { bg: string; fg: string; label: string }> = {
    pending: { bg: "var(--color-amber-bg, #fef3e2)", fg: "var(--color-amber-deep, #b45309)", label: "Pending approval" },
    approved: { bg: "var(--color-green-bg, #e9f7ef)", fg: "var(--color-green-deep, #15803d)", label: "Approved" },
    revoked: { bg: "#f1f2f4", fg: "#6b7280", label: "Revoked" },
  };
  const s = map[status] ?? map.revoked!;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-bold" style={{ background: s.bg, color: s.fg }}>
      <span className="inline-block size-1.5 rounded-full" style={{ background: s.fg }} /> {s.label}
    </span>
  );
}

export function DevicesClient({ devices, maxPerEmployee }: { devices: DeviceRow[]; maxPerEmployee: number }) {
  const [q, setQ] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  const [filter, setFilter] = React.useState<"all" | "pending" | "approved" | "revoked">("all");

  const filtered = devices.filter((d) => {
    if (filter !== "all" && d.status !== filter) return false;
    if (!q.trim()) return true;
    const hay = `${d.employeeName} ${d.kind} ${d.label ?? ""} ${d.platform ?? ""}`.toLowerCase();
    return hay.includes(q.trim().toLowerCase());
  });

  async function act(id: string, fn: (id: string) => Promise<{ ok: boolean; error?: string }>, done: string) {
    if (busy) return;
    setBusy(id);
    const res = await fn(id);
    setBusy(null);
    if (!res.ok) return fireToast({ message: res.error ?? "Something went wrong.", type: "error" });
    fireToast({ message: done, type: "success" });
  }

  const fmt = (d: string | Date | null) => (d ? formatDate(typeof d === "string" ? d : d.toISOString()) : "—");

  const counts = {
    all: devices.length,
    pending: devices.filter((d) => d.status === "pending").length,
    approved: devices.filter((d) => d.status === "approved").length,
    revoked: devices.filter((d) => d.status === "revoked").length,
  };

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex gap-1 rounded-xl border border-hairline bg-white p-1">
          {(["all", "pending", "approved", "revoked"] as const).map((f) => (
            <button
              key={f}
              type="button"
              onClick={() => setFilter(f)}
              className={`rounded-lg px-3 py-1.5 text-[12.5px] font-bold capitalize transition-colors ${filter === f ? "text-white" : "text-ink-muted hover:text-ink-strong"}`}
              style={filter === f ? { background: RED } : undefined}
            >
              {f} <span className="tabular-nums opacity-70">{counts[f]}</span>
            </button>
          ))}
        </div>
        <div className="relative min-w-[220px] flex-1 max-w-[340px]">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Local search — person or device" title="Local search — filters only the list on this page" aria-label="Local search — person or device — this page only"
            className="w-full rounded-xl border border-hairline-strong bg-white py-2.5 pl-9 pr-3 text-[13.5px] font-medium text-ink-strong outline-none focus:border-altus-red"
          />
        </div>
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div className="grid place-items-center rounded-2xl border border-hairline-strong bg-white px-6 py-16 text-center">
          <Smartphone size={26} className="text-ink-soft" />
          <p className="mt-3 text-[14px] font-bold text-ink-strong">No devices here</p>
          <p className="mt-1 text-[13px] text-ink-muted">Employees register a device the first time they punch in — from a desktop or Android browser, or the mobile app.</p>
        </div>
      ) : (
        <ul className="space-y-2.5">
          {filtered.map((d) => (
            <li key={d.id} className="flex flex-wrap items-center gap-3 rounded-2xl border border-hairline bg-white px-4 py-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-soft text-ink-muted">
                <Smartphone size={18} />
              </span>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-bold text-ink-strong">{d.employeeName}</div>
                <div className="truncate text-[12.5px] text-ink-muted">
                  {/* TYPE LEADS. Which slot this fills — Web (Desktop) vs Web
                      (Android) for a browser, or Laptop/Phone for the native app
                      — is the first thing an approver needs, because the cap is
                      one per slot: it decides what approving this row displaces. */}
                  <span className="font-bold text-ink-strong">{deviceTypeName(d)}</span>
                  {d.platform ? ` · ${d.platform}` : ""} · last used {fmt(d.lastUsedAt)}
                </div>
              </div>
              <StatusPill status={d.status} />
              <div className="flex shrink-0 gap-2">
                {d.status !== "approved" && (
                  <button
                    type="button"
                    disabled={busy === d.id}
                    onClick={() => act(d.id, approveDevice, "Device approved — they can now punch from it.")}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-60"
                    style={{ background: "var(--color-green-deep, #15803d)" }}
                  >
                    {busy === d.id ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />} Approve
                  </button>
                )}
                {d.status !== "revoked" && (
                  <button
                    type="button"
                    disabled={busy === d.id}
                    onClick={() => act(d.id, revokeDevice, "Device revoked — it can no longer punch.")}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong px-3 py-1.5 text-[12.5px] font-bold text-ink-strong transition-colors hover:border-altus-red hover:text-[color:var(--color-altus-red)] disabled:opacity-60"
                  >
                    {busy === d.id ? <Loader2 size={14} className="animate-spin" /> : <ShieldX size={14} />} Revoke
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="pt-1 text-[12px] text-ink-subtle">Cap: {maxPerEmployee} approved devices per employee, any kind — two laptops, two phones or one of each. Revoke an old one before approving a replacement.</p>
    </div>
  );
}

/**
 * The device's slot name. A browser reports its own descriptive label
 * ("Web (Desktop)" / "Web (Android)" / "Web (Mobile)"), set at registration from
 * the user-agent; older web rows and native-app rows fall back to the kind.
 */
function deviceTypeName(d: { kind: string; label: string | null; platform: string | null }): string {
  if (d.platform === "web") {
    const clean = d.label?.replace(/\s*\(auto-registered\)\s*$/i, "").trim();
    if (clean && /^web\s*\(/i.test(clean)) return clean;
    return d.kind === "phone" ? "Web (Mobile)" : "Web (Desktop)";
  }
  return d.kind === "laptop" ? "Laptop" : "Phone";
}
