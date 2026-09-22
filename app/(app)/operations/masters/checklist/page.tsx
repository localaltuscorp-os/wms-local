import { ListChecks } from "lucide-react";
import { requireWorkspace } from "@/lib/auth/workspace-access";
import { isSuperAdmin } from "@/lib/auth/super-admin";
import { PageShell } from "@/components/layout/page-shell";
import { MastersHeader } from "@/components/operations/masters/masters-header";
import { canAddTaskRoster } from "@/lib/auth/roster-permission";
import { listActiveSubjectNames } from "@/lib/queries/subjects";
import { ChecklistMasters } from "@/components/operations/masters/checklist-masters";
import { ChecklistMasterPicker } from "@/components/operations/masters/checklist-master-picker";
import type {
  ChecklistMasterItem,
  ChecklistPersonRow,
  ChecklistTemplateRow,
} from "@/lib/operations/checklist";
import {
  isMissingChecklistTable,
  listChecklistPeople,
  listChecklistTemplates,
  listTemplateItems,
} from "@/lib/queries/operations-checklist";

export const dynamic = "force-dynamic";

/**
 * OPERATIONS → MASTERS → Checklist Masters.
 *
 * The reusable checklists, edited directly: which master is open is a
 * dropdown beside the heading, and its rows take the full width below.
 * `?t=<id>` is the open master — in the URL, like
 * the checklist's `?run=`, so its rows are read on the server and a master is
 * linkable. Viewing is the room's; changing a master is admin-only, the same
 * rule as changing a checklist.
 */
export default async function ChecklistMastersPage({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  const me = await requireWorkspace("operations");
  const canEdit = me.isAdmin || isSuperAdmin(me.email);
  const sp = await searchParams;

  let templates: ChecklistTemplateRow[] = [];
  let people: ChecklistPersonRow[] = [];
  let missing = false;
  try {
    [templates, people] = await Promise.all([listChecklistTemplates(), listChecklistPeople()]);
  } catch (e) {
    if (!isMissingChecklistTable(e)) throw e;
    missing = true;
  }

  // Looked up in the list rather than queried by the raw param: a stale or
  // mistyped id falls back to the first master instead of an error.
  const selected = templates.find((t) => t.id === sp.t) ?? templates[0] ?? null;
  const items: ChecklistMasterItem[] = selected ? await listTemplateItems(selected.id) : [];
  // The Subject column's choices: the WMS Tasks roster (Admin Panel → Subjects).
  const subjects = await listActiveSubjectNames().catch(() => [] as string[]);

  return (
    <PageShell>
      <MastersHeader
        Icon={ListChecks}
        topic="Checklist"
        title="Checklist Masters"
        description="Reusable checklists — activities, the day each falls relative to the event, doers and backups. New checklists in Operations → Checklist are built from these."
        beside={
          missing ? undefined : (
            <ChecklistMasterPicker templates={templates} selectedId={selected?.id ?? null} canEdit={canEdit} />
          )
        }
      />
      {missing ? (
        <p className="rounded-2xl border border-dashed border-slate-300 px-6 py-12 text-center text-[14px] text-slate-500">
          The checklist tables are not set up yet (migration 0221).
        </p>
      ) : (
        <ChecklistMasters
          key={selected?.id ?? "none"}
          templates={templates}
          selected={selected}
          items={items}
          people={people}
          canEdit={canEdit}
          meId={me.id}
          subjects={subjects}
          canAddRoster={canAddTaskRoster(me)}
        />
      )}
    </PageShell>
  );
}
