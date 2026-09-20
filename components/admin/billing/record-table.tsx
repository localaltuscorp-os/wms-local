"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Plus, Pencil, Loader2, Search } from "lucide-react";
import { fireToast } from "@/lib/toast";

/**
 * ADMIN › BILLING — one table, four masters.
 *
 * Customers, payment terms, SAC codes and the product master's billing columns
 * are the same screen with different fields: a searchable table, a create
 * button, and an inline editor that opens under the row. Describing them with a
 * field list rather than writing the screen four times is what keeps them
 * consistent — and means a new field is one line, in one place.
 *
 * Every save goes through the caller's server action, which re-authorises and
 * re-validates; nothing here is trusted.
 */

export type FieldType = "text" | "number" | "textarea" | "checkbox" | "select";

export interface FieldSpec {
  key: string;
  label: string;
  type?: FieldType;
  options?: { value: string; label: string }[];
  placeholder?: string;
  hint?: string;
  /** Render this field as a table column. */
  column?: boolean;
  /** Wider editor cell (spans two of the three columns). */
  wide?: boolean;
}

export type RecordValues = Record<string, string | boolean | null>;
export interface RecordRow extends RecordValues {
  id: string;
}

export type SaveResult = { ok: true } | { ok: false; error: string };

interface Props {
  fields: FieldSpec[];
  rows: RecordRow[];
  /** `id` is null when creating. */
  onSave: (id: string | null, values: RecordValues) => Promise<SaveResult>;
  /** The column the search box matches, plus the label in the empty state. */
  searchKey: string;
  noun: string;
  canEdit?: boolean;
}

