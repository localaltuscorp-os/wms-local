import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import type { Route } from "next";
import { FolderArchive } from "lucide-react";
import { PageShell } from "@/components/layout/page-shell";
import { PageCommandBar, COMMAND_PAGE_CLASS } from "@/components/layout/page-command-bar";
import {
  ArchivePeopleFilter,
  ArchiveScopeSwitch,
  ArchiveSectionChips,
  ArchiveTables,
  EmptyPanel,
} from "@/components/archive/archive-chrome";
import { requireUser } from "@/lib/auth/current";
import {
  ARCHIVE_SCOPE_LABEL,
  ARCHIVE_SECTION_IDS,
  archiveSection,
  isArchiveSectionId,
  parseArchiveScope,
  sectionsForWorkspace,
} from "@/lib/archive/sections";
import { listArchivePeople, loadArchiveSection } from "@/lib/queries/archive";

export const dynamic = "force-dynamic";

/**
 * THE SECTION LIST, HANDED OVER INSTEAD OF DISCOVERED.
 *
 * Without this export Next runs a "generate static paths" pass for the
 * `[section]` segment in a CHILD WORKER. In dummy mode that worker boots its
 * own copy of the app, and lib/db/index.ts then opens a SECOND PGlite instance
 * — a multi-hundred-megabyte WASM Postgres that also holds an exclusive lock on
 * `.pglite/`. On a machine already short of memory the worker dies, Next
 * retries once, and the page fails with:
 *
 *   Jest worker encountered 2 child process exceptions, exceeding retry limit
 *
 * Answering from the registry costs one array and no worker. The fifteen ids
 * are a fixed, code-owned list (lib/archive/map.ts) — not data — so this cannot
 * drift from what the rail links to.
 *
 * It must be the REAL list, not `[]`: an empty array is read as "these are all
 * the params there are" and every section 404s (verified — `/archive/tasks`
 * returned 404 until this returned the ids). The page stays `force-dynamic`, so
 * nothing is prerendered from it either way.
 */
export function generateStaticParams(): { section: string }[] {
  return ARCHIVE_SECTION_IDS.map((section) => ({ section }));
}

/**
 * One module's Archive — "Archive Tasks", "Archive DCC", "Archive Incentives".
 *
 * The page is a reading of live tables scoped to ONE HALF of the roster — Past
 * Employees by default, Present Employees behind the switch (see
 * lib/archive/sections.ts). It is deliberately READ-ONLY: an ex-employee's
 * record is evidence of what happened, and the moment the Archive can edit it,
 * it stops being that. Corrections still belong on the module's own screen,
 * where the permissions and the audit trail live.
 *
 * ADMINS ONLY. The Archive puts one person's tasks, pay, appraisal scores and
 * exit record on a single rail, which is a different thing from the module
 * screens each of those rows already lives on — so it takes the same gate the
 * older archived-tasks page has always had. The rail item is hidden for
 * everyone else and this guard is what actually enforces it.
 */
export default async function ArchiveSectionPage({
  params,
  searchParams,
}: {
  params: Promise<{ section: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { section } = await params;
  if (!isArchiveSectionId(section)) notFound();

  const me = await requireUser();
  if (!me.isAdmin) redirect("/hub" as Route);

  const sp = await searchParams;
  const scope = parseArchiveScope(sp.scope);
  const employeeId = typeof sp.emp === "string" && sp.emp ? sp.emp : undefined;

  const sec = archiveSection(section);
  const siblings = sectionsForWorkspace(sec.workspace);

  const [people, tables, otherCount] = await Promise.all([
    listArchivePeople(scope),
    loadArchiveSection(sec.id, { scope, employeeId }),
    // Only the head-count of the other half, so the switch can say what is
    // behind it without loading that side's records.
    listArchivePeople(scope === "past" ? "present" : "past").then((p) => p.length),
  ]);

  const who = employeeId ? people.find((p) => p.id === employeeId) : undefined;

  return (
    <PageShell width="full" py={false} className={COMMAND_PAGE_CLASS}>
      <PageCommandBar
        title={sec.label}
        hint={`${ARCHIVE_SCOPE_LABEL[scope]} · ${sec.blurb}`}
        actions={
          <Link
            href={"/archive" as Route}
            className="filter-chip text-[12.5px]"
            title="Every module's archive in one place"
          >
            <FolderArchive size={14} strokeWidth={2.2} />
            All archives
          </Link>
        }
        toolbar={
          <div className="flex flex-col gap-2.5">
            <ArchiveScopeSwitch
              scope={scope}
              basePath={`/archive/${sec.id}`}
              counts={
                scope === "past"
                  ? { past: people.length, present: otherCount }
                  : { past: otherCount, present: people.length }
              }
            />
            <ArchiveSectionChips
              sections={siblings}
              activeId={sec.id}
              scope={scope}
              employeeId={employeeId}
            />
            <ArchivePeopleFilter
              people={people}
              scope={scope}
              employeeId={employeeId}
              basePath={`/archive/${sec.id}`}
            />
          </div>
        }
      />

      {people.length === 0 ? (
        <EmptyPanel
          title={scope === "past" ? "No past employees yet" : "Nobody on the active roster"}
          line={
            scope === "past"
              ? "The Archive fills itself: the moment an employee is marked inactive, everything of theirs — in this module and every other — is read here instead of cluttering the live screens."
              : "Every employee account here is inactive, so the Present view has nobody to read. Switch to Past Employees."
          }
        />
      ) : employeeId && !who ? (
        <EmptyPanel
          title={`Not in ${ARCHIVE_SCOPE_LABEL[scope]}`}
          line={
            scope === "past"
              ? "That person is still with the company — their records are under Present Employees, and on the live module screens."
              : "That person has left, so their records are under Past Employees."
          }
        />
      ) : (
        <>
          {who && (
            <p className="mb-4 text-[13px] font-medium text-ink-muted">
              Showing <strong className="text-ink-strong">{who.name}</strong>
              {who.department ? ` · ${who.department}` : ""}
              {who.lastWorkingDay
                ? ` · last working day ${who.lastWorkingDay}`
                : who.joinedAt
                  ? ` · joined ${who.joinedAt}`
                  : ""}
              {who.exitReason ? ` · ${who.exitReason}` : ""}
            </p>
          )}
          <ArchiveTables
            tables={tables}
            // The Present half is empty for a reason worth stating: these
            // records have no archive button of their own.
            emptyTitle={sec.archivable ? "Nothing archived yet" : `Nothing in ${sec.short} can be archived`}
            emptyLine={
              sec.archivable
                ? `Nobody has archived anything here yet. Archive a record on the ${sec.short} screen and it appears in this list.`
                : `A ${sec.short.toLowerCase()} record cannot be put away one at a time — there is no archive button behind it. These reach the Archive the day the person leaves, under Past Employees.`
            }
          />
        </>
      )}
    </PageShell>
  );
}
