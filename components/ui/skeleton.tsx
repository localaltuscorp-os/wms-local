import { cn } from "@/lib/utils";

/**
 * Pulsing placeholder box, used by `loading.tsx` files to paint a
 * skeleton of the route while the server component streams its data.
 * The animation cue is the only signal that something is happening —
 * keep colours muted so it doesn't compete with the live header.
 */
export function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      aria-hidden
      className={cn(
        "animate-pulse rounded-md bg-[color:var(--color-fog,#e5e7eb)]/70",
        className,
      )}
      {...props}
    />
  );
}
