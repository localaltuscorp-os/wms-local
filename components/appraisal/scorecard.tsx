"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Check,
  X,
  Paperclip,
  ChevronDown,
  Lock,
  Sparkles,
} from "lucide-react";
import { fireToast } from "@/lib/toast";
import {
  submitSelfScore,
  submitManagerScore,
  submitManagementScore,
  approveKpi,
  updateItem,
  uploadItemAttachment,
  signAttachmentUrl,
  refreshKnowledgeSharing,
} from "@/app/(app)/appraisal/actions";
import { DeleteItemButton } from "@/components/appraisal/item-builder";

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

export interface ClientStage {
  score: number | null;
  note: string | null;
  at: string | null;
}
export interface ClientAttachment {
  id: string;
  fileName: string;
  stage: string;
}
export interface ClientItem {
  id: string;
  dimension: string;
  area: string | null;
  title: string;
  measure: string | null;
  isTechnical: boolean | null;
  isManagerOnly: boolean;
  isAuto: boolean;
  subWeight: number;
  fraction: number;
  maxPoints: number;
  earnedPoints: number;
  stage: string;
  status: string;
  actualValue: string | null;
  evidence: string | null;
  adminApproved: boolean | null;
  adminRemarks: string | null;
  self: ClientStage;
  manager: ClientStage;
  management: ClientStage;
  meta: Record<string, unknown>;
  attachments: ClientAttachment[];
}
export interface ClientDimension {
  dimension: string;
  label: string;
  weight: number;
  pct: number;
  earnedPoints: number;
  maxPoints: number;
  isAuto: boolean;
  items: ClientItem[];
}
export interface ViewerCaps {
  isAdmin: boolean;
  isSelf: boolean;
  canManager: boolean;
  cycleStatus: string;
}

