import type { CSSProperties, ElementType, ReactNode } from "react";
import { PageShell } from "@/components/layout/page-shell";

/**
 * Presentation-only page frame for WMS sections outside the Tasks list.
 *
 * Tasks is the reference surface: a full-width, bounded content column with
 * responsive gutters and a compact top rhythm. Keeping that geometry here
 * lets WMS sections share the same visual ground without coupling any of
 * their data loaders, controls, or feature-specific content.
 */
export function WmsSectionShell({
  children,
  as,
  className = "",
  style,
}: {
  children: ReactNode;
  as?: ElementType;
  className?: string;
  style?: CSSProperties;
}) {
  return (
    <PageShell
      as={as ?? "main"}
      className={`wms-compact relative min-w-0 ${className}`}
      style={style}
    >
      {children}
    </PageShell>
  );
}
