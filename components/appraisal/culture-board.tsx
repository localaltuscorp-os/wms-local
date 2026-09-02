"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, ChevronUp, ChevronDown, Sparkles } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { reorderCulturePool } from "@/app/(app)/appraisal/actions";

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

export interface CulturePoolEntryView {
  id: string;
  position: number;
  title: string | null;
  body: string;
  assignments: { period: string; serial: number }[];
}

export function CultureBoardCard({
  pool,
  upcoming,
  perMonth,
  used,
}: {
  pool: CulturePoolEntryView[];
  upcoming: string[];
  perMonth: number;
  used: number;
}) {
  const router = useRouter();
  const [pendingId, setPendingId] = React.useState<string | null>(null);
  const upcomingSet = React.useMemo(() => new Set(upcoming), [upcoming]);

  function move(paraId: string, direction: "up" | "down") {
    setPendingId(paraId);
    (async () => {
      const res = await reorderCulturePool(paraId, direction);
      setPendingId(null);
      if (res.ok) router.refresh();
      else fireToast({ message: res.error, type: "error" });
    })();
  }

  if (pool.length === 0) {
    return (
      <div className="rounded-2xl bg-surface-card p-10 text-center text-[14.5px] text-ink-muted" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
        No active Constitution items yet. Add them in the Constitution (PMS) first — they feed the Culture rotation.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-2xl bg-surface-card p-5" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
        <div className="flex items-center gap-2">
          <span className="inline-grid size-8 place-items-center rounded-[10px]" style={{ background: `color-mix(in srgb, ${ACCENT} 10%, transparent)`, color: ACCENT }}>
            <Sparkles size={17} />
          </span>
          <div>
            <div className="text-[14px] font-bold text-ink-strong">Next month picks {perMonth} items, serial-wise</div>
            <div className="text-[12.5px] text-ink-subtle">{used} assigned so far · highlighted rows below are up next. Reorder to change what the rotation reaches first.</div>
          </div>
        </div>
      </section>

      <ol className="flex flex-col gap-2.5">
        {pool.map((p, i) => {
          const next = upcomingSet.has(p.id);
          const busy = pendingId === p.id;
          return (
            <li
              key={p.id}
              className="rounded-2xl bg-surface-card p-4"
              style={{
                boxShadow: next
                  ? `inset 0 0 0 1.5px color-mix(in srgb, ${ACCENT} 55%, transparent), 0 10px 28px -22px rgba(15,23,42,0.35)`
                  : "inset 0 0 0 1px var(--color-hairline), 0 10px 28px -24px rgba(15,23,42,0.3)",
              }}
            >
              <div className="flex items-start gap-3">
                <span className="mt-0.5 grid size-7 shrink-0 place-items-center rounded-lg text-[13px] font-black tabular-nums" style={{ background: "var(--color-surface-soft)", color: ACCENT_DEEP }}>
                  {i + 1}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    {p.title && <span className="text-[14px] font-bold text-ink-strong">{p.title}</span>}
                    {next && (
                      <span className="rounded-pill px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white" style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}>
                        Up next
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-[13px] leading-relaxed text-ink-muted">{p.body}</p>
                  {p.assignments.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {p.assignments.map((a) => (
                        <span key={`${a.period}-${a.serial}`} className="rounded-pill bg-surface-soft px-2 py-0.5 text-[11px] font-semibold text-ink-subtle">
                          {a.period} · #{a.serial}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 flex-col gap-1">
                  <button
                    type="button"
                    onClick={() => move(p.id, "up")}
                    disabled={busy || i === 0}
                    aria-label="Move up"
                    className="grid size-8 place-items-center rounded-lg bg-white text-ink-strong disabled:opacity-40"
                    style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
                  >
                    {busy ? <Loader2 size={14} className="animate-spin" /> : <ChevronUp size={16} />}
                  </button>
                  <button
                    type="button"
                    onClick={() => move(p.id, "down")}
                    disabled={busy || i === pool.length - 1}
                    aria-label="Move down"
                    className="grid size-8 place-items-center rounded-lg bg-white text-ink-strong disabled:opacity-40"
                    style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
                  >
                    <ChevronDown size={16} />
                  </button>
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
