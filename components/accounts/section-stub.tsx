import { Wrench } from "lucide-react";
import type { AccountsSection } from "@/lib/accounts/sections";

/**
 * Reusable "ready-to-extend" panel for stubbed Accounts sections. Renders the
 * section's source columns as an empty full-width table so the intended shape
 * is visible, with a clean empty-state body — intentional scaffold, not a
 * placeholder dump.
 */
export function SectionStub({ section }: { section: AccountsSection }) {
  const columns = section.columns ?? [];

  return (
    <main className="w-full px-8 max-md:px-4 pt-8 pb-16">
      <header className="mt-4 mb-7 wg-rise">
        <span
          className="text-[11px] font-bold uppercase tracking-[0.2em]"
          style={{ color: "var(--color-altus-red-deep)" }}
        >
          Accounts
        </span>
        <h1
          className="text-ink-strong"
          style={{
            fontFamily: "var(--font-display), system-ui, sans-serif",
            fontWeight: 900,
            fontSize: "clamp(28px, 3.2vw, 42px)",
            letterSpacing: "-0.025em",
            lineHeight: 1.05,
            marginTop: 6,
            maxWidth: "24ch",
          }}
        >
          {section.title}
        </h1>
        <p className="mt-2 font-medium text-ink-muted" style={{ fontSize: 15.5, maxWidth: "64ch" }}>
          {section.blurb}
        </p>
      </header>

      <section
        className="rounded-section border border-hairline bg-surface-card overflow-hidden wg-rise"
        style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)", animationDelay: "60ms" }}
      >
        {columns.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left" style={{ minWidth: Math.max(640, columns.length * 130) }}>
              <thead>
                <tr style={{ background: "var(--color-surface-soft)" }}>
                  {columns.map((c, i) => (
                    <th
                      key={`${c}-${i}`}
                      className="whitespace-nowrap px-4 py-3 text-[12px] font-bold uppercase tracking-[0.06em] text-ink-soft border-b border-hairline"
                      scope="col"
                    >
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td colSpan={columns.length} className="px-6 py-16 text-center">
                    <EmptyState />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        ) : (
          <div className="px-6 py-16 text-center">
            <EmptyState />
          </div>
        )}
      </section>
    </main>
  );
}

function EmptyState() {
  return (
    <div className="inline-flex flex-col items-center gap-3">
      <span
        className="grid place-items-center rounded-2xl"
        style={{
          width: 52,
          height: 52,
          background: "var(--color-surface-soft)",
          color: "var(--color-ink-soft)",
        }}
        aria-hidden
      >
        <Wrench size={24} strokeWidth={2.2} />
      </span>
      <p className="text-ink-strong font-bold" style={{ fontSize: 16 }}>
        Structure is ready
      </p>
      <p className="text-ink-muted font-medium" style={{ fontSize: 14, maxWidth: "42ch", lineHeight: 1.5 }}>
        The detailed spec for this section is being wired — the columns above
        capture the intended shape from the master sheet.
      </p>
    </div>
  );
}
