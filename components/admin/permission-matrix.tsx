"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, ChevronRight, Info, RotateCcw, ShieldCheck } from "lucide-react";
import { fireToast } from "@/lib/toast";
import {
  allPermissionNodes,
  PERMISSION_ACTION_HINTS,
  PERMISSION_ACTION_LABELS,
  PERMISSION_ACTIONS,
  type PermissionAction,
} from "@/lib/permissions/catalog";
import { effectiveFor, type PermissionOverride } from "@/lib/permissions/effective";
import {
  setModulePermission,
  resetEmployeePermissions,
  fetchEmployeeMatrix,
} from "@/app/master-admin/actions";

/**
 * THE PERMISSION MATRIX.
 *
 * Module → sub-module → sub-sub-module down the left, SHOW / VIEW / EDIT across
 * each row, one employee at a time.
 *
 * ── ONE PERSON AT A TIME, NOT A GRID OF EVERYBODY ──────────────────────────
 * ~200 nodes × ~30 staff × 3 actions is 18,000 checkboxes. As a single grid it
 * would be unreadable, unusable on anything but a wide screen, and would ship
 * every employee's whole configuration to the browser to render. The question
 * being answered is always "what may THIS person reach", so the person is the
 * selector and the tree is the page.
 *
 * ── THE ROW SHOWS THE EFFECTIVE ANSWER, NOT JUST THE STORED ONE ────────────
 * A node under a denied parent is denied, whatever its own row says. The matrix
 * renders that with `effectiveFor` — the SAME function the server guards use —
 * and labels the inherited denials with the ancestor responsible. Otherwise an
 * administrator switching a leaf back on would see it turn green and conclude it
 * was reachable, when the module above it is still shut.
 */

export interface MatrixPerson {
  id: string;
  name: string;
  email: string;
  isMasterAdmin: boolean;
}

type OverrideMapObj = Record<string, { show: boolean; view: boolean; edit: boolean }>;

interface Props {
  people: MatrixPerson[];
  initialPersonId: string | null;
  initialOverrides: OverrideMapObj;
}

const CARD =
  "rounded-2xl border border-[#E2E8F0] bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]";

