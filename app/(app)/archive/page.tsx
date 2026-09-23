import { redirect } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { PageShell } from "@/components/layout/page-shell";
import { PageCommandBar, COMMAND_PAGE_CLASS } from "@/components/layout/page-command-bar";
import {
  ArchivePeopleFilter,
  ArchiveScopeSwitch,
  EmptyPanel,
} from "@/components/archive/archive-chrome";
import { requireUser } from "@/lib/auth/current";
import {
  ARCHIVE_SCOPE_LABEL,
  ARCHIVE_SECTIONS,
  archiveQuery,
  parseArchiveScope,
  type ArchiveSection,
} from "@/lib/archive/sections";
import { archiveSectionCounts, listArchivePeople } from "@/lib/queries/archive";
import { WORKSPACE_LABEL, type WorkspaceId } from "@/lib/workspaces";
import { formatCount } from "@/lib/format";

export const dynamic = "force-dynamic";

/**
 * THE ARCHIVE INDEX — every module's archive on one page, with the roster of
 * the people it is about.
 *
 * Each room's rail opens straight into its own section; this is the view from
 * above, for the question the rail cannot answer: "we are looking for something
 * of X's — which module still has it?" Pick the person up here and every card
 * re-counts for them, so the answer is the card carrying a number.
 *
 * TWO HALVES (Sir, 2026-09): Past Employees, the default, and Present
 * Employees — the same fifteen readings pointed at people still on the roster.
 * The switch is the first control on the page because it changes what every
 * number under it means.
 */
