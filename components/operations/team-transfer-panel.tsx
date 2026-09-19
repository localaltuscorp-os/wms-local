"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Users2 } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { moveEmployeeToManager } from "@/app/(admin)/admin/hierarchy/actions";
import type { HierarchyColumn, HierarchyPerson } from "@/lib/queries/hierarchy";

/**
 * TEAM REPORTING → TRANSFER. Pick a person, pick their new manager, confirm.
 *
 * ── WHY THIS EXISTS NEXT TO A DRAG-AND-DROP BOARD ─────────────────────────
 * The board above already moves people, by dragging a card between columns.
 * That works when both ends are on screen; it stops working the moment the
 * org is wider than the viewport, which is exactly when somebody needs moving
 * — you cannot drag a card to a column you have to scroll to reach. Two names
 * and a button have no such limit, and they also say what is about to happen
 * in words, which a drag never does.
 *
 * ── THE CONFIRMATION IS THE POINT, NOT DECORATION ─────────────────────────
 * A reporting line is read by every manager dashboard, team roll-up, goal
 * cascade and approval chain in the application, so a mis-click here quietly
 * re-points somebody's approvals at the wrong person. The dialog therefore
 * spells out the whole sentence — who moves, FROM whom, TO whom — because
 * "are you sure?" over two dropdowns you may have mis-set is not a check.
 *
 * The write itself is `moveEmployeeToManager`, the SAME action the board uses:
 * it re-checks admin and the module-edit permission, and `setReportingManager`
 * underneath it owns the self-manager and cycle refusals. Nothing here decides
 * what a legal tree is — it only asks.
 */
