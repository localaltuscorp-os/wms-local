import { describe, it, expect } from "vitest";
import { codeOf } from "../fixtures/source-code";

/**
 * THE PLAN ↔ TASK CONTRACT.
 *
 * An Action or Sub-Action IS a WMS task once it has an owner and a date. These
 * assertions pin the four rules that make that one record rather than two:
 *
 *   1. Scheduling carries the plan's fields ONTO the task — the project's
 *      client, the row's own description, subject and priority.
 *   2. Re-editing a scheduled row UPDATES that task. It never creates a second.
 *   3. The client comes from the PROJECT, walked up the tree, so a plan can
 *      never file its work under two clients.
 *   4. A project cannot be created without one.
 *
 * Asserted on the source rather than by importing: these modules are server
 * actions that pull in the db client, which parses the real environment. The
 * repo already keeps `codeOf` for structural checks like this.
 */

const actions = codeOf("app/(app)/project-plan/actions.ts");
const queries = codeOf("lib/queries/project-plan.ts");

describe("scheduling an action carries the plan's fields onto its task", () => {
  it("resolves the client from the project above it", () => {
    expect(actions).toContain("const client = await clientForNode(node.id)");
  });

  it("writes client, description, subject and priority when creating the task", () => {
    // The create path — first time the row becomes schedulable.
    const create = actions.slice(actions.indexOf("await createTasksCore(actor, {"));
    expect(create).toContain("description: node.description ?? undefined");
    // Explicit, null included — `?? undefined` would read as "no opinion" and
    // take the action's own name as its client. See the client block below.
    expect(create).toContain("client,");
    expect(create).toContain("subject: node.subject ?? undefined");
    expect(create).toContain("priority,");
  });

  it("carries the row's own initiator rather than always the editor", () => {
    expect(actions).toContain("initiatorId: node.initiatorId ?? actor.id");
  });
});

describe("re-editing a scheduled row changes THAT task, never a second one", () => {
  // Anchored on CODE at both ends: `codeOf` strips comments, so a comment
  // marker would return -1 and silently slice to the end of the file.
  const update = actions.slice(
    actions.indexOf("if (existing) {"),
    actions.indexOf("await createTasksCore(actor, {"),
  );

  it("updates the existing task in place", () => {
    expect(update).toContain(".update(tasks)");
    expect(update).toContain("eq(tasks.id, existing.id)");
    // …and there is no create inside the branch that found one.
    expect(update).not.toContain("createTasksCore");
  });

  it("re-assigning the doer reaches the task", () => {
    expect(update).toContain("doerId: owner");
  });

  it("a changed description and client reach it too", () => {
    expect(update).toContain("...(node.description ? { description: node.description } : {})");
    expect(update).toContain("client,");
  });

  it("finds the task by the plan row, which is what prevents a duplicate", () => {
    expect(actions).toContain("eq(tasks.projectNodeId, nodeId)");
  });

  it("does NOT blank a description, subject or priority the row never carried", () => {
    // Both are editable on the WMS side as well; spreading them conditionally
    // is the difference between propagating a value and destroying one.
    expect(update).toContain("...(node.subject ? { subject: node.subject } : {})");
    expect(update).toContain("...(node.priority ? { priority: node.priority } : {})");
  });
});

describe("one client per plan", () => {
  it("walks UP to the nearest ancestor that holds one", () => {
    expect(queries).toContain("export async function clientForNode");
    expect(queries).toContain("JOIN up ON up.parent_id = n.id");
    expect(queries).toContain("ORDER BY depth ASC");
  });

  it("ignores an ancestor whose client is blank rather than stopping there", () => {
    expect(queries).toContain("client_name IS NOT NULL AND btrim(client_name)");
  });

  it("requires a client when a project is created through the dialog", () => {
    expect(actions).toContain('kind === "project" && !parsed.data.clientName?.trim()');
  });
});

describe("the plan table shows both axes at once", () => {
  const board = codeOf("components/project-plan/plan-board.tsx");
  const cell = codeOf("components/project-plan/plan-status-cell.tsx");

  it("has a Doer Status column and an Initiator Status column", () => {
    expect(board).toContain('{ key: "status", label: "Doer Status"');
    expect(board).toContain('{ key: "initiatorStatus", label: "Initiator Status"');
  });

  it("renders them side by side, each on its own axis", () => {
    expect(board).toContain('axis="doer"');
    expect(board).toContain('axis="initiator"');
  });

  it("stops the verdict from hiding the progress report", () => {
    // The doer cell hands the WORKING status straight to the shared control.
    // Routing it through effectivePlanStatus would let a verdict outrank it,
    // which is what the single combined cell used to do.
    expect(cell).toContain('axis === "doer"');
    expect(cell).toContain("<DoerStatusSelect");
    expect(cell).toContain("status={workingStatusOf(node)}");
    // ...and the verdict goes to its OWN control, off the same row.
    expect(cell).toContain("<InitiatorStatusSelect");
    expect(cell).toContain("approvalStatus={node.approvalStatus}");
  });

  it("shows an unruled row as No Verdict, not as Not Approved", () => {
    // BOTH CELLS ARE THE SHARED CONTROL NOW (2026-09-15), so "No Verdict" is
    // rendered once, in components/status/status-select.tsx, rather than by
    // each table spelling it for itself. That is what this now pins: the plan
    // cell must not grow a second copy of the rule.
    const shared = codeOf("components/status/status-select.tsx");
    expect(shared).toContain('placeholder="No Verdict"');
    expect(shared).toContain("effectiveInitiatorStatus(approvalStatus, archived)");
    expect(cell).not.toContain("No verdict");
  });

  it("keeps Archived out of the dropdown — it cascades, so it needs the confirm", () => {
    // Twice over: the combined "both" select filters it out of its own list,
    // and the shared initiator control is told to hide it on this board.
    expect(cell).toContain('(s) => s !== "archived" && canSetPlanStatus(actor, s).ok');
    expect(cell).toContain("hideArchived");
  });

  it("exports the two axes as separate columns", () => {
    expect(board).toContain("initiatorStatus: (() => {");
  });
});