export function BillingRecordTable({
  fields,
  rows,
  onSave,
  searchKey,
  noun,
  canEdit = true,
}: Props) {
  const router = useRouter();
  const [editing, setEditing] = React.useState<string | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [q, setQ] = React.useState("");

  const columns = fields.filter((f) => f.column);
  const filtered = q.trim()
    ? rows.filter((r) => String(r[searchKey] ?? "").toLowerCase().includes(q.trim().toLowerCase()))
    : rows;

  async function save(id: string | null, values: RecordValues): Promise<boolean> {
    const result = await onSave(id, values);
    if (!result.ok) {
      fireToast({ message: result.error, type: "error" });
      return false;
    }
    fireToast({ message: id ? `${noun} updated.` : `${noun} added.`, type: "success" });
    setEditing(null);
    setCreating(false);
    router.refresh();
    return true;
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search
            size={15}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-muted"
          />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={`Search ${noun.toLowerCase()}…`}
            aria-label={`Search ${noun}`}
            className="h-10 w-full rounded-chip border border-hairline bg-white pl-9 pr-3 text-[13px] outline-none focus:border-[color:var(--color-altus-red)]"
          />
        </div>
        {canEdit ? (
          <button
            type="button"
            onClick={() => {
              setCreating((v) => !v);
              setEditing(null);
            }}
            className="inline-flex h-10 items-center gap-2 rounded-chip px-4 text-[13px] font-bold text-white"
            style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}
          >
            <Plus size={15} /> Add {noun.toLowerCase()}
          </button>
        ) : null}
      </div>

      {creating ? (
        <Editor
          fields={fields}
          initial={{}}
          title={`New ${noun.toLowerCase()}`}
          onCancel={() => setCreating(false)}
          onSave={(values) => save(null, values)}
        />
      ) : null}

      <div
        className="overflow-x-auto rounded-[20px]"
        style={{
          background: "rgba(255,255,255,0.78)",
          boxShadow: "inset 0 0 0 1px var(--color-hairline)",
        }}
      >
        {filtered.length === 0 ? (
          <p className="px-5 py-10 text-center text-[13px] text-ink-muted">
            {rows.length === 0
              ? `No ${noun.toLowerCase()} yet.`
              : `No ${noun.toLowerCase()} matches “${q}”.`}
          </p>
        ) : (
          <table className="w-full min-w-[640px] border-collapse text-[13px]">
            <thead>
              <tr className="text-[10.5px] uppercase tracking-[0.12em] text-ink-muted">
                {columns.map((c) => (
                  <th key={c.key} className="px-4 py-3 text-left font-bold">
                    {c.label}
                  </th>
                ))}
                <th className="px-4 py-3 text-right font-bold">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((row) => (
                <React.Fragment key={row.id}>
                  <tr className="border-t border-hairline">
                    {columns.map((c) => (
                      <td key={c.key} className="px-4 py-3">
                        {renderCell(row[c.key], c)}
                      </td>
                    ))}
                    <td className="px-4 py-3 text-right">
                      {canEdit ? (
                        <button
                          type="button"
                          onClick={() => {
                            setEditing((cur) => (cur === row.id ? null : row.id));
                            setCreating(false);
                          }}
                          aria-label={`Edit ${String(row[searchKey] ?? "")}`}
                          className="inline-flex h-8 items-center gap-1.5 rounded-chip px-2.5 text-[12px] font-bold text-ink-muted"
                          style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
                        >
                          <Pencil size={13} /> Edit
                        </button>
                      ) : null}
                    </td>
                  </tr>
                  {editing === row.id ? (
                    <tr className="border-t border-hairline">
                      <td colSpan={columns.length + 1} className="p-3">
                        <Editor
                          fields={fields}
                          initial={row}
                          title={`Edit ${String(row[searchKey] ?? noun)}`}
                          onCancel={() => setEditing(null)}
                          onSave={(values) => save(row.id, values)}
                        />
                      </td>
                    </tr>
                  ) : null}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

function renderCell(value: string | boolean | null | undefined, field: FieldSpec) {
  if (field.type === "checkbox") {
    return (
      <span
        className="inline-flex rounded-pill px-2.5 py-[3px] text-[11px] font-bold"
        style={
          value
            ? { background: "#D1FAE5", color: "#022C22", boxShadow: "inset 0 0 0 1px #6EE7B7" }
            : { background: "#E2E8F0", color: "#0F172A", boxShadow: "inset 0 0 0 1px #CBD5E1" }
        }
      >
        {value ? "Yes" : "No"}
      </span>
    );
  }
  const text = value === null || value === undefined || value === "" ? "—" : String(value);
  return <span className={text === "—" ? "text-ink-muted" : ""}>{text}</span>;
}

function Editor({
  fields,
  initial,
  title,
  onSave,
  onCancel,
}: {
  fields: FieldSpec[];
  initial: Partial<RecordValues>;
  title: string;
  onSave: (values: RecordValues) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [values, setValues] = React.useState<RecordValues>(() => {
    const seed: RecordValues = {};
    for (const f of fields) {
      const v = initial[f.key];
      seed[f.key] = f.type === "checkbox" ? Boolean(v ?? true) : ((v as string | null) ?? "");
    }
    return seed;
  });
  const [busy, setBusy] = React.useState(false);

  return (
    <div
      className="rounded-[18px] p-4"
      style={{ background: "rgba(248,250,252,0.95)", boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
    >
      <h3 className="mb-3 text-[12px] font-bold uppercase tracking-[0.14em] text-ink-muted">{title}</h3>
      <div className="grid grid-cols-3 gap-3 max-lg:grid-cols-2 max-md:grid-cols-1">
        {fields.map((f) => (
          <label key={f.key} className={`block ${f.wide ? "col-span-2 max-md:col-span-1" : ""}`}>
            <span className="mb-1 block text-[11px] font-bold uppercase tracking-[0.12em] text-ink-muted">
              {f.label}
            </span>
            {f.type === "checkbox" ? (
              <span className="flex h-10 items-center gap-2">
                <input
                  type="checkbox"
                  checked={Boolean(values[f.key])}
                  onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.checked }))}
                  className="h-4 w-4 accent-[color:var(--color-altus-red)]"
                />
                <span className="text-[13px] text-ink-muted">{f.hint ?? "Enabled"}</span>
              </span>
            ) : f.type === "textarea" ? (
              <textarea
                className="min-h-[72px] w-full rounded-chip border border-hairline bg-white px-3 py-2 text-[13px] outline-none focus:border-[color:var(--color-altus-red)]"
                value={String(values[f.key] ?? "")}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
              />
            ) : f.type === "select" ? (
              <select
                className="h-10 w-full rounded-chip border border-hairline bg-white px-3 text-[13px] outline-none focus:border-[color:var(--color-altus-red)]"
                value={String(values[f.key] ?? "")}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              >
                <option value="">—</option>
                {(f.options ?? []).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : (
              <input
                className="h-10 w-full rounded-chip border border-hairline bg-white px-3 text-[13px] outline-none focus:border-[color:var(--color-altus-red)]"
                inputMode={f.type === "number" ? "decimal" : undefined}
                value={String(values[f.key] ?? "")}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
              />
            )}
            {f.hint && f.type !== "checkbox" ? (
              <span className="mt-1 block text-[11.5px] text-ink-muted">{f.hint}</span>
            ) : null}
          </label>
        ))}
      </div>
      <div className="mt-3 flex gap-2">
        <button
          type="button"
          onClick={async () => {
            setBusy(true);
            try {
              await onSave(values);
            } finally {
              setBusy(false);
            }
          }}
          disabled={busy}
          className="inline-flex h-10 items-center gap-2 rounded-chip px-4 text-[13px] font-bold text-white disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : null} Save
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="h-10 rounded-chip px-4 text-[13px] font-bold text-ink-muted"
          style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
