"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, Loader2, Target } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { savePersonalGoals } from "@/app/(app)/pms/review/actions";

type Status = "active" | "done" | "dropped";

export interface PersonalGoalRow {
  title: string;
  detail: string;
  status: Status;
}

const STATUS_LABEL: Record<Status, string> = { active: "Active", done: "Done", dropped: "Dropped" };
const MAX_GOALS = 3;

function pad(rows: PersonalGoalRow[]): PersonalGoalRow[] {
  const out = rows.slice(0, MAX_GOALS).map((r) => ({ ...r }));
  while (out.length < MAX_GOALS) out.push({ title: "", detail: "", status: "active" });
  return out;
}

export function PersonalGoalsEditor({
  initial,
  period,
  periodLabel,
  accent,
  accentDeep,
}: {
  initial: PersonalGoalRow[];
  period: string;
  periodLabel: string;
  accent: string;
  accentDeep: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();
  const [rows, setRows] = React.useState<PersonalGoalRow[]>(() => pad(initial));

  function update(i: number, patch: Partial<PersonalGoalRow>) {
    setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  }

  function submit() {
    const goals = rows
      .map((r) => ({ title: r.title.trim(), detail: r.detail.trim(), status: r.status }))
      .filter((r) => r.title.length > 0);
    startTransition(async () => {
      const res = await savePersonalGoals({ period, goals });
      if (res.ok) {
        fireToast({ message: "Personal goals saved.", type: "success" });
        router.refresh();
      } else {
        fireToast({ message: res.error, type: "error" });
      }
    });
  }

  const tint = (pct: number) => `color-mix(in srgb, ${accent} ${pct}%, transparent)`;

  return (
    <div className="flex flex-col gap-4">
      <div className="space-y-3">
        {rows.map((r, i) => (
          <div key={i} className="rounded-xl border border-hairline bg-surface-soft p-3.5">
            <div className="flex items-center gap-2.5">
              <span
                className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-[13px] font-black"
                style={{ background: tint(14), color: accentDeep }}
              >
                {i + 1}
              </span>
              <input
                type="text"
                value={r.title}
                maxLength={160}
                placeholder={`Personal goal ${i + 1} (e.g. read 2 books this month)`}
                onChange={(e) => update(i, { title: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submit();
                  }
                }}
                className="min-w-0 flex-1 bg-transparent text-[15px] font-semibold text-ink-strong outline-none placeholder:font-medium placeholder:text-ink-subtle"
              />
              <div className="inline-flex shrink-0 rounded-lg border border-hairline bg-white p-0.5" role="radiogroup" aria-label={`Goal ${i + 1} status`}>
                {(Object.keys(STATUS_LABEL) as Status[]).map((s) => {
                  const on = r.status === s;
                  return (
                    <button
                      key={s}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => update(i, { status: s })}
                      className="rounded-md px-2.5 py-1 text-[12px] font-bold transition-colors"
                      style={on ? { background: accent, color: "#fff" } : { color: "var(--color-ink-subtle)" }}
                    >
                      {STATUS_LABEL[s]}
                    </button>
                  );
                })}
              </div>
            </div>
            {(r.title.trim() || r.detail) && (
              <input
                type="text"
                value={r.detail}
                maxLength={1000}
                placeholder="A line of detail (optional)"
                onChange={(e) => update(i, { detail: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    submit();
                  }
                }}
                className="mt-2 block w-full bg-transparent text-[13.5px] text-ink-muted outline-none placeholder:text-ink-subtle"
                style={{ paddingLeft: "2.375rem" }}
              />
            )}
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-1.5 text-[12.5px] font-medium text-ink-subtle">
          <Target size={13} strokeWidth={2.4} /> Up to 3 · {periodLabel}
        </span>
        <button
          type="button"
          onClick={submit}
          disabled={pending}
          className="brand-btn wg-btn wg-sheen inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[14.5px] font-bold text-white transition-opacity disabled:opacity-50"
          style={{
            background: `linear-gradient(135deg, ${accent}, ${accentDeep})`,
            boxShadow: `0 8px 18px -10px color-mix(in srgb, ${accentDeep} 70%, transparent), inset 0 1px 0 rgba(255,255,255,0.25)`,
          }}
        >
          {pending ? <Loader2 size={17} className="animate-spin" /> : <Check size={17} strokeWidth={2.6} />}
          Save Goals
        </button>
      </div>
    </div>
  );
}
