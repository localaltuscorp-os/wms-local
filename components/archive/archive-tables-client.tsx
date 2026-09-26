"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { ArchiveRestore, Search, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import type { ArchiveRecordKind } from "@/lib/archive/sections";
import type { ArchiveTable } from "@/lib/queries/archive";
import { deleteRecord, reassignAndUnarchiveRecord, unarchiveRecord } from "@/app/(app)/archive/actions";
import type { ArchivePerson } from "@/lib/queries/archive";
import { formatCount } from "@/lib/format";

/**
 * The Archive's tables, with the two things a reading surface still needs: a
 * SEARCH BOX and, on rows that were put away, UNARCHIVE and DELETE.
 *
 * WHY THE SEARCH IS CLIENT-SIDE. Each table arrives with at most 500 rows
 * already in the page, and the question people ask here is "which of these
 * says Sharma / GST / September" — an instant filter over what is on screen,
 * across every column at once. A server round trip per keystroke would be
 * slower and would need a bespoke WHERE for each of the thirty-odd tables. The
 * row count line stays honest about it: it says how many of the loaded rows
 * match, next to the true total behind them.
 *
 * UNARCHIVE SAYS WHERE THE RECORD WENT. Putting something back is only half an
 * answer if you then have to go looking for it, so the toast carries a button
 * to the screen it landed on — "Open Tasks" for a task, its own module for
 * everything else (HOME below).
 *
 * DELETE ASKS TWICE, in the row itself rather than a modal: the first click
 * turns the button into "Delete for good?" and only the second one calls the
 * server. A window.confirm() would block the whole tab (and the browser
 * automation this app is tested with); an inline confirm keeps the row you are
 * about to destroy in front of you while you decide.
 */
/** Where each kind of record lives once it is no longer archived. */
const HOME: Record<ArchiveRecordKind, { href: string; label: string }> = {
  task: { href: "/tasks", label: "Tasks" },
  "weekly-goal": { href: "/goals/weekly", label: "Weekly Goals" },
  goal: { href: "/goals", label: "Goals" },
  "dcc-item": { href: "/dcc", label: "DCC" },
  // One table behind two forms — the table key says which of them this is.
  "module-submission": { href: "/reimbursements", label: "Reimbursements" },
  "kpi-assignment": { href: "/hr/kpi", label: "KPIs" },
  "employee-document": { href: "/hr/record", label: "HR Record" },
  "hr-ticket": { href: "/support", label: "Help Desk" },
  "project-node": { href: "/project-plan", label: "Project Plan" },
  "team-performance": { href: "/productivity/team", label: "Team Performance" },
};

function homeFor(table: ArchiveTable): { href: string; label: string } | null {
  if (!table.record) return null;
  if (table.record === "module-submission" && table.key === "references") {
    return { href: "/record-reference", label: "References" };
  }
  return HOME[table.record];
}

export function ArchiveTablesClient({ tables, activePeople = [] }: { tables: ArchiveTable[]; activePeople?: ArchivePerson[] }) {
  const [q, setQ] = React.useState("");
  React.useEffect(() => {
    const update = (event: Event) => setQ(String((event as CustomEvent<string>).detail ?? ""));
    window.addEventListener("archive-record-search", update);
    return () => window.removeEventListener("archive-record-search", update);
  }, []);
  const needle = q.trim().toLowerCase();

  return (
    <div className="flex flex-col gap-7">
      {false && <label className="flex items-center gap-2 self-start rounded-chip border border-hairline bg-surface-card px-3 py-2">
        <Search size={15} strokeWidth={2.2} className="text-ink-soft" />
        <input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search these records — name, client, subject, status…"
          className="w-[min(46ch,70vw)] bg-transparent text-[13.5px] text-ink-strong outline-none placeholder:text-ink-subtle"
          aria-label="Search the archived records on this page"
        />
        {q !== "" && (
          <button
            type="button"
            onClick={() => setQ("")}
            aria-label="Clear the search"
            className="text-ink-soft hover:text-ink-strong"
          >
            <X size={14} strokeWidth={2.4} />
          </button>
        )}
      </label>}

      {tables.map((t) => (
        <TableBlock key={t.key} table={t} needle={needle} activePeople={activePeople} />
      ))}
    </div>
  );
}

