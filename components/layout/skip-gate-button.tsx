"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, Loader2 } from "lucide-react";
import { skipGatesForToday } from "@/app/(app)/gate-skip-action";

/**
 * Floating "Skip for today" control — rendered by the (app) layout OVER any
 * active gate, but ONLY for super-admins. Sets the day-scoped skip cookie and
 * refreshes so the gate chain re-evaluates and passes.
 */
export function SkipGateButton() {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <div className="fixed bottom-5 right-5 z-[60]">
      <button
        type="button"
        onClick={() =>
          start(async () => {
            await skipGatesForToday();
            router.refresh();
          })
        }
        disabled={pending}
        className="inline-flex items-center gap-1.5 rounded-full border border-hairline-strong bg-white/90 px-4 py-2.5 text-[13.5px] font-bold text-ink-strong shadow-lg backdrop-blur transition-transform active:scale-[0.98] hover:border-[color:var(--color-altus-red)] disabled:opacity-60"
        style={{ boxShadow: "0 14px 36px -16px rgba(0,0,0,0.5)" }}
      >
        {pending ? <Loader2 size={15} className="animate-spin" /> : <ChevronRight size={15} strokeWidth={2.8} />}
        Skip for today
      </button>
    </div>
  );
}
