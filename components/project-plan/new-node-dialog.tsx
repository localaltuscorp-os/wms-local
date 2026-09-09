"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { X, Loader2 } from "lucide-react";
import { fireToast } from "@/lib/toast";
import {
  PLAN_KINDS, KIND_LABEL, hasTask, hasSchedule, type PlanKind,
} from "@/lib/project-plan/levels";
import { ancestorLevels, planPathTo, seedAncestors, writeRecentChain } from "@/lib/project-plan/recent";
import { createPlanNodeForTask, createPlanContainer } from "@/app/(app)/project-plan/actions";
import { uploadPlanAttachment } from "@/app/(app)/project-plan/attachment-actions";
// The REAL WMS new-task form, not a copy of it. EVERY level gets it — a
// Result / Action / Sub-Action / Sub-Sub-Action because it IS a task, and a
// Project / Milestone because the create buttons are one gesture and should
// not open two different dialogs depending on which one you pressed.
import { NewTaskForm } from "@/components/tasks/new-task-form";
import { loadNewTaskOptions } from "@/app/(app)/tasks/actions";
import {
  ParentPickers, parentIdFor, parentMissing, type PickedAncestors,
} from "./parent-pickers";
import { useRecentPlan } from "./use-recent-plan";
import type { PlanRow, EmployeeOption } from "./plan-board";

/**
 * New Project item — the same shape as the WMS "New Task" dialog (Radix modal,
 * display-font title, description, round close button, scrollable body), and
 * now the same BODY too: the full task form for all six levels.
 *
 * WHERE THE TWO PATHS PART. The form is identical; its destination is not.
 *
 *   result / action / sub_action / sub_sub_action   (TASK_KINDS)
 *       `beforeSubmit` creates the plan row, then the form creates THE task
 *       that hangs off it. One record shared by the plan, WMS and the calendar.
 *       Result joined this group because people put an owner and a date on one
 *       and expect to find it in WMS; it still reports its PROGRESS from the
 *       actions underneath it, which is why `hasTask` and `isExecutable` are
 *       two predicates and not one.
 *
 *   project / milestone
 *       `createOverride` takes the whole payload and writes a `project_nodes`
 *       row — and no task. Neither is work anyone does; `syncNodeTask` refuses
 *       to build a task for them, so making a milestone a task to share the
 *       form would break the module's central rule. Migration 0213 gives the
 *       row somewhere to keep client, subject, priority, initiator and tags.
 *
 * NO SCHEDULE ON PROJECT / MILESTONE. Those two are dated by the work
 * underneath them, so the Schedule block is hidden for them (`hideSchedule`)
 * and their start/end stay null. Result keeps it.
 *
 * WHERE IT GOES IS ALREADY ANSWERED. The chain of parent pickers is shared with
 * the bulk upload (`ParentPickers`) and, like it, opens PRE-FILLED from the
 * branch you were last working in — so pressing S for a Sub-Action while an
 * action is open files it under that action instead of presenting four empty
 * selects. Every pick stays editable; it is a default, not a lock, and the
 * "last opened" chip on a seeded select says where the value came from.
 */

interface Props {
  tree: PlanRow[];
  employees: EmployeeOption[];
  canManage: boolean;
  onCreated: () => void;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Which level to open on. The register's four create buttons each name one;
   *  the board opens on Action, which is what it mostly adds. The level picker
   *  inside stays editable either way — this is a starting point, not a lock. */
  initialKind?: PlanKind;
}

