import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/**
 * A native <select> wearing the app's chevron instead of the operating
 * system's arrow.
 *
 * Wrap the select, and give the select `appearance-none` plus right padding
 * (e.g. `!pr-9`) so its text never runs under the chevron:
 *
 *   <Chevroned>
 *     <select className={`${FIELD} appearance-none !pr-9`}>…</select>
 *   </Chevroned>
 */
export function Chevroned({
  children,
  className = "",
  iconSize = 15,
}: {
  children: ReactNode;
  className?: string;
  iconSize?: number;
}) {
  return (
    <span className={`relative block ${className}`}>
      {children}
      <ChevronDown
        size={iconSize}
        aria-hidden
        className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-ink-subtle"
      />
    </span>
  );
}
