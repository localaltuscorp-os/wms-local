import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { StatPill, type StatTone } from "@/components/admin/ui/stat-pill";
import { PageCommandBar } from "@/components/layout/page-command-bar";
import { cn } from "@/lib/utils";

export interface AdminSectionStat {
  label: string;
  value: string | number;
  tone?: StatTone;
}

export interface AdminSectionProps {
  /**
   * DEPRECATED — no longer rendered.
   *
   * This was the red uppercase breadcrumb pill ("ADMIN · PEOPLE") above every
   * title. The admin sidebar already says which section you are in and the
   * title says which page, so the pill restated both in the loudest type on the
   * screen. The prop is KEPT (not removed) so the seventeen admin pages that
   * pass it need no edit; it is simply ignored.
   */
  eyebrow?: string;
  /** The big display title, e.g. "The team". */
  title: string;
  /**
   * Supporting line. Now rendered INLINE to the right of the title as quiet
   * helper text, never underneath it — it costs no vertical space there.
   */
  subtitle?: string;
  /**
   * DEPRECATED — no longer rendered. The 52px brand-red icon tile beside the
   * title. Kept for call-site compatibility, same as `eyebrow`.
   */
  icon?: LucideIcon;
  /** Premium stat pills — the KPI row. Rendered in the bar's second row. */
  stats?: AdminSectionStat[];
  /** Right-aligned actions slot (buttons, export links, primary dialogs). */
  actions?: ReactNode;
  /** The page body — lists, tables, forms. */
  children: ReactNode;
  className?: string;
}

/**
 * The shared header + body frame for EVERY admin section page.
 *
 * Because all seventeen admin pages already route through this one component,
 * restyling it is what standardises the whole module — there are no per-page
 * CSS overrides to chase, and no page file needs to change.
 *
 * It now delegates its header to `PageCommandBar`
 * (components/layout/page-command-bar.tsx), the same component the Goals,
 * Accounts and Employees rooms use, so "the Yearly Goals header" is literally
 * one object rather than a look reproduced in several places.
 *
 * What that changed, versus the old glassy `admin-section-band`:
 *   · the red uppercase eyebrow pill is gone (see `eyebrow`)
 *   · the 52px red icon tile is gone (see `icon`)
 *   · the 44px display title drops to the shared clamp(22px, 2vw, 32px)
 *   · the subtitle moves INLINE, right of the title, instead of a 15px line
 *     beneath it
 *   · header padding drops from px-6 py-6 to the bar's 56px row
 *
 * KPI SAFETY: `stats` still renders the SAME `StatPill` component, in the same
 * order, with the same tones. It moves into the bar's second row — which is
 * where it already sat relative to the title (inside the header block), so the
 * pills stay directly under the title rather than being re-homed.
 *
 * Server-safe (no hooks, no "use client") — drop it straight into an admin
 * section page.tsx.
 *
 * Usage is UNCHANGED; `eyebrow` and `icon` are accepted and ignored:
 *   <AdminSection
 *     title="The team"
 *     subtitle="12 total · 9 active"
 *     stats={[{ label: "Total", value: 12 }, { label: "Active", value: 9, tone: "green" }]}
 *     actions={<InviteEmployeeDialog … />}
 *   >
 *     <EmployeeList … />
 *   </AdminSection>
 */
export function AdminSection({
  title,
  subtitle,
  stats,
  actions,
  children,
  className,
}: AdminSectionProps) {
  const hasStats = Boolean(stats && stats.length > 0);

  return (
    <div className={cn("wg-rise", className)}>
      <PageCommandBar
        title={title}
        hint={subtitle}
        actions={actions}
        toolbar={
          hasStats ? (
            <div className="flex flex-wrap gap-2">
              {stats!.map((s, i) => (
                <StatPill
                  key={`${s.label}-${i}`}
                  label={s.label}
                  value={s.value}
                  tone={s.tone}
                />
              ))}
            </div>
          ) : undefined
        }
      />

      {/* No top margin of its own — `PageCommandBar` already carries `mb-4`,
          and the old `mt-6` on top of that was 40px of dead space between the
          header and the table it heads. */}
      <div>{children}</div>
    </div>
  );
}
