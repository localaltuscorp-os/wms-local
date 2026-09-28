"use client";

import { X } from "lucide-react";
import type { LogRow } from "@/lib/queries/logs";
import { LOG_EVENT_LABELS, type LogEventType } from "@/lib/logs/events";

function fmtDT(iso: Date): string {
  const ist = new Date(iso.getTime() + 5.5 * 60 * 60 * 1000);
  const date = ist.toISOString().slice(0, 10);
  const time = ist.toISOString().slice(11, 19);
  return `${date} · ${time} IST`;
}

/** A single field's before/after change, from the `changes` array. */
interface FieldChange {
  field?: string;
  before?: unknown;
  after?: unknown;
}

function asChanges(v: unknown): FieldChange[] {
  if (Array.isArray(v)) return v as FieldChange[];
  if (v && typeof v === "object") {
    const out: FieldChange[] = [];
    for (const [field, pair] of Object.entries(v as Record<string, unknown>)) {
      if (pair && typeof pair === "object") {
        const p = pair as { before?: unknown; after?: unknown };
        out.push({ field, before: p.before, after: p.after });
      }
    }
    return out;
  }
  return [];
}

function val(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

/**
 * The full record, opened from a table row. Read-only by construction — there is
 * nothing to edit. Renders before/after field changes one per line when present.
 */
export function LogDetailPanel({ log, onClose }: { log: LogRow; onClose: () => void }) {
  const changes = asChanges(log.changes);
  const label = LOG_EVENT_LABELS[log.eventType as LogEventType] ?? log.eventType;

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true">
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="absolute inset-0 bg-black/20"
      />
      <aside className="relative flex h-full w-full max-w-lg flex-col overflow-y-auto border-l border-hairline-strong bg-surface-card p-5">
        <div className="mb-4 flex items-start justify-between gap-3 border-b border-hairline pb-3">
          <div>
            <p className="text-[10.5px] font-black uppercase tracking-[0.14em] text-ink-subtle">
              Log detail
            </p>
            <h2 className="mt-1 text-lg font-black text-ink-strong">{label}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-ink-muted hover:bg-surface-soft"
            aria-label="Close panel"
          >
            <X size={18} />
          </button>
        </div>

        <dl className="space-y-0 divide-y divide-hairline">
          <Field k="Person" v={log.employeeName ?? "—"} />
          <Field k="Employee ID" v={log.employeeCode ?? "—"} />
          <Field k="Function" v={log.functionName ?? "—"} />
          <Field k="Designation" v={log.designationName ?? "—"} />
          <Field k="Entity" v={log.entityName ?? "—"} />
          <Field k="Date / Time" v={fmtDT(log.eventAt)} />
          <Field k="Event Type" v={label} />
          <Field k="Module" v={log.module ?? "—"} />
          <Field k="Page" v={log.page ?? "—"} />
          <Field k="Route" v={log.route ?? "—"} />
          <Field k="Action" v={log.action ?? "—"} />
          <Field k="Resource Type" v={log.resourceType ?? "—"} />
          <Field k="Resource ID" v={log.resourceId ?? "—"} />
          <Field k="Resource Name" v={log.resourceName ?? "—"} />
          <Field k="Status" v={log.status ?? "—"} />
          <Field k="Reason" v={log.reason ?? "—"} />
          <Field k="Request ID" v={log.requestId ?? "—"} />
          <Field k="Operation ID" v={log.operationId ?? "—"} />
          <Field k="Actor Type" v={log.actorType ?? "—"} />
        </dl>

        {changes.length > 0 && (
          <div className="mt-5">
            <p className="mb-2 text-[11px] font-black uppercase tracking-[0.12em] text-ink-muted">
              Changes
            </p>
            <div className="space-y-2">
              {changes.map((c, i) => (
                <div
                  key={i}
                  className="rounded-lg border border-hairline px-3 py-2"
                  style={{ background: "var(--color-surface-soft)" }}
                >
                  <p className="text-[12px] font-bold text-ink-strong">{c.field ?? "field"}</p>
                  <div className="mt-1 grid grid-cols-2 gap-2 text-[12px]">
                    <div>
                      <p className="text-[10px] uppercase text-ink-muted">Before</p>
                      <p className="text-ink-soft">{val(c.before)}</p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase text-ink-muted">After</p>
                      <p className="font-semibold text-ink-strong">{val(c.after)}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <p className="mt-6 text-[11px] italic text-ink-subtle">
          Logs are immutable. This record cannot be edited or deleted from the WMS.
        </p>
      </aside>
    </div>
  );
}

function Field({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <dt className="shrink-0 text-[12px] text-ink-subtle">{k}</dt>
      <dd className="break-all text-right text-[12.5px] font-semibold text-ink-strong">{v}</dd>
    </div>
  );
}
