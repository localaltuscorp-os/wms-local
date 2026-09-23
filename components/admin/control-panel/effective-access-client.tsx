"use client";

import { useRouter } from "next/navigation";
import type { EffectiveAccess } from "@/lib/queries/control-panel";

export function EffectiveAccessClient({
  users,
  selectedId,
  selectedName,
  access,
}: {
  users: { id: string; name: string }[];
  selectedId: string | null;
  selectedName: string | null;
  access: EffectiveAccess | null;
}) {
  const router = useRouter();

  return (
    <div className="space-y-4">
      <select
        value={selectedId ?? ""}
        onChange={(e) => router.push(`/admin/control-panel/effective-access?emp=${e.target.value}`)}
        className="rounded-lg border border-hairline bg-surface-soft px-3 py-1.5 text-[13px] font-bold text-ink-strong"
      >
        <option value="">Choose an employee…</option>
        {users.map((u) => (
          <option key={u.id} value={u.id}>{u.name}</option>
        ))}
      </select>

      {!access ? (
        <p className="text-[13px] text-ink-subtle">Pick an employee to see their effective access.</p>
      ) : (
        <div className="space-y-4">
          {/* ── Permanent (roles) ─────────────────────────────── */}
          <div className="rounded-xl border border-hairline bg-surface-card">
            <p className="border-b border-hairline px-3 py-2 text-[11px] font-black uppercase tracking-[0.08em] text-ink-muted">
              Permanent access · {selectedName}
            </p>
            {access.permanent.length === 0 ? (
              <p className="px-3 py-3 text-[12.5px] text-ink-subtle">No role permissions.</p>
            ) : (
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr>
                    {["Module", "Page", "Action", "Scope", "Source"].map((h) => (
                      <th key={h} className="border-b border-hairline-strong px-3 py-1.5 text-[10.5px] font-black uppercase tracking-[0.08em] text-ink-muted">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {access.permanent.map((p, i) => (
                    <tr key={i} className="border-b border-hairline last:border-0">
                      <td className="px-3 py-1.5 text-[12.5px] font-semibold text-ink-strong">{p.module}</td>
                      <td className="px-3 py-1.5 text-[12.5px] text-ink-soft">{p.page || "—"}</td>
                      <td className="px-3 py-1.5 text-[12.5px] text-ink-soft">{p.action}</td>
                      <td className="px-3 py-1.5 text-[12.5px] text-ink-soft">{p.scope ?? "—"}</td>
                      <td className="px-3 py-1.5 text-[12.5px] text-ink-soft">{p.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>

          {/* ── Direct overrides ──────────────────────────────── */}
          {access.direct.length > 0 && (
            <div className="rounded-xl border border-hairline bg-surface-card">
              <p className="border-b border-hairline px-3 py-2 text-[11px] font-black uppercase tracking-[0.08em] text-ink-muted">
                Direct overrides (module permissions)
              </p>
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr>
                    {["Module", "Page", "Show", "View", "Edit"].map((h) => (
                      <th key={h} className="border-b border-hairline-strong px-3 py-1.5 text-[10.5px] font-black uppercase tracking-[0.08em] text-ink-muted">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {access.direct.map((d) => (
                    <tr key={d.nodeKey} className="border-b border-hairline last:border-0">
                      <td className="px-3 py-1.5 text-[12.5px] font-semibold text-ink-strong">{d.module}</td>
                      <td className="px-3 py-1.5 text-[12.5px] text-ink-soft">{d.page || "—"}</td>
                      <td className="px-3 py-1.5 text-[12.5px] text-ink-soft">{d.show ? "✓" : "—"}</td>
                      <td className="px-3 py-1.5 text-[12.5px] text-ink-soft">{d.view ? "✓" : "—"}</td>
                      <td className="px-3 py-1.5 text-[12.5px] text-ink-soft">{d.edit ? "✓" : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* ── Temporary ─────────────────────────────────────── */}
          <div className="rounded-xl border border-hairline bg-surface-card">
            <p className="border-b border-hairline px-3 py-2 text-[11px] font-black uppercase tracking-[0.08em] text-ink-muted">
              Temporary access
            </p>
            {access.temporary.length === 0 ? (
              <p className="px-3 py-3 text-[12.5px] text-ink-subtle">No temporary (delegated) access.</p>
            ) : (
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr>
                    {["As", "Target", "State", "Expires"].map((h) => (
                      <th key={h} className="border-b border-hairline-strong px-3 py-1.5 text-[10.5px] font-black uppercase tracking-[0.08em] text-ink-muted">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {access.temporary.map((t) => (
                    <tr key={t.id} className="border-b border-hairline last:border-0">
                      <td className="px-3 py-1.5 text-[12.5px] font-semibold text-ink-strong">{t.role === "delegate" ? "Delegate" : "Target"}</td>
                      <td className="px-3 py-1.5 text-[12.5px] text-ink-soft">{t.otherName}</td>
                      <td className="px-3 py-1.5">
                        <span className={`rounded px-1.5 py-0.5 text-[11px] font-bold ${t.state === "live" ? "bg-surface-soft text-ink-soft" : t.state === "revoked" ? "bg-altus-red-soft text-altus-red" : "bg-surface-soft text-ink-muted"}`}>
                          {t.state}
                        </span>
                      </td>
                      <td className="px-3 py-1.5 text-[12.5px] text-ink-soft">{t.expiresAt.toISOString().slice(0, 16)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
