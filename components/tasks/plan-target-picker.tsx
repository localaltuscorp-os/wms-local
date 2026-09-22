"use client";

import * as React from "react";
import { Select } from "@/components/ui/select";
import type { PlanPickerNode } from "@/lib/queries/project-plan";

/**
 * PROJECT → MILESTONE → RESULT → ACTION, in the New Task form.
 *
 * Filing a task into the plan used to be one flat select listing every row in
 * every project at once — fine at twenty rows, unusable at two hundred, and it
 * asked you to know which level you were picking. This asks the question the
 * way people hold it: which project, then which part of it.
 *
 * WHAT EACH BLANK MEANS, and why blanks are allowed at all: most tasks are
 * raised in a hurry against a project, before anyone has decided which
 * milestone they belong to. Forcing the whole chain would make people either
 * abandon the link or invent a milestone. So a blank is a real answer —
 * "Unclassified" — and the server materialises it as a REAL ROW you can rename
 * or move work out of later, rather than leaving the task attached to a project
 * in the abstract with no place in its tree.
 *
 * THE DEEPEST PICK IS AN ACTION, and picking one means "make this a SUB-action
 * of it". Leave it blank and the task becomes a new Action under the result.
 * There is nothing below Action to offer, because that is where this ends.
 *
 * WHY IT REBUILDS THE CASCADE FROM ONE FLAT LIST: the four levels are four
 * filters over the same array, which is one query at page load instead of a
 * round-trip each time the user changes their mind about a milestone.
 */

export interface PlanTarget {
  projectId: string;
  milestoneId: string | null;
  resultId: string | null;
  actionId: string | null;
  /** The new row's name — what the Project Plan will show it as. */
  name: string;
}

export const EMPTY_PLAN_TARGET: PlanTarget = {
  projectId: "",
  milestoneId: null,
  resultId: null,
  actionId: null,
  name: "",
};

interface Props {
  nodes: PlanPickerNode[];
  value: PlanTarget;
  onChange: (next: PlanTarget) => void;
}

const BLANK = "";

export function PlanTargetPicker({ nodes, value, onChange }: Props) {
  const childrenOf = React.useCallback(
    (parentId: string | null, kind: PlanPickerNode["kind"]) =>
      nodes.filter((n) => n.kind === kind && n.parentId === parentId),
    [nodes],
  );

  const projects = React.useMemo(() => childrenOf(null, "project"), [childrenOf]);
  const milestones = React.useMemo(
    () => (value.projectId ? childrenOf(value.projectId, "milestone") : []),
    [childrenOf, value.projectId],
  );
  const results = React.useMemo(
    () => (value.milestoneId ? childrenOf(value.milestoneId, "result") : []),
    [childrenOf, value.milestoneId],
  );
  const actions = React.useMemo(
    () => (value.resultId ? childrenOf(value.resultId, "action") : []),
    [childrenOf, value.resultId],
  );

  /**
   * Changing a level CLEARS everything under it. Keeping a stale result after
   * its milestone changed would leave a chain the server refuses — and it would
   * refuse it at submit, after the whole form was filled in, rather than here
   * where the change was made.
   */
  function setProject(id: string) {
    onChange({ ...value, projectId: id, milestoneId: null, resultId: null, actionId: null });
  }
  function setMilestone(id: string) {
    onChange({ ...value, milestoneId: id || null, resultId: null, actionId: null });
  }
  function setResult(id: string) {
    onChange({ ...value, resultId: id || null, actionId: null });
  }
  function setAction(id: string) {
    onChange({ ...value, actionId: id || null });
  }

  // What the row about to be created will be. Drives the name field's label and
  // the explanatory line, so the form says what it is going to do rather than
  // leaving it to be discovered afterwards.
  const willBe = value.actionId ? "Sub-Action" : "Action";
  const milestoneLabel = value.milestoneId
    ? (milestones.find((m) => m.id === value.milestoneId)?.name ?? "the milestone")
    : "Unclassified Milestone";
  const resultLabel = value.resultId
    ? (results.find((r) => r.id === value.resultId)?.name ?? "the result")
    : "Unclassified Result";

  if (projects.length === 0) return null;

  return (
    <div className="grid gap-3">
      <Row label="Project" id="pt-project">
        <Select
          id="pt-project"
          value={value.projectId}
          onValueChange={setProject}
          unstyled
          className="nt-input"
          options={[
            { value: BLANK, label: "Not linked to a project" },
            ...projects.map((p) => ({ value: p.id, label: p.name || "Untitled project" })),
          ]}
        />
      </Row>

      {value.projectId && (
        <>
          <Row label="Milestone" id="pt-milestone">
            <Select
              id="pt-milestone"
              value={value.milestoneId ?? BLANK}
              onValueChange={setMilestone}
              unstyled
              className="nt-input"
              options={[
                { value: BLANK, label: "Leave blank — Unclassified Milestone" },
                ...milestones.map((m) => ({ value: m.id, label: m.name || "Untitled milestone" })),
              ]}
            />
          </Row>

          <Row label="Result" id="pt-result">
            <Select
              id="pt-result"
              value={value.resultId ?? BLANK}
              onValueChange={setResult}
              unstyled
              className="nt-input"
              options={[
                { value: BLANK, label: "Leave blank — Unclassified Result" },
                ...results.map((r) => ({ value: r.id, label: r.name || "Untitled result" })),
              ]}
            />
          </Row>

          <Row label="Action" id="pt-action">
            <Select
              id="pt-action"
              value={value.actionId ?? BLANK}
              onValueChange={setAction}
              unstyled
              className="nt-input"
              options={[
                { value: BLANK, label: "A new action will be created for this task" },
                ...actions.map((a) => ({ value: a.id, label: a.name || "Untitled action" })),
              ]}
            />
          </Row>

          <p className="text-[12.5px] leading-relaxed text-ink-muted">
            {value.actionId ? (
              <>
                This task becomes a new <strong className="text-ink-strong">Sub-Action</strong> under
                the action you picked.
              </>
            ) : (
              <>
                {(!value.milestoneId || !value.resultId) && (
                  <>
                    Left blank, this files under{" "}
                    <strong className="text-ink-strong">{milestoneLabel}</strong> /{" "}
                    <strong className="text-ink-strong">{resultLabel}</strong> in this project — a
                    real row you can rename or move work out of later.{" "}
                  </>
                )}
                This task becomes a new <strong className="text-ink-strong">Action</strong> under
                that result.
              </>
            )}
          </p>

          <Row label={`${willBe} Name`} id="pt-name" required>
            <input
              id="pt-name"
              className="nt-input"
              placeholder={`What this ${willBe.toLowerCase()} is called…`}
              value={value.name}
              onChange={(e) => onChange({ ...value, name: e.target.value })}
            />
          </Row>
          <p className="-mt-1 text-[12.5px] leading-relaxed text-ink-muted">
            This is the row the Project Plan shows under{" "}
            <strong className="text-ink-strong">{value.actionId ? "the action" : resultLabel}</strong>
            . The task keeps its own title in the task list.
          </p>
        </>
      )}
    </div>
  );
}

/** The form's field shell, local so this component can live beside the task
 *  form without importing its internals. */
function Row({
  label,
  id,
  required,
  children,
}: {
  label: string;
  id: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="mb-1.5 block text-[13px] font-bold text-ink-strong">
        {label}
        {required && <span className="ml-0.5 text-altus-red">*</span>}
      </label>
      {children}
    </div>
  );
}