describe("only Action / Sub-Action / Sub-Sub-Action reach the task section", () => {
  const levels = codeOf("lib/project-plan/levels.ts");

  it("Result is no longer a task level", () => {
    expect(levels).toContain("export const TASK_KINDS: readonly PlanKind[] = [...EXECUTABLE_KINDS]");
    expect(levels).not.toContain('["result", ...EXECUTABLE_KINDS]');
  });

  it("the task levels are exactly the executable ones", () => {
    expect(levels).toContain(
      'export const EXECUTABLE_KINDS: readonly PlanKind[] = ["action", "sub_action", "sub_sub_action"]',
    );
  });

  it("archives the Result tasks that already existed rather than deleting them", () => {
    const mig = codeOf("db/migrations/0226_result_is_not_a_task.sql");
    expect(mig).toContain("SET archived   = true");
    expect(mig).toContain("WHERE kind = 'result'");
    expect(mig).not.toMatch(/DELETE\s+FROM\s+tasks/i);
  });
});

describe("a plan task's client is the PROJECT's, never the action's own name", () => {
  const validators = codeOf("lib/validators/task.ts");
  const core = codeOf("lib/tasks/create-task.ts");

  it("only falls back to the title when the caller never mentioned a client", () => {
    // `.default(null)` made "not supplied" and "deliberately blank" the same
    // value, so `client ?? title` fired on a plan task whose project had no
    // client and filed it under the ACTION'S name.
    expect(validators).toContain("client: z.string().trim().max(240).nullable().optional(),");
    expect(validators).not.toContain("client: z.string().trim().max(240).nullable().optional().default(null)");
    // Resolved once into `client` above the insert loop, not inline.
    expect(core).toContain("client = parsed.title");
    expect(core).toContain("client,");
  });

  it("passes the plan's client explicitly, null included", () => {
    const create = actions.slice(actions.indexOf("await createTasksCore(actor, {"));
    expect(create).toContain("client,");
    expect(create).not.toContain("client: client ?? undefined");
  });

  it("repairs the rows already written", () => {
    const mig = codeOf("db/migrations/0227_plan_task_client_repair.sql");
    expect(mig).toContain("WITH RECURSIVE up AS");
    expect(mig).toContain("DISTINCT ON (node_id)");
    // Only plan-linked tasks: a WMS task legitimately keeps client = title.
    expect(mig).toContain("t.project_node_id");
  });
});

describe("every path into a task resolves the client the same way", () => {
  const core = codeOf("lib/tasks/create-task.ts");

  it("resolves it from the plan row when the caller supplies none", () => {
    // The New Item dialog builds its task through the ordinary WMS path, not
    // through syncNodeTask — so the rule has to live in the shared core or that
    // path files every action under its own name.
    expect(core).toContain("client = await clientForNode(parsed.projectNodeId)");
    expect(core).toContain("if (parsed.client !== undefined)");
    expect(core).toContain("client = parsed.title");
  });
});

describe("an executable row needs a description before it can be scheduled", () => {
  const board = codeOf("components/project-plan/plan-board.tsx");

  it("refuses an owner or a target date while the description is empty", () => {
    expect(actions).toContain("const settingOwner = patch.ownerId !== undefined");
    expect(actions).toContain("const settingDate = patch.targetDate !== undefined");
    expect(actions).toContain("before scheduling it");
  });

  it("counts a description set in the SAME edit", () => {
    expect(actions).toContain(
      "patch.description !== undefined ? patch.description : auth.node.description",
    );
  });

  it("lets an already-scheduled row keep being edited", () => {
    // Grandfathering: blocking these would strand every row created before the
    // rule existed.
    const gate = actions.slice(actions.indexOf("const settingOwner"));
    expect(gate).toContain("if (!linked) {");
  });

  it("no longer pre-schedules a row added with the bare +", () => {
    // Seeding an owner and today's date would schedule the row before a
    // description could exist — routing straight around the rule.
    expect(actions).toContain("ownerId: null,");
    expect(actions).toContain("targetDate: null,");
  });

  it("shows the Description column by default, so the rule is satisfiable", () => {
    expect(board).toContain('"from", "to", "wms",');
    expect(board).not.toContain('"from", "to", "description", "wms",');
  });
});

