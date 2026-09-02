"use client";

import * as React from "react";
import { Check, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import {
  sectionItemIds,
  type EvalSection,
  type EvaluationInstance,
} from "@/lib/hr/candidate/evaluation-v2";
import { eligibilityVerdict, isSectionApplicable, type ScoreContext } from "@/lib/hr/candidate/evaluation-v2-scoring";

const RED = "#E10600";
const RED_DEEP = "#A80400";
const DISPLAY = "var(--font-display), system-ui, sans-serif";

export interface SectionStatus {
  rated: number;
  total: number;
  done: boolean;
  /** A gate section whose gate isn't revealed (or a non-sales sales section). */
  skipped: boolean;
}

/** Per-section completion for the rail (rating-progress-style counts). */
export function sectionStatus(section: EvalSection, inst: EvaluationInstance, ctx: ScoreContext): SectionStatus {
  if (section.input === "passfail") {
    const v = eligibilityVerdict(inst);
    return { rated: v.answered, total: v.total, done: v.answered === v.total, skipped: false };
  }
  if (section.input === "overall") {
    const done = inst.recommendation != null;
    return { rated: done ? 1 : 0, total: 1, done, skipped: false };
  }
  if (section.input === "sellgate") {
    // The "Responsibility to Sell?" gate is complete once answered Yes/No.
    const answered = inst.gates?.[section.id] != null;
    return { rated: answered ? 1 : 0, total: 1, done: answered, skipped: false };
  }
  // rating / gate
  const applicable = isSectionApplicable(section, inst, ctx);
  const ids = sectionItemIds(section);
  const rated = ids.filter((id) => id in inst.ratings || inst.cantSay.includes(id)).length;
  if (section.input === "gate") {
    const answered = inst.gates?.[section.id] != null;
    if (!applicable) {
      // gate answered but not revealed → treated as complete/skipped
      return { rated: answered ? 1 : 0, total: 1, done: answered, skipped: true };
    }
    return { rated, total: ids.length, done: ids.length > 0 && rated === ids.length, skipped: false };
  }
  return { rated, total: ids.length, done: ids.length > 0 && rated === ids.length, skipped: false };
}

/**
 * The sticky progress SIDEBAR — the primary navigation for the instrument. Lists
 * every applicable section with a live completion indicator, highlights the one
 * in view, and scrolls to a section on click. Keyboard: Up/Down move focus, Enter
 * jumps. Collapsible to a slim rail. On mobile it renders as a horizontal chip
 * strip above the form (handled by the parent's layout).
 */
export function SectionRail({
  sections,
  instance,
  ctx,
  activeId,
  onJump,
  collapsed,
  onToggleCollapse,
}: {
  sections: EvalSection[];
  instance: EvaluationInstance;
  ctx: ScoreContext;
  activeId: string | null;
  onJump: (id: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}) {
  const btnRefs = React.useRef<(HTMLButtonElement | null)[]>([]);

  function onKeyDown(e: React.KeyboardEvent, idx: number) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const dir = e.key === "ArrowDown" ? 1 : -1;
    const next = (idx + dir + sections.length) % sections.length;
    btnRefs.current[next]?.focus();
  }

  const doneCount = sections.filter((s) => sectionStatus(s, instance, ctx).done).length;

  return (
    <nav
      aria-label="Evaluation sections"
      className="rounded-2xl border border-hairline bg-white/95 p-2 shadow-[0_10px_30px_-22px_rgba(24,24,27,0.5)] backdrop-blur"
    >
      <div className={`flex items-center gap-2 px-2 py-2 ${collapsed ? "justify-center" : "justify-between"}`}>
        {!collapsed && (
          <div className="min-w-0">
            <p className="text-[10.5px] font-bold uppercase tracking-[0.14em] text-ink-soft">Sections</p>
            <p className="text-[13px] font-black tabular-nums text-ink-strong" style={{ fontFamily: DISPLAY }}>
              {doneCount} / {sections.length} complete
            </p>
          </div>
        )}
        <button
          type="button"
          onClick={onToggleCollapse}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-ink-muted transition-colors hover:bg-surface-soft"
          aria-label={collapsed ? "Expand section rail" : "Collapse section rail"}
          title={collapsed ? "Expand" : "Collapse"}
        >
          {collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}
        </button>
      </div>

      <ul className="mt-1 space-y-1">
        {sections.map((s, i) => {
          const st = sectionStatus(s, instance, ctx);
          const active = activeId === s.id;
          return (
            <li key={s.id}>
              <button
                ref={(el) => { btnRefs.current[i] = el; }}
                type="button"
                onClick={() => onJump(s.id)}
                onKeyDown={(e) => onKeyDown(e, i)}
                aria-current={active ? "true" : undefined}
                title={collapsed ? `${s.title} — ${st.skipped ? "skipped" : `${st.rated}/${st.total}`}` : undefined}
                className={`group flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition-colors ${collapsed ? "justify-center" : ""}`}
                style={active ? { background: "color-mix(in srgb, var(--color-altus-red) 8%, white)" } : undefined}
              >
                <StatusBadge status={st} code={s.code} active={active} />
                {!collapsed && (
                  <span className="min-w-0 flex-1">
                    <span
                      className="block truncate text-[13px] font-bold leading-tight"
                      style={{ color: active ? RED_DEEP : "var(--color-ink-strong)" }}
                    >
                      {s.title}
                    </span>
                    <span className="block text-[11px] font-semibold tabular-nums text-ink-subtle">
                      {st.skipped ? "Skipped" : `${st.rated} / ${st.total}`}
                    </span>
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

function StatusBadge({ status, code, active }: { status: SectionStatus; code: string; active: boolean }) {
  const pct = status.total > 0 ? status.rated / status.total : 0;
  const done = status.done;
  const size = 26;
  const r = 11;
  const c = 2 * Math.PI * r;
  const dash = c * Math.max(0, Math.min(1, pct));
  const ring = done ? "#16a34a" : status.rated > 0 ? RED : "var(--color-hairline-strong)";

  return (
    <span className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--color-hairline)" strokeWidth={3} />
        {!status.skipped && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={ring}
            strokeWidth={3}
            strokeLinecap="round"
            strokeDasharray={`${dash} ${c - dash}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: "stroke-dasharray 0.4s cubic-bezier(0.22,1,0.36,1), stroke 0.3s ease" }}
          />
        )}
      </svg>
      <span
        className="absolute text-[10px] font-black tabular-nums"
        style={{ color: done ? "#15803d" : active ? RED_DEEP : "var(--color-ink-muted)" }}
      >
        {done ? <Check size={13} strokeWidth={3.5} style={{ color: "#15803d" }} /> : code}
      </span>
    </span>
  );
}
