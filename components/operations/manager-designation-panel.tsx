"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, UserCog } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { setEmployeeIsManager } from "@/app/(admin)/admin/hierarchy/actions";
import type { HierarchyPerson } from "@/lib/queries/hierarchy";
import { CompactSelect } from "@/components/ui/compact-select";

/**
 * TEAM REPORTING → ADD/DELETE MANAGER (2026-09-26).
 *
 * Answers "how do I make Mohit a manager" and "how do I remove one" —
 * neither had a control anywhere before this. Flips the explicit `is_manager`
 * flag (migration 0253); see `lib/employees/is-manager.ts` for why that flag
 * exists at all rather than being purely derived from report counts.
 *
 * DEMOTING IS ALWAYS SAFE: a person who still has direct reports keeps their
 * column regardless of this flag (`getHierarchy`'s rule is reports > 0 OR
 * this flag), so turning the flag off never hides someone reports would
 * otherwise justify — it only ever removes a GUARANTEED-empty slot.
 */
export function ManagerDesignationPanel({ people }: { people: HierarchyPerson[] }) {
  const router = useRouter();
  const [employeeId, setEmployeeId] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const byId = React.useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);
  const employee = employeeId ? byId.get(employeeId) : undefined;
  const currentlyManager = !!employee && (employee.isManager || employee.reportCount > 0);
  // A manager purely by having reports right now can't be "un-flagged" — there
  // is no flag on them to remove, and removing it would do nothing anyway.
  const canDemote = !!employee && employee.isManager;

  function cancel() {
    if (busy) return;
    setOpen(false);
    setEmployeeId("");
  }

  function apply(next: boolean) {
    if (busy || !employee) return;
    setBusy(true);
    void setEmployeeIsManager(employee.id, next)
      .then((res) => {
        if (!res.ok) {
          fireToast({ message: res.error, type: "error" });
          return;
        }
        fireToast({
          message: next ? `${employee.name} is now a manager.` : `${employee.name} is no longer a manager.`,
          type: "success",
        });
        setOpen(false);
        setEmployeeId("");
        router.refresh();
      })
      .finally(() => setBusy(false));
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-14 w-[104px] shrink-0 items-center justify-center gap-1.5 rounded-xl border border-hairline-strong bg-white text-[12.5px] font-bold leading-tight text-ink-strong transition hover:border-hairline"
      >
        <UserCog size={15} strokeWidth={2.4} className="shrink-0" />
        <span className="flex flex-col">
          <span>Add/Delete</span>
          <span>Manager</span>
        </span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[130] grid place-items-center bg-[rgba(15,23,42,0.45)] p-4"
          onClick={cancel}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Add or delete a manager"
            className="w-[420px] max-w-[94vw] rounded-2xl border border-hairline-strong bg-surface-card p-5 shadow-[0_40px_100px_rgba(15,23,42,0.35)]"
          >
            <h2 className="topbar-heading text-center">Add / Delete Manager</h2>

            <div className="mt-4 flex flex-col items-center gap-3">
              <label className="sr-only" htmlFor="mgr-employee">
                Select employee
              </label>
              <CompactSelect
                value={employeeId}
                onChange={setEmployeeId}
                className="h-10 w-full rounded-lg border border-hairline-strong bg-white pl-3 pr-9 text-[13.5px] font-semibold text-ink-strong outline-none focus:border-altus-red"
                placeholder="Select Employee"
                aria-label="Select employee"
                matchTriggerWidth
                options={people
                  .slice()
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((p) => ({
                    value: p.id,
                    label: `${p.name}${p.isManager || p.reportCount > 0 ? " (manager)" : ""}`,
                  }))}
              />

              {employee && (
                <p className="text-center text-[12.5px] text-ink-muted">
                  {currentlyManager
                    ? `${employee.name} is currently a manager${employee.reportCount > 0 ? ` (${employee.reportCount} direct report${employee.reportCount === 1 ? "" : "s"})` : " with nobody under them yet"}.`
                    : `${employee.name} is not currently a manager.`}
                </p>
              )}
            </div>

            <div className="mt-4 flex gap-3">
              {employee && !currentlyManager && (
                <button
                  type="button"
                  onClick={() => apply(true)}
                  disabled={busy}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-[13.5px] font-bold text-white disabled:opacity-60"
                  style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
                >
                  {busy ? <Loader2 size={15} className="animate-spin" /> : null}
                  Make Manager
                </button>
              )}
              {employee && canDemote && (
                <button
                  type="button"
                  onClick={() => apply(false)}
                  disabled={busy}
                  className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-[13.5px] font-bold text-white disabled:opacity-60"
                  style={{ background: "#dc2626" }}
                >
                  {busy ? <Loader2 size={15} className="animate-spin" /> : null}
                  Remove Manager Status
                </button>
              )}
              {employee && currentlyManager && !canDemote && (
                <p className="flex-1 text-center text-[12px] text-ink-subtle" style={{ lineHeight: 1.5 }}>
                  They're a manager because {employee.reportCount} people already report to them — transfer those
                  reports elsewhere first to remove manager status.
                </p>
              )}
              <button
                type="button"
                onClick={cancel}
                disabled={busy}
                className="inline-flex flex-1 items-center justify-center rounded-lg border border-hairline-strong bg-white px-5 py-2.5 text-[13.5px] font-bold text-ink-strong disabled:opacity-60"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
