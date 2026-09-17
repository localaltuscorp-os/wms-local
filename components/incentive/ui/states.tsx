import type { LucideIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

/**
 * THE MODULE'S ONE EMPTY STATE.
 *
 * It replaces eight different treatments, from a bare `<p>` to a 10-unit padded
 * card with its own icon tile. Copy rule, from the design language: the heading
 * names the empty thing, the body says what to do next — never just that the
 * list is empty.
 */
export function IncentiveEmptyState({
  icon: Icon,
  title,
  body,
  action,
  compact = false,
}: {
  icon?: LucideIcon;
  title: string;
  body?: string;
  action?: React.ReactNode;
  /** Inside a table or a small panel, where the full-size version would tower. */
  compact?: boolean;
}) {
  return (
    <div className={compact ? "px-5 py-8 text-center" : "px-6 py-12 text-center"}>
      {Icon ? (
        <span
          aria-hidden
          className={`mx-auto mb-3 inline-flex items-center justify-center rounded-2xl ${
            compact ? "size-10" : "size-14"
          }`}
          style={{
            background: "color-mix(in srgb, var(--color-altus-red) 9%, transparent)",
            color: "var(--color-altus-red)",
          }}
        >
          <Icon size={compact ? 20 : 26} strokeWidth={2.2} />
        </span>
      ) : null}
      <p className="font-bold text-ink-strong" style={{ fontSize: compact ? 15 : 17 }}>
        {title}
      </p>
      {body ? (
        <p
          className="mx-auto mt-1.5 max-w-[46ch] font-medium text-ink-muted"
          style={{ fontSize: 13.5, lineHeight: 1.5 }}
        >
          {body}
        </p>
      ) : null}
      {action ? <div className="mt-4 flex justify-center">{action}</div> : null}
    </div>
  );
}

/** Table placeholder — used by `loading.tsx` and by streamed panels. */
export function IncentiveTableSkeleton({ rows = 6, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="rounded-2xl border border-hairline bg-surface-card p-4">
      <div className="flex items-center gap-2">
        <Skeleton className="h-8 w-[220px]" />
        <Skeleton className="ml-auto h-8 w-[90px]" />
      </div>
      <div className="mt-4 space-y-2">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-3">
            {Array.from({ length: cols }).map((__, c) => (
              <Skeleton key={c} className={`h-6 ${c === 0 ? "w-[26%]" : "flex-1"}`} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/** KPI band placeholder. */
export function IncentiveKpiSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-[86px] rounded-2xl" />
      ))}
    </div>
  );
}
