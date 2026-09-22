import { describe, it, expect } from "vitest";
import { codeOf } from "../fixtures/source-code";
import { UNCLASSIFIED_MILESTONE, UNCLASSIFIED_RESULT } from "@/lib/project-plan/levels";

/**
 * FILING A WMS TASK INTO THE PLAN — Project → Milestone → Result → Action.
 *
 * The rule, in the words it was asked in:
 *
 *   pick a project                     required
 *   milestone blank → "Unclassified Milestone" under that project
 *   result blank    → "Unclassified Result" under that milestone
 *   action PICKED   → the task becomes a SUB-ACTION of it
 *   action blank    → the task becomes a new ACTION under the result
 *
 * Asserted on the source: the resolver is a server action that pulls in the db
 * client, which parses the real environment.
 */

const actions = codeOf("app/(app)/project-plan/actions.ts");
const picker = codeOf("components/tasks/plan-target-picker.tsx");
const form = codeOf("components/tasks/new-task-form.tsx");
const queries = codeOf("lib/queries/project-plan.ts");

describe("the placeholder rows", () => {
  it("are named once, where both the resolver and any reader can see them", () => {
    expect(UNCLASSIFIED_MILESTONE).toBe("Unclassified Milestone");
    expect(UNCLASSIFIED_RESULT).toBe("Unclassified Result");
  });

  it("are found before they are created, so a project gets one of each", () => {
    expect(actions).toContain("async function findOrCreateChild");
    expect(actions).toContain("eq(projectNodes.name, name)");
    expect(actions).toContain("eq(projectNodes.isArchived, false)");
  });

  it("are REAL rows, not a rendering trick", () => {
    const foc = actions.slice(actions.indexOf("async function findOrCreateChild"));
    expect(foc).toContain(".insert(projectNodes)");
  });
});

describe("the level the task lands at", () => {
  const resolver = actions.slice(actions.indexOf("export async function resolvePlanTargetForTask"));

  it("becomes a SUB-ACTION when an action was picked", () => {
    expect(resolver).toContain('kind = "sub_action"');
    expect(resolver).toContain("parentId = actionId;");
  });

  it("becomes an ACTION when the action was left blank", () => {
    expect(resolver).toContain('kind = "action"');
    expect(resolver).toContain("parentId = resultId;");
  });

  it("fills in the missing levels from the top down", () => {
    expect(resolver).toContain('findOrCreateChild(projectId, "milestone", UNCLASSIFIED_MILESTONE');
    expect(resolver).toContain('findOrCreateChild(milestoneId, "result", UNCLASSIFIED_RESULT');
  });
});

describe("a chain assembled in the browser is not trusted", () => {
  const resolver = actions.slice(actions.indexOf("export async function resolvePlanTargetForTask"));

  it("refuses a milestone from another project", () => {
    expect(resolver).toContain("m.parentId !== projectId");
    expect(resolver).toContain("That milestone is not in this project.");
  });

  it("refuses a result that is not under the chosen milestone", () => {
    expect(resolver).toContain("r.parentId !== milestoneId");
  });

  it("refuses an action that is not under the chosen result", () => {
    expect(resolver).toContain("a.parentId !== resultId");
  });

  it("refuses anything but a project at the top", () => {
    expect(resolver).toContain('project.kind !== "project"');
    expect(resolver).toContain("project.isArchived");
  });
});

describe("the picker", () => {
  it("offers a blank at every level below Project", () => {
    expect(picker).toContain("Leave blank — Unclassified Milestone");
    expect(picker).toContain("Leave blank — Unclassified Result");
    expect(picker).toContain("A new action will be created for this task");
  });

  it("stops at Action — there is nothing to pick below it", () => {
    expect(queries).toContain('inArray(projectNodes.kind, ["project", "milestone", "result", "action"])');
    expect(picker).not.toContain('"sub_action"');
  });

  it("clears everything under a level when that level changes", () => {
    // A stale result under a changed milestone is a chain the server refuses —
    // and it would refuse it at submit, not where the change was made.
    expect(picker).toContain("milestoneId: null, resultId: null, actionId: null");
    expect(picker).toContain("resultId: null, actionId: null");
  });

  it("names the row it is about to create", () => {
    expect(picker).toContain("const willBe = value.actionId ? \"Sub-Action\" : \"Action\"");
    expect(picker).toContain("${willBe} Name");
  });
});

describe("a client picked on the form wins over the project's", () => {
  it("passes the picked client explicitly", () => {
    // In this form the first field IS the client (it writes to `title`), so
    // without this the cascade's project client won and a task showed "—"
    // whenever that project had none — ignoring the client on screen.
    expect(form).toContain("client: titleFreeText ? undefined : values.title");
  });

  it("leaves the plan's own dialog inheriting instead", () => {
    // `titleFreeText` is true there: the first field is the ROW's name and
    // there is no client in the form to pick, so the project's applies.
    expect(form).toContain("titleFreeText");
  });
});

describe("a row created from the + Action / + Sub-Action dialog keeps its description", () => {
  const dialog = codeOf("components/project-plan/new-node-dialog.tsx");

  it("hands the description to the plan row, not only to the task", () => {
    expect(dialog).toContain("description: v.description");
    expect(dialog).toContain("subject: v.subject");
    expect(dialog).toContain("priority: v.priority");
  });

  it("gives beforeSubmit the fields to hand over", () => {
    expect(form).toContain("description: values.description || null");
    expect(form).toContain("subject: values.subject || null");
    expect(form).toContain("priority: values.priority");
  });

  it("accepts and stores them on the row", () => {
    const schema = actions.slice(
      actions.indexOf("const CreateForTaskSchema"),
      actions.indexOf("export async function createPlanNodeForTask"),
    );
    expect(schema).toContain("description: z.string().trim().max(2000).nullable().optional()");
    expect(actions).toContain("description: parsed.data.description || null");
  });
});

describe("the form resolves the chain before it creates the task", () => {
  it("stamps the resolved row onto the task", () => {
    const submit = form.slice(form.indexOf("if (cascadeShown && planTarget.projectId)"));
    expect(submit).toContain("resolvePlanTargetForTask");
    expect(submit).toContain("linkedNodeId = target.id");
  });

  it("stops on a refusal rather than leaving a task created and unfiled", () => {
    const submit = form.slice(form.indexOf("if (cascadeShown && planTarget.projectId)"));
    const stop = submit.indexOf("setError(target.error)");
    const create = submit.indexOf("await createTask(");
    expect(stop).toBeGreaterThan(-1);
    expect(create).toBeGreaterThan(stop);
  });

  it("requires the row's name before it will submit", () => {
    expect(form).toContain("if (!planTarget.name.trim())");
  });

  it("carries the task's doer and date onto the row, so the plan shows it scheduled", () => {
    expect(form).toContain("ownerId: values.doerIds[0] ?? null");
    expect(form).toContain("targetDate: dueIso.slice(0, 10)");
  });

  it("replaces the old flat select rather than sitting beside it", () => {
    expect(form).toContain("const projectLinkShown =\n    !cascadeShown &&");
  });
});
