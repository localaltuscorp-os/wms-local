"use client";

import * as React from "react";
import { Loader2, Plus, Wifi, X, Check } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { setOfficeIpAllowlist } from "@/app/(app)/attendance/devices/actions";

const RED = "var(--color-altus-red)";

/**
 * Office-network allowlist editor (super-admin). Sets the public IP(s) the WEB
 * punch must come from — the browser "punch from home" bypass closes once at
 * least one entry is saved. Empty list = gate OFF. Shows the admin's current
 * detected IP so they can add the office Wi-Fi in one tap.
 */
export function OfficeNetworkEditor({ currentIp, allowlist }: { currentIp: string | null; allowlist: string[] }) {
  const [list, setList] = React.useState<string[]>(allowlist);
  const [input, setInput] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const dirty = JSON.stringify(list) !== JSON.stringify(allowlist);

  function add(ip: string) {
    const v = ip.trim();
    if (!v || list.includes(v)) return;
    setList((l) => [...l, v]);
    setInput("");
  }

  async function save() {
    setSaving(true);
    const res = await setOfficeIpAllowlist(list);
    setSaving(false);
    if (!res.ok) return fireToast({ message: res.error, type: "error" });
    fireToast({ message: list.length ? "Office network saved — web punches now require it." : "Office-network gate turned off.", type: "success" });
  }

  return (
    <div className="rounded-2xl border border-hairline bg-white p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-surface-soft text-ink-muted"><Wifi size={17} /></span>
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-bold text-ink-strong">Office network</div>
          <div className="text-[12.5px] text-ink-muted">
            {list.length === 0
              ? "Gate off — web attendance is allowed from anywhere. Add your office IP to require it."
              : `Web attendance must come from ${list.length} allowed network${list.length === 1 ? "" : "s"}.`}
          </div>
        </div>
        {currentIp && !list.includes(currentIp) && (
          <button
            type="button"
            onClick={() => add(currentIp)}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-bold text-white"
            style={{ background: RED }}
          >
            <Plus size={14} /> Add this network ({currentIp})
          </button>
        )}
      </div>

      {list.length > 0 && (
        <ul className="mt-3 flex flex-wrap gap-2">
          {list.map((ip) => (
            <li key={ip} className="inline-flex items-center gap-2 rounded-lg border border-hairline-strong bg-surface-soft px-2.5 py-1.5 text-[12.5px] font-semibold text-ink-strong">
              <span className="font-mono">{ip}</span>
              <button type="button" onClick={() => setList((l) => l.filter((x) => x !== ip))} aria-label={`Remove ${ip}`} className="text-ink-subtle hover:text-[color:var(--color-altus-red)]">
                <X size={13} />
              </button>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(input); } }}
          placeholder="Add an IP or CIDR (e.g. 203.0.113.9 or 203.0.113.0/24)"
          className="min-w-[240px] flex-1 rounded-lg border border-hairline-strong bg-white px-3 py-2 text-[13px] font-mono text-ink-strong outline-none focus:border-altus-red"
        />
        <button type="button" onClick={() => add(input)} className="rounded-lg border border-hairline-strong px-3 py-2 text-[12.5px] font-bold text-ink-strong hover:border-altus-red">Add</button>
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={save}
          className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[12.5px] font-bold text-white disabled:opacity-50"
          style={{ background: RED }}
        >
          {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save
        </button>
      </div>
      <p className="mt-2 text-[11.5px] text-ink-subtle">Super-admin only. Mobile-app punches aren’t affected (they use the stronger device + integrity checks).</p>
    </div>
  );
}
