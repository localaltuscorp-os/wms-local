"use client";

import * as React from "react";

/** A pickable project (project_nodes row of kind 'project'). */
export interface ProjectOption {
  id: string;
  name: string;
}

/** A pickable vendor (vendors master, migration 0184). */
export interface VendorOption {
  id: string;
  name: string;
}

export interface ProjectTagValue {
  isProject: boolean;
  projectNodeId: string;
  vendorId: string;
}

/**
 * "Part of Project?" — the Yes/No the goal forms ask, plus the project and
 * (optional) vendor it tags to when the answer is Yes.
 *
 * Shared by the Yearly / Quarterly / Monthly quick-add and the Weekly board so
 * every level asks the question identically. Answering No clears both pickers,
 * mirroring the server, which also nulls the refs — a goal can never keep a
 * project it no longer claims to be part of.
 *
 * Keyboard-first: the Yes/No pair are real radios (arrow keys switch), and the
 * pickers are native selects.
 */
export function ProjectTagFields({
  isProject,
  projectNodeId,
  vendorId,
  projects,
  vendors,
  onChange,
  idPrefix = "goal",
}: {
  isProject: boolean;
  projectNodeId: string;
  vendorId: string;
  projects: ProjectOption[];
  vendors: VendorOption[];
  onChange: (next: ProjectTagValue) => void;
  idPrefix?: string;
}) {
  const name = `${idPrefix}-is-project`;
  const set = (patch: Partial<ProjectTagValue>) =>
    onChange({ isProject, projectNodeId, vendorId, ...patch });

  return (
    <div className="rounded-xl border border-hairline bg-surface-soft p-3">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[12px] font-bold text-ink-soft">Part of Project?</span>
        <div className="inline-flex items-center gap-3" role="radiogroup" aria-label="Part of a project?">
          {[
            { label: "Yes", value: true },
            { label: "No", value: false },
          ].map((opt) => (
            <label key={opt.label} className="inline-flex cursor-pointer items-center gap-1.5">
              <input
                type="radio"
                name={name}
                checked={isProject === opt.value}
                onChange={() =>
                  // Answering No clears the tags so nothing stale is submitted.
                  set(
                    opt.value
                      ? { isProject: true }
                      : { isProject: false, projectNodeId: "", vendorId: "" },
                  )
                }
                className="h-3.5 w-3.5 accent-[var(--color-altus-red)]"
              />
              <span className="text-[13px] font-semibold text-ink-strong">{opt.label}</span>
            </label>
          ))}
        </div>
      </div>

      {isProject && (
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[12px] font-bold text-ink-soft">Project</span>
            <select
              value={projectNodeId}
              onChange={(e) => set({ projectNodeId: e.target.value })}
              className="w-full rounded-lg border border-hairline-strong bg-white px-2.5 py-2 text-[13px] font-medium text-ink-strong outline-none focus:border-altus-red"
            >
              <option value="">— select a project —</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            {projects.length === 0 && (
              <span className="mt-1 block text-[11.5px] font-medium text-ink-subtle">
                No projects yet — create one in the Projects module.
              </span>
            )}
          </label>

          <label className="block">
            <span className="mb-1 block text-[12px] font-bold text-ink-soft">
              Vendor <span className="font-medium text-ink-subtle">(if relevant)</span>
            </span>
            <select
              value={vendorId}
              onChange={(e) => set({ vendorId: e.target.value })}
              className="w-full rounded-lg border border-hairline-strong bg-white px-2.5 py-2 text-[13px] font-medium text-ink-strong outline-none focus:border-altus-red"
            >
              <option value="">— none —</option>
              {vendors.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.name}
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </div>
  );
}
