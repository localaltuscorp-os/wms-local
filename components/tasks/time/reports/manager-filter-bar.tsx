"use client";

import { useRouter } from "next/navigation";
import type { Route } from "next";
import { useState } from "react";
import { SlidersHorizontal, RotateCcw } from "lucide-react";
import { LookupSelect } from "@/components/ui/lookup-select";
import { TASK_PRIORITIES, PRIORITY_LABELS, type TaskPriority } from "@/db/enums";
import type { TimeReportFilters, TimeReportFilterOptions } from "@/lib/queries/time-reports";

const FIELD =
  "w-full rounded-xl border border-hairline bg-white px-3.5 py-2.5 text-[14px] font-semibold text-ink-strong outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/50";
const LABEL = "mb-1.5 block uppercase font-bold text-ink-subtle";

function Label({ children }: { children: string }) {
  return (
    <span className={LABEL} style={{ fontSize: 10.5, letterSpacing: "0.08em" }}>
      {children}
    </span>
  );
}

/** The full Manager Report filter bar (employee · department · client · subject
 *  · priority · date range · goal). Keyboard-first; Apply navigates with the
 *  chosen query, Reset clears everything. */
export function ManagerFilterBar({
  options,
  initial,
}: {
  options: TimeReportFilterOptions;
  initial: TimeReportFilters;
}) {
  const router = useRouter();
  const [employeeId, setEmployeeId] = useState<string | null>(initial.employeeId ?? null);
  const [goalId, setGoalId] = useState<string | null>(initial.goalId ?? null);
  const [department, setDepartment] = useState(initial.department ?? "");
  const [client, setClient] = useState(initial.client ?? "");
  const [subject, setSubject] = useState(initial.subject ?? "");
  const [priority, setPriority] = useState<string>(initial.priority ?? "");
  const [from, setFrom] = useState(initial.from ?? "");
  const [to, setTo] = useState(initial.to ?? "");

  function apply() {
    const p = new URLSearchParams();
    if (employeeId) p.set("employee", employeeId);
    if (department) p.set("department", department);
    if (client) p.set("client", client);
    if (subject) p.set("subject", subject);
    if (priority) p.set("priority", priority);
    if (goalId) p.set("goal", goalId);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    const qs = p.toString();
    router.push((qs ? `/tasks/time/manager?${qs}` : "/tasks/time/manager") as Route);
  }

  function reset() {
    setEmployeeId(null);
    setGoalId(null);
    setDepartment("");
    setClient("");
    setSubject("");
    setPriority("");
    setFrom("");
    setTo("");
    router.push("/tasks/time/manager" as Route);
  }

  return (
    <div
      className="mb-6 rounded-section bg-surface-card border border-hairline p-5"
      style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
    >
      <div className="grid grid-cols-4 gap-4 max-lg:grid-cols-2 max-sm:grid-cols-1">
        <label>
          <Label>Employee</Label>
          <LookupSelect
            label="employee"
            value={employeeId}
            onChange={setEmployeeId}
            options={options.employees}
            className={FIELD}
            placeholder="All employees"
          />
        </label>

        <label>
          <Label>Department</Label>
          <select className={FIELD} value={department} onChange={(e) => setDepartment(e.target.value)}>
            <option value="">All departments</option>
            {options.departments.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </label>

        <label>
          <Label>Client</Label>
          <select className={FIELD} value={client} onChange={(e) => setClient(e.target.value)}>
            <option value="">All clients</option>
            {options.clients.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </label>

        <label>
          <Label>Subject</Label>
          <select className={FIELD} value={subject} onChange={(e) => setSubject(e.target.value)}>
            <option value="">All subjects</option>
            {options.subjects.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>

        <label>
          <Label>Priority</Label>
          <select className={FIELD} value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="">All priorities</option>
            {TASK_PRIORITIES.map((p) => (
              <option key={p} value={p}>{PRIORITY_LABELS[p as TaskPriority]}</option>
            ))}
          </select>
        </label>

        <label>
          <Label>Goal</Label>
          <LookupSelect
            label="goal"
            value={goalId}
            onChange={setGoalId}
            options={options.goals}
            className={FIELD}
            placeholder="All goals"
          />
        </label>

        <label>
          <Label>From</Label>
          <input type="date" className={FIELD} value={from} onChange={(e) => setFrom(e.target.value)} />
        </label>

        <label>
          <Label>To</Label>
          <input type="date" className={FIELD} value={to} onChange={(e) => setTo(e.target.value)} />
        </label>
      </div>

      <div className="mt-5 flex items-center gap-2.5">
        <button
          type="button"
          onClick={apply}
          className="wg-btn inline-flex items-center gap-2 rounded-full px-5 py-2.5 font-bold text-white transition-transform active:scale-[0.98]"
          style={{ background: "var(--color-altus-red)", fontSize: 13.5 }}
        >
          <SlidersHorizontal size={15} strokeWidth={2.4} />
          Apply Filters
        </button>
        <button
          type="button"
          onClick={reset}
          className="wg-btn inline-flex items-center gap-2 rounded-full border border-hairline bg-white/75 px-4 py-2.5 font-bold text-ink-strong transition-colors hover:border-hairline-strong"
          style={{ fontSize: 13.5 }}
        >
          <RotateCcw size={15} strokeWidth={2.4} />
          Reset
        </button>
      </div>
    </div>
  );
}
