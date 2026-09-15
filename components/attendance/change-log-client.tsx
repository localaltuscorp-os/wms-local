"use client";

import * as React from "react";
import { useRouter, useSearchParams, usePathname } from "next/navigation";
import { ScrollText, ArrowRight, Laptop, Smartphone, Cpu, X } from "lucide-react";
import { formatDate } from "@/lib/format";
import { ATTENDANCE_AUDIT_ACTION_LABELS, type AttendanceAuditAction } from "@/db/enums";

interface Row {
  id: string;
  employeeId: string;
  employeeName: string;
  actorId: string;
  actorName: string;
  action: AttendanceAuditAction;
  field: string | null;
  attendanceDate: string;
  punchKind: "in" | "out" | null;
  oldValue: string | null;
  newValue: string | null;
  reason: string | null;
  deviceLabel: string | null;
  deviceKind: string | null;
  authorizationContext: {
    basis?: "self" | "privileged" | "system";
    onBehalfOfOther?: boolean;
    monthLockOverridden?: boolean;
    selfWindowOpen?: boolean;
    deviceExempt?: boolean;
    systemJob?: string;
  } | null;
  createdAt: string;
}

interface Person {
  id: string;
  name: string;
}

const ACTION_COLORS: Record<AttendanceAuditAction, { bg: string; fg: string }> = {
  create: { bg: "var(--color-green-bg, #e9f7ef)", fg: "var(--color-green-deep, #15803d)" },
  update: { bg: "var(--color-amber-bg, #fef3e2)", fg: "var(--color-amber-deep, #b45309)" },
  delete: { bg: "#FDE7E5", fg: "#A80400" },
  clear: { bg: "#f1f2f4", fg: "#6b7280" },
};

/**
 * The change-log table and its filters.
 *
 * FILTERING IS SERVER-SIDE, through the URL. The filters write query parameters
 * and the page re-renders from the database, rather than the component holding
 * the whole log in memory and filtering it in the browser. That is deliberate:
 * the table is capped at 500 rows, so a client-side filter would silently search
 * only the newest 500 changes and confidently report "no results" for a change
 * that is simply older than the cap — the exact question this screen exists to
 * answer. The filter state living in the URL also makes a filtered view
 * shareable, which is what happens when two people investigate one entry.
 */
