"use client";

import * as React from "react";
import { ArrowRight, Download, FileSpreadsheet, Plus, Sparkles, Trash2 } from "lucide-react";
import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";
import {
  EMPTY_VENDOR,
  VENDOR_COLUMNS,
  parseAmc,
  vendorColumnForHeader,
  type VendorFields,
  type VendorTextKey,
} from "@/lib/operations/directory";

/**
 * Directory bulk-entry GRID — the Tasks bulk grid (components/tasks/
 * tasks-bulk-grid.tsx) ported to vendors. Type into the cells, paste straight
 * from Excel, or drop a CSV/XLSX; "Proceed" hands the filled rows to the review
 * step (vendor-bulk-entry.tsx).
 *
 * Header-aware: a pasted or uploaded sheet whose first row is a header ("First
 * Name", "Mobile", "PIN" …) is mapped by NAME, so its columns can be in any
 * order. A sheet without one is read in the template's column order.
 */

type Draft = VendorFields & { id: number };

const CELL =
  "w-full bg-transparent px-2 py-1.5 text-[13px] text-ink-strong outline-none focus:bg-[color-mix(in_oklab,var(--color-altus-red)_5%,transparent)]";

const MIN_W: Record<keyof VendorFields, number> = {
  category: 160,
  firstName: 140,
  lastName: 130,
  cellNo: 130,
  email: 200,
  addressLine1: 200,
  addressLine2: 180,
  addressLine3: 160,
  addressLine4: 160,
  landmark: 160,
  city: 120,
  state: 120,
  pincode: 100,
  website: 180,
  amc: 84,
  notes: 220,
};

const REQUIRED = new Set<keyof VendorFields>(["category", "firstName"]);

const TEMPLATE_EXAMPLE = [
  "Electrician",
  "Ramesh",
  "Yadav",
  "9800000000",
  "ramesh@example.com",
  "Shop 12, Station Road",
  "Thane West",
  "",
  "",
  "Opp. SBI Bank",
  "Thane",
  "Maharashtra",
  "400601",
  "www.example.com",
  "Yes",
  "Available 9am-7pm",
];

function isBlank(d: VendorFields): boolean {
  return VENDOR_COLUMNS.every((c) => (c.key === "amc" ? !d.amc : !d[c.key as VendorTextKey].trim()));
}

/** Download the upload template — one header row + one example, built in the browser. */
export async function downloadVendorTemplate() {
  const XLSX = await import("xlsx");
  const ws = XLSX.utils.aoa_to_sheet([VENDOR_COLUMNS.map((c) => c.label), TEMPLATE_EXAMPLE]);
  ws["!cols"] = VENDOR_COLUMNS.map((c) => ({ wch: Math.max(14, c.label.length + 4) }));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Vendors");
  XLSX.writeFile(wb, "vendor-directory-template.xlsx");
}

/**
 * Free text with an in-app suggestion list — the Tasks grid's SuggestInput. Not a
 * <datalist>: that popup is painted by the browser, cannot be styled (it goes
 * dark on a dark-mode OS inside a white dialog) and swallows pointer events.
 */
