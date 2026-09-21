import { EXEC_CATEGORIES, categoryColors } from "@/lib/exec-calendar/taxonomy";

/**
 * The §3 legend — the fixed categories (fourteen since 2026-09-18), their colours and what each one DOES.
 *
 * Rendered from the taxonomy rather than written out, so the legend cannot
 * drift from the rules: a category that gains protected time says so here the
 * same day, and a category nobody added cannot appear.
 */
export function ExecLegend({ compact = false }: { compact?: boolean }) {
  return (
    <div className="rounded-2xl border border-hairline bg-surface-card p-4">
      <h2 className="text-[13px] font-bold uppercase tracking-wide text-ink-soft">Legend</h2>
      <ul className={compact ? "mt-2 flex flex-wrap gap-x-4 gap-y-1.5" : "mt-3 space-y-2.5"}>
        {EXEC_CATEGORIES.map((c) => {
          const col = categoryColors(c.key);
          return (
            <li key={c.key} className="flex items-start gap-2">
              <span
                className="mt-[3px] h-3 w-3 shrink-0 rounded-[4px]"
                style={{ background: col.base, border: `1px solid ${col.edge}` }}
              />
              <span className="min-w-0">
                <span className="block text-[12.5px] font-semibold text-ink-strong">
                  {c.label}
                  {c.protected && (
                    <span
                      className="ml-1.5 rounded-pill px-1.5 py-[1px] text-[10px] font-bold uppercase"
                      style={{ background: col.bg, color: col.deep }}
                      title="Only the calendar's owner can book over this time"
                    >
                      protected
                    </span>
                  )}
                </span>
                {!compact && (
                  <span className="mt-0.5 block text-[11.5px] leading-snug text-ink-muted">{c.blurb}</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {!compact && (
        /* "Protected" was a label with no meaning attached (asked 2026-09-18).
           Spelled out once, under the list, rather than in every blurb. */
        <p className="mt-3 border-t border-hairline pt-2.5 text-[11.5px] leading-snug text-ink-muted">
          <span className="font-bold text-ink-strong">Protected</span>{" "}means only the
          calendar&rsquo;s owner can put something else over that time. Anyone else who tries
          is refused.
        </p>
      )}
    </div>
  );
}
