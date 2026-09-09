"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Gauge, X } from "lucide-react";
import { Select } from "@/components/ui/select";
import { fireToast } from "@/lib/toast";
import {
  createObligation,
  updateObligation,
} from "@/app/(app)/events/obligations/actions";
import type { CategoryOption, ObligationRowVM } from "./types";

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Non-null → edit that obligation; null → create a new one. */
  obligation: ObligationRowVM | null;
  categoryOptions: CategoryOption[];
}

interface FormState {
  name: string;
  counterparty: string;
  targetCount: string;
  isCompulsory: boolean;
  categoryId: string;
  penaltyNote: string;
}

const EMPTY: FormState = {
  name: "",
  counterparty: "",
  targetCount: "1",
  isCompulsory: true,
  categoryId: "",
  penaltyNote: "",
};

export function ObligationFormDialog({
  open,
  onOpenChange,
  obligation,
  categoryOptions,
}: Props) {
  const router = useRouter();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const isEdit = obligation !== null;

  // Load the row into the form when the dialog transitions open — done during
  // render (React's recommended alternative to a syncing effect).
  const [prevOpen, setPrevOpen] = useState(false);
  if (open !== prevOpen) {
    setPrevOpen(open);
    if (open) {
      setError(null);
      setForm(
        obligation
          ? {
              name: obligation.name,
              counterparty: obligation.counterparty ?? "",
              targetCount: String(obligation.targetCount),
              isCompulsory: obligation.isCompulsory,
              categoryId: obligation.categoryId ?? "",
              penaltyNote: obligation.penaltyNote ?? "",
            }
          : EMPTY,
      );
    }
  }

  function set<K extends keyof FormState>(key: K, v: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: v }));
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (form.name.trim() === "") {
      setError("A name is required.");
      return;
    }
    setError(null);
    startTransition(async () => {
      const payload = {
        name: form.name,
        counterparty: form.counterparty,
        targetCount: form.targetCount,
        isCompulsory: form.isCompulsory,
        categoryId: form.categoryId,
        penaltyNote: form.penaltyNote,
      };
      const res =
        isEdit && obligation
          ? await updateObligation({ id: obligation.id, ...payload })
          : await createObligation(payload);
      if (!res.ok) {
        setError(res.error);
        return;
      }
      fireToast({ message: isEdit ? "Obligation updated." : "Obligation added." });
      onOpenChange(false);
      router.refresh();
    });
  }

  const baseInput =
    "w-full rounded-lg border px-3.5 py-2.5 text-[15px] bg-white text-ink-strong transition-colors outline-none border-hairline-strong focus:border-[color:var(--ev-accent)] focus:ring-2 placeholder:text-ink-subtle";

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-[90]"
          style={{ background: "rgba(15,23,42,0.45)", backdropFilter: "blur(3px)" }}
        />
        <Dialog.Content
          className="wg-rise fixed left-1/2 top-1/2 z-[100] w-full max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl bg-surface-card max-h-[calc(100dvh-32px)]"
          style={
            {
              border: "1px solid var(--color-hairline-strong)",
              boxShadow:
                "0 24px 60px -16px rgba(15,23,42,0.40), 0 4px 12px rgba(15,23,42,0.12)",
              ["--ev-accent" as string]: ACCENT,
            } as React.CSSProperties
          }
        >
          <span
            aria-hidden
            className="block h-1 w-full"
            style={{ background: `linear-gradient(90deg, ${ACCENT}, ${ACCENT_DEEP})` }}
          />
          <div className="max-h-[calc(100dvh-36px)] overflow-y-auto p-6">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <span
                  className="mt-0.5 inline-flex size-10 shrink-0 items-center justify-center rounded-xl"
                  style={{ background: `${ACCENT}1f`, color: ACCENT_DEEP }}
                  aria-hidden
                >
                  <Gauge size={20} strokeWidth={2.4} />
                </span>
                <div>
                  <Dialog.Title
                    className="text-ink-strong"
                    style={{
                      fontFamily: "var(--font-serif)",
                      fontSize: 22,
                      fontWeight: 800,
                      lineHeight: 1.15,
                    }}
                  >
                    {isEdit ? "Edit Obligation" : "New Obligation"}
                  </Dialog.Title>
                  <Dialog.Description
                    className="mt-1 text-[14.5px] text-ink-muted"
                    style={{ lineHeight: 1.5 }}
                  >
                    A compulsory monthly session — set the counterparty and how
                    many are needed each month.
                  </Dialog.Description>
                </div>
              </div>
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Close"
                  disabled={pending}
                  className="inline-flex size-9 shrink-0 items-center justify-center rounded-full text-ink-subtle transition-colors hover:bg-surface-soft hover:text-ink-strong"
                >
                  <X size={18} strokeWidth={2.4} />
                </button>
              </Dialog.Close>
            </div>

            <form onSubmit={onSubmit} className="space-y-4">
              <Field label="Name" required>
                <input
                  autoFocus
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="e.g. AICL sessions"
                  maxLength={300}
                  className={baseInput}
                  style={{ ["--tw-ring-color" as string]: `${ACCENT}33` }}
                />
              </Field>

              <div className="grid grid-cols-2 gap-4 max-sm:grid-cols-1">
                <Field label="Counterparty">
                  <input
                    value={form.counterparty}
                    onChange={(e) => set("counterparty", e.target.value)}
                    placeholder="e.g. AICL"
                    maxLength={2000}
                    className={baseInput}
                    style={{ ["--tw-ring-color" as string]: `${ACCENT}33` }}
                  />
                </Field>
                <Field label="Monthly Target" required>
                  <input
                    type="number"
                    min={1}
                    max={999}
                    value={form.targetCount}
                    onChange={(e) => set("targetCount", e.target.value)}
                    className={baseInput}
                    style={{ ["--tw-ring-color" as string]: `${ACCENT}33` }}
                  />
                </Field>
              </div>

              <Field label="Category">
                <Select
                  options={[
                    { value: "", label: "— None —" },
                    ...categoryOptions.map((c) => ({ value: c.id, label: c.name })),
                  ]}
                  value={form.categoryId}
                  onValueChange={(v) => set("categoryId", v)}
                  placeholder="— None —"
                  ariaLabel="Category"
                />
              </Field>

              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-hairline p-3.5">
                <input
                  type="checkbox"
                  checked={form.isCompulsory}
                  onChange={(e) => set("isCompulsory", e.target.checked)}
                  className="mt-0.5 size-4 accent-[color:var(--ev-accent)]"
                  style={{ ["--ev-accent" as string]: ACCENT }}
                />
                <span>
                  <span className="block text-[14.5px] font-bold text-ink-strong">
                    Compulsory
                  </span>
                  <span className="block text-[13px] text-ink-muted">
                    Missing a compulsory obligation shows red and counts against
                    the monthly KPI.
                  </span>
                </span>
              </label>

              <Field label="Penalty Note">
                <textarea
                  value={form.penaltyNote}
                  onChange={(e) => set("penaltyNote", e.target.value)}
                  placeholder="e.g. else we don't get paid"
                  maxLength={2000}
                  rows={2}
                  className={baseInput}
                  style={{ ["--tw-ring-color" as string]: `${ACCENT}33` }}
                />
              </Field>

              {error && (
                <div
                  role="alert"
                  className="rounded-lg px-3.5 py-2.5 text-[14px] font-semibold"
                  style={{
                    background: "color-mix(in srgb, var(--color-altus-red) 8%, transparent)",
                    border: "1px solid color-mix(in srgb, var(--color-altus-red) 28%, transparent)",
                    color: "var(--color-altus-red-deep)",
                  }}
                >
                  {error}
                </div>
              )}

              <div className="flex justify-end gap-2 pt-1">
                <Dialog.Close asChild>
                  <button
                    type="button"
                    className="bg-surface-card rounded-pill px-4 py-2.5 text-[15px] font-semibold text-ink-muted transition-colors hover:bg-surface-soft disabled:opacity-50"
                    disabled={pending}
                  >
                    Cancel
                  </button>
                </Dialog.Close>
                <button
                  type="submit"
                  disabled={pending}
                  className="brand-btn rounded-pill px-6 py-2.5 text-[15px] font-bold text-white shadow-sm transition-transform enabled:hover:-translate-y-0.5 disabled:opacity-50"
                  style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
                >
                  {pending ? "Saving…" : isEdit ? "Save Changes" : "Add Obligation"}
                </button>
              </div>
            </form>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-[14px] font-bold text-ink-strong">
        {label}
        {required && <span className="ml-0.5 text-altus-red">*</span>}
      </label>
      {children}
    </div>
  );
}