export function CategoryInput({
  value,
  onChange,
  options,
  placeholder,
  className,
  required,
}: {
  value: string;
  onChange: (v: string) => void;
  options: string[];
  placeholder: string;
  className?: string;
  required?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const inputRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLDivElement>(null);

  const q = value.trim().toLowerCase();
  const filtered = React.useMemo(
    () =>
      options.filter((o) => {
        const lo = o.toLowerCase();
        return lo !== q && (!q || lo.includes(q));
      }),
    [options, q],
  );

  React.useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const show = open && filtered.length > 0;

  function choose(v: string) {
    onChange(v);
    setOpen(false);
    inputRef.current?.focus();
  }

  return (
    <Popover open={show} onOpenChange={(o) => { if (!o) setOpen(false); }}>
      <PopoverAnchor asChild>
        <input
          ref={inputRef}
          value={value}
          required={required}
          onChange={(e) => {
            onChange(e.target.value);
            setActive(0);
            setOpen(true);
          }}
          onFocus={() => { setActive(0); setOpen(true); }}
          onKeyDown={(e) => {
            if (!show) {
              if (e.key === "ArrowDown") setOpen(true);
              return;
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, filtered.length - 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === "Enter" && filtered[active]) {
              e.preventDefault();
              choose(filtered[active]);
            } else if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
            }
          }}
          placeholder={placeholder}
          autoComplete="off"
          className={className}
        />
      </PopoverAnchor>
      <PopoverContent
        align="start"
        sideOffset={4}
        // Focus stays in the input while typing, and is not dragged back on
        // close (that re-fires onFocus and reopens the list).
        onOpenAutoFocus={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          if (inputRef.current?.contains(e.target as Node)) e.preventDefault();
        }}
        onFocusOutside={(e) => {
          if (inputRef.current?.contains(e.target as Node)) e.preventDefault();
        }}
        className="slim-scroll max-h-[min(240px,var(--radix-popover-content-available-height))] w-[var(--radix-popover-trigger-width)] min-w-[180px] max-w-[320px] overscroll-contain p-0"
      >
        <div ref={listRef} className="py-1">
          {filtered.map((o, idx) => (
            <button
              key={o}
              type="button"
              data-idx={idx}
              onMouseDown={(e) => { e.preventDefault(); choose(o); }}
              onMouseEnter={() => setActive(idx)}
              className={`flex w-full items-center px-3 py-1.5 text-left text-[13px] font-semibold text-ink-strong ${idx === active ? "bg-surface-soft" : ""}`}
            >
              {o}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

export function VendorBulkGrid({
  categories,
  onProceed,
}: {
  categories: string[];
  onProceed: (rows: VendorFields[]) => void;
}) {
  const seq = React.useRef(1);
  const blank = React.useCallback((): Draft => ({ ...EMPTY_VENDOR, id: seq.current++ }), []);
  const [rows, setRows] = React.useState<Draft[]>(() => Array.from({ length: 6 }, blank));
  const [dragging, setDragging] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [fileErr, setFileErr] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement>(null);

  function setCell(id: number, patch: Partial<VendorFields>) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  }
  function removeRow(id: number) {
    setRows((prev) => (prev.length > 1 ? prev.filter((r) => r.id !== id) : prev.map((r) => (r.id === id ? blank() : r))));
  }

  /** A cell matrix (paste or file) → drafts, by header name when row 1 is a header. */
  const draftsFromMatrix = React.useCallback(
    (matrix: string[][]): Draft[] => {
      const first = matrix[0] ?? [];
      const mapped = first.map((h) => vendorColumnForHeader(String(h ?? "")));
      const useHeader = mapped.filter(Boolean).length >= 2;
      const order: (keyof VendorFields | null)[] = useHeader ? mapped : VENDOR_COLUMNS.map((c) => c.key);
      const body = useHeader ? matrix.slice(1) : matrix;
      return body
        .filter((r) => r.some((c) => String(c ?? "").trim()))
        .map((r) => {
          const d = blank();
          order.forEach((key, i) => {
            if (!key) return;
            const raw = String(r[i] ?? "").trim();
            if (key === "amc") d.amc = parseAmc(raw) ?? false;
            else d[key] = raw;
          });
          return d;
        });
    },
    [blank],
  );

  const appendDrafts = React.useCallback((parsed: Draft[]) => {
    if (parsed.length === 0) return;
    setRows((prev) => [...prev.filter((r) => !isBlank(r)), ...parsed]);
  }, []);

  function onPaste(e: React.ClipboardEvent) {
    const text = e.clipboardData.getData("text/plain");
    if (!text || !/[\t\n]/.test(text)) return;
    e.preventDefault();
    appendDrafts(
      draftsFromMatrix(
        text
          .replace(/\r/g, "")
          .split("\n")
          .filter((l) => l.trim().length > 0)
          .map((line) => line.split("\t")),
      ),
    );
  }

  const ingestFile = React.useCallback(
    async (file: File) => {
      setFileErr(null);
      setBusy(true);
      try {
        const XLSX = await import("xlsx");
        const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: "array", cellDates: false });
        const sheet = wb.Sheets[wb.SheetNames[0] ?? ""];
        if (!sheet) throw new Error("That file has no sheets.");
        const matrix = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, blankrows: false, defval: "", raw: false });
        if (matrix.length === 0) throw new Error("That file is empty.");
        const parsed = draftsFromMatrix(matrix.map((r) => r.map((c) => (c ?? "").toString())));
        if (parsed.length === 0) throw new Error("No vendor rows found in that file.");
        appendDrafts(parsed);
      } catch (err) {
        setFileErr(err instanceof Error ? err.message : "Could not read that file.");
      } finally {
        setBusy(false);
      }
    },
    [draftsFromMatrix, appendDrafts],
  );

  function proceed() {
    onProceed(rows.filter((r) => !isBlank(r)).map(({ id: _id, ...v }) => v));
  }

  const filledCount = rows.filter((r) => !isBlank(r)).length;
  const toolBtn =
    "inline-flex items-center gap-1.5 rounded-lg border border-solid px-2.5 py-1 text-[12px] font-bold text-ink-soft transition-colors hover:border-altus-red hover:text-altus-red disabled:opacity-50";

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-2">
        <Sparkles size={15} className="text-altus-red" strokeWidth={2.4} />
        <span className="text-[13px] font-bold text-ink-strong">Fill your vendors below</span>
        <span className="text-[12px] font-semibold text-ink-subtle">- type, paste from Excel, or drop a file</span>
        <span className="ml-auto flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void downloadVendorTemplate()} className={toolBtn} style={{ borderColor: "var(--color-hairline-strong)" }}>
            <Download size={13} strokeWidth={2.4} /> Download template
          </button>
          <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className={toolBtn} style={{ borderColor: "var(--color-hairline-strong)" }}>
            <FileSpreadsheet size={13} strokeWidth={2.4} /> {busy ? "Reading…" : "Import CSV / Excel"}
          </button>
        </span>
        <input
          ref={fileRef}
          type="file"
          accept=".csv,.xlsx,.xls,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void ingestFile(f);
            e.target.value = "";
          }}
        />
      </div>

      {fileErr && <p className="mb-2 text-[12.5px] font-semibold text-altus-red">{fileErr}</p>}

      <div
        className="relative overflow-x-auto rounded-xl border transition-colors"
        style={{ borderColor: dragging ? "var(--color-altus-red)" : "var(--color-hairline-strong)", overscrollBehaviorY: "auto" }}
        onPaste={onPaste}
        onDragOver={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={(e) => {
          if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
          setDragging(false);
        }}
        onDrop={(e) => {
          if (!e.dataTransfer.types.includes("Files")) return;
          e.preventDefault();
          setDragging(false);
          const f = e.dataTransfer.files?.[0];
          if (f) void ingestFile(f);
        }}
      >
        {dragging && (
          <div
            className="pointer-events-none absolute inset-0 z-10 grid place-items-center rounded-xl text-[13px] font-bold text-altus-red"
            style={{ background: "color-mix(in srgb, var(--color-altus-red) 8%, var(--color-surface-card))" }}
          >
            Drop a CSV or Excel file to fill these rows
          </div>
        )}
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr style={{ background: "var(--color-surface-soft)" }}>
              <th className="w-10 border-b px-1 py-2 text-center text-[11px] font-bold uppercase tracking-wide text-ink-subtle" style={{ borderColor: "var(--color-hairline)" }}>
                #
              </th>
              {VENDOR_COLUMNS.map((c) => (
                <th
                  key={c.key}
                  className="whitespace-nowrap border-b border-l px-2 py-2 text-left text-[11px] font-bold uppercase tracking-wide text-ink-soft"
                  style={{ borderColor: "var(--color-hairline)", minWidth: MIN_W[c.key] }}
                >
                  {c.label}
                  {REQUIRED.has(c.key) ? <span className="text-altus-red"> *</span> : null}
                </th>
              ))}
              <th className="w-8 border-b border-l px-1 py-2" style={{ borderColor: "var(--color-hairline)" }} />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.id}>
                <td className="border-b px-1 text-center align-middle text-[12px] font-bold tabular-nums text-ink-subtle" style={{ borderColor: "var(--color-hairline)" }}>
                  {i + 1}
                </td>
                {VENDOR_COLUMNS.map((c) => (
                  <td key={c.key} className="border-b border-l align-middle" style={{ borderColor: "var(--color-hairline)", minWidth: MIN_W[c.key] }}>
                    {c.key === "amc" ? (
                      <div className="flex justify-center px-1">
                        <button
                          type="button"
                          onClick={() => setCell(r.id, { amc: !r.amc })}
                          aria-pressed={r.amc}
                          aria-label={`AMC row ${i + 1}`}
                          className="rounded-pill px-3 py-0.5 text-[11.5px] font-bold transition-colors"
                          style={
                            r.amc
                              ? { background: "var(--color-green-bg)", color: "var(--color-green-deep)" }
                              : { background: "var(--color-surface-soft)", color: "var(--color-ink-subtle)" }
                          }
                        >
                          {r.amc ? "Yes" : "No"}
                        </button>
                      </div>
                    ) : c.key === "category" ? (
                      <CategoryInput
                        value={r.category}
                        onChange={(v) => setCell(r.id, { category: v })}
                        options={categories}
                        placeholder="Category"
                        className={CELL}
                      />
                    ) : (
                      <input
                        value={r[c.key as VendorTextKey]}
                        onChange={(e) => setCell(r.id, { [c.key]: e.target.value } as Partial<VendorFields>)}
                        placeholder={c.label}
                        aria-label={`${c.label} row ${i + 1}`}
                        className={CELL}
                      />
                    )}
                  </td>
                ))}
                <td className="border-b border-l px-1 text-center align-middle" style={{ borderColor: "var(--color-hairline)" }}>
                  <button
                    type="button"
                    onClick={() => removeRow(r.id)}
                    aria-label={`Remove row ${i + 1}`}
                    className="grid size-6 place-items-center rounded-md text-ink-subtle hover:bg-altus-red hover:text-white"
                  >
                    <Trash2 size={12} strokeWidth={2.4} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setRows((prev) => [...prev, blank()])}
          className="inline-flex items-center gap-1.5 rounded-pill border border-hairline-strong px-3.5 py-1.5 text-[13px] font-semibold text-ink-soft hover:bg-surface-soft hover:text-ink-strong"
        >
          <Plus size={14} strokeWidth={2.6} /> Add row
        </button>
        <button
          type="button"
          onClick={proceed}
          disabled={filledCount === 0}
          className="inline-flex items-center gap-1.5 rounded-pill px-5 py-2 text-[13.5px] font-bold text-white transition-all hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:translate-y-0"
          style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
        >
          Review {filledCount || ""} <ArrowRight size={15} strokeWidth={2.6} />
        </button>
      </div>
    </div>
  );
}