export function ChangeLogClient({
  rows,
  subjects,
  actors,
}: {
  rows: Row[];
  subjects: Person[];
  actors: Person[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const set = React.useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(params.toString());
      if (value) next.set(key, value);
      else next.delete(key);
      router.replace(`${pathname}?${next.toString()}`);
    },
    [params, pathname, router],
  );

  const get = (k: string) => params.get(k) ?? "";
  const anyFilter = ["employee", "actor", "attFrom", "attTo", "chgFrom", "chgTo", "action"].some(
    (k) => !!params.get(k),
  );

  const field =
    "rounded-xl border border-hairline-strong bg-white px-3 py-2 text-[13px] font-medium text-ink-strong outline-none focus:border-altus-red";

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end gap-2.5 rounded-2xl border border-hairline-strong bg-white p-4">
        <Filter label="Employee">
          <select value={get("employee")} onChange={(e) => set("employee", e.target.value)} className={field}>
            <option value="">Anyone</option>
            {subjects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Filter>

        <Filter label="Changed by">
          <select value={get("actor")} onChange={(e) => set("actor", e.target.value)} className={field}>
            <option value="">Anyone</option>
            {actors.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Filter>

        <Filter label="Action">
          <select value={get("action")} onChange={(e) => set("action", e.target.value)} className={field}>
            <option value="">All</option>
            {(Object.keys(ATTENDANCE_AUDIT_ACTION_LABELS) as AttendanceAuditAction[]).map((a) => (
              <option key={a} value={a}>
                {ATTENDANCE_AUDIT_ACTION_LABELS[a]}
              </option>
            ))}
          </select>
        </Filter>

        {/* TWO date ranges, not one. "What changed about September" and "what
            did we change last Tuesday" are different investigations, and a
            single range cannot express either without ambiguity. */}
        <Filter label="Attendance date">
          <div className="flex items-center gap-1.5">
            <input type="date" value={get("attFrom")} onChange={(e) => set("attFrom", e.target.value)} className={field} />
            <span className="text-[12px] text-ink-subtle">to</span>
            <input type="date" value={get("attTo")} onChange={(e) => set("attTo", e.target.value)} className={field} />
          </div>
        </Filter>

        <Filter label="Change date">
          <div className="flex items-center gap-1.5">
            <input type="date" value={get("chgFrom")} onChange={(e) => set("chgFrom", e.target.value)} className={field} />
            <span className="text-[12px] text-ink-subtle">to</span>
            <input type="date" value={get("chgTo")} onChange={(e) => set("chgTo", e.target.value)} className={field} />
          </div>
        </Filter>

        {anyFilter && (
          <button
            type="button"
            onClick={() => router.replace(pathname)}
            className="inline-flex items-center gap-1.5 rounded-xl border border-hairline-strong px-3 py-2 text-[12.5px] font-bold text-ink-strong transition-colors hover:border-altus-red"
          >
            <X size={13} /> Clear
          </button>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="grid place-items-center rounded-2xl border border-hairline-strong bg-white px-6 py-16 text-center">
          <ScrollText size={26} className="text-ink-soft" />
          <p className="mt-3 text-[14px] font-bold text-ink-strong">No changes recorded</p>
          <p className="mt-1 max-w-[46ch] text-[13px] text-ink-muted">
            {anyFilter
              ? "Nothing matches these filters. Try widening the date range."
              : "Nothing has been changed by an attendance manager or by the nightly forgotten-logout job yet. Ordinary self-corrections inside the 15-minute window are not recorded here."}
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-hairline-strong bg-white">
          <table className="w-full min-w-[900px] border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-hairline text-left text-[11px] font-bold uppercase tracking-[0.12em] text-ink-muted">
                <Th>Employee</Th>
                <Th>Attendance date</Th>
                <Th>What changed</Th>
                <Th>Old → New</Th>
                <Th>Changed by</Th>
                <Th>Device</Th>
                <Th>Changed at</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-hairline last:border-0 align-top">
                  <Td>
                    <span className="font-bold text-ink-strong">{r.employeeName}</span>
                  </Td>
                  <Td>{formatDate(r.attendanceDate)}</Td>
                  <Td>
                    <span
                      className="inline-flex items-center rounded-pill px-2 py-0.5 text-[11px] font-bold"
                      style={{ background: ACTION_COLORS[r.action].bg, color: ACTION_COLORS[r.action].fg }}
                    >
                      {ATTENDANCE_AUDIT_ACTION_LABELS[r.action]}
                    </span>{" "}
                    <span className="text-ink-muted">
                      {r.punchKind === "in" ? "check-in" : r.punchKind === "out" ? "check-out" : "punch"}
                    </span>
                    {/* The overrides, stated plainly. A change made past a lock
                        is the kind this log exists for, and burying that in a
                        JSON blob nobody opens defeats the purpose. */}
                    {r.authorizationContext?.basis === "system" && (
                      <div className="mt-1 text-[11.5px] font-bold text-ink-muted">
                        Automatic — no clock-out by 11:59 PM
                      </div>
                    )}
                    {r.authorizationContext?.monthLockOverridden && (
                      <div className="mt-1 text-[11.5px] font-bold text-[#A80400]">Past monthly lock</div>
                    )}
                    {r.authorizationContext?.onBehalfOfOther === false &&
                      r.authorizationContext?.selfWindowOpen === false && (
                        <div className="mt-1 text-[11.5px] font-bold text-[#b45309]">
                          Own punch, past 15-minute window
                        </div>
                      )}
                  </Td>
                  <Td>
                    <span className="inline-flex items-center gap-1.5 tabular-nums">
                      <span className="text-ink-muted line-through">{r.oldValue ?? "—"}</span>
                      <ArrowRight size={12} className="text-ink-subtle" />
                      <span className="font-bold text-ink-strong">{r.newValue ?? "—"}</span>
                    </span>
                    {r.reason && <div className="mt-0.5 text-[12px] text-ink-subtle">{r.reason}</div>}
                  </Td>
                  <Td>
                    {/* A SYSTEM entry names the job, not a person. The audit
                        table's actor_id is NOT NULL and holds the employee, so
                        printing it here would read as "Om changed Om's
                        attendance" for a change Om did not make. */}
                    {r.authorizationContext?.basis === "system" ? (
                      <span className="inline-flex items-center gap-1.5 font-bold text-ink-muted">
                        <Cpu size={13} /> System
                      </span>
                    ) : (
                      r.actorName
                    )}
                  </Td>
                  <Td>
                    <span className="inline-flex items-center gap-1.5 text-ink-muted">
                      {r.deviceKind === "phone" ? <Smartphone size={13} /> : <Laptop size={13} />}
                      {r.authorizationContext?.basis === "system"
                        ? "Scheduled job"
                        : (r.deviceLabel ??
                          (r.authorizationContext?.deviceExempt ? "Exempt (any device)" : "—"))}
                    </span>
                  </Td>
                  <Td>
                    <span className="whitespace-nowrap text-ink-muted">
                      {new Date(r.createdAt).toLocaleString("en-GB", {
                        day: "2-digit",
                        month: "short",
                        year: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                        hour12: false,
                      })}
                    </span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rows.length >= 500 && (
        <p className="text-[12px] text-ink-subtle">
          Showing the most recent 500 changes. Narrow the date range to see older entries.
        </p>
      )}
    </div>
  );
}

function Filter({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="grid gap-1.5">
      <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-muted">{label}</span>
      {children}
    </label>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="px-4 py-3 font-bold">{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="px-4 py-3">{children}</td>;
}
