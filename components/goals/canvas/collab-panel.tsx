"use client";

/**
 * Goals Canvas — COLLABORATION PANEL (Phase 7, design §2.2 narrative rows +
 * §4.1 LinkedEntities / EvidenceGallery / CommentsThread / ActivityFeed +
 * §4.4). Fills the LEFT ParentContextPanel's placeholder sections with LIVE
 * data and folds the real /goals/review scorecard into the same rail.
 *
 * DATA: everything loads lazily through ONE batched `goalDetailBundle` server
 * action on peek/expand (§3.3), cached behind the app-wide QueryClientProvider
 * (components/providers.tsx) with per-goalId keys — drilling away and back
 * does NOT refetch (staleTime 60s); mutations patch the cache in place.
 *
 * Comments UI is a domain port of components/tasks/audit-event.tsx (the task
 * 'commented' pattern): author + relative time, 15-min author edit window /
 * admin override, ⌘Enter save · Esc cancel, hover-revealed affordances.
 *
 * HARD LAWS: zero queries outside the bundle; amber identity; motion/react
 * reduced-motion-gated; no CSS zoom/transform on ancestors; keyboard-first.
 */

import * as React from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import {
  Activity,
  Award,
  Building2,
  CalendarDays,
  Check,
  CheckCircle2,
  FileText,
  FolderKanban,
  Gauge,
  Link2,
  ListChecks,
  Loader2,
  MessageSquare,
  Paperclip,
  Pencil,
  Plus,
  RefreshCw,
  Reply,
  ShieldAlert,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { fireToast } from "@/lib/toast";
import {
  goalCode,
  pctTone,
  type GoalDTO,
} from "@/components/goals/cascade/util";
import { ACCENT, ACCENT_DEEP, accentMix } from "./tokens";
import {
  addGoalComment,
  addGoalDependency,
  addGoalLink,
  deleteGoalComment,
  editGoalComment,
  goalDetailBundle,
  removeGoalAttachment,
  removeGoalDependency,
  removeGoalLink,
  resolveGoalDependency,
  uploadGoalAttachment,
  type DetailActivity,
  type DetailComment,
  type GoalDetailBundle,
  type LinkKind,
  type NodeKind,
} from "@/app/(app)/goals/cascade/detail-actions";
import { reviewGoal } from "@/app/(app)/goals/review/actions";
import { useCanvasShell } from "./shell-context";

/* ------------------------------------------------------------------ */

/* Accent + ramp come from the design contract (tokens.ts, §2.0). */

const COMMENT_EDIT_WINDOW_MS = 15 * 60 * 1000;

export interface CollabNode {
  kind: NodeKind;
  id: string;
}

function SectionHeader({ icon, children, right }: { icon?: React.ReactNode; children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-[0.14em] text-ink-subtle">
      {icon}
      {children}
      {right != null && <span className="ml-auto">{right}</span>}
    </div>
  );
}

function timeAgo(isoDate: string): string {
  try {
    return formatDistanceToNow(new Date(isoDate), { addSuffix: true });
  } catch {
    return "";
  }
}

function fmtBytes(n: number | null): string {
  if (n == null) return "";
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

/* ------------------------------------------------------------------ */
/* The lazy bundle hook — cached per goalId behind QueryClientProvider */
/* ------------------------------------------------------------------ */

const detailKey = (node: CollabNode) => ["goal-detail", node.kind, node.id] as const;

function useGoalDetail(node: CollabNode) {
  return useQuery<GoalDetailBundle, Error>({
    queryKey: detailKey(node),
    queryFn: async () => {
      const res = await goalDetailBundle({ id: node.id, kind: node.kind });
      if (!res.ok) throw new Error(res.error);
      return res.bundle;
    },
    staleTime: 60_000,
    retry: 1,
  });
}

/** In-place cache patch after a mutation — no refetch on success. */
function useBundlePatch(node: CollabNode) {
  const qc = useQueryClient();
  return React.useCallback(
    (fn: (b: GoalDetailBundle) => GoalDetailBundle) => {
      qc.setQueryData<GoalDetailBundle>(detailKey(node), (old) => (old ? fn(old) : old));
    },
    [qc, node.kind, node.id], // eslint-disable-line react-hooks/exhaustive-deps
  );
}

/* ------------------------------------------------------------------ */
/* Shared micro-UI                                                     */
/* ------------------------------------------------------------------ */

function GhostButton(props: {
  onClick: () => void;
  icon?: React.ReactNode;
  children: React.ReactNode;
  title?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      disabled={props.disabled}
      title={props.title}
      className="inline-flex items-center gap-1 rounded-chip border px-2 py-0.5 text-[11px] font-bold text-ink-muted transition-colors hover:text-ink-strong disabled:opacity-50"
      style={{ borderColor: "var(--color-hairline-strong)" }}
    >
      {props.icon}
      {props.children}
    </button>
  );
}

function IconButton(props: {
  onClick: () => void;
  label: string;
  busy?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      aria-label={props.label}
      title={props.label}
      className="rounded-md p-1 text-ink-subtle transition-colors hover:bg-surface-soft hover:text-ink-strong"
    >
      {props.busy ? <Loader2 size={12} className="animate-spin" /> : props.children}
    </button>
  );
}

function SkeletonRows({ n }: { n: number }) {
  return (
    <div className="mt-2 space-y-2" aria-hidden>
      {Array.from({ length: n }, (_, i) => (
        <div
          key={i}
          className="h-6 animate-pulse rounded-lg"
          style={{ background: "var(--color-surface-soft)", animationDelay: `${i * 120}ms` }}
        />
      ))}
    </div>
  );
}

function MigrationNote() {
  return (
    <p
      className="mt-1.5 rounded-lg px-2.5 py-1.5 text-[11.5px] font-semibold"
      style={{ color: "#9a3412", background: "rgba(154,52,29,0.08)" }}
    >
      Collaboration data isn&apos;t provisioned yet — migration 0142 must be applied
      before links, comments and the gallery go live.
    </p>
  );
}

/* ------------------------------------------------------------------ */
/* Review scorecard (§ Phase 7 — the real /goals/review, in the rail)  */
/* ------------------------------------------------------------------ */

function ScoreBar({ label, pct, color }: { label: string; pct: number | null; color: string }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-[0.08em] text-ink-subtle">{label}</span>
        <span className="text-[13px] font-black tabular-nums" style={{ color: pct == null ? "var(--color-ink-faint, #94a3b8)" : color }}>
          {pct == null ? "—" : `${pct}%`}
        </span>
      </div>
      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full" style={{ background: accentMix(10) }}>
        <div
          className="h-full rounded-full transition-[width] duration-500 ease-out"
          style={{ width: `${pct ?? 0}%`, background: color }}
        />
      </div>
    </div>
  );
}

function ReviewScorecard({ g, bundle, node }: { g: GoalDTO; bundle: GoalDetailBundle | undefined; node: CollabNode }) {
  const shell = useCanvasShell();
  const canReview = shell.canReview === true;
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [pct, setPct] = React.useState<string>(g.acceptPct == null ? "" : String(g.acceptPct));
  const [note, setNote] = React.useState<string>(g.reviewNotes ?? "");
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    setPct(g.acceptPct == null ? "" : String(g.acceptPct));
    setNote(g.reviewNotes ?? "");
    setOpen(false);
  }, [g.id, g.acceptPct, g.reviewNotes]);

  const commit = () => {
    const parsed = pct.trim() === "" ? null : Math.max(0, Math.min(100, Math.round(Number(pct))));
    if (parsed !== null && !Number.isFinite(parsed)) {
      fireToast({ message: "Accept % must be a number 0–100." });
      return;
    }
    setBusy(true);
    void shell.mutation
      .mutate(
        { type: "update", id: g.id, fields: { acceptPct: parsed, reviewNotes: note.trim() || null } },
        () => reviewGoal({ id: g.id, acceptPct: parsed, reviewNotes: note.trim() || null }),
      )
      .then((ok) => {
        if (ok) {
          setOpen(false);
          // The review appended a goal_reviews history row — refresh the bundle.
          void qc.invalidateQueries({ queryKey: detailKey(node) });
        }
      })
      .finally(() => setBusy(false));
  };

  const selfTone = pctTone(g.pctDone);
  const mgrTone = pctTone(g.acceptPct ?? 0);
  const reviews = bundle?.reviews ?? [];

  return (
    <section className="border-t px-5 py-3.5" style={{ borderColor: "var(--color-hairline)" }}>
      <SectionHeader
        icon={<Gauge size={12} strokeWidth={2.6} />}
        right={
          canReview ? (
            <GhostButton onClick={() => setOpen((o) => !o)} icon={<Pencil size={11} strokeWidth={2.6} />}>
              {g.acceptPct == null ? "Review" : "Re-review"}
            </GhostButton>
          ) : undefined
        }
      >
        Review scorecard
      </SectionHeader>

      <div className="mt-2.5 grid grid-cols-2 gap-3">
        <ScoreBar label="Self-rated" pct={g.pctDone} color={selfTone.color} />
        <ScoreBar label="Manager-accepted" pct={g.acceptPct} color={g.acceptPct == null ? "var(--color-ink-faint, #94a3b8)" : mgrTone.color} />
      </div>

      {g.reviewNotes && !open && (
        <p
          className="mt-2.5 rounded-lg px-3 py-2 text-[12.5px] font-medium leading-relaxed text-ink-soft"
          style={{ background: "var(--color-surface-soft)", borderLeft: `2px solid ${ACCENT}` }}
        >
          {g.reviewNotes}
        </p>
      )}
      {!canReview && g.acceptPct == null && (
        <p className="mt-2 text-[11.5px] font-semibold text-ink-faint">
          Awaiting a manager review — the accept % is manager-owned.
        </p>
      )}

      {open && canReview && (
        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2">
            <input
              autoFocus
              inputMode="numeric"
              value={pct}
              onChange={(e) => setPct(e.target.value.replace(/[^\d]/g, "").slice(0, 3))}
              onKeyDown={(e) => {
                if (e.key === "Enter") commit();
                if (e.key === "Escape") setOpen(false);
              }}
              placeholder="—"
              aria-label="Accept percent"
              className="w-16 rounded-md border px-2 py-1.5 text-center text-[14px] font-black tabular-nums outline-none focus:ring-2"
              style={{ borderColor: "var(--color-hairline-strong)" }}
            />
            <span className="text-[12px] font-bold text-ink-subtle">% accepted</span>
            <div className="ml-auto flex gap-1">
              {[0, 25, 50, 75, 100].map((v) => (
                <button
                  key={v}
                  type="button"
                  onClick={() => setPct(String(v))}
                  className="rounded px-1.5 py-0.5 text-[10.5px] font-black tabular-nums transition-colors"
                  style={{
                    color: pct === String(v) ? "#fff" : ACCENT_DEEP,
                    background: pct === String(v) ? ACCENT_DEEP : accentMix(10),
                  }}
                >
                  {v}
                </button>
              ))}
            </div>
          </div>
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") commit();
              if (e.key === "Escape") setOpen(false);
            }}
            rows={2}
            placeholder="Review note (visible to the owner)…"
            className="w-full resize-y rounded-md border p-2.5 text-[13px] leading-relaxed outline-none"
            style={{ borderColor: "var(--color-hairline-strong)" }}
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={commit}
              disabled={busy}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12.5px] font-black text-white disabled:opacity-50"
              style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
            >
              {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} strokeWidth={2.8} />}
              Save Review
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md px-2.5 py-1.5 text-[12.5px] font-bold text-ink-muted hover:bg-surface-soft"
            >
              Cancel
            </button>
            <span className="text-[11px] text-ink-faint">⌘Enter · Esc</span>
          </div>
        </div>
      )}

      {reviews.length > 0 && (
        <details className="mt-2.5">
          <summary className="cursor-pointer select-none text-[11.5px] font-bold text-ink-subtle hover:text-ink-strong">
            Review history · {reviews.length}
          </summary>
          <ul className="mt-1.5 space-y-1.5">
            {reviews.map((r) => (
              <li key={r.id} className="flex items-baseline gap-2 text-[12px] font-semibold text-ink-muted">
                <span className="tabular-nums font-black text-ink-strong">
                  {r.selfPct ?? "—"}% → {r.managerPct == null ? "—" : `${r.managerPct}%`}
                </span>
                <span className="truncate">{r.reviewerName ?? "Someone"}{r.note ? ` — ${r.note}` : ""}</span>
                <span className="ml-auto shrink-0 text-[10.5px] tabular-nums text-ink-faint">{timeAgo(r.createdAt)}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Linked entities                                                     */
/* ------------------------------------------------------------------ */

const LINK_KIND_META: Record<LinkKind, { label: string; icon: React.ReactNode }> = {
  task: { label: "Task", icon: <ListChecks size={11} strokeWidth={2.6} /> },
  project: { label: "Project", icon: <FolderKanban size={11} strokeWidth={2.6} /> },
  kpi: { label: "KPI", icon: <Gauge size={11} strokeWidth={2.6} /> },
  incentive: { label: "Incentive", icon: <Award size={11} strokeWidth={2.6} /> },
  calendar: { label: "Meeting", icon: <CalendarDays size={11} strokeWidth={2.6} /> },
  department: { label: "Dept", icon: <Building2 size={11} strokeWidth={2.6} /> },
};

function LinksSection({ node, bundle, loading }: { node: CollabNode; bundle: GoalDetailBundle | undefined; loading: boolean }) {
  const shell = useCanvasShell();
  const patch = useBundlePatch(node);
  const [adding, setAdding] = React.useState(false);
  const [kind, setKind] = React.useState<LinkKind>("task");
  const [label, setLabel] = React.useState("");
  const [url, setUrl] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);

  React.useEffect(() => {
    setAdding(false);
    setLabel("");
    setUrl("");
  }, [node.id]);

  const links = bundle?.links ?? [];

  const submit = () => {
    if (!label.trim()) {
      fireToast({ message: "Give the link a label." });
      return;
    }
    setBusy("add");
    void addGoalLink({ node, kind, label: label.trim(), url: url.trim() || null })
      .then((res) => {
        if (!res.ok) {
          fireToast({ message: res.error });
          return;
        }
        patch((b) => ({ ...b, links: [res.link, ...b.links] }));
        setLabel("");
        setUrl("");
        setAdding(false);
      })
      .finally(() => setBusy(null));
  };

  const remove = (id: string) => {
    setBusy(id);
    void removeGoalLink({ id })
      .then((res) => {
        if (!res.ok) {
          fireToast({ message: res.error });
          return;
        }
        patch((b) => ({ ...b, links: b.links.filter((l) => l.id !== id) }));
      })
      .finally(() => setBusy(null));
  };

  return (
    <section className="border-t px-5 py-3.5" style={{ borderColor: "var(--color-hairline)" }}>
      <SectionHeader
        icon={<Link2 size={12} strokeWidth={2.6} />}
        right={
          shell.canWrite && bundle?.collabReady !== false ? (
            <GhostButton onClick={() => setAdding((o) => !o)} icon={<Plus size={11} strokeWidth={2.8} />}>
              Link
            </GhostButton>
          ) : undefined
        }
      >
        Linked tasks · KPIs · incentives
      </SectionHeader>

      {loading && <SkeletonRows n={2} />}
      {!loading && bundle?.collabReady === false && <MigrationNote />}

      {!loading && links.length === 0 && bundle?.collabReady !== false && !adding && (
        <p className="mt-1.5 text-[12px] font-semibold text-ink-faint">
          Nothing linked yet — connect the tasks, KPIs or incentives this objective drives.
        </p>
      )}

      {links.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {links.map((l) => {
            const meta = LINK_KIND_META[l.kind];
            const inner = (
              <>
                <span style={{ color: ACCENT_DEEP }}>{meta.icon}</span>
                <span className="text-[10px] font-black uppercase tracking-[0.06em] text-ink-subtle">{meta.label}</span>
                <span className="max-w-[180px] truncate text-[11.5px] font-bold text-ink-strong">{l.label}</span>
              </>
            );
            return (
              <span
                key={l.id}
                className="group inline-flex items-center gap-1.5 rounded-chip border px-2 py-1"
                style={{ borderColor: "var(--color-hairline)", background: "var(--color-surface-card)" }}
                title={l.createdByName ? `Linked by ${l.createdByName}` : undefined}
              >
                {l.url ? (
                  <a href={l.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:underline">
                    {inner}
                  </a>
                ) : (
                  inner
                )}
                {shell.canWrite && (
                  <button
                    type="button"
                    onClick={() => remove(l.id)}
                    aria-label={`Remove link ${l.label}`}
                    className="opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    {busy === l.id ? (
                      <Loader2 size={11} className="animate-spin text-ink-subtle" />
                    ) : (
                      <X size={11} strokeWidth={2.8} className="text-ink-subtle hover:text-ink-strong" />
                    )}
                  </button>
                )}
              </span>
            );
          })}
        </div>
      )}

      {adding && (
        <div className="mt-2.5 space-y-2">
          <div className="flex flex-wrap gap-1">
            {(Object.keys(LINK_KIND_META) as LinkKind[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className="inline-flex items-center gap-1 rounded-chip px-2 py-0.5 text-[10.5px] font-black uppercase tracking-[0.06em]"
                style={{
                  color: kind === k ? "#fff" : ACCENT_DEEP,
                  background: kind === k ? ACCENT_DEEP : accentMix(8),
                }}
              >
                {LINK_KIND_META[k].icon}
                {LINK_KIND_META[k].label}
              </button>
            ))}
          </div>
          <input
            autoFocus
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") setAdding(false);
            }}
            placeholder={`Name the ${LINK_KIND_META[kind].label.toLowerCase()}…`}
            className="w-full rounded-md border px-2.5 py-1.5 text-[13px] font-semibold outline-none"
            style={{ borderColor: "var(--color-hairline-strong)" }}
          />
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") setAdding(false);
            }}
            placeholder="Optional URL (deep-link)…"
            className="w-full rounded-md border px-2.5 py-1.5 text-[12.5px] outline-none"
            style={{ borderColor: "var(--color-hairline-strong)" }}
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={busy === "add"}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-black text-white disabled:opacity-50"
              style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
            >
              {busy === "add" ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} strokeWidth={2.8} />}
              Add Link
            </button>
            <button type="button" onClick={() => setAdding(false)} className="rounded-md px-2.5 py-1.5 text-[12px] font-bold text-ink-muted hover:bg-surface-soft">
              Cancel
            </button>
            <span className="text-[11px] text-ink-faint">Enter · Esc</span>
          </div>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Dependencies + blockers                                             */
/* ------------------------------------------------------------------ */

function DependenciesSection({ node, bundle, loading }: { node: CollabNode; bundle: GoalDetailBundle | undefined; loading: boolean }) {
  const shell = useCanvasShell();
  const patch = useBundlePatch(node);
  const [adding, setAdding] = React.useState(false);
  const [kind, setKind] = React.useState<"depends_on" | "blocked_by">("blocked_by");
  const [targetId, setTargetId] = React.useState<string>("");
  const [label, setLabel] = React.useState("");
  const [busy, setBusy] = React.useState<string | null>(null);

  React.useEffect(() => {
    setAdding(false);
    setTargetId("");
    setLabel("");
  }, [node.id]);

  const deps = bundle?.dependencies ?? [];
  const openBlockers = deps.filter((d) => d.kind === "blocked_by" && !d.resolvedAt).length;

  // Candidate goal targets from the ALREADY-LOADED optimistic tree (zero queries).
  const candidates = React.useMemo(
    () =>
      shell.goals
        .filter((g) => !(node.kind === "cascade" && g.id === node.id))
        .slice()
        .sort((a, b) => a.periodKey.localeCompare(b.periodKey) || a.position - b.position),
    [shell.goals, node.kind, node.id],
  );

  const submit = () => {
    const target = targetId ? { id: targetId, kind: "cascade" as const } : null;
    if (!target && !label.trim()) {
      fireToast({ message: "Pick a goal or name the blocker." });
      return;
    }
    setBusy("add");
    void addGoalDependency({ node, kind, target, label: label.trim() || null })
      .then((res) => {
        if (!res.ok) {
          fireToast({ message: res.error });
          return;
        }
        patch((b) => ({ ...b, dependencies: [res.dependency, ...b.dependencies] }));
        setAdding(false);
        setTargetId("");
        setLabel("");
      })
      .finally(() => setBusy(null));
  };

  const toggle = (id: string, resolved: boolean) => {
    setBusy(id);
    void resolveGoalDependency({ id, resolved })
      .then((res) => {
        if (!res.ok) {
          fireToast({ message: res.error });
          return;
        }
        patch((b) => ({
          ...b,
          dependencies: b.dependencies.map((d) => (d.id === id ? res.dependency : d)),
        }));
      })
      .finally(() => setBusy(null));
  };

  const remove = (id: string) => {
    setBusy(id);
    void removeGoalDependency({ id })
      .then((res) => {
        if (!res.ok) {
          fireToast({ message: res.error });
          return;
        }
        patch((b) => ({ ...b, dependencies: b.dependencies.filter((d) => d.id !== id) }));
      })
      .finally(() => setBusy(null));
  };

  return (
    <section className="border-t px-5 py-3.5" style={{ borderColor: "var(--color-hairline)" }}>
      <SectionHeader
        icon={<ShieldAlert size={12} strokeWidth={2.6} />}
        right={
          shell.canWrite && bundle?.collabReady !== false ? (
            <GhostButton onClick={() => setAdding((o) => !o)} icon={<Plus size={11} strokeWidth={2.8} />}>
              Add
            </GhostButton>
          ) : undefined
        }
      >
        Dependencies · blockers
        {openBlockers > 0 && (
          <span
            className="ml-1 rounded-full px-1.5 py-0.5 text-[9.5px] font-black tabular-nums text-white"
            style={{ background: "#b91c1c" }}
            title={`${openBlockers} open blocker${openBlockers === 1 ? "" : "s"}`}
          >
            {openBlockers}
          </span>
        )}
      </SectionHeader>

      {loading && <SkeletonRows n={1} />}

      {!loading && deps.length === 0 && bundle?.collabReady !== false && !adding && (
        <p className="mt-1.5 text-[12px] font-semibold text-ink-faint">No dependencies — this objective stands alone.</p>
      )}

      {deps.length > 0 && (
        <ul className="mt-2 space-y-1.5">
          {deps.map((d) => {
            const resolved = d.resolvedAt != null;
            const isBlocker = d.kind === "blocked_by";
            return (
              <li key={d.id} className="group flex items-center gap-2">
                <span
                  className="shrink-0 rounded-chip px-1.5 py-0.5 text-[9.5px] font-black uppercase tracking-[0.06em]"
                  style={{
                    color: resolved ? "#15803d" : isBlocker ? "#b91c1c" : ACCENT_DEEP,
                    background: resolved
                      ? "color-mix(in srgb, #15803d 10%, transparent)"
                      : isBlocker
                        ? "rgba(185,28,28,0.10)"
                        : accentMix(10),
                  }}
                >
                  {resolved ? "resolved" : isBlocker ? "blocked by" : "depends on"}
                </span>
                <span
                  className="min-w-0 truncate text-[12.5px] font-bold"
                  style={{
                    color: resolved ? "var(--color-ink-faint, #94a3b8)" : "var(--color-ink-strong)",
                    textDecoration: resolved ? "line-through" : "none",
                  }}
                >
                  {d.label}
                </span>
                {shell.canWrite && (
                  <span className="ml-auto flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100">
                    <IconButton onClick={() => toggle(d.id, !resolved)} label={resolved ? "Reopen" : "Mark resolved"} busy={busy === d.id}>
                      <CheckCircle2 size={13} strokeWidth={2.4} style={{ color: resolved ? "#15803d" : undefined }} />
                    </IconButton>
                    <IconButton onClick={() => remove(d.id)} label="Remove dependency">
                      <Trash2 size={12} strokeWidth={2.4} />
                    </IconButton>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {adding && (
        <div className="mt-2.5 space-y-2">
          <div className="flex gap-1">
            {(["blocked_by", "depends_on"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className="rounded-chip px-2 py-0.5 text-[10.5px] font-black uppercase tracking-[0.06em]"
                style={{
                  color: kind === k ? "#fff" : k === "blocked_by" ? "#b91c1c" : ACCENT_DEEP,
                  background:
                    kind === k
                      ? k === "blocked_by"
                        ? "#b91c1c"
                        : ACCENT_DEEP
                      : k === "blocked_by"
                        ? "rgba(185,28,28,0.10)"
                        : accentMix(8),
                }}
              >
                {k === "blocked_by" ? "Blocked by" : "Depends on"}
              </button>
            ))}
          </div>
          <select
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
            className="w-full rounded-md border px-2 py-1.5 text-[12.5px] font-semibold outline-none"
            style={{ borderColor: "var(--color-hairline-strong)" }}
            aria-label="Pick a goal this depends on"
          >
            <option value="">External / free-text (name it below)…</option>
            {candidates.map((g) => (
              <option key={g.id} value={g.id}>
                {goalCode(g)} · {g.title.slice(0, 60)}
              </option>
            ))}
          </select>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
              if (e.key === "Escape") setAdding(false);
            }}
            placeholder={targetId ? "Optional note (defaults to the goal's title)…" : "Name the external blocker…"}
            className="w-full rounded-md border px-2.5 py-1.5 text-[13px] font-semibold outline-none"
            style={{ borderColor: "var(--color-hairline-strong)" }}
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={busy === "add"}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-black text-white disabled:opacity-50"
              style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
            >
              {busy === "add" ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} strokeWidth={2.8} />}
              Add
            </button>
            <button type="button" onClick={() => setAdding(false)} className="rounded-md px-2.5 py-1.5 text-[12px] font-bold text-ink-muted hover:bg-surface-soft">
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Evidence gallery (documents reuse — signed-URL semantics)           */
/* ------------------------------------------------------------------ */

function EvidenceSection({ node, bundle, loading }: { node: CollabNode; bundle: GoalDetailBundle | undefined; loading: boolean }) {
  const shell = useCanvasShell();
  const patch = useBundlePatch(node);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const [busy, setBusy] = React.useState<string | null>(null);

  const attachments = bundle?.attachments ?? [];

  const upload = (file: File) => {
    const form = new FormData();
    form.set("nodeId", node.id);
    form.set("nodeKind", node.kind);
    form.set("file", file);
    setBusy("upload");
    void uploadGoalAttachment(form)
      .then((res) => {
        if (!res.ok) {
          fireToast({ message: res.error });
          return;
        }
        patch((b) => ({ ...b, attachments: [res.attachment, ...b.attachments] }));
        fireToast({ message: "Evidence attached." });
      })
      .finally(() => {
        setBusy(null);
        if (inputRef.current) inputRef.current.value = "";
      });
  };

  const remove = (id: string) => {
    setBusy(id);
    void removeGoalAttachment({ id })
      .then((res) => {
        if (!res.ok) {
          fireToast({ message: res.error });
          return;
        }
        patch((b) => ({ ...b, attachments: b.attachments.filter((a) => a.id !== id) }));
      })
      .finally(() => setBusy(null));
  };

  return (
    <section className="border-t px-5 py-3.5" style={{ borderColor: "var(--color-hairline)" }}>
      <SectionHeader
        icon={<Paperclip size={12} strokeWidth={2.6} />}
        right={
          shell.canWrite && bundle?.collabReady !== false ? (
            <GhostButton
              onClick={() => inputRef.current?.click()}
              icon={busy === "upload" ? <Loader2 size={11} className="animate-spin" /> : <Upload size={11} strokeWidth={2.6} />}
              disabled={busy === "upload"}
            >
              Upload
            </GhostButton>
          ) : undefined
        }
      >
        Evidence
      </SectionHeader>
      <input
        ref={inputRef}
        type="file"
        className="hidden"
        aria-hidden
        tabIndex={-1}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) upload(f);
        }}
      />

      {loading && <SkeletonRows n={2} />}

      {!loading && attachments.length === 0 && !bundle?.legacyEvidenceUrl && bundle?.collabReady !== false && (
        <p className="mt-1.5 text-[12px] font-semibold text-ink-faint">
          No evidence yet — attach screenshots, sheets or documents that prove the work.
        </p>
      )}

      {(attachments.length > 0 || bundle?.legacyEvidenceUrl) && (
        <ul className="mt-2 space-y-1.5">
          {bundle?.legacyEvidenceUrl && (
            <li className="flex items-center gap-2">
              <FileText size={14} strokeWidth={2.2} className="shrink-0 text-ink-subtle" />
              <a
                href={bundle.legacyEvidenceUrl}
                target="_blank"
                rel="noreferrer"
                className="min-w-0 truncate text-[12.5px] font-bold text-ink-strong hover:underline"
              >
                Evidence Link
              </a>
              <span
                className="shrink-0 rounded-chip px-1.5 py-0.5 text-[9px] font-black uppercase tracking-[0.08em] text-ink-subtle"
                style={{ background: "var(--color-surface-soft)" }}
              >
                legacy
              </span>
            </li>
          )}
          {attachments.map((a) => (
            <li key={a.id} className="group flex items-center gap-2">
              <FileText size={14} strokeWidth={2.2} className="shrink-0" style={{ color: ACCENT_DEEP }} />
              {a.url ? (
                <a href={a.url} target="_blank" rel="noreferrer" className="min-w-0 truncate text-[12.5px] font-bold text-ink-strong hover:underline">
                  {a.title}
                </a>
              ) : (
                <span className="min-w-0 truncate text-[12.5px] font-bold text-ink-muted" title="Couldn't sign a download URL — retry later">
                  {a.title}
                </span>
              )}
              <span className="shrink-0 text-[10.5px] font-bold tabular-nums text-ink-faint">{fmtBytes(a.sizeBytes)}</span>
              <span className="ml-auto shrink-0 text-[10.5px] tabular-nums text-ink-faint">{timeAgo(a.createdAt)}</span>
              {shell.canWrite && (
                <span className="shrink-0 opacity-0 transition-opacity group-hover:opacity-100">
                  <IconButton onClick={() => remove(a.id)} label={`Remove ${a.title}`} busy={busy === a.id}>
                    <Trash2 size={12} strokeWidth={2.4} />
                  </IconButton>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Comments thread (port of tasks/audit-event.tsx 'commented' UI)      */
/* ------------------------------------------------------------------ */

function CommentBody({
  c,
  viewer,
  onEdited,
  onDeleted,
}: {
  c: DetailComment;
  viewer: { id: string; isAdmin: boolean };
  onEdited: (next: DetailComment) => void;
  onDeleted: (id: string) => void;
}) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState(c.body);
  const [pending, setPending] = React.useState(false);

  const ageMs = Date.now() - new Date(c.createdAt).getTime();
  const canMutate = viewer.isAdmin || (c.authorId === viewer.id && ageMs <= COMMENT_EDIT_WINDOW_MS);

  const save = () => {
    const next = draft.trim();
    if (!next) return;
    if (next === c.body) {
      setEditing(false);
      return;
    }
    setPending(true);
    void editGoalComment({ id: c.id, body: next })
      .then((res) => {
        if (!res.ok) {
          fireToast({ message: res.error });
          return;
        }
        onEdited(res.comment);
        setEditing(false);
      })
      .finally(() => setPending(false));
  };

  const remove = () => {
    if (!confirm("Delete this comment? This can't be undone.")) return;
    setPending(true);
    void deleteGoalComment({ id: c.id })
      .then((res) => {
        if (!res.ok) {
          fireToast({ message: res.error });
          return;
        }
        onDeleted(c.id);
      })
      .finally(() => setPending(false));
  };

  return (
    <div className="group text-[13px] leading-relaxed text-ink" style={{ overflowWrap: "anywhere" }}>
      <span className="inline-flex items-center gap-1.5">
        <strong className="text-ink-strong">{c.authorName ?? "Someone"}</strong>
        <span className="text-[11px] tabular-nums text-ink-faint">{timeAgo(c.createdAt)}</span>
        {c.editedAt && <span className="text-[10.5px] text-ink-faint">(edited)</span>}
        {canMutate && !editing && (
          <span className="inline-flex items-center opacity-0 transition-opacity group-hover:opacity-100">
            <IconButton onClick={() => setEditing(true)} label="Edit comment">
              <Pencil size={11} strokeWidth={2.4} />
            </IconButton>
            <IconButton onClick={remove} label="Delete comment" busy={pending}>
              <Trash2 size={11} strokeWidth={2.4} />
            </IconButton>
          </span>
        )}
      </span>
      {editing ? (
        <div className="mt-1.5 space-y-1.5">
          <textarea
            autoFocus
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                save();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setEditing(false);
                setDraft(c.body);
              }
            }}
            rows={Math.max(2, Math.min(6, draft.split("\n").length))}
            className="w-full resize-y rounded-md border p-2.5 text-[13px] leading-relaxed outline-none"
            style={{ borderColor: "var(--color-hairline-strong)" }}
          />
          <div className="flex items-center gap-2 text-[11.5px]">
            <button
              type="button"
              onClick={save}
              disabled={pending || !draft.trim()}
              className="inline-flex items-center gap-1 rounded-md px-2.5 py-1 font-black text-white disabled:opacity-50"
              style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
            >
              {pending ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} strokeWidth={2.8} />}
              Save
            </button>
            <button
              type="button"
              onClick={() => {
                setEditing(false);
                setDraft(c.body);
              }}
              className="rounded-md px-2 py-1 font-bold text-ink-muted hover:bg-surface-soft"
            >
              Cancel
            </button>
            <span className="text-ink-faint">⌘Enter · Esc</span>
          </div>
        </div>
      ) : (
        <div
          className="mt-1 whitespace-pre-wrap rounded-md px-2.5 py-2 text-[13px] text-ink-soft"
          style={{
            background: "rgba(15, 23, 42, 0.03)",
            borderLeft: `2px solid color-mix(in srgb, ${ACCENT} 55%, transparent)`,
          }}
        >
          {c.body}
        </div>
      )}
    </div>
  );
}

function CommentsSection({ node, bundle, loading }: { node: CollabNode; bundle: GoalDetailBundle | undefined; loading: boolean }) {
  const patch = useBundlePatch(node);
  const [draft, setDraft] = React.useState("");
  const [replyTo, setReplyTo] = React.useState<DetailComment | null>(null);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    setDraft("");
    setReplyTo(null);
  }, [node.id]);

  const comments = React.useMemo(() => bundle?.comments ?? [], [bundle?.comments]);
  const roots = comments.filter((c) => !c.parentId);
  const repliesOf = React.useMemo(() => {
    const m = new Map<string, DetailComment[]>();
    for (const c of comments) {
      if (!c.parentId) continue;
      const arr = m.get(c.parentId) ?? [];
      arr.push(c);
      m.set(c.parentId, arr);
    }
    return m;
  }, [comments]);

  const viewer = bundle?.viewer ?? { id: "", isAdmin: false };

  const onEdited = (next: DetailComment) =>
    patch((b) => ({ ...b, comments: b.comments.map((c) => (c.id === next.id ? next : c)) }));
  const onDeleted = (id: string) =>
    patch((b) => ({ ...b, comments: b.comments.filter((c) => c.id !== id && c.parentId !== id) }));

  const submit = () => {
    const body = draft.trim();
    if (!body || pending) return;
    setPending(true);
    void addGoalComment({ node, parentId: replyTo?.id ?? null, body })
      .then((res) => {
        if (!res.ok) {
          fireToast({ message: res.error });
          return;
        }
        patch((b) => ({ ...b, comments: [...b.comments, res.comment] }));
        setDraft("");
        setReplyTo(null);
      })
      .finally(() => setPending(false));
  };

  return (
    <section className="border-t px-5 py-3.5" style={{ borderColor: "var(--color-hairline)" }}>
      <SectionHeader icon={<MessageSquare size={12} strokeWidth={2.6} />}>
        Comments{comments.length > 0 && <span className="tabular-nums normal-case tracking-normal"> · {comments.length}</span>}
      </SectionHeader>

      {loading && <SkeletonRows n={2} />}
      {!loading && bundle?.collabReady === false && <MigrationNote />}

      {!loading && roots.length === 0 && bundle?.collabReady !== false && (
        <p className="mt-1.5 text-[12px] font-semibold text-ink-faint">Start the thread — decisions live better next to the goal.</p>
      )}

      {roots.length > 0 && (
        <ul className="mt-2.5 space-y-3">
          {roots.map((c) => (
            <li key={c.id}>
              <CommentBody c={c} viewer={viewer} onEdited={onEdited} onDeleted={onDeleted} />
              {(repliesOf.get(c.id) ?? []).map((r) => (
                <div key={r.id} className="mt-2 border-l-2 pl-3" style={{ borderColor: "var(--color-hairline)" , marginLeft: 6 }}>
                  <CommentBody c={r} viewer={viewer} onEdited={onEdited} onDeleted={onDeleted} />
                </div>
              ))}
              <button
                type="button"
                onClick={() => setReplyTo(replyTo?.id === c.id ? null : c)}
                className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-ink-subtle transition-colors hover:text-ink-strong"
              >
                <Reply size={11} strokeWidth={2.6} /> Reply
              </button>
            </li>
          ))}
        </ul>
      )}

      {bundle?.collabReady !== false && (
        <div className="mt-3">
          {replyTo && (
            <div className="mb-1 flex items-center gap-1.5 text-[11px] font-bold" style={{ color: ACCENT_DEEP }}>
              <Reply size={11} strokeWidth={2.6} />
              Replying to {replyTo.authorName ?? "comment"}
              <button type="button" onClick={() => setReplyTo(null)} aria-label="Cancel reply">
                <X size={11} strokeWidth={2.8} />
              </button>
            </div>
          )}
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                e.preventDefault();
                submit();
              } else if (e.key === "Escape" && replyTo) {
                setReplyTo(null);
              }
            }}
            rows={2}
            placeholder={replyTo ? "Write your reply…" : "Add a comment…"}
            aria-label="Add a comment"
            className="w-full resize-y rounded-md border p-2.5 text-[13px] leading-relaxed outline-none focus:ring-2"
            style={{ borderColor: "var(--color-hairline-strong)" }}
          />
          <div className="mt-1.5 flex items-center gap-2">
            <button
              type="button"
              onClick={submit}
              disabled={pending || !draft.trim()}
              className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[12px] font-black text-white disabled:opacity-50"
              style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
            >
              {pending ? <Loader2 size={12} className="animate-spin" /> : <MessageSquare size={12} strokeWidth={2.6} />}
              {replyTo ? "Reply" : "Comment"}
            </button>
            <span className="text-[11px] text-ink-faint">⌘Enter to send</span>
          </div>
        </div>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* Activity feed (event_log outbox read-back)                          */
/* ------------------------------------------------------------------ */

function activitySentence(a: DetailActivity): string {
  const d = typeof a.payload.detail === "string" ? a.payload.detail : null;
  const from = a.payload.from;
  const to = a.payload.to;
  switch (a.eventType) {
    case "GoalCascadeCreated":
      return d ? `created “${d}”` : "created the goal";
    case "GoalCascadeEdited":
      return d ? `updated ${d}` : "updated the goal";
    case "GoalCascadeProgressSet":
      return `set progress ${from ?? "—"}% → ${to ?? "—"}%`;
    case "GoalCascadeAdopted":
      return `marked it ${to ?? "adopted"}`;
    case "GoalCascadeArchived":
      return "archived the goal";
    case "GoalCascadeRebalanced":
      return d ?? "rebalanced the child targets";
    case "GoalCommented":
      return d ? `commented — “${d}”` : "commented";
    case "GoalLinked":
      return d ? `linked ${d}` : "linked an item";
    case "GoalUnlinked":
      return d ? `removed the link ${d}` : "removed a link";
    case "GoalDependencyAdded":
      return d ? `added: ${d}` : "added a dependency";
    case "GoalDependencyResolved":
      return d ? `resolved “${d}”` : "resolved a dependency";
    case "GoalAttachmentAdded":
      return d ? `attached ${d}` : "attached evidence";
    case "GoalAttachmentRemoved":
      return d ? `removed ${d}` : "removed an attachment";
    case "GoalReviewed": {
      const pct = a.payload.acceptPct;
      return pct == null ? "reviewed the goal" : `reviewed — accepted ${pct}%`;
    }
    case "GoalProgressLogged":
      return "logged weekly progress";
    default:
      return a.eventType.replace(/^Goal/, "").replace(/([A-Z])/g, " $1").trim().toLowerCase();
  }
}

function ActivitySection({ bundle, loading }: { bundle: GoalDetailBundle | undefined; loading: boolean }) {
  const activity = bundle?.activity ?? [];
  return (
    <section className="border-t px-5 py-3.5" style={{ borderColor: "var(--color-hairline)" }}>
      <SectionHeader icon={<Activity size={12} strokeWidth={2.6} />}>Activity</SectionHeader>

      {loading && <SkeletonRows n={3} />}

      {!loading && activity.length === 0 && (
        <p className="mt-1.5 text-[12px] font-semibold text-ink-faint">
          No activity recorded yet — changes from here on land in this timeline.
        </p>
      )}

      {activity.length > 0 && (
        <ul className="relative mt-2.5 space-y-2.5 pl-4">
          <span
            aria-hidden
            className="absolute bottom-1 left-[3px] top-1 w-px"
            style={{ background: "var(--color-hairline)" }}
          />
          {activity.map((a) => (
            <li key={a.seq} className="relative text-[12.5px] leading-relaxed text-ink" style={{ overflowWrap: "anywhere" }}>
              <span
                aria-hidden
                className="absolute -left-4 top-[6px] size-[7px] rounded-full"
                style={{ background: ACCENT, boxShadow: `0 0 0 2.5px ${accentMix(18)}` }}
              />
              <strong className="text-ink-strong">{a.actorName ?? "Someone"}</strong>{" "}
              <span className="text-ink-soft">{activitySentence(a)}</span>
              <span className="ml-1.5 text-[10.5px] tabular-nums text-ink-faint">{timeAgo(a.occurredAt)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/* CollabSections — the exported LEFT-panel block                      */
/* ------------------------------------------------------------------ */

/**
 * The full Phase-7 section stack for one goal node. Mounted inside the LEFT
 * ParentContextPanel; the bundle loads lazily on mount (= on peek/expand of
 * that goal) and is cached per goalId, so back-navigation is instant.
 *
 * `scorecardGoal` — pass the focused cascade GoalDTO to fold the real
 * /goals/review scorecard (dual self/manager rating + history) into the rail.
 */
export function CollabSections({
  node,
  scorecardGoal,
  contextLabel,
}: {
  node: CollabNode;
  scorecardGoal?: GoalDTO;
  contextLabel?: string;
}): React.JSX.Element {
  const reduce = useReducedMotion() ?? false;
  const { data: bundle, isLoading, isError, refetch } = useGoalDetail(node);

  return (
    <AnimatePresence mode="popLayout" initial={false}>
      <motion.div
        key={`${node.kind}-${node.id}`}
        initial={reduce ? false : { opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        exit={reduce ? undefined : { opacity: 0, y: -8 }}
        transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 380, damping: 34 }}
      >
        {contextLabel && (
          <div className="border-t px-5 pt-3" style={{ borderColor: "var(--color-hairline)" }}>
            <span
              className="inline-block rounded-chip px-2 py-0.5 text-[10px] font-black uppercase tracking-[0.1em]"
              style={{ color: ACCENT_DEEP, background: accentMix(8) }}
            >
              {contextLabel}
            </span>
          </div>
        )}

        {isError ? (
          <div className="border-t px-5 py-4" style={{ borderColor: "var(--color-hairline)" }}>
            <p className="text-[12.5px] font-semibold text-ink-muted">Couldn&apos;t load the goal&apos;s detail.</p>
            <button
              type="button"
              onClick={() => void refetch()}
              className="mt-2 inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[12px] font-black"
              style={{ color: ACCENT_DEEP, background: accentMix(10) }}
            >
              <RefreshCw size={12} strokeWidth={2.6} /> Retry
            </button>
          </div>
        ) : (
          <>
            {scorecardGoal && <ReviewScorecard g={scorecardGoal} bundle={bundle} node={node} />}
            <LinksSection node={node} bundle={bundle} loading={isLoading} />
            <DependenciesSection node={node} bundle={bundle} loading={isLoading} />
            <EvidenceSection node={node} bundle={bundle} loading={isLoading} />
            <CommentsSection node={node} bundle={bundle} loading={isLoading} />
            <ActivitySection bundle={bundle} loading={isLoading} />
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
