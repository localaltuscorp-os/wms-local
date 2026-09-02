"use client";

import { AlertCircle } from "lucide-react";

/**
 * Friendly inline error card. Slides in from above with a red glyph + message
 * instead of slapping a brutal red border on the whole input.
 */
export function AuthError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="flex items-start gap-2.5 rounded-xl px-3.5 py-3 text-[14px]"
      style={{
        background:
          "linear-gradient(135deg, rgba(225, 6, 0, 0.06), rgba(244, 63, 94, 0.06))",
        border: "1px solid rgba(225, 6, 0, 0.25)",
        color: "var(--color-altus-red-deep)",
        animation:
          "errorSlide 240ms cubic-bezier(0.2, 0.7, 0.3, 1) both",
      }}
    >
      <AlertCircle className="h-4 w-4 shrink-0 mt-[1px]" aria-hidden />
      <span className="leading-snug">{message}</span>
    </div>
  );
}
