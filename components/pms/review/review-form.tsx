"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronDown, Loader2, Users } from "lucide-react";
import { StarRating } from "@/components/ui/star-rating";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { fireToast } from "@/lib/toast";
import { saveMonthlyReview } from "@/app/(app)/pms/review/actions";

type Relation = "manager" | "subordinate" | "peer";

export interface ReviewPerson {
  id: string;
  name: string;
  avatarUrl: string | null;
  department: string | null;
  relation: Relation;
  /** Whether the signed-in user has already reviewed this person this period. */
  done: boolean;
  /** Pre-filled prior review for this person (if any). */
  prior: {
    attitude: number | null;
    behaviour: number | null;
    skill: number | null;
    changeTags: string[];
    explanation: string | null;
    scope: "internal" | "external";
  } | null;
}

const RELATION_LABEL: Record<Relation, string> = {
  manager: "You manage them",
  subordinate: "They manage you",
  peer: "Colleague",
};

export function ReviewForm({
  people,
  changeTags,
  period,
  periodLabel,
  accent,
  accentDeep,
}: {
  people: ReviewPerson[];
  changeTags: readonly string[];
  period: string;
  periodLabel: string;
  accent: string;
  accentDeep: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = React.useTransition();

  const firstPending = people.find((p) => !p.done) ?? people[0] ?? null;
  const [selectedId, setSelectedId] = React.useState<string | null>(firstPending?.id ?? null);
  const [pickerOpen, setPickerOpen] = React.useState(false);

  const selected = people.find((p) => p.id === selectedId) ?? null;

  const [attitude, setAttitude] = React.useState<number | null>(null);
  const [behaviour, setBehaviour] = React.useState<number | null>(null);
  const [skill, setSkill] = React.useState<number | null>(null);
  const [tags, setTags] = React.useState<string[]>([]);
  const [explanation, setExplanation] = React.useState("");
  const [scope, setScope] = React.useState<"internal" | "external">("internal");

  const explanationRef = React.useRef<HTMLTextAreaElement>(null);

  // Sync form state whenever the selected subject changes (load prior or reset).
  React.useEffect(() => {
    const p = selected?.prior;
    setAttitude(p?.attitude ?? null);
    setBehaviour(p?.behaviour ?? null);
    setSkill(p?.skill ?? null);
    setTags(p?.changeTags ?? []);
    setExplanation(p?.explanation ?? "");
    setScope(p?.scope ?? "internal");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedId]);

  function toggleTag(t: string) {
    setTags((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  }

  const complete = attitude != null && behaviour != null && skill != null;

  function submit() {
    if (!selected) {
      fireToast({ message: "Pick a person to review.", type: "error" });
      return;
    }
    if (!complete) {
      fireToast({ message: "Rate Attitude, Behaviour and Skill (3–5).", type: "error" });
      return;
    }
    startTransition(async () => {
      const res = await saveMonthlyReview({
        subjectId: selected.id,
        relation: selected.relation,
        period,
        attitude,
        behaviour,
        skill,
        changeTags: tags,
        explanation,
        scope,
      });
      if (res.ok) {
        fireToast({ message: `Review of ${selected.name} saved.`, type: "success" });
        router.refresh();
      } else {
        fireToast({ message: res.error, type: "error" });
      }
    });
  }

  if (people.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center">
        <Users size={26} className="text-ink-subtle" />
        <p className="text-[15px] font-semibold text-ink-strong">No one to review yet.</p>
        <p className="text-[13.5px] text-ink-muted" style={{ maxWidth: "44ch" }}>
          Reviews appear once you have a manager, peers, or direct reports on the org chart.
        </p>
      </div>
    );
  }

  const tint = (pct: number) => `color-mix(in srgb, ${accent} ${pct}%, transparent)`;
  const reviewedCount = people.filter((p) => p.done).length;

  return (
    <div className="flex flex-col gap-5">
      {/* Person picker + progress */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Popover open={pickerOpen} onOpenChange={setPickerOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              // eslint-disable-next-line jsx-a11y/no-autofocus
              autoFocus
              className="flex min-w-[15rem] items-center gap-3 rounded-xl border-2 px-3 py-2.5 text-left transition-colors"
              style={{ borderColor: pickerOpen ? accent : "var(--color-hairline)" }}
              aria-haspopup="listbox"
              aria-expanded={pickerOpen}
            >
              {selected ? (
                <>
                  <EmployeeAvatar name={selected.name} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-bold text-ink-strong">{selected.name}</span>
                    <span className="block text-[12px] font-semibold" style={{ color: accentDeep }}>
                      {RELATION_LABEL[selected.relation]}
                    </span>
                  </span>
                </>
              ) : (
                <span className="flex-1 text-[15px] font-semibold text-ink-subtle">Select a person…</span>
              )}
              <ChevronDown size={18} strokeWidth={2.4} className="shrink-0 text-ink-muted" />
            </button>
          </PopoverTrigger>
          <PopoverContent
            align="start"
            sideOffset={6}
            onCloseAutoFocus={(e) => e.preventDefault()}
            className="w-[var(--radix-popover-trigger-width)] min-w-[18rem] overflow-hidden p-1.5"
          >
            <ul role="listbox" className="max-h-[340px] overflow-y-auto">
              {(["manager", "subordinate", "peer"] as Relation[]).map((rel) => {
                const group = people.filter((p) => p.relation === rel);
                if (group.length === 0) return null;
                return (
                  <li key={rel} role="presentation">
                    <div className="px-2.5 pb-1 pt-2 text-[10.5px] font-bold uppercase tracking-[0.12em] text-ink-subtle">
                      {rel === "manager" ? "Your team (you manage)" : rel === "subordinate" ? "Your manager (rate up)" : "Peers"}
                    </div>
                    <ul role="group">
                      {group.map((p) => {
                        const isSel = p.id === selectedId;
                        return (
                          <li
                            key={p.id}
                            role="option"
                            aria-selected={isSel}
                            onClick={() => {
                              setSelectedId(p.id);
                              setPickerOpen(false);
                            }}
                            className="flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors hover:bg-black/[0.04]"
                            style={isSel ? { background: tint(8) } : undefined}
                          >
                            <EmployeeAvatar name={p.name} size="sm" />
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-[14.5px] font-semibold text-ink-strong">{p.name}</span>
                              <span className="block truncate text-[12px] text-ink-subtle">{p.department || "—"}</span>
                            </span>
                            {p.done && (
                              <span
                                className="inline-flex items-center gap-1 rounded-pill px-2 py-0.5 text-[10.5px] font-bold"
                                style={{ background: tint(14), color: accentDeep }}
                              >
                                <Check size={11} strokeWidth={3} /> Done
                              </span>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                );
              })}
            </ul>
          </PopoverContent>
        </Popover>

        <span className="text-[13px] font-semibold text-ink-muted">
          {reviewedCount}/{people.length} reviewed · {periodLabel}
        </span>
      </div>

      {selected && (
        <>
          {/* Three rated dimensions, 3–5 */}
          <div className="grid grid-cols-3 gap-3 max-md:grid-cols-1">
            {[
              ["Attitude", attitude, setAttitude] as const,
              ["Behaviour", behaviour, setBehaviour] as const,
              ["Skill", skill, setSkill] as const,
            ].map(([label, val, setter]) => (
              <div key={label} className="rounded-xl border border-hairline bg-surface-soft p-4">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[13.5px] font-bold text-ink-strong">{label}</span>
                  <span className="text-[11px] font-semibold text-ink-subtle">3–5</span>
                </div>
                <StarRating value={val} onChange={setter} min={3} max={5} size={28} color={accent} label={`${label} rating`} />
              </div>
            ))}
          </div>

          {/* What needs change */}
          <div>
            <span className="mb-2 block text-[13.5px] font-bold text-ink-strong">What needs to change?</span>
            <div className="flex flex-wrap gap-2">
              {changeTags.map((t) => {
                const on = tags.includes(t);
                return (
                  <button
                    key={t}
                    type="button"
                    aria-pressed={on}
                    onClick={() => toggleTag(t)}
                    className="rounded-pill border-2 px-3 py-1.5 text-[13px] font-semibold transition-colors"
                    style={
                      on
                        ? { background: accent, borderColor: accent, color: "#fff" }
                        : { borderColor: "var(--color-hairline-strong)", color: "var(--color-ink-soft)" }
                    }
                  >
                    {t}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Explanation */}
          <div>
            <label className="mb-1.5 block text-[13.5px] font-bold text-ink-strong" htmlFor="pms-review-explanation">
              Explanation <span className="font-medium text-ink-subtle">(optional)</span>
            </label>
            <textarea
              id="pms-review-explanation"
              ref={explanationRef}
              value={explanation}
              maxLength={2000}
              rows={3}
              placeholder="Context for the ratings — what's going well, what to work on."
              onChange={(e) => setExplanation(e.target.value)}
              onKeyDown={(e) => {
                if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                  e.preventDefault();
                  submit();
                }
              }}
              className="w-full resize-y rounded-xl border border-hairline bg-white px-3.5 py-2.5 text-[14.5px] text-ink-strong outline-none transition-colors focus:border-2"
              style={{ borderColor: "var(--color-hairline)" }}
            />
          </div>

          {/* Scope toggle + submit */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex rounded-xl border border-hairline p-1" role="radiogroup" aria-label="Review scope">
              {(["internal", "external"] as const).map((s) => {
                const on = scope === s;
                return (
                  <button
                    key={s}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setScope(s)}
                    className="rounded-lg px-4 py-1.5 text-[13.5px] font-bold capitalize transition-colors"
                    style={on ? { background: accent, color: "#fff" } : { color: "var(--color-ink-muted)" }}
                  >
                    {s}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              onClick={submit}
              disabled={pending || !complete}
              className="brand-btn wg-btn wg-sheen inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-[14.5px] font-bold text-white transition-opacity disabled:opacity-50"
              style={{
                background: `linear-gradient(135deg, ${accent}, ${accentDeep})`,
                boxShadow: `0 8px 18px -10px color-mix(in srgb, ${accentDeep} 70%, transparent), inset 0 1px 0 rgba(255,255,255,0.25)`,
              }}
            >
              {pending ? <Loader2 size={17} className="animate-spin" /> : <Check size={17} strokeWidth={2.6} />}
              {selected.done ? "Update Review" : "Save Review"}
            </button>
          </div>
        </>
      )}
    </div>
  );
}