export function AppraisalScorecard({
  dimensions,
  caps,
}: {
  dimensions: ClientDimension[];
  caps: ViewerCaps;
}) {
  if (dimensions.length === 0) {
    return (
      <div className="rounded-2xl bg-surface-card p-10 text-center text-[14.5px] text-ink-muted"
        style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
        No appraisal items yet. {caps.isAdmin ? "Add KPI / Skill / Attitude items and seed the standard dimensions." : "Your appraisal is being prepared."}
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      {dimensions.map((dim) => (
        <DimensionCard key={dim.dimension} dim={dim} caps={caps} />
      ))}
    </div>
  );
}

function pct(n: number): string {
  return `${Math.round(n)}%`;
}
function band(p: number): string {
  if (p >= 75) return "#16a34a";
  if (p >= 50) return "#d97706";
  return "#dc2626";
}

function DimensionCard({ dim, caps }: { dim: ClientDimension; caps: ViewerCaps }) {
  const [open, setOpen] = React.useState(true);
  const color = band(dim.pct);
  return (
    <section
      className="overflow-hidden rounded-2xl bg-surface-card"
      style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline), 0 10px 28px -22px rgba(15,23,42,0.35)" }}
    >
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-3 px-5 py-3.5 text-left"
      >
        <ChevronDown
          size={18}
          className="shrink-0 transition-transform"
          style={{ transform: open ? "none" : "rotate(-90deg)", color: "var(--color-ink-subtle)" }}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[15px] font-bold text-ink-strong">{dim.label}</span>
            {dim.isAuto && (
              <span className="inline-flex items-center gap-1 rounded-pill bg-surface-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-ink-subtle">
                <Sparkles size={10} /> Auto
              </span>
            )}
            <span className="text-[12px] font-semibold text-ink-subtle">weight {Math.round(dim.weight)}%</span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="tabular-nums text-[20px] font-black leading-none" style={{ color }}>
            {pct(dim.pct)}
          </div>
          <div className="text-[11px] text-ink-subtle tabular-nums">
            {dim.earnedPoints.toFixed(1)} / {dim.maxPoints.toFixed(1)} pts
          </div>
        </div>
      </button>
      {open && (
        <div className="border-t border-hairline px-4 py-3">
          <div className="flex flex-col gap-3">
            {dim.items.map((it) => (
              <ItemRow key={it.id} item={it} caps={caps} />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function ItemRow({ item, caps }: { item: ClientItem; caps: ViewerCaps }) {
  const color = band(item.fraction * 100);
  const isOneLiner = ["problem_solving", "growth_mindset", "ability"].includes(item.dimension);
  const finalized = item.status === "finalized" || caps.cycleStatus === "finalized";

  return (
    <div className="rounded-xl bg-surface-soft/60 p-3.5" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {item.area && <span className="text-[11px] font-semibold uppercase tracking-wide text-ink-subtle">{item.area}</span>}
            <span className="text-[14px] font-semibold text-ink-strong">{item.title}</span>
            {item.isTechnical != null && (
              <span className="rounded-pill bg-white px-2 py-0.5 text-[10px] font-bold text-ink-subtle" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
                {item.isTechnical ? "Technical" : "Non-Technical"}
              </span>
            )}
          </div>
          {item.measure && <div className="mt-0.5 text-[12px] text-ink-subtle">Measure: {item.measure}</div>}
          <div className="mt-1 text-[11px] text-ink-subtle tabular-nums">
            sub-weight {Math.round(item.subWeight)}% · max {item.maxPoints.toFixed(1)} pts
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className="tabular-nums text-[16px] font-black leading-none" style={{ color }}>
            {pct(item.fraction * 100)}
          </div>
          <div className="mt-0.5 text-[10px] uppercase tracking-wide text-ink-subtle">{item.stage === "none" ? "unscored" : item.stage}</div>
        </div>
      </div>

      {/* fill bar */}
      <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full" style={{ background: "var(--color-hairline)" }}>
        <span className="block h-full rounded-full" style={{ width: `${Math.max(2, item.fraction * 100)}%`, background: `linear-gradient(90deg, color-mix(in srgb, ${color} 70%, #fff), ${color})` }} />
      </div>

      {/* stage summary chips */}
      <div className="mt-2.5 flex flex-wrap gap-1.5">
        {item.self.score != null && <StageChip label="Self" v={item.self.score} note={item.self.note} />}
        {item.manager.score != null && <StageChip label="Manager" v={item.manager.score} note={item.manager.note} />}
        {item.management.score != null && <StageChip label="Mgmt" v={item.management.score} note={item.management.note} />}
        {item.adminApproved === false && (
          <span className="rounded-pill bg-rose-50 px-2 py-0.5 text-[11px] font-bold text-rose-700">Not Approved</span>
        )}
      </div>

      {/* attachments */}
      {item.attachments.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {item.attachments.map((a) => (
            <AttachmentChip key={a.id} att={a} />
          ))}
        </div>
      )}

      {/* action forms */}
      {!finalized && (
        <div className="mt-3 flex flex-col gap-2">
          {item.dimension === "kpi" && caps.isAdmin && <KpiAdminForm item={item} />}
          {item.dimension === "incentive" && caps.isAdmin && <AutoMetaForm item={item} kind="incentive" />}
          {item.dimension === "knowledge_sharing" && caps.isAdmin && <AutoMetaForm item={item} kind="ks" />}

          {!item.isAuto && item.dimension !== "kpi" && !item.isManagerOnly && caps.isSelf && (
            <StageForm item={item} stage="self" isOneLiner={false} />
          )}
          {!item.isAuto && item.dimension !== "kpi" && caps.canManager && (
            <StageForm item={item} stage="manager" isOneLiner={isOneLiner} />
          )}
          {!item.isAuto && item.dimension !== "kpi" && caps.isAdmin && (
            <StageForm item={item} stage="management" isOneLiner={isOneLiner} />
          )}
          {(caps.isSelf || caps.canManager || caps.isAdmin) && !item.isAuto && (
            <AttachmentUpload item={item} isSelf={caps.isSelf} />
          )}
        </div>
      )}
      {finalized && (
        <div className="mt-2 flex items-center gap-1.5 text-[11px] font-semibold text-ink-subtle">
          <Lock size={12} /> Final
        </div>
      )}

      {caps.isAdmin && (
        <div className="mt-2 flex justify-end">
          <DeleteItemButton itemId={item.id} />
        </div>
      )}
    </div>
  );
}

function StageChip({ label, v, note }: { label: string; v: number; note: string | null }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded-pill bg-white px-2 py-0.5 text-[11px] font-bold text-ink-strong"
      style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
      title={note ?? undefined}
    >
      {label} <span className="tabular-nums" style={{ color: ACCENT_DEEP }}>{v}/10</span>
    </span>
  );
}

function AttachmentChip({ att }: { att: ClientAttachment }) {
  const [busy, setBusy] = React.useState(false);
  async function open() {
    setBusy(true);
    const res = await signAttachmentUrl(att.id);
    setBusy(false);
    if (res.ok) window.open(res.url, "_blank", "noopener");
    else fireToast({ message: res.error, type: "error" });
  }
  return (
    <button
      type="button"
      onClick={open}
      className="inline-flex items-center gap-1 rounded-pill bg-white px-2 py-0.5 text-[11px] font-semibold text-ink-strong hover:underline"
      style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
    >
      {busy ? <Loader2 size={11} className="animate-spin" /> : <Paperclip size={11} />} {att.fileName}
    </button>
  );
}

const inputCls =
  "w-full rounded-lg border border-hairline bg-white px-3 py-2 text-[13px] outline-none focus:border-[color:var(--accent)] focus:ring-2 focus:ring-[color:color-mix(in_srgb,var(--accent)_25%,transparent)]";

function submitBtn(pending: boolean, label: string) {
  return (
    <button
      type="submit"
      disabled={pending}
      className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-bold text-white disabled:opacity-60"
      style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
    >
      {pending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} {label}
    </button>
  );
}

function StageForm({ item, stage, isOneLiner }: { item: ClientItem; stage: "self" | "manager" | "management"; isOneLiner: boolean }) {
  const router = useRouter();
  const existing = item[stage];
  const [score, setScore] = React.useState<string>(existing.score != null ? String(existing.score) : "");
  const [note, setNote] = React.useState<string>(existing.note ?? "");
  const [pending, start] = React.useTransition();

  const label = stage === "self" ? "Save Self Score" : stage === "manager" ? "Save Manager Score" : "Save Management Score";
  const noteRequired = stage === "manager";

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const numScore = Number(score);
    if (!Number.isFinite(numScore) || numScore < 0 || numScore > 10) {
      fireToast({ message: "Score must be 0–10.", type: "error" });
      return;
    }
    if (noteRequired && note.trim().length === 0) {
      fireToast({ message: "Manager explanation is required.", type: "error" });
      return;
    }
    start(async () => {
      const res =
        stage === "self"
          ? await submitSelfScore({ itemId: item.id, score: numScore, justification: note.trim() || undefined })
          : stage === "manager"
            ? await submitManagerScore({ itemId: item.id, score: numScore, explanation: note.trim() })
            : await submitManagementScore({ itemId: item.id, score: numScore, explanation: note.trim() || undefined });
      if (res.ok) {
        fireToast({ message: `${stage === "self" ? "Self" : stage === "manager" ? "Manager" : "Management"} score saved.`, type: "success" });
        router.refresh();
      } else fireToast({ message: res.error, type: "error" });
    });
  }

  return (
    <form onSubmit={onSubmit} className="rounded-lg bg-white/70 p-2.5" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
      <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-subtle">
        {stage === "self" ? "Your self score" : stage === "manager" ? "Manager score" : "Management score"}
      </div>
      <div className="flex flex-wrap items-start gap-2">
        {isOneLiner ? (
          <div className="flex gap-1.5">
            <YesNo active={score === "10"} onClick={() => setScore("10")} label="Yes" yes />
            <YesNo active={score === "0"} onClick={() => setScore("0")} label="No" />
          </div>
        ) : (
          <input
            type="number"
            min={0}
            max={10}
            step={0.5}
            value={score}
            onChange={(e) => setScore(e.target.value)}
            placeholder="0–10"
            className={inputCls}
            style={{ maxWidth: 96, ["--accent" as string]: ACCENT }}
          />
        )}
        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder={noteRequired ? "Explanation (required)" : stage === "self" ? "Justification (optional)" : "Explanation (optional)"}
          className={inputCls}
          style={{ flex: 1, minWidth: 180, ["--accent" as string]: ACCENT }}
        />
        {submitBtn(pending, label)}
      </div>
    </form>
  );
}

function YesNo({ active, onClick, label, yes }: { active: boolean; onClick: () => void; label: string; yes?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-lg px-3 py-2 text-[13px] font-bold"
      style={
        active
          ? { background: yes ? "#16a34a" : "#dc2626", color: "#fff" }
          : { background: "#fff", color: "var(--color-ink-subtle)", boxShadow: "inset 0 0 0 1px var(--color-hairline)" }
      }
    >
      {label}
    </button>
  );
}

function KpiAdminForm({ item }: { item: ClientItem }) {
  const router = useRouter();
  const [actual, setActual] = React.useState(item.actualValue ?? "");
  const [evidence, setEvidence] = React.useState(item.evidence ?? "");
  const [score, setScore] = React.useState(item.management.score != null ? String(item.management.score) : "");
  const [remarks, setRemarks] = React.useState(item.adminRemarks ?? "");
  const [pending, start] = React.useTransition();

  function save(approved: boolean) {
    const numScore = Number(score);
    if (approved && (!Number.isFinite(numScore) || numScore < 0 || numScore > 10)) {
      fireToast({ message: "Enter a score 0–10 to approve.", type: "error" });
      return;
    }
    if (!approved && remarks.trim().length === 0) {
      fireToast({ message: "Remarks are required when not approving.", type: "error" });
      return;
    }
    start(async () => {
      // Persist the KPI actual/evidence first, then the verdict.
      await updateItem({ itemId: item.id, actualValue: actual.trim() || null, evidence: evidence.trim() || null });
      const res = await approveKpi({ itemId: item.id, approved, remarks: remarks.trim() || undefined, score: approved ? numScore : undefined });
      if (res.ok) {
        fireToast({ message: approved ? "KPI approved." : "KPI marked not approved.", type: "success" });
        router.refresh();
      } else fireToast({ message: res.error, type: "error" });
    });
  }

  return (
    <div className="rounded-lg bg-white/70 p-2.5" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
      <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-subtle">Admin: fill + approve</div>
      <div className="grid grid-cols-2 gap-2 max-sm:grid-cols-1">
        <input value={actual} onChange={(e) => setActual(e.target.value)} placeholder="Actual value" className={inputCls} style={{ ["--accent" as string]: ACCENT }} />
        <input value={evidence} onChange={(e) => setEvidence(e.target.value)} placeholder="Evidence" className={inputCls} style={{ ["--accent" as string]: ACCENT }} />
        <input type="number" min={0} max={10} step={0.5} value={score} onChange={(e) => setScore(e.target.value)} placeholder="Score 0–10" className={inputCls} style={{ ["--accent" as string]: ACCENT }} />
        <input value={remarks} onChange={(e) => setRemarks(e.target.value)} placeholder="Remarks (if not approved)" className={inputCls} style={{ ["--accent" as string]: ACCENT }} />
      </div>
      <div className="mt-2 flex gap-2">
        <button type="button" onClick={() => save(true)} disabled={pending} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-bold text-white disabled:opacity-60" style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}>
          {pending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Approve
        </button>
        <button type="button" onClick={() => save(false)} disabled={pending} className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-[13px] font-bold text-rose-700 disabled:opacity-60" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
          <X size={14} /> Not Approved
        </button>
      </div>
    </div>
  );
}

function AutoMetaForm({ item, kind }: { item: ClientItem; kind: "incentive" | "ks" }) {
  const router = useRouter();
  const m = item.meta;
  const [a, setA] = React.useState(String(kind === "incentive" ? (m.earned ?? "") : (m.done ?? "")));
  const [b, setB] = React.useState(String(kind === "incentive" ? (m.baseSalary ?? "") : (m.given ?? "")));
  const [c, setC] = React.useState(String(kind === "incentive" ? (m.targetPct ?? "") : ""));
  const [pending, start] = React.useTransition();

  function pullFromTraining() {
    start(async () => {
      const res = await refreshKnowledgeSharing(item.id);
      if (res.ok) {
        setA(String(res.done));
        setB(String(res.given));
        fireToast({ message: `Pulled from Training: ${res.done} attended · ${res.given} delivered.`, type: "success" });
        router.refresh();
      } else fireToast({ message: res.error, type: "error" });
    });
  }

  function save() {
    const meta =
      kind === "incentive"
        ? { earned: Number(a) || 0, baseSalary: Number(b) || 0, targetPct: Number(c) || undefined }
        : { done: Number(a) || 0, given: Number(b) || 0 };
    start(async () => {
      const res = await updateItem({ itemId: item.id, meta });
      if (res.ok) {
        fireToast({ message: "Saved. Score recomputed.", type: "success" });
        router.refresh();
      } else fireToast({ message: res.error, type: "error" });
    });
  }

  return (
    <div className="rounded-lg bg-white/70 p-2.5" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
      <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-ink-subtle">
        {kind === "incentive" ? "Admin: incentive inputs (auto-scored)" : "Admin: training counts (auto-scored)"}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <input type="number" value={a} onChange={(e) => setA(e.target.value)} placeholder={kind === "incentive" ? "Earned ₹" : "Sessions attended"} className={inputCls} style={{ maxWidth: 160, ["--accent" as string]: ACCENT }} />
        <input type="number" value={b} onChange={(e) => setB(e.target.value)} placeholder={kind === "incentive" ? "Base salary ₹" : "Sessions delivered"} className={inputCls} style={{ maxWidth: 160, ["--accent" as string]: ACCENT }} />
        {kind === "incentive" && (
          <input type="number" value={c} onChange={(e) => setC(e.target.value)} placeholder="Target %" className={inputCls} style={{ maxWidth: 120, ["--accent" as string]: ACCENT }} />
        )}
        {kind === "ks" && (
          <button type="button" onClick={pullFromTraining} disabled={pending} className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3.5 py-2 text-[13px] font-bold text-ink-strong disabled:opacity-60" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
            {pending ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} Pull from Training
          </button>
        )}
        <button type="button" onClick={save} disabled={pending} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[13px] font-bold text-white disabled:opacity-60" style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}>
          {pending ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save
        </button>
      </div>
    </div>
  );
}

function AttachmentUpload({ item, isSelf }: { item: ClientItem; isSelf: boolean }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  const inputRef = React.useRef<HTMLInputElement>(null);

  function onPick(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const fd = new FormData();
    fd.set("itemId", item.id);
    fd.set("stage", isSelf ? "self" : "manager");
    fd.set("file", file);
    start(async () => {
      const res = await uploadItemAttachment(fd);
      if (res.ok) {
        fireToast({ message: "Attachment uploaded.", type: "success" });
        router.refresh();
      } else fireToast({ message: res.error, type: "error" });
      if (inputRef.current) inputRef.current.value = "";
    });
  }

  return (
    <div>
      <input ref={inputRef} type="file" className="hidden" onChange={onPick} />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-[12px] font-semibold text-ink-strong disabled:opacity-60"
        style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
      >
        {pending ? <Loader2 size={12} className="animate-spin" /> : <Paperclip size={12} />} Attach Evidence
      </button>
    </div>
  );
}
