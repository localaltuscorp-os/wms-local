import { ArrowRightLeft, CalendarClock, Palette, Pencil, Plus, Target, Trash2, type LucideIcon } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { loadCePage } from "@/lib/client-engagement/page-context";
import { listCeAudit, listCeMembers, listLinkableEmployees } from "@/lib/queries/client-engagement";
import { CeNotReady } from "@/components/client-engagement/not-ready";
import { TeamPanel } from "@/components/client-engagement/team-panel";

export const dynamic = "force-dynamic";

const ICON: Record<string, LucideIcon> = {
  create: Plus,
  update: Pencil,
  assign: ArrowRightLeft,
  transfer: ArrowRightLeft,
  status: Palette,
  reference_count: Target,
  delete: Trash2,
};

const fmt = (iso: string) =>
  new Date(iso).toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

/**
 * OPERATIONS → CLIENT ENGAGEMENT → TEAM & LOG.
 *
 * The roster (who can carry accounts, their capacity) and the audit log: every
 * assignment, transfer, status colour change and reference count, with who did
 * it and when.
 */
export default async function ClientEngagementTeam() {
  const ctx = await loadCePage();
  if (!ctx.ready) {
    return (
      <PageShell width="full">
        <CeNotReady />
      </PageShell>
    );
  }

  const [members, employees, log] = await Promise.all([
    listCeMembers({ includeInactive: true }),
    ctx.canManage ? listLinkableEmployees() : Promise.resolve([]),
    listCeAudit({ limit: 200 }),
  ]);

  return (
    <PageShell width="full">
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <TeamPanel members={members} employees={employees} canManage={ctx.canManage} />

        <section className="overflow-hidden rounded-2xl border border-hairline bg-surface-card" style={{ boxShadow: "0 1px 2px rgba(15,23,42,0.04), 0 12px 30px -24px rgba(15,23,42,0.22)" }}>
          <header className="flex items-center gap-2 border-b border-hairline px-4 py-3">
            <CalendarClock size={15} strokeWidth={2.4} className="text-ink-subtle" />
            <h2 className="text-[16px] font-extrabold text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif" }}>
              Activity
            </h2>
            <span className="ml-auto text-[12px] text-ink-subtle">Latest {log.length}</span>
          </header>
          {log.length === 0 ? (
            <p className="px-4 py-10 text-center text-[13px] font-medium text-ink-subtle">Nothing has changed yet.</p>
          ) : (
            <ol className="max-h-[70vh] overflow-y-auto">
              {log.map((row) => {
                const Icon = ICON[row.action] ?? Pencil;
                const tone = row.action === "delete" ? "red" : row.action === "transfer" || row.action === "assign" ? "indigo" : row.action === "status" ? "purple" : row.action === "reference_count" ? "green" : "slate";
                return (
                  <li key={row.id} className="flex items-start gap-3 border-b border-hairline px-4 py-2.5 last:border-0">
                    <span
                      className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-lg"
                      style={{ color: `var(--color-${tone}-deep)`, background: `color-mix(in srgb, var(--color-${tone}) 40%, transparent)` }}
                    >
                      <Icon size={13} strokeWidth={2.5} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] font-semibold text-ink-strong">{row.summary}</p>
                      <p className="text-[11.5px] text-ink-subtle">
                        {row.actorName ?? "Someone"} · {fmt(row.createdAt)}
                      </p>
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>
      </div>
    </PageShell>
  );
}
