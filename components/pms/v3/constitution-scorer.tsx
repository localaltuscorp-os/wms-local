"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, ScrollText, Save } from "lucide-react";
import { fireToast } from "@/lib/toast";
import {
  saveConstitutionScore,
  saveConstitutionWeights,
} from "@/app/(app)/pms/v3/actions";
import type { ConstitutionParaView } from "@/lib/queries/pms-v3";

type Role = "admin" | "self";

function ScaleRow({
  value,
  onChange,
  max,
  accent,
  disabled,
  label,
}: {
  value: number | null;
  onChange: (v: number) => void;
  max: number;
  accent: string;
  disabled?: boolean;
  label: string;
}) {
  return (
    <div className="flex flex-wrap gap-1" role="radiogroup" aria-label={label}>
      {Array.from({ length: max + 1 }, (_, i) => i).map((n) => {
        const on = value != null && n <= value;
        const exact = value === n;
        return (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={exact}
            disabled={disabled}
            onClick={() => onChange(n)}
            className="grid size-6 place-items-center rounded text-[11px] font-bold tabular-nums transition-transform enabled:hover:scale-110 disabled:opacity-50"
            style={{
              background: on ? accent : "var(--color-surface-soft)",
              color: on ? "#fff" : "var(--color-ink-subtle)",
              boxShadow: exact ? `0 0 0 2px color-mix(in srgb, ${accent} 45%, transparent)` : undefined,
            }}
          >
            {n}
          </button>
        );
      })}
    </div>
  );
}

export function ConstitutionScorer({
  paras,
  subjectId,
  period,
  scaleMax,
  totalWeightTarget,
  canEditWeights,
  editableRole,
  accent,
  accentDeep,
}: {
  paras: ConstitutionParaView[];
  subjectId: string;
  period: string;
  scaleMax: number;
  totalWeightTarget: number;
  canEditWeights: boolean;
  editableRole: Role | null;
  accent: string;
  accentDeep: string;
}) {
  const router = useRouter();
  const [weights, setWeights] = React.useState<Record<string, number>>(
    Object.fromEntries(paras.map((p) => [p.id, p.weight])),
  );
  const [savingWeights, startWeights] = React.useTransition();

  const scorable = paras.filter((p) => !p.isHeading);
  const totalWeight = scorable.reduce((s, p) => s + (weights[p.id] ?? 0), 0);
  const weightsOk = Math.abs(totalWeight - totalWeightTarget) < 0.01;

  function saveWeights() {
    if (!weightsOk) {
      fireToast({ message: `Weights must total ${totalWeightTarget} (now ${totalWeight}).`, type: "error" });
      return;
    }
    startWeights(async () => {
      const res = await saveConstitutionWeights({
        weights: scorable.map((p) => ({ paraId: p.id, weight: weights[p.id] ?? 0 })),
      });
      if (res.ok) { fireToast({ message: "Weights saved.", type: "success" }); router.refresh(); }
      else fireToast({ message: res.error, type: "error" });
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {canEditWeights && (
        <div
          className="sticky top-2 z-10 flex items-center justify-between gap-3 rounded-xl border border-hairline p-3"
          style={{ background: weightsOk ? "color-mix(in srgb, #16a34a 8%, white)" : "color-mix(in srgb, #d97706 8%, white)" }}
        >
          <span className="text-[13px] font-bold" style={{ color: weightsOk ? "#15803d" : "#b45309" }}>
            Total weight {totalWeight} / {totalWeightTarget}
          </span>
          <button
            type="button"
            onClick={saveWeights}
            disabled={savingWeights}
            className="brand-btn wg-btn inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-bold text-white disabled:opacity-50"
            style={{ background: `linear-gradient(135deg, ${accent}, ${accentDeep})` }}
          >
            {savingWeights ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} strokeWidth={2.6} />}
            Save Weights
          </button>
        </div>
      )}

      {paras.map((p) =>
        p.isHeading ? (
          <div key={p.id} className="mt-2 flex items-center gap-2">
            <ScrollText size={15} style={{ color: accentDeep }} />
            <h3 className="text-[15px] font-black text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui" }}>
              {p.title ?? p.body}
            </h3>
          </div>
        ) : (
          <ParaCard
            key={p.id}
            para={p}
            subjectId={subjectId}
            period={period}
            scaleMax={scaleMax}
            weight={weights[p.id] ?? 0}
            onWeight={(v) => canEditWeights && setWeights((w) => ({ ...w, [p.id]: v }))}
            canEditWeights={canEditWeights}
            editableRole={editableRole}
            accent={accent}
            accentDeep={accentDeep}
            onSaved={() => router.refresh()}
          />
        ),
      )}
    </div>
  );
}