export function PermissionMatrix({ people, initialPersonId, initialOverrides }: Props) {
  const router = useRouter();
  const [personId, setPersonId] = useState<string | null>(initialPersonId);
  const [overrides, setOverrides] = useState<OverrideMapObj>(initialOverrides);
  const [loading, setLoading] = useState(false);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(new Set());
  const [, startTransition] = useTransition();

  const person = people.find((p) => p.id === personId) ?? null;
  const nodes = allPermissionNodes();

  /** The stored overrides as the pure resolver wants them. */
  const overrideMap = useMemo(() => {
    const m = new Map<string, PermissionOverride>();
    for (const [key, v] of Object.entries(overrides)) {
      m.set(key, { canShow: v.show, canView: v.view, canEdit: v.edit });
    }
    return m;
  }, [overrides]);

  function selectPerson(id: string) {
    setPersonId(id);
    setOverrides({});
    setLoading(true);
    void fetchEmployeeMatrix(id).then(
      (res) => {
        setOverrides(res.ok ? res.overrides : {});
        setLoading(false);
        if (!res.ok) fireToast({ message: res.error });
      },
      () => {
        setLoading(false);
        fireToast({ message: "Could not load that person's permissions." });
      },
    );
  }

  /**
   * Toggle one action on one node.
   *
   * Optimistic: the checkbox flips immediately and is reverted if the server
   * refuses. A matrix where every click waits on a round trip is unusable for
   * the "switch off eleven things" job it exists for.
   */
  function toggle(nodeKey: string, action: PermissionAction, nextValue: boolean) {
    if (!person) return;

    const current = overrides[nodeKey] ?? { show: true, view: true, edit: true };
    const next = { ...current, [action]: nextValue };

    // EDIT IMPLIES VIEW, applied here too so the UI never shows a state the
    // server would silently normalise away. Switching VIEW off takes EDIT with
    // it; switching EDIT on turns VIEW on.
    if (action === "view" && !nextValue) next.edit = false;
    if (action === "edit" && nextValue) next.view = true;

    const before = overrides;
    const optimistic = { ...overrides, [nodeKey]: next };
    // An all-true entry is no override at all — mirror the server, which deletes
    // the row, so the "customised" count on screen stays truthful.
    if (next.show && next.view && next.edit) delete optimistic[nodeKey];
    setOverrides(optimistic);

    startTransition(async () => {
      const res = await setModulePermission({
        employeeId: person.id,
        nodeKey,
        show: next.show,
        view: next.view,
        edit: next.edit,
      });
      if (!res.ok) {
        setOverrides(before);
        fireToast({ message: res.error });
      }
    });
  }

  function resetAll() {
    if (!person) return;
    startTransition(async () => {
      const res = await resetEmployeePermissions(person.id);
      if (!res.ok) {
        fireToast({ message: res.error });
        return;
      }
      setOverrides({});
      fireToast({ message: `${person.name} is back to the application's own permissions.` });
      router.refresh();
    });
  }

  function toggleCollapse(key: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  /** Is this node hidden because an ancestor module is collapsed? */
  function isHidden(ancestors: readonly string[]): boolean {
    return ancestors.some((a) => collapsed.has(a));
  }

  const customisedCount = Object.keys(overrides).length;

  return (
    <div className="space-y-4">
      <div className={`${CARD} p-5 max-md:p-4`}>
        <div className="flex flex-wrap items-end gap-4">
          <div className="min-w-[260px] flex-1">
            <label
              className="mb-1.5 block text-[13px] font-semibold text-[#0F172A]"
              htmlFor="pm-person"
            >
              Employee
            </label>
            <select
              id="pm-person"
              className="w-full rounded-md border border-[#CBD5E1] bg-white px-3 py-2.5 text-[14px]"
              value={personId ?? ""}
              onChange={(e) => selectPerson(e.target.value)}
            >
              <option value="">Select an employee…</option>
              {people.map((p) => (
                <option key={p.id} value={p.id} disabled={p.isMasterAdmin}>
                  {p.name} · {p.email}
                  {p.isMasterAdmin ? " (master admin — not governed)" : ""}
                </option>
              ))}
            </select>
          </div>
          {person && (
            <div className="flex items-center gap-3">
              <span className="text-[13px] text-[#64748B]">
                {customisedCount === 0
                  ? "No restrictions — uses the application's own permissions"
                  : `${customisedCount} node${customisedCount === 1 ? "" : "s"} restricted`}
              </span>
              <button
                type="button"
                onClick={resetAll}
                disabled={customisedCount === 0}
                className="inline-flex items-center gap-1.5 rounded-md border border-[#CBD5E1] px-3 py-2 text-[13px] font-medium text-[#334155] disabled:opacity-40"
              >
                <RotateCcw size={13} strokeWidth={2.2} />
                Reset all
              </button>
            </div>
          )}
        </div>

        <div
          className="mt-4 flex items-start gap-2.5 rounded-lg px-3.5 py-3"
          style={{ background: "rgba(15,23,42,0.035)" }}
        >
          <Info size={15} strokeWidth={2.2} className="mt-0.5 shrink-0 text-[#64748B]" />
          <div className="text-[13px] text-[#334155]" style={{ lineHeight: 1.6 }}>
            <p>
              A tick means <strong>not restricted here</strong> — the person still
              has to pass the permission the application already applies (admin
              flag, department rooms, each page&apos;s own guard). Switching
              something off <strong>narrows</strong> their access; nothing on this
              screen can grant access they did not already have.
            </p>
            <p className="mt-1.5">
              Switching a module off takes its sub-modules with it. The backend
              enforces every one of these — hiding a menu entry is not the
              mechanism.
            </p>
          </div>
        </div>
      </div>

      {!person ? (
        <div className={`${CARD} p-8 text-center`}>
          <ShieldCheck size={22} strokeWidth={2} className="mx-auto mb-2 text-[#94A3B8]" />
          <p className="text-[14px] text-[#64748B]">
            Choose an employee to see and change what they can reach.
          </p>
        </div>
      ) : person.isMasterAdmin ? (
        <div className={`${CARD} p-6`}>
          <p className="text-[14px] text-[#334155]" style={{ lineHeight: 1.6 }}>
            <strong>{person.name}</strong> is a master administrator. Module
            permissions are not applied to master administrators — if they could be
            denied a node, one mistaken save would remove the only way to undo it,
            leaving no route back except a hand-written database change.
          </p>
        </div>
      ) : (
        <div className={`${CARD} overflow-hidden`}>
          <div className="table-scroll overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-[13px]">
              <thead>
                <tr className="bg-[#F8FAFC] text-left text-[11.5px] font-semibold uppercase tracking-wide text-[#94A3B8]">
                  <th className="border-b border-[#E2E8F0] px-4 py-2.5">
                    Module · Sub-module · Sub-sub-module
                  </th>
                  {PERMISSION_ACTIONS.map((a) => (
                    <th
                      key={a}
                      className="w-24 border-b border-[#E2E8F0] px-3 py-2.5 text-center"
                      title={PERMISSION_ACTION_HINTS[a]}
                    >
                      {PERMISSION_ACTION_LABELS[a]}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-[#94A3B8]">
                      Loading…
                    </td>
                  </tr>
                )}
                {!loading &&
                  nodes.map((n) => {
                    if (isHidden(n.ancestors)) return null;
                    const eff = effectiveFor(n.key, overrideMap);
                    const stored = overrides[n.key];
                    const hasChildren = Boolean(n.children?.length);
                    const isCollapsed = collapsed.has(n.key);

                    return (
                      <tr
                        key={n.key}
                        className="border-b border-[#F1F5F9]"
                        style={{
                          background:
                            n.depth === 1
                              ? "#FCFDFE"
                              : undefined,
                        }}
                      >
                        <td
                          className="px-4 py-2"
                          style={{ paddingLeft: 16 + (n.depth - 1) * 22 }}
                        >
                          <div className="flex items-center gap-1.5">
                            {hasChildren ? (
                              <button
                                type="button"
                                onClick={() => toggleCollapse(n.key)}
                                aria-expanded={!isCollapsed}
                                aria-label={
                                  isCollapsed ? `Expand ${n.label}` : `Collapse ${n.label}`
                                }
                                className="shrink-0 text-[#94A3B8] hover:text-[#0F172A]"
                              >
                                {isCollapsed ? (
                                  <ChevronRight size={14} strokeWidth={2.4} />
                                ) : (
                                  <ChevronDown size={14} strokeWidth={2.4} />
                                )}
                              </button>
                            ) : (
                              <span className="w-[14px] shrink-0" />
                            )}
                            <span
                              className={
                                n.depth === 1
                                  ? "font-semibold text-[#0F172A]"
                                  : n.depth === 2
                                    ? "font-medium text-[#0F172A]"
                                    : "text-[#334155]"
                              }
                            >
                              {n.label}
                            </span>
                            {stored && (
                              <span
                                className="rounded-pill bg-[#FEF3C7] px-1.5 py-0.5 text-[10.5px] font-semibold text-[#92400E]"
                                title="This node has an explicit restriction"
                              >
                                set
                              </span>
                            )}
                          </div>
                          {n.note && (
                            <p
                              className="mt-0.5 text-[11.5px] text-[#94A3B8]"
                              style={{ paddingLeft: 20, lineHeight: 1.45 }}
                            >
                              {n.note}
                            </p>
                          )}
                        </td>
                        {PERMISSION_ACTIONS.map((a) => {
                          const allowed =
                            a === "show" ? eff.show : a === "view" ? eff.view : eff.edit;
                          const deniedBy = eff.deniedBy?.[a];
                          const inherited = Boolean(deniedBy) && deniedBy !== n.key;
                          return (
                            <td key={a} className="px-3 py-2 text-center">
                              <label className="inline-flex items-center justify-center">
                                <span className="sr-only">
                                  {PERMISSION_ACTION_LABELS[a]} — {n.label}
                                </span>
                                <input
                                  type="checkbox"
                                  checked={allowed}
                                  // An inherited denial is not this row's to
                                  // change: unticking the leaf would store a
                                  // second restriction that changes nothing, and
                                  // ticking it cannot re-open a shut parent.
                                  disabled={inherited}
                                  title={
                                    inherited
                                      ? `Denied by "${deniedBy}" further up`
                                      : PERMISSION_ACTION_HINTS[a]
                                  }
                                  onChange={(e) => toggle(n.key, a, e.target.checked)}
                                  className="size-4 accent-[#E10600] disabled:opacity-30"
                                />
                              </label>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
