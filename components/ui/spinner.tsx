/**
 * Circular buffering spinner — a clean SVG ring with a spinning arc, the kind
 * larger products use while content resolves. Inherits `currentColor`, so set
 * the colour with a text utility (defaults to the brand red). Sizes via the
 * `size` prop. Pair with a label via <BufferingState/> for full-page waits.
 */
export function Spinner({
  size = 22,
  strokeWidth = 2.5,
  className = "",
}: {
  size?: number;
  strokeWidth?: number;
  className?: string;
}) {
  return (
    <span
      role="status"
      aria-label="Loading"
      className={className || "text-altus-red"}
      style={{ display: "inline-flex", lineHeight: 0 }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 24 24"
        className="animate-spin"
        style={{ display: "block" }}
      >
        {/* Track */}
        <circle
          cx="12"
          cy="12"
          r="9.5"
          fill="none"
          stroke="currentColor"
          strokeOpacity="0.16"
          strokeWidth={strokeWidth}
        />
        {/* Spinning arc (a quarter turn with rounded caps) */}
        <path
          d="M12 2.5 a 9.5 9.5 0 0 1 9.5 9.5"
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
        />
      </svg>
    </span>
  );
}

/**
 * Centered spinner + label for full-page / section loading states. Drop into
 * a `loading.tsx` so the wait reads as an intentional "buffering" moment.
 */
export function BufferingState({
  label = "Loading…",
  className = "",
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={`flex flex-col items-center justify-center gap-3 ${className}`}
      role="status"
      aria-live="polite"
    >
      <Spinner size={34} strokeWidth={2.75} className="text-altus-red" />
      <span className="text-[14px] font-semibold text-ink-soft">{label}</span>
    </div>
  );
}

/**
 * Viewport-centered buffering overlay for `loading.tsx` files — a single,
 * consistent "circle + label" shown over the route's skeleton on EVERY slow
 * page, so the loading experience is uniform app-wide (not tasks-only).
 * Pointer-events-none so it never blocks the skeleton beneath it.
 */
export function PageBuffering({ label = "Loading…" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-0 z-30 flex items-center justify-center"
    >
      <div className="flex flex-col items-center gap-3 rounded-2xl bg-white/65 px-7 py-6 backdrop-blur-[2px] shadow-sm">
        <Spinner size={34} strokeWidth={2.75} className="text-altus-red" />
        <span className="text-[14px] font-semibold text-ink-soft">{label}</span>
      </div>
    </div>
  );
}
