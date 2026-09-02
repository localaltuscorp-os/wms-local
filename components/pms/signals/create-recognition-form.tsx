"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Award, Loader2, X } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { LookupSelect, type LookupOption } from "@/components/ui/lookup-select";
import { createRecognition } from "@/app/(app)/pms/signals/actions";
import { MODULE_THEME } from "@/lib/module-theme";

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

/** Suggested kinds — admin can also type a custom one. */
const KINDS = [
  "Spot award",
  "Employee of the month",
  "Above & beyond",
  "Team player",
  "Customer impact",
  "Learning champion",
] as const;

const inputCls =
  "w-full rounded-xl border border-hairline bg-white px-3.5 py-2.5 text-[14.5px] font-medium text-ink-strong outline-none transition-colors focus:border-[var(--ring)]";

/**
 * Admin-only "add a recognition the engine missed" form. Inline-expanding card
 * (collapsed → a button). Keyboard-first: opening autofocuses the person
 * picker, Enter on the reason submits, Esc collapses. The created row lands as
 * a *suggested* recognition — it still needs an explicit Release (Law 8).
 */
export function CreateRecognitionForm({
  people,
  defaultPeriod,
}: {
  people: LookupOption[];
  defaultPeriod: string;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [employeeId, setEmployeeId] = React.useState<string | null>(null);
  const [period, setPeriod] = React.useState(defaultPeriod);
  const [kind, setKind] = React.useState<string>(KINDS[0]);
  const [reason, setReason] = React.useState("");
  const [pending, start] = React.useTransition();
  const periodRef = React.useRef<HTMLInputElement>(null);

  function reset() {
    setEmployeeId(null);
    setPeriod(defaultPeriod);
    setKind(KINDS[0]);
    setReason("");
  }

  function close() {
    setOpen(false);
    reset();
  }

  function submit() {
    if (!employeeId) {
      fireToast({ message: "Pick a person to recognise.", type: "error" });
      return;
    }
    start(async () => {
      const res = await createRecognition({
        employeeId,
        period,
        kind: kind.trim(),
        reason: reason.trim() || undefined,
      });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: "Recognition added — release it when you're ready.", type: "success" });
      close();
      router.refresh();
    });
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="wg-btn wg-sheen inline-flex items-center gap-2 rounded-pill px-5 py-2.5 text-[14px] font-bold text-white whitespace-nowrap"
        style={{
          background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})`,
          boxShadow: `0 10px 24px -12px color-mix(in srgb, ${ACCENT_DEEP} 70%, transparent), inset 0 1px 0 rgba(255,255,255,0.25)`,
        }}
      >
        <Plus size={16} strokeWidth={2.6} /> Add Recognition
      </button>
    );
  }

  return (
    <div
      className="wg-rise w-full max-w-[560px] rounded-2xl bg-surface-card p-5"
      style={{
        ["--ring" as string]: ACCENT,
        boxShadow:
          "inset 0 0 0 1px var(--color-hairline), inset 0 1px 0 rgba(255,255,255,0.7), 0 10px 28px -20px rgba(15,23,42,0.35)",
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          close();
        }
      }}
    >
      <div className="mb-4 flex items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 text-[15px] font-bold text-ink-strong">
          <Award size={17} strokeWidth={2.4} style={{ color: ACCENT }} /> New Recognition
        </span>
        <button
          type="button"
          onClick={close}
          aria-label="Cancel"
          className="inline-flex size-8 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-soft"
        >
          <X size={17} strokeWidth={2.4} />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4 max-md:grid-cols-1">
        <label className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-bold uppercase tracking-wide text-ink-subtle">Person</span>
          <LookupSelect
            label="person"
            value={employeeId}
            onChange={setEmployeeId}
            options={people}
            className={inputCls}
            placeholder="Search a person…"
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-bold uppercase tracking-wide text-ink-subtle">Period</span>
          <input
            ref={periodRef}
            type="month"
            value={period}
            onChange={(e) => setPeriod(e.target.value)}
            className={inputCls}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-bold uppercase tracking-wide text-ink-subtle">Kind</span>
          <input
            list="recognition-kinds"
            value={kind}
            onChange={(e) => setKind(e.target.value)}
            maxLength={80}
            placeholder="e.g. Spot award"
            className={inputCls}
          />
          <datalist id="recognition-kinds">
            {KINDS.map((k) => (
              <option key={k} value={k} />
            ))}
          </datalist>
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-bold uppercase tracking-wide text-ink-subtle">
            Reason <span className="font-medium normal-case text-ink-subtle">(optional)</span>
          </span>
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={2000}
            placeholder="Why does this person deserve it?"
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                submit();
              }
            }}
            className={inputCls}
          />
        </label>
      </div>

      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          disabled={pending}
          onClick={submit}
          className="wg-btn wg-sheen inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[14px] font-bold text-white transition-opacity disabled:opacity-60"
          style={{
            background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})`,
            boxShadow: `0 8px 18px -10px color-mix(in srgb, ${ACCENT_DEEP} 70%, transparent), inset 0 1px 0 rgba(255,255,255,0.25)`,
          }}
        >
          {pending ? <Loader2 size={16} className="animate-spin" /> : <Plus size={16} strokeWidth={2.6} />}
          Add as Suggested
        </button>
        <button
          type="button"
          disabled={pending}
          onClick={close}
          className="rounded-xl border border-hairline bg-white px-4 py-2.5 text-[14px] font-bold text-ink-muted transition-colors hover:bg-surface-soft disabled:opacity-60"
        >
          Cancel
        </button>
        <span className="text-[12.5px] text-ink-subtle">It still needs an explicit release.</span>
      </div>
    </div>
  );
}
