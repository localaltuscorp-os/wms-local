"use client";

import * as React from "react";
import { Maximize2, Minimize2 } from "lucide-react";

/**
 * The "Full screen" button that sits beside a master screen's search bar.
 *
 * The browser Fullscreen API on the whole page — the same mechanism
 * `components/tasks/focus-workspace.tsx` uses. Extracted here because
 * Customer Master had it inline and every Client KYC directory wanted it too;
 * a third and fourth hand-copied toggle is how the icon ends up flipping the
 * wrong way on one screen and not the others.
 *
 * `requestFullscreen` rejects when the browser refuses (an iframe without the
 * permission, or a call the user didn't initiate). Swallowed on purpose: the
 * page works fine un-maximised, and an error toast for a cosmetic control
 * would be worse than the button quietly doing nothing.
 *
 * Entering also stamps `data-app-fullscreen` on the root element, which
 * globals.css uses to fold away the module's left rail. Browser fullscreen
 * alone only removes the BROWSER's chrome — the app's own sidebar would sit
 * there taking a quarter of the screen you just asked to fill.
 *
 * Two skins, one implementation:
 *   "labelled" (default) — the icon+text button beside a master screen's
 *                          search bar, on a light surface.
 *   "header"             — icon-only circle for the navy app header, matching
 *                          the back/forward pills in nav-history-buttons.tsx.
 * A prop rather than a second component precisely because of the note above:
 * a hand-copied toggle is how the icon ends up flipping the wrong way on one
 * screen and not the others.
 */
export function FullscreenToggle({
  variant = "labelled",
  size = "md",
}: {
  variant?: "labelled" | "header";
  /**
   * Height of the "labelled" skin. "md" matches a master screen's search bar;
   * "sm" matches a filter chip, for headers where this button sits in a row of
   * them rather than next to a full-height input. Ignored by "header", which
   * is a fixed-size circle in the app bar.
   */
  size?: "sm" | "md";
} = {}) {
  const [isFullscreen, setIsFullscreen] = React.useState(false);

  React.useEffect(() => {
    // Driven by the event, not by what we asked for: Escape and the browser's
    // own chrome exit fullscreen without going through this button.
    const onChange = () => {
      const on = Boolean(document.fullscreenElement);
      setIsFullscreen(on);
      document.documentElement.toggleAttribute("data-app-fullscreen", on);
    };
    document.addEventListener("fullscreenchange", onChange);
    return () => {
      document.removeEventListener("fullscreenchange", onChange);
      // Leaving the page while maximised must not strand the attribute on the
      // root, or the next screen renders with no sidebar and no way back.
      document.documentElement.removeAttribute("data-app-fullscreen");
    };
  }, []);

  function toggle() {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => undefined);
    } else {
      document.exitFullscreen?.().catch(() => undefined);
    }
  }

  const label = isFullscreen ? "Exit full screen" : "Enter full screen";
  const Icon = isFullscreen ? Minimize2 : Maximize2;

  if (variant === "header") {
    // Same 36px circle as the back/forward pills so the header's icon-only
    // controls stay one family. Hover mirrors theirs exactly.
    return (
      <button
        type="button"
        onClick={toggle}
        title={label}
        aria-label={label}
        aria-pressed={isFullscreen}
        className="shrink-0 max-md:hidden"
        style={{
          width: 30,
          height: 30,
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          borderRadius: 9999,
          background: "rgba(255, 255, 255, 0.08)",
          border: "1.5px solid rgba(255, 255, 255, 0.16)",
          color: "rgba(255, 255, 255, 0.88)",
          cursor: "pointer",
          transition:
            "background-color 180ms ease, border-color 180ms ease, transform 180ms ease, box-shadow 220ms ease",
          outline: "none",
        }}
        onMouseEnter={(e) => {
          const el = e.currentTarget;
          el.style.background = "rgba(255, 255, 255, 0.18)";
          el.style.borderColor = "rgba(255, 255, 255, 0.32)";
          el.style.transform = "translateY(-1px)";
          el.style.boxShadow = "0 4px 12px rgba(0, 0, 0, 0.25)";
        }}
        onMouseLeave={(e) => {
          const el = e.currentTarget;
          el.style.background = "rgba(255, 255, 255, 0.08)";
          el.style.borderColor = "rgba(255, 255, 255, 0.16)";
          el.style.transform = "";
          el.style.boxShadow = "";
        }}
      >
        <Icon size={15} strokeWidth={2.4} />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={toggle}
      title={label}
      aria-label={label}
      aria-pressed={isFullscreen}
      className={`shrink-0 inline-flex items-center gap-1.5 rounded-chip font-semibold text-ink-soft bg-surface-card border border-hairline whitespace-nowrap ${
        size === "sm" ? "px-2.5 h-[26px] text-[12px] !rounded-[8px]" : "px-3.5 h-10 text-[14px]"
      }`}
    >
      <Icon size={size === "sm" ? 12 : 15} strokeWidth={2.3} className="shrink-0" />
      {isFullscreen ? "Exit" : "Full screen"}
    </button>
  );
}
