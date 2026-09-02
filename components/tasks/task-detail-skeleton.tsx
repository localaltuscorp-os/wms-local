/**
 * Placeholder UI shown while the task detail page is streaming.
 *
 * Roughly matches the dimensions of `TaskDetailView` so the layout
 * doesn't jump when content arrives — same two-column grid on desktop,
 * single column on mobile. Pure CSS shimmer; no client JS needed.
 */
export function TaskDetailSkeleton() {
  return (
    <div
      aria-busy
      aria-live="polite"
      aria-label="Loading task"
      className="grid grid-cols-[minmax(0,1fr)_360px] gap-10 max-lg:grid-cols-1 max-lg:gap-6"
    >
      {/* LEFT — document */}
      <div className="min-w-0">
        {/* Top-right action chips */}
        <div className="flex justify-end gap-2 mb-4">
          <Block w={92} h={32} pill />
          <Block w={104} h={32} pill />
          <Block w={108} h={32} pill />
        </div>

        {/* Subject + priority + status pill */}
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <Block w={88} h={26} pill />
          <Block w={120} h={26} pill />
          <Block w={96} h={26} pill />
        </div>

        {/* Title (client name) */}
        <Block w="60%" h={22} />
        {/* Description — large */}
        <div className="mt-3 space-y-2">
          <Block w="100%" h={28} />
          <Block w="92%" h={28} />
          <Block w="68%" h={28} />
        </div>

        {/* Meta strip */}
        <div className="mt-8 pt-6 grid grid-cols-2 gap-6 max-sm:grid-cols-1" style={{ borderTop: "1px solid var(--color-hairline)" }}>
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex flex-col gap-2">
              <Block w={64} h={11} />
              <Block w="70%" h={18} />
            </div>
          ))}
        </div>

        {/* Audit feed header */}
        <div className="mt-10">
          <Block w={120} h={16} />
          <div className="mt-4 space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3">
                <Block w={32} h={32} circle />
                <div className="flex-1 space-y-2">
                  <Block w="40%" h={14} />
                  <Block w="80%" h={12} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* RIGHT — action rail */}
      <div className="flex flex-col gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="rounded-section border border-hairline bg-surface-card p-5"
          >
            <Block w={120} h={11} />
            <div className="mt-3 space-y-2">
              <Block w="80%" h={14} />
              <Block w="55%" h={14} />
            </div>
            <div className="mt-4">
              <Block w="100%" h={40} pill />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

interface BlockProps {
  w: number | string;
  h: number | string;
  pill?: boolean;
  circle?: boolean;
}

function Block({ w, h, pill, circle }: BlockProps) {
  const radius = circle ? "9999px" : pill ? "9999px" : "6px";
  return (
    <span
      aria-hidden
      className="block"
      style={{
        width: typeof w === "number" ? `${w}px` : w,
        height: typeof h === "number" ? `${h}px` : h,
        borderRadius: radius,
        background:
          "linear-gradient(90deg, rgba(15,23,42,0.05) 0%, rgba(15,23,42,0.09) 50%, rgba(15,23,42,0.05) 100%)",
        backgroundSize: "200% 100%",
        animation: "skeletonShimmer 1.4s ease-in-out infinite",
      }}
    />
  );
}