export function NewNodeDialog({ tree, onCreated, open, onOpenChange, initialKind }: Props) {
  // `initialKind` is read ONCE on purpose. Both callers mount this with
  // `key={creating}`, so pressing a different create button remounts the whole
  // dialog and the level arrives fresh — no effect needed to chase the prop.
  const [kind, setKind] = React.useState<PlanKind>(initialKind ?? "action");

  /**
   * The branch someone was last working in, and the pre-fill it produces.
   *
   * DERIVED, NOT COPIED INTO STATE. `chosen` is null until a picker is touched,
   * and until then the chain simply IS the seed — so a remembered branch that
   * arrives a tick after mount (localStorage is read in an effect, because the
   * server has none) shows up without an effect writing state, and a deliberate
   * choice can never be overwritten by one arriving late.
   */
  const recent = useRecentPlan(tree);
  const seed = React.useMemo(() => seedAncestors(kind, recent), [kind, recent]);
  const [chosen, setChosen] = React.useState<PickedAncestors | null>(null);
  const picked = chosen ?? seed;

  /**
   * Rosters for the task form (employees, clients, subjects). Loaded lazily the
   * first time the dialog opens and then kept, so reopening is instant and the
   * four roster queries don't run on every render of the board behind it.
   */
  const [opts, setOpts] = React.useState<{
    employees: { id: string; name: string }[];
    clients: string[];
    subjects: string[];
    canAddRoster: boolean;
  } | null>(null);
  const [optsError, setOptsError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setOptsError(null);
    loadNewTaskOptions()
      .then((o) => setOpts({
        employees: o.employees,
        clients: o.clients,
        subjects: o.subjects,
        canAddRoster: o.canAddRoster,
      }))
      .catch(() => setOptsError("Couldn't load the form. Close and reopen to retry."));
  }, [open]);

  const parentId = parentIdFor(kind, picked);
  const missingParent = parentMissing(kind, picked);
  /** Result and the three executable levels are tasks (see TASK_KINDS);
   *  Project and Milestone are plan rows with no task. */
  const isTaskLevel = hasTask(kind);

  function reset() {
    setChosen(null);
  }

  /**
   * Remember where this one went, so the next create — and the next bulk
   * upload — open pointing at the same branch. Written from the TREE rather
   * than from `picked`, so what is stored is a path that really exists.
   */
  function rememberDestination() {
    if (!parentId) return;
    const path = planPathTo(tree, parentId);
    if (path.length) writeRecentChain(path);
  }

  /**
   * Push the files the form's Media section collected onto the row that was
   * just created.
   *
   * They used to go nowhere — the Media grid was UI-only, so a file picked here
   * vanished on submit and the register's Attachments cell stayed at "—". This
   * is the same server action that cell's "Add a file" button calls, so a file
   * added at create time and one added later are one kind of attachment.
   *
   * NEVER FAILS THE CREATE. The row exists by the time this runs; a storage
   * hiccup on file three must not read as "your project wasn't saved". Each
   * failure is reported on its own and the rest still go.
   */
  async function uploadMedia(nodeId: string, files: File[]) {
    for (const file of files) {
      try {
        const fd = new FormData();
        fd.set("nodeId", nodeId);
        fd.set("file", file);
        const res = await uploadPlanAttachment(fd);
        if (!res.ok) fireToast({ message: `${file.name}: ${res.error}`, type: "error" });
      } catch {
        fireToast({ message: `${file.name} didn't upload.`, type: "error" });
      }
    }
  }

  function done() {
    fireToast({ message: `${KIND_LABEL[kind]} added.`, type: "success" });
    rememberDestination();
    onOpenChange(false);
    reset();
    onCreated();
  }

  // Every level, for everyone. `createPlanNode` no longer tests who is asking
  // — STATUS is the one guarded action in this module — so the picker offers
  // the whole chain rather than hiding levels it would in fact accept.
  const creatable = PLAN_KINDS;

  return (
    <Dialog.Root open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) reset(); }}>
      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-[140]"
          style={{ background: "rgba(15, 23, 42, 0.45)", backdropFilter: "blur(4px)" }}
        />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[150] w-[min(820px,calc(100vw-48px))] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl bg-white shadow-2xl"
          style={{ maxHeight: "calc(100vh - 48px)", borderBottom: `3px solid ${ACCENT}` }}
        >
          {/* Head */}
          <div className="relative border-b border-hairline px-8 py-5 max-md:px-5">
            <Dialog.Title
              className="text-ink-strong"
              style={{
                fontFamily: "var(--font-display), system-ui, sans-serif",
                fontWeight: 900,
                fontSize: "clamp(24px, 2.4vw, 32px)",
                letterSpacing: "-0.022em",
                lineHeight: 1.02,
              }}
            >
              New {KIND_LABEL[kind]}
            </Dialog.Title>
            <Dialog.Description className="mt-1 text-[15px] font-semibold text-ink-muted">
              {isTaskLevel
                ? `Pick where it sits, then name it and say what it is. A ${KIND_LABEL[kind].toLowerCase()} becomes a real WMS task, with a doer, a due date and the whole record behind it.`
                : `Pick where it sits, then name it and say what it is. A ${KIND_LABEL[kind].toLowerCase()} holds the plan, so it stays off the task list and the calendar.`}
            </Dialog.Description>
            <div className="absolute right-5 top-4">
              <Dialog.Close asChild>
                <button
                  type="button"
                  aria-label="Close"
                  className="inline-flex size-10 items-center justify-center rounded-full border border-hairline bg-white text-ink-muted transition-colors hover:bg-surface-soft"
                >
                  <X size={20} strokeWidth={2.4} />
                </button>
              </Dialog.Close>
            </div>
          </div>

          {/* Body */}
          <div className="overflow-y-auto px-8 py-5 max-md:px-5" style={{ maxHeight: "calc(100vh - 200px)" }}>
            <Field label="Level">
              <select
                value={kind}
                onChange={(e) => { setKind(e.target.value as PlanKind); setChosen(null); }}
                className={INPUT}
              >
                {creatable.map((k) => (
                  <option key={k} value={k}>{KIND_LABEL[k]}</option>
                ))}
              </select>
            </Field>

            {/* Ancestors — exactly the ones this level needs, pre-filled from
                the branch last worked in. Shared with the bulk upload so both
                dialogs ask the question the same way. */}
            <ParentPickers
              tree={tree}
              kind={kind}
              picked={picked}
              seededFrom={seed}
              onChange={setChosen}
              className="mt-4"
            />

            {/* ── The WHOLE WMS task form, at every level ──────────────────
                An Action is a task, so `beforeSubmit` creates the plan row and
                hands its id to the task — one Create makes both, and there is
                still exactly one code path that writes a task. A Project /
                Milestone / Result is not a task, so `createOverride` takes the
                same payload and writes only the plan row. Project and Milestone
                additionally drop the Schedule block: they are dated by the work
                underneath them. */}
            <div className="mt-5 border-t border-hairline pt-5">
              {missingParent ? (
                <p className="rounded-lg bg-surface-soft px-3 py-6 text-center text-[13.5px] font-semibold text-ink-muted">
                  Choose the {KIND_LABEL[parentLevelOf(kind)].toLowerCase()} this sits under to continue.
                </p>
              ) : optsError ? (
                <p className="rounded-lg bg-surface-soft px-3 py-6 text-center text-[13.5px] font-semibold text-ink-muted">
                  {optsError}
                </p>
              ) : opts ? (
                <NewTaskForm
                  // Remounting per level throws away a half-typed form when the
                  // level changes — which is the point: the destination of every
                  // field changed with it.
                  key={kind}
                  employees={opts.employees}
                  clients={opts.clients}
                  subjects={opts.subjects}
                  canAddRoster={opts.canAddRoster}
                  hideSchedule={!hasSchedule(kind)}
                  submitLabel={`Create ${KIND_LABEL[kind]}`}
                  // EVERY LEVEL NAMES ITSELF in the first field — "Action
                  // Name", not "Client Name" — and describes itself in the
                  // second. It used to be containers only, which left an Action
                  // being named after the client somebody picked: the one row
                  // whose name is the point of the row, taking it from a
                  // roster. A Result asks for a Result Name, so an Action asks
                  // for an Action Name.
                  //
                  // SUBJECT COMES BACK ON THE EXECUTABLE LEVELS. It was dropped
                  // with the client picker on the reasoning that a subject had
                  // nothing left to be about — true of a container, wrong of an
                  // Action: an Action IS a WMS task, `tasks.subject` is the
                  // line every task list and report groups by, and leaving it
                  // null filed every action created here under nothing.
                  //
                  // So the pair is Action Name + Subject, side by side, and the
                  // form's own schema makes it REQUIRED (`buildSchema` swaps in
                  // `min(1, "Subject is required")` the moment it is shown).
                  // Project / Milestone / Result keep it hidden: a container
                  // has no task, and `project_nodes.subject` is written by the
                  // container path from a field nobody was filling in.
                  //
                  // TAGS STILL GO, at every level: a plan row is placed
                  // by where it sits in the hierarchy, and a second, looser way
                  // to group the same rows is a filing system competing with
                  // the plan. Section 04 draws itself only when something is
                  // left in it, so on the levels that keep a schedule it stays
                  // and on the ones that do not it disappears.
                  titleLabel={`${KIND_LABEL[kind]} Name`}
                  titleFreeText
                  descriptionLabel={`${KIND_LABEL[kind]} Description`}
                  hideSubject={!isTaskLevel}
                  hideTags
                  onSuccess={
                    isTaskLevel
                      ? () => { rememberDestination(); onOpenChange(false); reset(); onCreated(); }
                      : undefined
                  }
                  beforeSubmit={
                    isTaskLevel
                      ? async (v) => {
                          const first = v.doerIds[0];
                          if (!first) return { ok: false as const, error: "Pick at least one doer." };
                          const res = await createPlanNodeForTask({
                            kind,
                            parentId,
                            name: v.title,
                            // The plan row's owner is the FIRST doer. A multi-doer
                            // create still fans out N tasks in WMS the way it always
                            // has; this one row owns the first of them.
                            ownerId: first,
                            targetDate: v.dueAt.slice(0, 10),
                            startsAt: v.startsAt,
                            endsAt: v.endsAt,
                            links: v.links,
                          });
                          if (!res.ok) return { ok: false as const, error: res.error };
                          // The row exists now, so its files have somewhere to
                          // go. Done before `createTask` runs, which is fine:
                          // they belong to the plan row either way.
                          if (v.media.length) await uploadMedia(res.id, v.media);
                          return { ok: true as const, projectNodeId: res.id };
                        }
                      : undefined
                  }
                  createOverride={
                    isTaskLevel
                      ? undefined
                      : async (v) => {
                          const res = await createPlanContainer({
                            kind,
                            parentId,
                            // The first field IS the row's name at these levels
                            // — the form asks for "Project Name", not a client
                            // — so the register reads the name someone typed.
                            name: v.title,
                            priority: v.priority,
                            initiatorId: v.initiatorId || null,
                            // The FIRST doer owns the row, matching the task path.
                            ownerId: v.doerIds[0] ?? null,
                            description: v.description,
                            notes: v.notes,
                            links: v.links,
                            targetDate: v.dueAt.slice(0, 10),
                            startsAt: v.startsAt,
                            endsAt: v.endsAt,
                          });
                          if (!res.ok) return res;
                          if (v.media.length) await uploadMedia(res.id, v.media);
                          // A container holds ONE person — its owner — because
                          // it has no task to fan out to. Picking several is
                          // allowed by the shared form, so say what happened
                          // rather than dropping the rest in silence.
                          if (v.doerIds.length > 1) {
                            fireToast({
                              message: `Only the first person becomes the ${KIND_LABEL[kind].toLowerCase()}'s owner — a ${KIND_LABEL[kind].toLowerCase()} isn't shared work.`,
                              type: "error",
                            });
                          }
                          done();
                          return res;
                        }
                  }
                />
              ) : (
                <div className="grid place-items-center py-16">
                  <Loader2 className="animate-spin" size={26} style={{ color: ACCENT }} />
                </div>
              )}
            </div>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

const ACCENT = "#E10600";

const INPUT =
  "w-full rounded-lg border border-hairline-strong bg-white px-3 py-2.5 text-[14px] font-medium text-ink-strong outline-none transition-colors focus:border-[#E10600] disabled:bg-surface-soft disabled:opacity-60";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="mb-1.5 text-[11px] font-bold uppercase tracking-[0.1em] text-ink-subtle">{label}</p>
      {children}
    </div>
  );
}

/** The level this one sits under — only read when there IS one. */
function parentLevelOf(kind: PlanKind): PlanKind {
  const chain = ancestorLevels(kind);
  return chain[chain.length - 1] ?? "project";
}