function TableBlock({ table, needle, activePeople }: { table: ArchiveTable; needle: string; activePeople: ArchivePerson[] }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  /** Which row is one click away from being destroyed. */
  const [armed, setArmed] = React.useState<string | null>(null);
  /** Rows already acted on — hidden immediately so the list matches the truth
   *  before the server round trip lands. */
  const [gone, setGone] = React.useState<Set<string>>(new Set());
  const [recipient, setRecipient] = React.useState<Record<string, string>>({});

  const actionable = !!table.record && !!table.rowIds;
  /**
   * Some tables restore but never delete — a Team Performance row is an
   * employee, and no list preference is worth a Delete button next to a
   * person. The server action refuses it too; this only decides what is
   * drawn.
   */
  const deletable = actionable && !table.restoreOnly;
  const reassignable = table.record === "task" || table.record === "weekly-goal" || table.record === "goal" || table.record === "project-node";

  const visible = table.rows
    .map((cells, i) => ({ cells, id: table.rowIds?.[i] }))
    .filter((r) => !(r.id && gone.has(r.id)))
    .filter(
      (r) =>
        needle === "" ||
        r.cells.some((c) => c != null && String(c).toLowerCase().includes(needle)),
    );

  const filtered = needle !== "" && visible.length !== table.rows.length;

  function run(kind: "unarchive" | "delete", id: string) {
    start(async () => {
      const res =
        kind === "unarchive"
          ? await unarchiveRecord(table.record!, id)
          : await deleteRecord(table.record!, id);
      if (res.ok) {
        setGone((g) => new Set(g).add(id));
        const home = kind === "unarchive" ? homeFor(table) : null;
        toast.success(res.message, {
          action: home
            ? { label: `Open ${home.label}`, onClick: () => router.push(home.href as Route) }
            : undefined,
          duration: home ? 8000 : 4000,
        });
        router.refresh();
      } else {
        toast.error(res.error);
      }
      setArmed(null);
    });
  }
  function reassign(id: string, employeeId = recipient[id]) {
    if (!employeeId) return toast.error("Choose the employee who will receive this work.");
    start(async () => {
      const res = await reassignAndUnarchiveRecord(table.record!, id, employeeId);
      if (res.ok) { setGone((g) => new Set(g).add(id)); toast.success(res.message); router.refresh(); }
      else toast.error(res.error);
    });
  }

  return (
    <section className="wg-rise">
      <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-[13px] font-black uppercase tracking-[0.08em] text-ink-muted">
          {table.title}
        </h2>
        <span className="text-mono text-[12px] text-ink-soft">
          {filtered
            ? `${formatCount(visible.length)} of ${formatCount(table.rows.length)} shown · `
            : ""}
          {formatCount(Math.max(0, table.total - gone.size))}{" "}
          {table.total - gone.size === 1 ? "record" : "records"}
          {table.total > table.rows.length
            ? ` · latest ${formatCount(table.rows.length)} loaded`
            : ""}
        </span>
      </div>

      <div
        className="rounded-section border border-hairline bg-surface-card overflow-hidden"
        style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}
      >
        {visible.length === 0 ? (
          <p className="px-6 py-10 text-center text-[13.5px] font-medium text-ink-soft">
            {table.rows.length === 0
              ? "No records for this scope."
              : `Nothing here matches “${needle}”.`}
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table
              className="w-full border-collapse text-left"
              style={{ minWidth: Math.max(640, (table.columns.length + (actionable ? 1 : 0)) * 88) }}
            >
              <thead>
                <tr style={{ background: "var(--color-surface-soft)" }}>
                  {table.columns.map((c) => (
                    <th
                      key={c.key}
                      scope="col"
                      className={
                        "whitespace-nowrap px-4 py-3 text-[12px] font-bold uppercase tracking-[0.06em] text-ink-soft border-b border-hairline" +
                        (c.align === "right" ? " text-right" : "")
                      }
                    >
                      {c.label}
                    </th>
                  ))}
                  {actionable && (
                    <th
                      scope="col"
                      className="sticky right-0 z-10 whitespace-nowrap px-4 py-3 text-right text-[12px] font-bold uppercase tracking-[0.06em] text-ink-soft border-b border-hairline"
                      style={{ background: "var(--color-surface-soft)" }}
                    >
                      Actions
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {visible.map((row, i) => (
                  <tr key={row.id ?? i} className="border-b border-hairline last:border-b-0">
                    {table.columns.map((c, j) => {
                      const v = row.cells[j];
                      return (
                        <td
                          key={c.key}
                          className={
                        "whitespace-nowrap px-1.5 py-2.5 align-top text-[13.5px] text-ink-strong" +
                            (c.align === "right" ? " text-right text-mono whitespace-nowrap" : "")
                          }
                        >
                          {v == null || v === "" ? (
                            <span className="text-ink-subtle">—</span>
                          ) : (
                            <span>{v}</span>
                          )}
                        </td>
                      );
                    })}
                    {actionable && (
                      // Pinned to the right edge: these tables are wide enough
                      // to scroll sideways, and buttons you have to go looking
                      // for may as well not be there.
                      <td
                        className="sticky right-0 z-10 whitespace-nowrap px-4 py-2 align-top text-right"
                        style={{
                          background: "var(--color-surface-card)",
                          boxShadow: "-8px 0 12px -10px rgba(15,23,42,0.35)",
                        }}
                      >
                        {row.id && (
                          <span className="inline-flex items-center gap-1.5">
                            {reassignable && (
                              <>
                                <select value={recipient[row.id] ?? ""} onChange={(e) => { const employeeId = e.target.value; setRecipient((v) => ({ ...v, [row.id!]: employeeId })); if (employeeId) reassign(row.id!, employeeId); }} disabled={pending} className="max-w-36 rounded-chip border border-hairline bg-white px-2 py-1 text-[12px] text-ink-strong">
                                  <option value="">Reassign to…</option>
                                  {activePeople.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                                </select>
                              </>
                            )}
                            <button
                              type="button"
                              disabled={pending}
                              onClick={() => run("unarchive", row.id!)}
                              className="filter-chip text-[12px] disabled:opacity-50"
                              title="Put this record back on its module screen"
                            >
                              <ArchiveRestore size={13} strokeWidth={2.2} />
                              Unarchive
                            </button>
                            {!deletable ? null : armed === row.id ? (
                              <>
                                <button
                                  type="button"
                                  disabled={pending}
                                  onClick={() => run("delete", row.id!)}
                                  className="filter-chip text-[12px] disabled:opacity-50"
                                  style={{
                                    borderColor: "var(--color-altus-red)",
                                    background:
                                      "color-mix(in srgb, var(--color-altus-red) 10%, var(--color-surface-card))",
                                    color: "var(--color-altus-red-deep, #A80400)",
                                    fontWeight: 700,
                                  }}
                                >
                                  <Trash2 size={13} strokeWidth={2.2} />
                                  Delete for good?
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setArmed(null)}
                                  className="filter-chip text-[12px]"
                                >
                                  Cancel
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                disabled={pending}
                                onClick={() => setArmed(row.id!)}
                                className="filter-chip text-[12px] disabled:opacity-50"
                                title="Delete this record permanently"
                              >
                                <Trash2 size={13} strokeWidth={2.2} />
                                Delete
                              </button>
                            )}
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
