"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, ShieldAlert } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { CATEGORY_GLYPH } from "@/lib/hr/ticket-ui";
import type { HrTicketCategory } from "@/db/enums";
import { updateRoute } from "@/app/(app)/hr/routing/actions";

const RED = "var(--color-altus-red)";

interface RowIn {
  category: HrTicketCategory;
  label: string;
  ownerId: string | null;
  ownerName: string | null;
  isActive: boolean;
}

export function RoutingEditor({
  rows,
  handlers,
}: {
  rows: RowIn[];
  handlers: Array<{ id: string; name: string }>;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState<string | null>(null);
  const [local, setLocal] = React.useState<RowIn[]>(rows);

  async function save(category: HrTicketCategory, next: Partial<RowIn>) {
    const row = local.find((r) => r.category === category);
    if (!row) return;
    const merged = { ...row, ...next };
    setLocal((prev) => prev.map((r) => (r.category === category ? merged : r)));
    setBusy(category);
    const res = await updateRoute({ category, ownerId: merged.ownerId, isActive: merged.isActive });
    setBusy(null);
    if (!res.ok) {
      setLocal((prev) => prev.map((r) => (r.category === category ? row : r))); // revert
      fireToast({ message: res.error, type: "error" });
      return;
    }
    fireToast({ message: "Routing saved", type: "success" });
    router.refresh();
  }

  return (
    <div className="overflow-hidden rounded-2xl border border-hairline bg-surface-card">
      <ul className="divide-y divide-hairline">
        {local.map((r) => (
          <li key={r.category} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
            <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-[16px]" style={{ background: "#E1060014" }}>
              {CATEGORY_GLYPH[r.category]}
            </span>
            <div className="min-w-[140px] flex-1">
              <div className="flex items-center gap-1.5 text-[14px] font-bold text-ink-strong">
                {r.label}
                {r.category === "grievance" && <ShieldAlert size={14} style={{ color: RED }} />}
              </div>
              {!r.ownerId && (
                <div className="text-[11.5px] font-medium text-ink-muted">Falls back to super-admins</div>
              )}
            </div>
            <select
              value={r.ownerId ?? ""}
              disabled={busy === r.category}
              onChange={(e) => save(r.category, { ownerId: e.target.value || null })}
              className="min-w-[180px] rounded-lg border border-hairline bg-surface-card px-2.5 py-1.5 text-[13px] font-medium text-ink-strong outline-none focus:border-[var(--color-altus-red)]"
              aria-label={`Owner for ${r.label}`}
            >
              <option value="">Super-admins (fallback)</option>
              {handlers.map((h) => (
                <option key={h.id} value={h.id}>
                  {h.name}
                </option>
              ))}
            </select>
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-[12.5px] font-semibold text-ink-muted">
              <input
                type="checkbox"
                checked={r.isActive}
                disabled={busy === r.category}
                onChange={(e) => save(r.category, { isActive: e.target.checked })}
                className="h-4 w-4 accent-[var(--color-altus-red)]"
              />
              Active
            </label>
            {busy === r.category && <Loader2 size={15} className="animate-spin text-ink-muted" />}
          </li>
        ))}
      </ul>
    </div>
  );
}
