"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { useRouter } from "next/navigation";
import { Check, Loader2, Users, X } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { setIncentiveEligibility } from "@/app/(app)/incentive/catalog-actions";
import type { EligibilityPerson } from "@/lib/queries/incentive-eligibility";

/**
 * WHO DOES THIS INCENTIVE APPLY TO?
 *
 * Everyone, a whole function, or a named list. The admin picks; the employee
 * simply never sees an incentive they were not picked for, and it never counts
 * toward their attainment.
 *
 * A DEPARTMENT BUTTON SELECTS, IT DOES NOT SUBSCRIBE. Pressing "Sales" ticks
 * everyone currently in Sales and then forgets it was ever a department — what
 * gets stored is the list of people. If it stored the rule instead, moving
 * somebody between departments would change what they are paid for, months
 * after anyone decided anything, and nobody would know why.
 */
export function IncentiveEligibilityDialog({
  incentiveId,
  incentiveName,
  appliesToAll,
  eligibleIds,
  people,
}: {
  incentiveId: string;
  incentiveName: string;
  appliesToAll: boolean;
  eligibleIds: string[];
  people: EligibilityPerson[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [all, setAll] = React.useState(appliesToAll);
  const [picked, setPicked] = React.useState<Set<string>>(new Set(eligibleIds));
  const [saving, setSaving] = React.useState(false);
  const [filter, setFilter] = React.useState("");

  // Re-seed from the server every time it opens: another admin may have changed
  // this while the dialog sat closed on someone's second monitor.
  React.useEffect(() => {
    if (!open) return;
    setAll(appliesToAll);
    setPicked(new Set(eligibleIds));
    setFilter("");
  }, [open, appliesToAll, eligibleIds]);

  const departments = React.useMemo(() => {
    const map = new Map<string, string[]>();
    for (const p of people) {
      const dept = (p.department ?? "").trim() || "No function";
      map.set(dept, [...(map.get(dept) ?? []), p.id]);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [people]);

  const visible = React.useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return people;
    return people.filter(
      (p) =>
        p.name.toLowerCase().includes(q) || (p.department ?? "").toLowerCase().includes(q),
    );
  }, [people, filter]);

  function toggle(id: string) {
    setAll(false);
    setPicked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  /** Whole function on or off — on unless it is already fully selected. */
  function toggleDepartment(ids: string[]) {
    setAll(false);
    setPicked((prev) => {
      const next = new Set(prev);
      const complete = ids.every((id) => next.has(id));
      for (const id of ids) {
        if (complete) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }

  function save() {
    setSaving(true);
    setIncentiveEligibility({
      incentiveId,
      appliesToAll: all,
      employeeIds: all ? [] : [...picked],
    })
      .then((res) => {
        setSaving(false);
        if (!res.ok) return fireToast({ message: res.error, type: "error" });
        fireToast({
          message: all
            ? `"${incentiveName}" now applies to everyone.`
            : `"${incentiveName}" applies to ${picked.size} ${picked.size === 1 ? "person" : "people"}.`,
        });
        setOpen(false);
        router.refresh();
      })
      .catch((e) =>
        fireToast({ message: e instanceof Error ? e.message : "Failed.", type: "error" }),
      );
  }

  const summary = appliesToAll
    ? "Everyone"
    : `${eligibleIds.length} ${eligibleIds.length === 1 ? "person" : "people"}`;

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <Dialog.Trigger asChild>
        <button
          type="button"
          title={`Who "${incentiveName}" applies to`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-hairline bg-surface-card px-2 py-1 text-[11.5px] font-semibold text-ink-soft transition-colors hover:border-hairline-strong hover:text-ink-strong"
        >
          <Users size={13} strokeWidth={2.2} aria-hidden />
          {summary}
        </button>
      </Dialog.Trigger>

      <Dialog.Portal>
        <Dialog.Overlay
          className="fixed inset-0 z-[90]"
          style={{ background: "rgba(15,23,42,0.40)", backdropFilter: "blur(3px)" }}
        />
        <Dialog.Content className="fixed left-1/2 top-[8vh] z-[100] flex max-h-[80vh] w-[min(640px,calc(100vw-32px))] -translate-x-1/2 flex-col overflow-hidden rounded-section border border-hairline-strong bg-surface-card shadow-2xl">
          <div className="flex items-start gap-3 border-b border-hairline px-5 py-4">
            <div className="min-w-0 flex-1">
              <Dialog.Title className="text-[15px] font-bold text-ink-strong">
                Who gets &ldquo;{incentiveName}&rdquo;?
              </Dialog.Title>
              <Dialog.Description className="mt-0.5 text-[12.5px] text-ink-muted">
                Anyone not selected will not see this incentive at all, and it will not count
                toward their target.
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Close"
                className="grid size-8 shrink-0 place-items-center rounded-lg text-ink-soft hover:bg-surface-soft"
              >
                <X size={16} strokeWidth={2.4} />
              </button>
            </Dialog.Close>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-b border-hairline px-5 py-3">
            <button
              type="button"
              onClick={() => {
                setAll(true);
                setPicked(new Set());
              }}
              aria-pressed={all}
              className={`rounded-lg px-3 py-1.5 text-[12.5px] font-bold transition-colors ${
                all
                  ? "bg-[var(--color-altus-red)] text-white"
                  : "border border-hairline bg-surface-card text-ink-soft hover:border-hairline-strong"
              }`}
            >
              Everyone
            </button>

            {/* SELECT ALL is not the same button as Everyone, and both belong here.
                "Everyone" stores a standing rule — appliesToAll — so anyone hired
                later is covered, and ticking one name afterwards REPLACES the rule
                with that single person. "Select all" instead ticks every name now,
                so you can untick the one or two who don't qualify and keep the
                rest. Neither can stand in for the other. */}
            <button
              type="button"
              onClick={() => {
                setAll(false);
                setPicked(new Set(people.map((p) => p.id)));
              }}
              aria-pressed={!all && people.length > 0 && people.every((p) => picked.has(p.id))}
              className={`rounded-lg px-3 py-1.5 text-[12.5px] font-bold transition-colors ${
                !all && people.length > 0 && people.every((p) => picked.has(p.id))
                  ? "bg-[var(--color-altus-red)] text-white"
                  : "border border-hairline bg-surface-card text-ink-soft hover:border-hairline-strong"
              }`}
            >
              Select all
              <span className="ml-1.5 opacity-60">{people.length}</span>
            </button>

            {(all || picked.size > 0) && (
              <button
                type="button"
                onClick={() => {
                  setAll(false);
                  setPicked(new Set());
                }}
                className="rounded-lg px-3 py-1.5 text-[12.5px] font-bold text-altus-red hover:underline"
              >
                Clear
              </button>
            )}

            {/* Whole-function shortcuts. They tick people; they are not stored. */}
            {departments.map(([dept, ids]) => {
              const complete = !all && ids.every((id) => picked.has(id));
              return (
                <button
                  key={dept}
                  type="button"
                  onClick={() => toggleDepartment(ids)}
                  aria-pressed={complete}
                  className={`rounded-lg px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${
                    complete
                      ? "bg-ink-strong text-white"
                      : "border border-hairline bg-surface-card text-ink-soft hover:border-hairline-strong"
                  }`}
                >
                  {dept}
                  <span className="ml-1.5 opacity-60">{ids.length}</span>
                </button>
              );
            })}
          </div>

          <div className="border-b border-hairline px-5 py-2.5">
            <input
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="Filter people…"
              className="w-full rounded-lg border border-hairline bg-surface-soft px-3 py-1.5 text-[13px] outline-none focus:border-hairline-strong"
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto px-2 py-2">
            {visible.map((p) => {
              const on = all || picked.has(p.id);
              return (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => toggle(p.id)}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-surface-soft"
                >
                  <span
                    aria-hidden
                    className={`grid size-[18px] shrink-0 place-items-center rounded-[5px] border ${
                      on
                        ? "border-transparent bg-[var(--color-altus-red)] text-white"
                        : "border-hairline-strong bg-surface-card"
                    }`}
                  >
                    {on && <Check size={12} strokeWidth={3} />}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-ink-strong">
                    {p.name}
                  </span>
                  <span className="shrink-0 text-[11.5px] text-ink-muted">
                    {p.department ?? "—"}
                  </span>
                </button>
              );
            })}
            {visible.length === 0 && (
              <p className="px-3 py-6 text-center text-[13px] text-ink-subtle">Nobody matches that.</p>
            )}
          </div>

          <div className="flex items-center gap-3 border-t border-hairline px-5 py-3">
            <span className="text-[12.5px] font-semibold text-ink-muted">
              {all ? "Everyone" : `${picked.size} selected`}
            </span>
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="ml-auto inline-flex items-center gap-2 rounded-lg bg-[var(--color-altus-red)] px-4 py-2 text-[13px] font-bold text-white disabled:opacity-60"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} strokeWidth={2.8} />}
              Save
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
