"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Keyboard, X } from "lucide-react";
import { SHORTCUT_GROUPS } from "@/lib/shortcuts-catalog";

/**
 * KEYBOARD SHORTCUTS sheet, opened from the profile menu (Sir: "make a list of
 * shortcuts and what it does below profile of person on top right corner").
 *
 * Reads lib/shortcuts-catalog.ts — the same list the "?" overlay uses — so the
 * list can never drift from what is actually bound.
 *
 * Controlled from the parent because it is launched by a Radix DropdownMenu.Item:
 * the menu closes on select, which would unmount an uncontrolled dialog before it
 * ever painted.
 */
export function ShortcutsSheet({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-[80] bg-black/40 backdrop-blur-[2px]" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[81] w-[min(680px,94vw)] max-h-[86vh] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border border-hairline bg-surface-card p-6 shadow-2xl max-md:p-4"
          aria-describedby={undefined}
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span
                className="grid size-9 shrink-0 place-items-center rounded-xl text-white"
                style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
              >
                <Keyboard size={17} strokeWidth={2.3} />
              </span>
              <div>
                <Dialog.Title
                  className="text-[17px] font-black text-ink-strong"
                  style={{ fontFamily: "var(--font-display), system-ui, sans-serif" }}
                >
                  Keyboard shortcuts
                </Dialog.Title>
                <p className="text-[12.5px] font-medium text-ink-muted">
                  Shortcuts never fire while you are typing in a box.
                </p>
              </div>
            </div>
            <Dialog.Close
              aria-label="Close"
              className="grid size-8 shrink-0 place-items-center rounded-full text-ink-muted transition-colors hover:bg-surface-soft hover:text-ink-strong"
            >
              <X size={16} />
            </Dialog.Close>
          </div>

          <div className="flex flex-col gap-5">
            {SHORTCUT_GROUPS.map((g) => (
              <section key={g.title}>
                <h3 className="text-[11px] font-black uppercase tracking-[0.12em] text-altus-red-deep">
                  {g.title}
                </h3>
                {g.note && (
                  <p className="mt-0.5 text-[12px] font-medium text-ink-subtle">{g.note}</p>
                )}
                <ul className="mt-2 flex flex-col gap-1.5">
                  {g.items.map((s) => (
                    <li key={s.keys} className="flex items-baseline gap-3">
                      <kbd className="shrink-0 rounded-md border border-hairline-strong bg-surface-soft px-2 py-1 text-[11.5px] font-black text-ink-strong">
                        {s.keys}
                      </kbd>
                      <span className="text-[13px] font-medium text-ink-muted">{s.does}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
