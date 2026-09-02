import Link from "next/link";
import type { Route } from "next";
import { Repeat, ArrowRight } from "lucide-react";
import { format } from "date-fns";
import type { RecurringTemplateRow } from "@/lib/queries/recurring-templates";

interface Props {
  rows: RecurringTemplateRow[];
}

/**
 * Phase 5.2 surface — admin oversight of recurring task templates.
 * For each rule-holder shows: title + subject, the RRULE summary,
 * doer/initiator, child count, and the next scheduled occurrence
 * (if any). Click-through to the template task itself.
 */
export function RecurringTemplatesList({ rows }: Props) {
  return (
    <section className="mt-10 max-w-5xl">
      <header className="mb-4">
        <h3 className="text-display-xs">Recurring task templates</h3>
        <p className="text-body text-ink-subtle mt-1">
          Templates whose schedule rule spawns child instances daily at 02:00 UTC.
          Disable a template by clearing its recurrence in the task editor.
        </p>
      </header>
      {rows.length === 0 ? (
        <div
          className="rounded-section border border-dashed border-hairline-strong bg-surface-card px-5 py-8 text-center text-[14px] text-ink-subtle"
        >
          No active recurring templates.
        </div>
      ) : (
        <div
          className="overflow-hidden rounded-section border border-hairline bg-surface-card"
          style={{ boxShadow: "0 1px 3px rgba(15, 23, 42, 0.04)" }}
        >
          <table className="w-full text-[14px]">
            <thead>
              <tr
                className="text-left text-[11.5px] uppercase tracking-[0.08em] text-ink-subtle font-bold border-b border-hairline"
                style={{ background: "var(--color-surface-soft)" }}
              >
                <th className="px-4 py-3">Template</th>
                <th className="px-4 py-3">Rule</th>
                <th className="px-4 py-3">Doer</th>
                <th className="px-4 py-3 text-right tabular-nums">Spawned</th>
                <th className="px-4 py-3">Next</th>
                <th className="px-4 py-3 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-hairline last:border-b-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <Repeat size={13} className="text-ink-subtle shrink-0" strokeWidth={2.4} />
                      <span className="font-semibold text-ink-strong truncate max-w-[280px]">
                        {r.title}
                      </span>
                    </div>
                    {r.subject && (
                      <div className="text-[12px] text-ink-subtle mt-0.5 ml-[21px]">
                        {r.subject}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-3 font-mono text-[12.5px] text-ink-soft">
                    {summariseRule(r.rule)}
                  </td>
                  <td className="px-4 py-3 text-ink-strong">{r.doerName ?? "—"}</td>
                  <td className="px-4 py-3 text-right tabular-nums text-ink-soft">
                    {r.childCount}
                  </td>
                  <td className="px-4 py-3 text-ink-subtle tabular-nums">
                    {r.nextChildDueAt ? format(r.nextChildDueAt, "d MMM, EEE") : "—"}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/tasks/${r.id}` as Route}
                      aria-label={`Open ${r.title}`}
                      className="inline-flex items-center text-ink-subtle hover:text-ink-strong"
                    >
                      <ArrowRight size={15} strokeWidth={2.2} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/**
 * Compact RRULE-lite summariser for the admin table. Mirrors the
 * picker's user-facing summary in `schedule-section.tsx` but in mono
 * font so the structure reads at a glance.
 */
function summariseRule(rule: string): string {
  const parts = rule
    .split(";")
    .map((s) => s.split("="))
    .filter((kv) => kv.length === 2 && kv[0] && kv[1]);
  const dict = new Map(parts.map(([k, v]) => [k!.toUpperCase(), v!]));
  const freq = (dict.get("FREQ") ?? "").toLowerCase();
  const byDay = dict.get("BYDAY");
  const byMonthDay = dict.get("BYMONTHDAY");
  const until = dict.get("UNTIL");
  let main = freq || "(unparsed)";
  if (byDay) main += ` · ${byDay}`;
  if (byMonthDay) main += ` · day ${byMonthDay}`;
  if (until) main += ` · until ${until}`;
  return main;
}
