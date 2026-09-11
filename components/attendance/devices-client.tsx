"use client";

import * as React from "react";
import { Loader2, Search, ShieldCheck, ShieldX, Smartphone, Plus } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { formatDate } from "@/lib/format";
import {
  approveDevice,
  revokeDevice,
  registerDeviceForEmployee,
} from "@/app/(app)/attendance/devices/actions";
import { CollapsibleSearch } from "@/components/ui/collapsible-search";

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
  lastSeenAt: string | Date | null;
  approvedAt: string | Date | null;
  approvedByName: string | null;
  revokedAt: string | Date | null;
  revokedByName: string | null;
  revokeReason: string | null;
}

interface EmployeeOption {
  id: string;
  name: string;
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
    <span className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[11px] font-bold" style={{ background: s.bg, color: s.fg }}>
      <span className="inline-block size-1.5 rounded-full" style={{ background: s.fg }} /> {s.label}
    </span>
  );
}

export function DevicesClient({
  devices,
  maxPerKind,
  employees,
}: {
  devices: DeviceRow[];
  maxPerKind: number;
  employees: EmployeeOption[];
}) {
  const [q, setQ] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);
  // Defaults to the LIVE devices. Revoked rows are history and are kept
  // forever, so after a year of replacements they would otherwise dominate the
  // default view and bury the pending approvals that need acting on.
  const [filter, setFilter] = React.useState<"all" | "pending" | "approved" | "revoked">("all");
  const [showRegister, setShowRegister] = React.useState(false);

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

  const fmt = (d: string | Date | null) => (d ? formatDate(typeof d === "string" ? d : d.toISOString()) : "-");

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
        <CollapsibleSearch scope="person or device">
        <div className="relative min-w-[220px] flex-1 max-w-[340px]">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Local search - person or device" title="Local search - filters only the list on this page" aria-label="Local search - person or device - this page only"
            className="w-full rounded-xl border border-hairline-strong bg-white py-2.5 pl-9 pr-3 text-[13.5px] font-medium text-ink-strong outline-none focus:border-altus-red"
          />
        </div>
        </CollapsibleSearch>

        <button
          type="button"
          onClick={() => setShowRegister((v) => !v)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-white px-3 py-1.5 text-[12.5px] font-bold text-ink-strong transition-colors hover:border-altus-red"
        >
          <Plus size={14} /> Register a device
        </button>
      </div>

      {showRegister && (
        <RegisterDeviceForm employees={employees} onDone={() => setShowRegister(false)} />
      )}

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
                  {d.platform ? ` · ${d.platform}` : ""} · last seen{" "}
                  {fmt(d.lastSeenAt ?? d.lastUsedAt)}
                </div>
                {/* THE HISTORY LINE. A revoked row is kept forever precisely so
                    this can be read later; showing the status without who did it
                    or why would make the retention pointless. */}
                {d.status === "revoked" && (
                  <div className="mt-0.5 truncate text-[12px] text-ink-subtle">
                    Revoked {fmt(d.revokedAt)}
                    {d.revokedByName ? ` by ${d.revokedByName}` : ""}
                    {d.revokeReason ? ` — ${d.revokeReason}` : ""}
                  </div>
                )}
                {d.status === "approved" && d.approvedByName && (
                  <div className="mt-0.5 truncate text-[12px] text-ink-subtle">
                    Approved {fmt(d.approvedAt)} by {d.approvedByName}
                  </div>
                )}
              </div>
              <StatusPill status={d.status} />
              <div className="flex shrink-0 gap-2">
                {d.status !== "approved" && (
                  <button
                    type="button"
                    disabled={busy === d.id}
                    onClick={() => act(d.id, approveDevice, "Device approved — they can now use the WMS from it.")}
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
                    onClick={() => {
                      // ASK WHY. A revocation removes someone's ability to work
                      // from that machine, and the reason is what the device
                      // history shows six months later when nobody remembers.
                      const reason = window.prompt(
                        `Why are you revoking ${d.employeeName}'s ${deviceTypeName(d)}?
(Lost, replaced, left the company, suspicious activity…)`,
                      );
                      if (reason === null) return; // cancelled
                      act(
                        d.id,
                        (id) => revokeDevice(id, reason),
                        "Device revoked — it can no longer reach the WMS.",
                      );
                    }}
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
      <p className="pt-1 text-[12px] text-ink-subtle">
        Cap: {maxPerKind} approved laptop and {maxPerKind} approved phone per employee. Revoke the old one
        before approving a replacement — revoked devices stay in this list as history.
      </p>
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

/**
 * Register a device against an employee, on their behalf.
 *
 * The device id is TYPED IN, not detected: this form runs in the administrator's
 * browser, so anything it could detect would describe the administrator's
 * machine, not the employee's. For a phone the id is the one the app shows on
 * its own device screen; for a laptop the ordinary path is the employee signing
 * in once and having the browser adopted, and this form is for setting somebody
 * up ahead of that.
 */
function RegisterDeviceForm({
  employees,
  onDone,
}: {
  employees: EmployeeOption[];
  onDone: () => void;
}) {
  const [employeeId, setEmployeeId] = React.useState("");
  const [kind, setKind] = React.useState<"laptop" | "phone">("laptop");
  const [deviceId, setDeviceId] = React.useState("");
  const [label, setLabel] = React.useState("");
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    const res = await registerDeviceForEmployee({ employeeId, kind, deviceId, label });
    setBusy(false);
    if (!res.ok) return fireToast({ message: res.error, type: "error" });
    fireToast({ message: "Device registered and approved.", type: "success" });
    setDeviceId("");
    setLabel("");
    onDone();
  }

  const field =
    "w-full rounded-xl border border-hairline-strong bg-white px-3 py-2.5 text-[13.5px] font-medium text-ink-strong outline-none focus:border-altus-red";

  return (
    <form
      onSubmit={submit}
      className="grid gap-3 rounded-2xl border border-hairline-strong bg-white p-4 md:grid-cols-2"
    >
      <label className="grid gap-1.5">
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-muted">Employee</span>
        <select value={employeeId} onChange={(e) => setEmployeeId(e.target.value)} className={field} required>
          <option value="">Select an employee…</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
      </label>

      <label className="grid gap-1.5">
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-muted">Device type</span>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value as "laptop" | "phone")}
          className={field}
        >
          <option value="laptop">Desktop / Laptop</option>
          <option value="phone">Mobile phone</option>
        </select>
      </label>

      <label className="grid gap-1.5">
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-muted">Device id</span>
        <input
          value={deviceId}
          onChange={(e) => setDeviceId(e.target.value)}
          placeholder="From the employee's device screen"
          className={field}
          required
          minLength={8}
        />
      </label>

      <label className="grid gap-1.5">
        <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-muted">
          Label <span className="font-medium normal-case tracking-normal">(optional)</span>
        </span>
        <input
          value={label}
          onChange={(e) => setLabel(e.target.value)}
          placeholder="e.g. Office Dell, Pixel 8"
          className={field}
        />
      </label>

      <div className="md:col-span-2 flex items-center gap-2">
        <button
          type="submit"
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[12.5px] font-bold text-white disabled:opacity-60"
          style={{ background: RED }}
        >
          {busy ? <Loader2 size={14} className="animate-spin" /> : <ShieldCheck size={14} />} Register &amp; approve
        </button>
        <button
          type="button"
          onClick={onDone}
          className="rounded-lg border border-hairline-strong px-3.5 py-2 text-[12.5px] font-bold text-ink-strong"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
