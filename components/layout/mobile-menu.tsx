"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Menu, X } from "lucide-react";

/**
 * Tier-3 mobile fix — the public header hides the primary nav at
 * `max-md:hidden` and previously left mobile users with no way to
 * navigate. This component is the missing piece: a cyan hamburger
 * button that opens a slide-in drawer containing the same MainNav
 * the desktop header renders.
 *
 * Server-rendered children are passed in by `MobileMenuServer`.
 * Auto-closes when any nav link is clicked (via `onPointerDown` on
 * the drawer body) so a mobile user goes from open → click → land
 * on the new page with no extra tap.
 */
export function MobileMenu({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          aria-label="Open navigation"
          className="md:hidden inline-flex items-center justify-center size-10 rounded-full border border-hairline bg-white/80 text-ink-strong active:scale-95 transition-transform"
          style={{
            boxShadow: "0 1px 3px rgba(15, 23, 42, 0.06)",
          }}
        >
          <Menu size={20} strokeWidth={2.4} />
        </button>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-[60]"
          style={{
            // No backdrop-filter here: animating opacity over a backdrop
            // blur re-blurs the whole page every frame and visibly stutters
            // the drawer on phones (the header already runs its own blur).
            background: "rgba(15, 23, 42, 0.44)",
            animation: "fadeOverlayIn 200ms ease-out forwards",
          }}
        />
        <Dialog.Content
          className="fixed left-0 top-0 z-[61] h-dvh w-[82vw] max-w-[360px] flex flex-col"
          style={{
            background:
              "linear-gradient(180deg, #ffffff 0%, var(--color-surface-soft) 100%)",
            borderRight: "1px solid var(--color-hairline)",
            boxShadow: "0 20px 48px rgba(15, 23, 42, 0.18)",
            animation: "slideMenuIn 220ms cubic-bezier(0.22, 1, 0.36, 1) forwards",
            // Own compositor layer — the slide stays on the GPU instead of
            // repainting the gradient + shadow every frame.
            willChange: "transform, opacity",
          }}
        >
          <div
            className="flex items-center justify-between px-5 py-4 border-b"
            style={{ borderColor: "var(--color-hairline)" }}
          >
            <Dialog.Title className="text-table-head text-ink-muted">
              Menu
            </Dialog.Title>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close navigation"
                className="inline-flex items-center justify-center size-9 rounded-full text-ink-strong hover:bg-black/5 transition-colors"
              >
                <X size={20} strokeWidth={2.4} />
              </button>
            </Dialog.Close>
          </div>
          {/* Tapping any link inside fires this — pointerdown closes the
              drawer before next-router begins navigation, so the user
              sees a clean transition rather than menu-then-page-flash. */}
          <div
            className="flex-1 overflow-y-auto p-4 mobile-menu-body"
            onPointerDown={(e) => {
              const target = e.target as HTMLElement;
              if (target.closest("a")) setOpen(false);
            }}
          >
            {children}
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
