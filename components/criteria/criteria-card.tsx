"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Target, Pencil, Check, X, Loader2 } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { setEmployeeCriteria } from "@/app/(app)/profile/criteria-actions";

/**
 * Performance-criteria card — shown in Profile > Performance and Weekly Goals.
 * Admins get an inline editor; everyone else sees read-only chips. Editing
 * here updates the single `employees.performance_criteria` field, so both
 * surfaces stay in sync.
 */
export function CriteriaCard({
  employeeId,
  employeeName,
  criteria,
  kra = null,
  isAdmin,
  compact = false,
}: {
  employeeId: string;
  employeeName?: string;
  criteria: string | null;
  kra?: string | null;
  isAdmin: boolean;
  compact?: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [value, setValue] = React.useState(criteria ?? "");
  const [kraValue, setKraValue] = React.useState(kra ?? "");
  const [pending, start] = React.useTransition();
  React.useEffect(() => setValue(criteria ?? ""), [criteria]);
  React.useEffect(() => setKraValue(kra ?? ""), [kra]);

  const split = (s: string | null) =>
    (s ?? "").split(/[,;]+/).map((x) => x.trim()).filter(Boolean);
  const points = split(criteria);
  const kraPoints = split(kra);

  function save() {
    start(async () => {
      const res = await setEmployeeCriteria({ employeeId, criteria: value.trim(), kra: kraValue.trim() });
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      fireToast({ message: "Saved.", type: "success" });
      setEditing(false);
      router.refresh();
    });
  }

  return (
    <div
      className={`rounded-section border border-hairline bg-surface-card ${compact ? "p-4" : "p-6"}`}
      style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Target size={compact ? 16 : 18} className="text-altus-red" strokeWidth={2.3} />
          <h3 className={`font-black text-ink-strong ${compact ? "text-[15px]" : "text-[18px]"}`}>
            KRA &amp; Performance criteria{employeeName ? ` — ${employeeName}` : ""}
          </h3>
        </div>
        {isAdmin && !editing && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="inline-flex items-center gap-1.5 rounded-full border border-hairline px-3 py-1.5 text-[13px] font-bold text-ink-soft hover:text-ink-strong transition-colors"
          >
            <Pencil size={13} /> Edit
          </button>
        )}
      </div>

      {editing ? (
        <div className="space-y-3">
          <div>
            <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.06em] text-ink-subtle">Key Result Areas (KRA)</label>
            <textarea
              value={kraValue}
              onChange={(e) => setKraValue(e.target.value)}
              rows={2}
              placeholder="Comma-separated KRAs, e.g. Client management, Solution delivery, Project completion"
              className="w-full rounded-md border border-hairline bg-white px-3 py-2 text-[14px] outline-none focus:border-altus-red/50"
            />
          </div>
          <div>
            <label className="mb-1 block text-[11px] font-black uppercase tracking-[0.06em] text-ink-subtle">Evaluation criteria</label>
            <textarea
              value={value}
              onChange={(e) => setValue(e.target.value)}
              rows={2}
              placeholder="Comma-separated criteria, e.g. Client satisfaction, Timely delivery, Revenue contribution"
              className="w-full rounded-md border border-hairline bg-white px-3 py-2 text-[14px] outline-none focus:border-altus-red/50"
            />
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={save} disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[13px] font-bold text-white disabled:opacity-60"
              style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}>
              {pending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save
            </button>
            <button type="button" onClick={() => { setEditing(false); setValue(criteria ?? ""); setKraValue(kra ?? ""); }}
              className="inline-flex items-center gap-1.5 rounded-full border border-hairline px-4 py-1.5 text-[13px] font-bold text-ink-soft">
              <X size={14} /> Cancel
            </button>
          </div>
        </div>
      ) : kraPoints.length > 0 || points.length > 0 ? (
        <div className="space-y-3">
          <ChipGroup label="Key Result Areas" chips={kraPoints} empty={isAdmin ? "No KRA set yet — click Edit to add." : null} />
          <ChipGroup label="Evaluation criteria" chips={points} empty={isAdmin ? "No criteria set yet — click Edit to add." : null} />
        </div>
      ) : (
        <p className="text-[14px] font-semibold text-ink-muted">
          {isAdmin ? "No KRA or criteria set yet — click Edit to add." : "Not set yet."}
        </p>
      )}
    </div>
  );
}

/** A labelled row of ALL-CAPS chips (KRA / criteria points). */
function ChipGroup({ label, chips, empty }: { label: string; chips: string[]; empty: string | null }) {
  if (chips.length === 0 && !empty) return null;
  return (
    <div>
      <span className="mb-1.5 block text-[11px] font-black uppercase tracking-[0.06em] text-ink-subtle">{label}</span>
      {chips.length > 0 ? (
        <div className="flex flex-wrap gap-2">
          {chips.map((p, i) => (
            <span key={i}
              className="inline-flex items-center rounded-full px-3 py-1.5 text-[12px] font-bold uppercase tracking-[0.04em] text-ink-strong"
              style={{ background: "color-mix(in srgb, var(--color-altus-red) 8%, transparent)", border: "1px solid color-mix(in srgb, var(--color-altus-red) 22%, transparent)" }}>
              {p}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-[13px] font-semibold text-ink-muted">{empty}</p>
      )}
    </div>
  );
}