export default async function ArchiveIndexPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const me = await requireUser();
  if (!me.isAdmin) redirect("/hub" as Route);

  const sp = await searchParams;
  const scope = parseArchiveScope(sp.scope);
  const employeeId = typeof sp.emp === "string" && sp.emp ? sp.emp : undefined;

  const [people, counts, otherCount] = await Promise.all([
    listArchivePeople(scope),
    archiveSectionCounts({ scope, employeeId }),
    // Head-count only for the half you are NOT looking at — enough for the
    // switch to say what is behind it, without reading that side's records.
    listArchivePeople(scope === "past" ? "present" : "past").then((p) => p.length),
  ]);

  const who = employeeId ? people.find((p) => p.id === employeeId) : undefined;

  // Grouped in registry order so the page reads room by room, the way the hub
  // and the sidebar do.
  const byRoom = new Map<WorkspaceId, ArchiveSection[]>();
  for (const s of ARCHIVE_SECTIONS) {
    const list = byRoom.get(s.workspace) ?? [];
    list.push(s);
    byRoom.set(s.workspace, list);
  }

  const totalRecords = Object.values(counts).reduce((a, b) => a + b, 0);

  return (
    <PageShell width="full" py={false} className={COMMAND_PAGE_CLASS}>
      <PageCommandBar
        title="Archive"
        hint={
          scope === "past"
            ? "Everything belonging to people who have left — read-only, in whatever state they left it."
            : "The same reading, for people still on the roster — every module's record of them in one place, read-only."
        }
        toolbar={
          <div className="flex flex-col gap-2.5">
            <ArchiveScopeSwitch
              scope={scope}
              basePath="/archive"
              counts={
                scope === "past"
                  ? { past: people.length, present: otherCount }
                  : { past: otherCount, present: people.length }
              }
            />
            <ArchivePeopleFilter
              people={people}
              scope={scope}
              employeeId={employeeId}
              basePath="/archive"
            />
          </div>
        }
      />

      {people.length === 0 ? (
        <EmptyPanel
          title={scope === "past" ? "No past employees yet" : "Nobody on the active roster"}
          line={
            scope === "past"
              ? "Nobody has been marked inactive. When someone leaves, every module's archive fills itself from the records already in place — nothing has to be moved or re-entered."
              : "Every employee account is inactive, so the Present view has nobody to read. Switch to Past Employees."
          }
        />
      ) : (
        <>
          <p className="mb-5 text-[13px] font-medium text-ink-muted">
            {formatCount(people.length)} {scope === "past" ? "past" : "present"}{" "}
            {people.length === 1 ? "employee" : "employees"} · {formatCount(totalRecords)}{" "}
            {totalRecords === 1 ? "record" : "records"}
            {who ? (
              <>
                {" "}
                · showing <strong className="text-ink-strong">{who.name}</strong>
                {who.lastWorkingDay ? `, last working day ${who.lastWorkingDay}` : ""}
              </>
            ) : null}
          </p>

          {[...byRoom.entries()].map(([room, sections]) => (
            <section key={room} className="mb-8 wg-rise">
              <h2 className="mb-3 text-[12px] font-black uppercase tracking-[0.08em] text-ink-muted">
                {WORKSPACE_LABEL[room]}
              </h2>
              <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
                {sections.map((s) => (
                  <Link
                    key={s.id}
                    href={`/archive/${s.id}${archiveQuery({ scope, employeeId })}` as Route}
                    className="rounded-section border border-hairline bg-surface-card px-4 py-4 transition-shadow hover:shadow-[0_8px_24px_-12px_rgba(15,23,42,0.25)]"
                    style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}
                  >
                    <span className="flex items-center justify-between gap-3">
                      <span className="flex items-center gap-2 text-[14px] font-black tracking-tight text-ink-strong">
                        <s.Icon size={16} strokeWidth={2.2} />
                        {s.label}
                      </span>
                      <span className="text-mono text-[13px] font-bold text-ink-muted">
                        {formatCount(counts[s.id] ?? 0)}
                      </span>
                    </span>
                    <span className="mt-1.5 block text-[12.5px] font-medium leading-snug text-ink-muted">
                      {s.blurb}
                    </span>
                  </Link>
                ))}
              </div>
            </section>
          ))}

          <section className="mt-10 wg-rise">
            <h2 className="mb-3 text-[12px] font-black uppercase tracking-[0.08em] text-ink-muted">
              {ARCHIVE_SCOPE_LABEL[scope]}
            </h2>
            <div
              className="rounded-section border border-hairline bg-surface-card overflow-hidden"
              style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}
            >
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left" style={{ minWidth: 820 }}>
                  <thead>
                    <tr style={{ background: "var(--color-surface-soft)" }}>
                      {(scope === "past"
                        ? ["Name", "Email", "Department", "Role", "Joined", "Last working day", "Exit reason"]
                        : ["Name", "Email", "Department", "Role", "Joined"]
                      ).map(
                        (h) => (
                          <th
                            key={h}
                            scope="col"
                            className="whitespace-nowrap px-4 py-3 text-[12px] font-bold uppercase tracking-[0.06em] text-ink-soft border-b border-hairline"
                          >
                            {h}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {people.map((p) => (
                      <tr key={p.id} className="border-b border-hairline last:border-b-0">
                        <td className="px-4 py-2.5 text-[13.5px] font-semibold text-ink-strong">
                          <Link
                            href={`/archive${archiveQuery({ scope, employeeId: p.id })}` as Route}
                            className="hover:underline"
                          >
                            {p.name}
                          </Link>
                        </td>
                        <td className="px-4 py-2.5 text-[13.5px] text-ink-muted">{p.email}</td>
                        <td className="px-4 py-2.5 text-[13.5px] text-ink-strong">
                          {p.department ?? <span className="text-ink-subtle">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-[13.5px] text-ink-strong">{p.role}</td>
                        <td className="px-4 py-2.5 text-[13.5px] text-ink-strong">
                          {p.joinedAt ?? <span className="text-ink-subtle">—</span>}
                        </td>
                        {/* Exit facts only exist on the Past side; the Present
                            table ends at Joined rather than carrying two columns
                            of em-dashes for everyone still here. */}
                        {scope === "past" && (
                          <>
                            <td className="px-4 py-2.5 text-[13.5px] text-ink-strong">
                              {p.lastWorkingDay ?? p.deactivatedAt ?? (
                                <span className="text-ink-subtle">—</span>
                              )}
                            </td>
                            <td className="px-4 py-2.5 text-[13.5px] text-ink-strong">
                              {p.exitReason ?? <span className="text-ink-subtle">—</span>}
                            </td>
                          </>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        </>
      )}
    </PageShell>
  );
}
