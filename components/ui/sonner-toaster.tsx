"use client";

import { Toaster } from "sonner";

/**
 * App-wide toast surface (premium, accessible, stacked) — backed by sonner.
 * Replaces the old custom event-bus ToastHost. Brand-styled: bottom-right,
 * rich success/error colours, a close button, and rounded cards that match
 * the app's surfaces.
 */
export function AppToaster() {
  return (
    <Toaster
      position="bottom-right"
      richColors
      closeButton
      expand={false}
      gap={10}
      offset={20}
      toastOptions={{
        duration: 3800,
        classNames: {
          toast:
            "rounded-chip border border-hairline shadow-lg !text-[14px] !font-medium",
          actionButton: "!rounded-pill !font-semibold",
        },
        style: {
          fontFamily: "var(--font-sans, system-ui)",
        },
      }}
    />
  );
}