function ParaCard({
  para,
  subjectId,
  period,
  scaleMax,
  weight,
  onWeight,
  canEditWeights,
  editableRole,
  accent,
  accentDeep,
  onSaved,
}: {
  para: ConstitutionParaView;
  subjectId: string;
  period: string;
  scaleMax: number;
  weight: number;
  onWeight: (v: number) => void;
  canEditWeights: boolean;
  editableRole: Role | null;
  accent: string;
  accentDeep: string;
  onSaved: () => void;
}) {
  const mine = editableRole === "admin" ? para.adminScore : editableRole === "self" ? para.selfScore : null;
  const [points, setPoints] = React.useState<number | null>(mine);
  const [pending, start] = React.useTransition();

  function submit() {
    if (!editableRole || points == null) {
      fireToast({ message: `Score this paragraph (0–${scaleMax}).`, type: "error" });
      return;
    }
    start(async () => {
      const res = await saveConstitutionScore({
        subjectId, period, paraId: para.id, raterRole: editableRole, points,
      });
      if (res.ok) { fireToast({ message: "Score saved.", type: "success" }); onSaved(); }
      else fireToast({ message: res.error, type: "error" });
    });
  }

  const gap = para.adminScore != null && para.selfScore != null ? Math.abs(para.adminScore - para.selfScore) : null;
  return (
    <div className="rounded-xl border border-hairline bg-surface-card p-3.5">
      <div className="flex items-start gap-3">
        <p className="min-w-0 flex-1 text-[14px] leading-relaxed text-ink-soft">{para.body}</p>
        <label className="flex shrink-0 flex-col items-end">
          <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-subtle">Weight</span>
          <input
            type="number"
            min={0}
            max={100}
            value={weight}
            disabled={!canEditWeights}
            onChange={(e) => onWeight(Number(e.target.value))}
            className="w-16 rounded-md border border-hairline bg-white px-2 py-1 text-right text-[13px] tabular-nums outline-none disabled:opacity-60"
          />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-4">
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-subtle">Admin</span>
          <span className="text-[14px] font-black tabular-nums" style={{ color: accentDeep }}>{para.adminScore ?? "—"}</span>
        </div>
        <div className="flex flex-col items-center gap-0.5">
          <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-ink-subtle">Self</span>
          <span className="text-[14px] font-black tabular-nums" style={{ color: accent }}>{para.selfScore ?? "—"}</span>
        </div>
        {gap != null && gap >= 2 && (
          <span className="rounded-pill px-2 py-0.5 text-[11px] font-bold" style={{ background: "color-mix(in srgb, #d97706 14%, transparent)", color: "#b45309" }}>
            gap {gap}
          </span>
        )}

        {editableRole && (
          <div className="ml-auto flex items-center gap-2">
            <ScaleRow value={points} onChange={setPoints} max={scaleMax} accent={accent} label="Paragraph score" />
            <button
              type="button"
              onClick={submit}
              disabled={pending}
              className="brand-btn wg-btn inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-50"
              style={{ background: `linear-gradient(135deg, ${accent}, ${accentDeep})` }}
            >
              {pending ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} strokeWidth={2.8} />}
              Save
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