export function TeamTransferPanel({
  people,
  columns,
}: {
  people: HierarchyPerson[];
  columns: HierarchyColumn[];
}) {
  const router = useRouter();
  const [employeeId, setEmployeeId] = React.useState("");
  const [managerId, setManagerId] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [confirming, setConfirming] = React.useState(false);
  const [busy, setBusy] = React.useState(false);

  const byId = React.useMemo(() => new Map(people.map((p) => [p.id, p])), [people]);

  /** People who already hold a column — the sketch's "bordered cells". */
  const currentManagers = React.useMemo(
    () =>
      columns
        .filter((c) => c.managerId !== null)
        .map((c) => ({ id: c.managerId as string, name: c.managerName, count: c.reports.length }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [columns],
  );

  /**
   * Everyone else, offered as a SECOND group rather than left out.
   *
   * Only existing managers appear as columns, so a list of columns alone could
   * never give somebody their FIRST report — the person you want to promote is
   * precisely the one who is not a column yet. Keeping them in a separate group
   * means the common case (an existing manager) stays at the top of the list.
   */
  const otherEmployees = React.useMemo(() => {
    const isManager = new Set(currentManagers.map((m) => m.id));
    return people.filter((p) => !isManager.has(p.id)).sort((a, b) => a.name.localeCompare(b.name));
  }, [people, currentManagers]);

  const employee = employeeId ? byId.get(employeeId) : undefined;
  const oldManagerName = employee?.managerId
    ? (byId.get(employee.managerId)?.name ?? "Former employee")
    : "no manager";
  const newManagerName =
    managerId === "none" ? "no manager" : managerId ? (byId.get(managerId)?.name ?? "") : "";

  /** Already there — nothing to confirm, and nothing to write. */
  const isNoOp =
    !!employee &&
    !!managerId &&
    ((managerId === "none" && employee.managerId === null) || employee.managerId === managerId);
  const isSelf = !!employee && managerId === employee.id;
  const ready = !!employeeId && !!managerId && !isNoOp && !isSelf;

  function onTransferClick() {
    if (!ready) return;
    setConfirming(true);
  }

  /**
   * Cancelling clears the pickers, not just the dialog.
   *
   * Leaving them set meant backing out of a transfer left the panel still
   * reading "Asha Kulkarni to Ravi Deshpande" with a live Transfer button — the
   * screen still proposing the thing that was just declined, one click from
   * doing it. Clearing puts the panel back to where it was before the attempt.
   *
   * Used by the Cancel button AND the backdrop, so dismissing either way ends
   * in the same state.
   */
  function cancel() {
    if (busy) return;
    setConfirming(false);
    setOpen(false);
    setEmployeeId("");
    setManagerId("");
  }

  function onConfirm() {
    if (busy || !employee) return;
    setBusy(true);
    void moveEmployeeToManager({
      employeeId: employee.id,
      managerId: managerId === "none" ? null : managerId,
    })
      .then((res) => {
        if (!res.ok) {
          fireToast({ message: res.error, type: "error" });
          return;
        }
        setConfirming(false);
        setOpen(false);
        setEmployeeId("");
        setManagerId("");
        fireToast({
          // `changed: false` means the tree already said this — worth saying so
          // rather than claiming a move that did not happen.
          message: res.changed
            ? `${employee.name} now reports to ${newManagerName}.`
            : `${employee.name} already reported to ${newManagerName}.`,
          type: "success",
        });
        // The board above is server-rendered from the same snapshot, so it only
        // shows the person in their new column after this.
        router.refresh();
      })
      .finally(() => setBusy(false));
  }

  /**
   * ONE WIDTH FOR BOTH PICKERS, taken from the longest label either of them
   * can show.
   *
   * Left to themselves a `<select>` sizes to its own widest option, so the two
   * came out different widths for no reason the reader can see — and the
   * manager list is wider by an accident of it carrying "(count)" suffixes.
   * Measuring both lists together and giving them the same number keeps them a
   * matched pair whatever the roster does.
   *
   * `ch` because the thing being fitted is text: 1ch is the "0" advance of the
   * actual rendered font, so this tracks the font rather than a px guess.
   * +4 for the caret lane, the padding and a little slack so the longest name
   * is not flush against the arrow. CLAMPED at both ends — 22ch so an org of
   * short names still gets a box that reads as a control, 32ch so a single
   * outlier cannot stretch the row: the fixture's "Venkataraman Subramanian
   * Krishnamurthy" is 36 characters, and sizing to it would put the box back to
   * the width being complained about. Past the ceiling the option text
   * truncates, which is the right trade for one name in a list.
   */
  const selectWidthCh = React.useMemo(() => {
    const labels = [
      "Select Employee",
      "Select Manager",
      ...people.map((p) => p.name),
      ...currentManagers.map((m) => `${m.name} (${m.count})`),
    ];
    const longest = labels.reduce((n, l) => Math.max(n, l.length), 0);
    return Math.min(Math.max(longest + 4, 22), 32);
  }, [people, currentManagers]);

  /**
   * `appearance-none` plus our own caret, because the NATIVE arrow is placed by
   * the browser hard against the right edge and no amount of padding moves it —
   * which is why it read as sitting on the border. Drawing it ourselves puts it
   * 12px in, vertically centred, and `pr-9` reserves the lane so a long name
   * runs under nothing.
   */
  const CARET =
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath d='M1 1.5 6 6.5l5-5' fill='none' stroke='%2364748b' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E\")";

  const SELECT =
    "h-10 appearance-none rounded-lg border border-hairline-strong bg-white pl-3 pr-9 text-[13.5px] font-semibold text-ink-strong outline-none focus:border-altus-red disabled:opacity-60";

  const selectStyle: React.CSSProperties = {
    width: `${selectWidthCh}ch`,
    backgroundImage: CARET,
    backgroundRepeat: "no-repeat",
    backgroundPosition: "right 12px center",
  };

  return (
    <>
      {/* THE TRIGGER. The pickers used to sit permanently under the board,
          which spent a whole row of the page on a control that gets used
          occasionally. As a button they stay one click away and the board gets
          the page. */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-10 items-center gap-2 rounded-lg px-5 text-[13.5px] font-bold text-white"
        style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
      >
        <Users2 size={15} strokeWidth={2.4} /> Transfer
      </button>

      {/* THE PICKERS, as a dialog. Only ONE overlay is ever mounted: opening
          the confirmation REPLACES this rather than stacking a second modal on
          top of it, so Cancel always returns to the page and never to a dialog
          hiding behind another. */}
      {open && !confirming ? (
        <div
          className="fixed inset-0 z-[130] grid place-items-center bg-[rgba(15,23,42,0.45)] p-4"
          onClick={cancel}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Transfer an employee"
            className="w-fit max-w-[94vw] rounded-2xl border border-hairline-strong bg-surface-card p-5 shadow-[0_40px_100px_rgba(15,23,42,0.35)]"
          >
            <h2 className="topbar-heading text-center">Transfer</h2>

            <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
              <label className="sr-only" htmlFor="tr-employee">
                Select employee
              </label>
              <select
                id="tr-employee"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
                className={SELECT}
                style={selectStyle}
              >
                <option value="">Select Employee</option>
                {people
                  .slice()
                  .sort((a, b) => a.name.localeCompare(b.name))
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
              </select>

              <span className="text-[13.5px] text-ink-muted">to</span>

              <label className="sr-only" htmlFor="tr-manager">
                Select manager
              </label>
              <select
                id="tr-manager"
                value={managerId}
                onChange={(e) => setManagerId(e.target.value)}
                className={SELECT}
                style={selectStyle}
              >
                <option value="">Select Manager</option>
                {/* THE CURRENT MANAGER IS GREYED OUT, not just refused after
                    the fact. Picking the person somebody already reports to is
                    not a transfer, and the panel used to accept the choice and
                    then explain itself with "already reports to ..." under a
                    dead button. Unselectable says the same thing before the
                    click, and the same rule covers the self-pick. */}
                <optgroup label="Managers">
                  {currentManagers.map((m) => (
                    <option
                      key={m.id}
                      value={m.id}
                      disabled={m.id === employeeId || m.id === employee?.managerId}
                    >
                      {m.name} ({m.count}){m.id === employee?.managerId ? " - current manager" : ""}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="Other employees">
                  {otherEmployees.map((p) => (
                    <option
                      key={p.id}
                      value={p.id}
                      disabled={p.id === employeeId || p.id === employee?.managerId}
                    >
                      {p.name}{p.id === employee?.managerId ? " - current manager" : ""}
                    </option>
                  ))}
                </optgroup>
                {/* Unassigning is a real move, and the board has a column for
                    it - unless they are already unassigned, which is the same
                    no-op as picking their current manager. */}
                <optgroup label="Or">
                  <option value="none" disabled={!!employee && employee.managerId === null}>
                    No manager{employee && employee.managerId === null ? " - current" : ""}
                  </option>
                </optgroup>
              </select>
            </div>

            {/* Say WHY the button is dead rather than leaving it inert. */}
            {isSelf ? (
              <p className="mt-3 text-center text-[12.5px] font-semibold text-amber-700">
                Somebody cannot report to themselves.
              </p>
            ) : isNoOp ? (
              <p className="mt-3 text-center text-[12.5px] font-semibold text-ink-muted">
                {employee?.name} already reports to {newManagerName}.
              </p>
            ) : null}

            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={onTransferClick}
                disabled={!ready}
                className="inline-flex flex-1 items-center justify-center rounded-lg px-5 py-2.5 text-[13.5px] font-bold text-white disabled:opacity-50"
                style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
              >
                Transfer
              </button>
              <button
                type="button"
                onClick={cancel}
                className="inline-flex flex-1 items-center justify-center rounded-lg border border-hairline-strong bg-white px-5 py-2.5 text-[13.5px] font-bold text-ink-strong"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {confirming && employee ? (
        <div
          className="fixed inset-0 z-[130] grid place-items-center bg-[rgba(15,23,42,0.45)] p-4"
          onClick={cancel}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-label="Confirm transfer"
            className="w-[460px] max-w-[94vw] rounded-2xl border border-hairline-strong bg-surface-card p-5 shadow-[0_40px_100px_rgba(15,23,42,0.35)]"
          >
            {/* `topbar-heading` is the app's page-title mark — the same class
                the top bar's "Team Reporting" uses, not a copy of its values.
                It carries its own --mw-a/--mw-b, so the display face, the brand
                red, the 900 weight and the clamp() size all come from one
                declaration and cannot drift from the title this dialog opened
                in front of. */}
            <h2 className="topbar-heading text-center">Confirm transfer?</h2>

            {/* THE WHOLE SENTENCE, not just a yes/no — and HORIZONTAL, so it
                reads left to right in the same direction the move travels:
                who moves, off whom, onto whom. Three equal columns rather than
                `auto 1fr`, so the three names line up under their own labels
                instead of the longest one setting the shape.

                `min-w-0` + `break-words` on the cells: these are real names,
                and "Venkataraman Subramanian Krishnamurthy" is in the fixture
                precisely so long ones get exercised rather than assumed. */}
            <div className="mt-4 rounded-xl border border-hairline-strong bg-white p-4">
              <div className="grid grid-cols-3 gap-x-4 gap-y-1.5 text-[13px]">
                <span className="min-w-0 text-ink-muted">Employee</span>
                <span className="min-w-0 text-ink-muted">will move from</span>
                <span className="min-w-0 text-ink-muted">to</span>
                <span className="min-w-0 break-words font-bold text-ink-strong">{employee.name}</span>
                <span className="min-w-0 break-words font-bold text-ink-strong">{oldManagerName}</span>
                <span className="min-w-0 break-words font-bold text-ink-strong">{newManagerName}</span>
              </div>
            </div>

            <p className="mt-3 text-[12.5px] leading-[1.55] text-ink-muted">
              Every manager dashboard, team roll-up, goal cascade and approval chain reads this
              relationship, so it changes where {employee.name}&apos;s approvals go.
            </p>

            {/* CONFIRM LEFT, CANCEL RIGHT, both filled and both white-on-colour.
                Equal width via `flex-1`, so neither reads as the safer option
                by being the larger target — the colours carry the meaning and
                the labels sit centred in matching boxes. */}
            <div className="mt-4 flex gap-3">
              <button
                type="button"
                onClick={onConfirm}
                disabled={busy}
                className="inline-flex flex-1 items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-[13.5px] font-bold text-white disabled:opacity-60"
                style={{ background: "#16a34a" }}
              >
                {busy ? <Loader2 size={15} className="animate-spin" /> : null}
                Confirm
              </button>
              <button
                type="button"
                onClick={cancel}
                disabled={busy}
                className="inline-flex flex-1 items-center justify-center rounded-lg px-5 py-2.5 text-[13.5px] font-bold text-white disabled:opacity-60"
                style={{ background: "#dc2626" }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
