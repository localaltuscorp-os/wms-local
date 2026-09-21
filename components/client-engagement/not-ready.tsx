import { DatabaseZap } from "lucide-react";

/** Shown on every tab until migration 0238 has been applied. */
export function CeNotReady() {
  return (
    <div className="rounded-2xl border border-hairline bg-surface-card px-8 py-14 text-center" style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}>
      <span
        className="mx-auto mb-4 inline-flex size-16 items-center justify-center rounded-2xl"
        style={{ background: "color-mix(in srgb, var(--color-altus-red) 9%, transparent)", color: "var(--color-altus-red)" }}
      >
        <DatabaseZap size={30} strokeWidth={2.2} />
      </span>
      <h3 className="font-bold text-ink-strong" style={{ fontSize: 22, letterSpacing: "-0.01em" }}>
        Client Engagement needs its tables
      </h3>
      <p className="mx-auto mt-2 max-w-[52ch] font-medium" style={{ fontSize: 14.5, lineHeight: 1.5, color: "var(--color-ink-muted)" }}>
        Run <code className="rounded bg-surface-soft px-1.5 py-0.5 text-[13px]">db/RUN-IN-SUPABASE-0238.sql</code> against this
        database. It only adds new tables, so nothing else in the app changes.
      </p>
    </div>
  );
}