describe("the WMS task list shows the initiator axis too", () => {
  const table = codeOf("components/tasks/task-table.tsx");

  it("has an Initiator Status column beside Doer Status", () => {
    expect(table).toContain('header: "Initiator Status"');
    expect(table).toContain('approvalStatus: "Initiator Status"');
  });

  it("renders the SHARED control, not a task-only dropdown", () => {
    expect(table).toContain("InitiatorStatusSelect");
    expect(table).toContain("setTaskInitiatorStatus");
  });

  it("splices a new column in at its default position instead of appending", () => {
    // Appending put Initiator Status at the far right for anyone who had ever
    // dragged a header, and beside Doer Status for everyone else — the kind of
    // difference nobody reproduces.
    expect(table).toContain("merged.splice(at, 0, id)");
    expect(table).not.toContain("setColumnOrder([...kept, ...added])");
  });

  it("sorts undecided rows first — the queue an initiator clears", () => {
    expect(table).toContain("return v === null ? -1 : INITIATOR_STATUSES.indexOf(v)");
  });

  it("asks the same permission question the other two modules ask", () => {
    expect(table).toContain("isInitiator: r.initiatorId === me.id");
    expect(table).toContain("isDoer: r.doerId === me.id");
  });
});

describe("the plan table can set and show the client", () => {
  const board = codeOf("components/project-plan/plan-board.tsx");

  it("puts Description beside the row's name, not at the far end", () => {
    const names = board.slice(board.indexOf("const ALL_COLUMNS = ["));
    const name = names.indexOf('key: "name"');
    const desc = names.indexOf('key: "description"');
    const owner = names.indexOf('key: "owner"');
    expect(name).toBeGreaterThan(-1);
    expect(desc).toBeGreaterThan(name);
    expect(desc).toBeLessThan(owner);
  });

  it("has a Client column", () => {
    expect(board).toContain('{ key: "client", label: "Client"');
  });

  it("is editable on a project and a read-only echo below it", () => {
    expect(board).toContain('if (node.kind !== "project")');
    expect(board).toContain("patch({ clientName: v || null })");
  });

  it("resolves the inherited client by the same nearest-ancestor rule", () => {
    expect(board).toContain("const own = nd.clientName?.trim() || null");
    expect(board).toContain("const effective = own ?? inherited");
  });
});

describe("a project's client can be changed, and reaches its whole branch", () => {
  it("is editable after creation — but only on the project", () => {
    expect(actions).toContain("clientName: z.string().trim().max(200).nullable().optional()");
    expect(actions).toContain('if (auth.node.kind !== "project")');
  });

  it("pushes the new client onto every task already scheduled beneath it", () => {
    expect(actions).toContain("async function resyncBranchClient");
    expect(actions).toContain("if (patch.clientName !== undefined)");
    expect(actions).toContain("inArray(tasks.projectNodeId, ids)");
  });
});

describe("delete and archive are both offered, and are different things", () => {
  const board = codeOf("components/project-plan/plan-board.tsx");

  it("has a permanent delete as well as the archive", () => {
    expect(actions).toContain("export async function purgePlanNode");
    expect(board).toContain('<IconBtn label="Delete permanently"');
    expect(board).toContain('<IconBtn label="Archive"');
  });

  it("keeps the permanent one admin-only", () => {
    expect(actions).toContain(
      'if (!me.isAdmin) return fail("Only an administrator can permanently delete a plan row.")',
    );
  });

  it("removes the linked tasks from the calendar BEFORE deleting them", () => {
    const purge = actions.slice(actions.indexOf("export async function purgePlanNode"));
    const reconcile = purge.indexOf("reconcileTaskEvent");
    const del = purge.indexOf("db.delete(tasks)");
    expect(reconcile).toBeGreaterThan(-1);
    expect(del).toBeGreaterThan(reconcile);
  });

  it("says it cannot be undone, and names Archive as the alternative", () => {
    expect(board).toContain("This cannot be undone. Use Archive instead");
  });
});

describe("archiving", () => {
  const board = codeOf("components/project-plan/plan-board.tsx");

  it("offers Archive on every row, at every level", () => {
    // One control on the row's own button strip — the strip is rendered for
    // every node regardless of kind, so this is all six levels.
    expect(board).toContain('<IconBtn label="Archive"');
  });

  it("says archive, not delete, because that is what it does", () => {
    expect(board).toContain("const parts = [`Archive ${KIND_LABEL[node.kind].toLowerCase()}");
    expect(board).toContain("Nothing is deleted");
  });

  it("still warns how far the cascade reaches before running", () => {
    expect(board).toContain("This also archives");
    expect(board).toContain("linked task");
  });
});
