"use client";

import * as Dialog from "@radix-ui/react-dialog";
import { useState } from "react";
import { Plus, X } from "lucide-react";
import { SelfLearningForm } from "./self-learning-form";

export function SelfLearningLogDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button type="button" className="brand-btn inline-flex items-center gap-2 rounded-lg px-4 py-2 text-[13px] font-bold text-white">
          <Plus size={16} strokeWidth={2.5} /> Log an Entry
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[90] bg-slate-950/35 backdrop-blur-[1px]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[100] flex max-h-[calc(100dvh-32px)] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-xl border border-hairline bg-surface-card shadow-[0_18px_44px_-30px_rgba(15,23,42,0.3)] outline-none">
          <div className="flex items-center justify-between border-b border-hairline px-5 py-3">
            <Dialog.Title className="text-[16px] font-bold text-ink-strong">Log an Entry</Dialog.Title>
            <Dialog.Close asChild>
              <button type="button" aria-label="Close" className="inline-flex size-8 items-center justify-center rounded-lg text-ink-subtle hover:bg-surface-soft hover:text-ink-strong">
                <X size={17} />
              </button>
            </Dialog.Close>
          </div>
          <div className="min-h-0 overflow-y-auto px-5 pb-1">
            <SelfLearningForm onSuccess={() => setOpen(false)} />
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
