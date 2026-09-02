"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Paperclip,
  ExternalLink,
  Check,
  Upload,
  Link2,
  X,
  ShieldCheck,
  Target as TargetIcon,
  Layers,
  CalendarCheck2,
} from "lucide-react";
import { useCountUp } from "@/lib/use-count-up";
import { fireToast } from "@/lib/toast";
import { setGoalPctDone } from "@/app/(app)/goals/cascade/actions";
import { reviewGoal, uploadGoalEvidence } from "@/app/(app)/goals/review/actions";
import { TeamAvatars } from "./team-picker";
import {
  effectiveGoalPct,
  pctTone,
  periodKeyLabel,
  PERIOD_LABEL,
  fmtNum,
  GOALS_ACCENT,
  GOALS_ACCENT_DEEP,
  type GoalDTO,
  type GoalPeriodBucket,
  type RosterMember,
} from "./util";
import type { GoalPeriod } from "@/lib/goals/types";

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

interface Headline {
  weekScore: number;
  ytdWeeklyAvg: number;
  weeklyGoalCount: number;
  cascadeGoalCount: number;
}

/* ================================================================== */
/* Score ring — a tone-coloured SVG dial with the % read out inside.   */
/* Green ≥70 / amber ≥40 / red, so a score is legible at a glance.     */
/* ================================================================== */
function ScoreRing({ value, size = 74 }: { value: number; size?: number }) {
  const v = clamp(value);
  const tone = pctTone(v);
  const stroke = Math.max(6, Math.round(size * 0.11));
  const r = (size - stroke) / 2;
  const c = size / 2;
  const circ = 2 * Math.PI * r;
  const dash = (v / 100) * circ;
  const gid = React.useId();
  return (
    <span
      role="img"
      aria-label={`${v} percent`}
      className="relative inline-flex shrink-0 items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden className="block -rotate-90">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={tone.color} />
            <stop offset="100%" stopColor={`color-mix(in srgb, ${tone.color} 62%, #000)`} />
          </linearGradient>
        </defs>
        <circle cx={c} cy={c} r={r} fill="none" stroke={`color-mix(in srgb, ${tone.color} 14%, transparent)`} strokeWidth={stroke} />
        <circle
          cx={c}
          cy={c}
          r={r}
          fill="none"
          stroke={`url(#${gid})`}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${circ}`}
          style={{
            filter: `drop-shadow(0 0 5px color-mix(in srgb, ${tone.color} 45%, transparent))`,
            transition: "stroke-dasharray 0.7s cubic-bezier(0.22,1,0.36,1), stroke 0.3s ease",
          }}
        />
      </svg>
      <span className="absolute inline-flex items-baseline tabular-nums" style={{ color: tone.color }}>
        <span style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900, fontSize: Math.round(size * 0.3) }}>
          {v}
        </span>
        <span style={{ fontWeight: 800, fontSize: Math.round(size * 0.15), opacity: 0.75 }}>%</span>
      </span>
    </span>
  );
}

/* Animated count-up number (respects the tile's tone). */
function CountUp({ value, suffix = "" }: { value: number; suffix?: string }) {
  const n = useCountUp(value);
  return (
    <>
      {n}
      {suffix}
    </>
  );
}

/* ================================================================== */
/* Headline stat tile — glass surface, aurora wash, count-up figure.   */
/* ================================================================== */
function StatTile({
  label,
  value,
  suffix,
  tone,
  Icon,
  index,
}: {
  label: string;
  value: number;
  suffix?: string;
  tone?: string;
  Icon: React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  index: number;
}) {
  return (
    <div
      className="wg-rise relative isolate overflow-hidden rounded-2xl border border-hairline bg-surface-card p-4"
      style={
        {
          animationDelay: `${index * 60}ms`,
          boxShadow: "inset 0 1px 0 rgba(255,255,255,0.7), 0 6px 20px -14px rgba(15,23,42,0.35)",
          "--kpi-tone": "color-mix(in srgb, #E10600 62%, transparent)",
          "--kpi-tone-deep": "color-mix(in srgb, #A80400 48%, transparent)",
          "--kpi-index": index,
        } as React.CSSProperties
      }
    >
      <span aria-hidden className="kpi-aurora-primary" />
      <span aria-hidden className="kpi-aurora-secondary" />
      <div className="relative flex items-start justify-between gap-2">
        <div>
          <p className="text-[10.5px] font-black uppercase tracking-[0.1em] text-ink-muted">{label}</p>
          <p
            className="mt-1.5 text-[30px] leading-none tabular-nums"
            style={{ color: tone ?? "var(--color-ink-strong)", fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 900 }}
          >
            <CountUp value={value} suffix={suffix} />
          </p>
        </div>
        <span
          className="grid size-9 place-items-center rounded-xl"
          style={{
            background: tone ? `color-mix(in srgb, ${tone} 14%, transparent)` : "color-mix(in srgb, #E10600 10%, transparent)",
            color: tone ?? "var(--color-altus-red)",
          }}
        >
          <Icon size={17} strokeWidth={2.4} />
        </span>
      </div>
    </div>
  );
}

/* ================================================================== */
/* A slider + synced number box — the friendly way to set a %.         */
/* ================================================================== */
function PctField({
  value,
  onChange,
  onCommit,
  disabled,
  placeholder,
  tone,
}: {
  value: number | null;
  onChange: (n: number | null) => void;
  onCommit: () => void;
  disabled?: boolean;
  placeholder?: string;
  tone: string;
}) {
  const shown = value ?? 0;
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={0}
        max={100}
        step={5}
        value={shown}
        disabled={disabled}
        onChange={(e) => onChange(clamp(Number(e.target.value)))}
        onPointerUp={onCommit}
        onKeyUp={onCommit}
        aria-label="Score slider"
        className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full disabled:cursor-not-allowed disabled:opacity-50"
        style={{
          background: `linear-gradient(90deg, ${tone} ${shown}%, color-mix(in srgb, ${tone} 16%, var(--color-hairline)) ${shown}%)`,
          accentColor: tone,
        }}
      />
      <div className="flex items-center gap-1">
        <input
          value={value == null ? "" : String(value)}
          disabled={disabled}
          inputMode="numeric"
          placeholder={placeholder ?? "—"}
          onChange={(e) => {
            const raw = e.target.value.trim();
            onChange(raw === "" ? null : clamp(Number(raw) || 0));
          }}
          onBlur={onCommit}
          onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
          className="w-12 rounded-lg border border-hairline bg-surface-card px-2 py-1.5 text-right text-[14px] font-black tabular-nums text-ink-strong outline-none transition-colors focus:border-hairline-strong disabled:opacity-60"
          style={{ color: value == null ? undefined : tone }}
        />
        <span className="text-[12px] font-bold text-ink-subtle">%</span>
      </div>
    </div>
  );
}

/* ================================================================== */
/* One reviewable goal — score ring, self + manager sliders, notes,    */
/* evidence. Hover lift + sheen; entrance stagger.                     */
/* ================================================================== */
function ReviewRow({
  goal,
  roster,
  canSelfRate,
  canReview,
  evidenceHref,
  index,
}: {
  goal: GoalDTO;
  roster: RosterMember[];
  canSelfRate: boolean;
  canReview: boolean;
  evidenceHref?: string;
  index: number;
}) {
  const router = useRouter();
  const [self, setSelf] = React.useState<number>(goal.pctDone);
  const [accept, setAccept] = React.useState<number | null>(goal.acceptPct);
  const [notes, setNotes] = React.useState(goal.reviewNotes ?? "");
  const [evOpen, setEvOpen] = React.useState(false);
  const [pending, start] = React.useTransition();
  const fileRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => setSelf(goal.pctDone), [goal.pctDone]);
  React.useEffect(() => setAccept(goal.acceptPct), [goal.acceptPct]);

  // Live effective preview: the manager's accept wins once set, else self.
  const eff = accept ?? self;
  const tone = pctTone(eff);
  const reviewed = goal.acceptPct != null;
  const adjusted = reviewed && goal.acceptPct !== goal.pctDone;

  function commitSelf() {
    const n = clamp(self);
    if (n === goal.pctDone) return;
    start(async () => {
      const res = await setGoalPctDone({ id: goal.id, pctDone: n });
      if (!res.ok) return fireToast({ message: res.error, type: "error" });
      router.refresh();
    });
  }

  function commitReview() {
    start(async () => {
      const res = await reviewGoal({ id: goal.id, acceptPct: accept, reviewNotes: notes.trim() || null });
      if (!res.ok) return fireToast({ message: res.error, type: "error" });
      fireToast({ message: "Review saved", type: "success" });
      router.refresh();
    });
  }

  function onPickFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const fd = new FormData();
    fd.set("goalId", goal.id);
    fd.set("file", file);
    start(async () => {
      const res = await uploadGoalEvidence(fd);
      if (!res.ok) return fireToast({ message: res.error, type: "error" });
      fireToast({ message: "Evidence attached", type: "success" });
      setEvOpen(false);
      router.refresh();
    });
  }

  function submitLink(link: string) {
    if (!link.trim()) return;
    const fd = new FormData();
    fd.set("goalId", goal.id);
    fd.set("link", link.trim());
    start(async () => {
      const res = await uploadGoalEvidence(fd);
      if (!res.ok) return fireToast({ message: res.error, type: "error" });
      fireToast({ message: "Evidence linked", type: "success" });
      setEvOpen(false);
      router.refresh();
    });
  }

  return (
    <div
      className="wg-rise wg-sheen group relative overflow-hidden rounded-3xl border border-hairline bg-surface-card p-5 transition-all duration-300 hover:-translate-y-0.5"
      style={{
        animationDelay: `${index * 45}ms`,
        boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6), 0 10px 30px -22px rgba(15,23,42,0.4)",
      }}
    >
      {/* tone accent rail */}
      <span aria-hidden className="absolute inset-y-0 left-0 w-1.5" style={{ background: `linear-gradient(180deg, ${tone.color}, color-mix(in srgb, ${tone.color} 55%, #000))` }} />

      {/* Head — ring + identity */}
      <div className="flex items-start gap-4 pl-2">
        <ScoreRing value={eff} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {goal.area && (
              <span
                className="rounded-full px-2.5 py-0.5 text-[11px] font-bold"
                style={{ background: "color-mix(in srgb, #E10600 9%, transparent)", color: GOALS_ACCENT_DEEP }}
              >
                {goal.area}
              </span>
            )}
            <span className="text-[15.5px] font-bold text-ink-strong">{goal.title}</span>
            {reviewed && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-black uppercase tracking-[0.05em]"
                style={{ background: "color-mix(in srgb, #15803d 12%, transparent)", color: "#15803d" }}
              >
                <ShieldCheck size={11} strokeWidth={2.6} /> Reviewed
              </span>
            )}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-ink-muted">
            <span className="inline-flex items-center gap-1 font-semibold">
              <TargetIcon size={12} className="opacity-70" /> Tgt {fmtNum(goal.targetQty)}
            </span>
            <span className="font-semibold">Act {fmtNum(goal.actualQty)}</span>
            {adjusted && (
              <span className="inline-flex items-center gap-1 rounded-full bg-black/[0.04] px-2 py-0.5 text-[11px] font-bold text-ink-soft">
                self {goal.pctDone}% → accepted {goal.acceptPct}%
              </span>
            )}
            <TeamAvatars team={goal.teamInvolved} roster={roster} max={3} />
          </div>
        </div>
      </div>

      {/* Controls — self + manager sliders */}
      <div className="mt-4 grid gap-4 border-t border-hairline pt-4 sm:grid-cols-2">
        <div>
          <label className="text-[10.5px] font-black uppercase tracking-[0.08em] text-ink-muted">Self rating</label>
          <div className="mt-2">
            <PctField
              value={self}
              onChange={(n) => setSelf(n ?? 0)}
              onCommit={commitSelf}
              disabled={!canSelfRate || pending}
              tone={pctTone(self).color}
            />
          </div>
        </div>

        <div className={canReview ? "sm:border-l sm:border-hairline sm:pl-4" : "sm:border-l sm:border-hairline sm:pl-4"}>
          <div className="flex items-center justify-between">
            <label className="text-[10.5px] font-black uppercase tracking-[0.08em] text-ink-muted">Manager accepts</label>
            {canReview && (
              <button
                type="button"
                onClick={commitReview}
                disabled={pending}
                className="wg-btn wg-sheen inline-flex items-center gap-1 rounded-full px-3 py-1 text-[12px] font-bold text-white disabled:opacity-60"
                style={{ background: `linear-gradient(135deg, ${GOALS_ACCENT}, ${GOALS_ACCENT_DEEP})` }}
              >
                {pending ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} strokeWidth={3} />}
                Save
              </button>
            )}
          </div>
          <div className="mt-2">
            <PctField
              value={accept}
              onChange={setAccept}
              onCommit={canReview ? commitReview : () => {}}
              disabled={!canReview || pending}
              placeholder={canReview ? "—" : "n/a"}
              tone={accept == null ? "var(--color-ink-subtle)" : pctTone(accept).color}
            />
          </div>
        </div>
      </div>

      {/* Notes */}
      {canReview ? (
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          onBlur={commitReview}
          rows={1}
          placeholder="Add review notes…"
          className="mt-3 w-full resize-none rounded-xl border border-hairline bg-surface-card px-3.5 py-2.5 text-[13px] text-ink-strong outline-none transition-colors focus:border-hairline-strong"
        />
      ) : goal.reviewNotes ? (
        <p
          className="mt-3 rounded-xl px-3.5 py-2.5 text-[13px] italic text-ink-soft"
          style={{ background: "color-mix(in srgb, #E10600 4%, rgba(0,0,0,0.02))" }}
        >
          “{goal.reviewNotes}”
        </p>
      ) : null}

      {/* Evidence */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {evidenceHref && (
          <a
            href={evidenceHref}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-bold text-white transition-transform hover:-translate-y-px"
            style={{ background: "linear-gradient(135deg, #1f2937, #0f172a)" }}
          >
            <ExternalLink size={12} /> View evidence
          </a>
        )}
        {(canSelfRate || canReview) && (
          <button
            type="button"
            onClick={() => setEvOpen((s) => !s)}
            className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface-card px-3 py-1.5 text-[12px] font-bold text-ink-soft transition-colors hover:border-hairline-strong hover:text-ink-strong"
          >
            <Paperclip size={12} /> {evidenceHref ? "Replace" : "Attach"} evidence
          </button>
        )}
      </div>

      {evOpen && (
        <div
          className="wg-rise mt-2 flex flex-wrap items-center gap-2 rounded-2xl border border-hairline p-3"
          style={{ background: "color-mix(in srgb, #E10600 3%, rgba(0,0,0,0.015))" }}
        >
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-full border border-hairline bg-surface-card px-3 py-1.5 text-[12.5px] font-bold text-ink-strong hover:brightness-95 disabled:opacity-60"
          >
            <Upload size={12} /> Upload file
          </button>
          <input ref={fileRef} type="file" className="hidden" onChange={onPickFile} />
          <span className="text-[12px] font-semibold text-ink-subtle">or</span>
          <div className="flex min-w-[200px] flex-1 items-center gap-1.5 rounded-full border border-hairline bg-surface-card px-3">
            <Link2 size={13} className="shrink-0 text-ink-subtle" />
            <input
              placeholder="Paste a link, press Enter"
              onKeyDown={(e) => {
                if (e.key === "Enter") submitLink((e.target as HTMLInputElement).value);
              }}
              className="h-8 flex-1 border-0 bg-transparent text-[13px] outline-none"
            />
          </div>
          <button
            type="button"
            onClick={() => setEvOpen(false)}
            className="grid size-7 place-items-center rounded-full text-ink-subtle transition-colors hover:bg-black/[0.05] hover:text-ink-strong"
            aria-label="Close"
          >
            <X size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/* Animated roll-up bars — effective % per period, tone-coloured.      */
/* ================================================================== */
function RollupBars({ buckets }: { buckets: GoalPeriodBucket[] }) {
  const rows = buckets.filter((b) => b.count > 0);
  if (rows.length === 0) return null;
  return (
    <div className="space-y-2.5">
      {rows.map((b, i) => {
        const tone = pctTone(b.avg);
        return (
          <div key={b.periodKey} className="wg-rise flex items-center gap-3" style={{ animationDelay: `${i * 40}ms` }}>
            <span className="w-28 shrink-0 truncate text-[12.5px] font-bold text-ink-soft">{periodKeyLabel(b.periodKey)}</span>
            <div className="relative h-3.5 flex-1 overflow-hidden rounded-full" style={{ background: "color-mix(in srgb, var(--color-ink-strong) 6%, transparent)" }}>
              <span
                className="absolute inset-y-0 left-0 rounded-full"
                style={{
                  width: `${b.avg}%`,
                  background: `linear-gradient(90deg, color-mix(in srgb, ${tone.color} 78%, #000), ${tone.color})`,
                  boxShadow: `0 0 10px -2px color-mix(in srgb, ${tone.color} 55%, transparent)`,
                  transition: "width 0.8s cubic-bezier(0.22,1,0.36,1)",
                }}
              />
            </div>
            <span className="w-16 shrink-0 text-right text-[13px] font-black tabular-nums" style={{ color: tone.color }}>
              {b.avg}%
            </span>
            <span className="w-14 shrink-0 text-right text-[11.5px] font-semibold text-ink-subtle">
              {b.count} {b.count === 1 ? "goal" : "goals"}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ================================================================== */
/* Board                                                               */
/* ================================================================== */
export function ReviewBoard({
  goals,
  roster,
  headline,
  buckets,
  canSelfRate,
  canReview,
  evidenceHrefs,
}: {
  goals: GoalDTO[];
  roster: RosterMember[];
  headline: Headline;
  buckets: GoalPeriodBucket[];
  canSelfRate: boolean;
  canReview: boolean;
  evidenceHrefs: Record<string, string>;
}) {
  const [filter, setFilter] = React.useState<GoalPeriod | "all">("all");

  const countByLevel = React.useMemo(() => {
    const m: Record<string, number> = { all: goals.length, year: 0, quarter: 0, month: 0 };
    for (const g of goals) m[g.period] = (m[g.period] ?? 0) + 1;
    return m;
  }, [goals]);

  const shown = filter === "all" ? goals : goals.filter((g) => g.period === filter);

  return (
    <div className="space-y-7">
      {/* Headline stats */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="This week" value={headline.weekScore} suffix="%" tone={pctTone(headline.weekScore).color} Icon={CalendarCheck2} index={0} />
        <StatTile label="Weekly YTD avg" value={headline.ytdWeeklyAvg} suffix="%" tone={pctTone(headline.ytdWeeklyAvg).color} Icon={TargetIcon} index={1} />
        <StatTile label="Cascade goals" value={headline.cascadeGoalCount} Icon={Layers} index={2} />
        <StatTile label="Weekly goals" value={headline.weeklyGoalCount} Icon={CalendarCheck2} index={3} />
      </div>

      {/* Roll-up chart */}
      {buckets.some((b) => b.count > 0) && (
        <div
          className="wg-rise rounded-3xl border border-hairline bg-surface-card p-5"
          style={{ animationDelay: "120ms", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.6), 0 8px 26px -20px rgba(15,23,42,0.35)" }}
        >
          <div className="mb-4 flex items-center gap-2">
            <span className="grid size-7 place-items-center rounded-lg" style={{ background: "color-mix(in srgb, #E10600 10%, transparent)", color: GOALS_ACCENT }}>
              <Layers size={15} strokeWidth={2.4} />
            </span>
            <h2 className="text-[13px] font-black uppercase tracking-[0.07em] text-ink-muted">Effective % by period</h2>
          </div>
          <RollupBars buckets={buckets} />
        </div>
      )}

      {/* Level filter — segmented */}
      <div className="flex flex-wrap items-center gap-1.5 rounded-full border border-hairline bg-surface-card p-1" style={{ width: "fit-content" }}>
        {(["all", "year", "quarter", "month"] as const).map((lvl) => {
          const active = filter === lvl;
          const label = lvl === "all" ? "All levels" : PERIOD_LABEL[lvl];
          const n = countByLevel[lvl] ?? 0;
          return (
            <button
              key={lvl}
              type="button"
              onClick={() => setFilter(lvl)}
              className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[13px] font-bold transition-all ${
                active ? "text-white" : "text-ink-soft hover:text-ink-strong"
              }`}
              style={active ? { background: `linear-gradient(135deg, ${GOALS_ACCENT}, ${GOALS_ACCENT_DEEP})`, boxShadow: "0 6px 16px -8px rgba(225,6,0,0.5)" } : undefined}
            >
              {label}
              <span
                className="inline-flex min-w-[18px] items-center justify-center rounded-full px-1 text-[11px] font-black tabular-nums"
                style={{
                  background: active ? "rgba(255,255,255,0.22)" : "color-mix(in srgb, var(--color-ink-strong) 7%, transparent)",
                  color: active ? "#fff" : "var(--color-ink-muted)",
                }}
              >
                {n}
              </span>
            </button>
          );
        })}
      </div>

      {/* Rows */}
      {shown.length === 0 ? (
        <div
          className="rounded-3xl border border-hairline-strong bg-surface-card p-12 text-center"
          style={{ background: "color-mix(in srgb, #E10600 2%, var(--color-surface-card))" }}
        >
          <span className="mx-auto mb-3 grid size-12 place-items-center rounded-2xl" style={{ background: "color-mix(in srgb, #E10600 10%, transparent)", color: GOALS_ACCENT }}>
            <ShieldCheck size={22} strokeWidth={2.2} />
          </span>
          <p className="text-[14.5px] font-semibold text-ink-muted">No goals to review at this level.</p>
          {filter !== "all" && (
            <button type="button" onClick={() => setFilter("all")} className="mt-2 text-[13px] font-bold text-altus-red hover:underline">
              Show All Levels
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3.5">
          {shown.map((g, i) => (
            <ReviewRow
              key={g.id}
              goal={g}
              roster={roster}
              canSelfRate={canSelfRate}
              canReview={canReview}
              evidenceHref={evidenceHrefs[g.id]}
              index={i}
            />
          ))}
        </div>
      )}
    </div>
  );
}
