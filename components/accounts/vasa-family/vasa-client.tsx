"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Plus, X, Download, Trash2, Loader2, Check, ChevronLeft, ChevronRight,
  CloudCheck, Mail, Share2, FilePlus2,
} from "lucide-react";
import type { LookupOption } from "@/components/ui/lookup-select";
import { PageCommandBar } from "@/components/layout/page-command-bar";
import { fireToast } from "@/lib/toast";
import { addAccountsLookup, softDeleteAccountsLookup } from "@/lib/accounts/lookups";
import type { VasaCell } from "@/lib/queries/accounts-vasa";
import { formatFullInr, formatPreciseInr, inrTooltip } from "@/lib/accounts/inr-format";
import { vasaCellState, vasaExpected, vasaDelta } from "@/lib/accounts/vasa-match";
import {
  saveVasaCell, addVasaSnapshot, deleteVasaSnapshot, emailVasaSnapshot,
} from "@/app/(app)/accounts/vasa-family-interpersonal/actions";
import { VasaSnapshotList } from "./vasa-snapshot-list";

const key = (asOn: string, row: string, col: string) => `${asOn}|${row}|${col}`;

/* ── Chart dates ─────────────────────────────────────────────────────────────
 * STORED as the sheet always stored them, `dd/mm/yyyy`, because every existing
 * row and the server's own date sort (listVasaSnapshots) already parse that
 * shape — restamping the column would orphan the history.
 * DISPLAYED as `19-Aug-26`, which cannot be misread the way 08/09/2026 can.
 * Only the label changes; nothing is written in the new format.             */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** `dd/mm/yyyy` → `19-Aug-2026`. Unparseable input is shown verbatim. */
function chartLabel(stored: string): string {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(stored.trim());
  if (!m) return stored;
  const [, d, mo, y] = m;
  const mi = Number(mo) - 1;
  if (mi < 0 || mi > 11) return stored;
  const year = y!.length === 2 ? `20${y}` : y!;
  return `${String(d).padStart(2, "0")}-${MONTHS[mi]}-${year}`;
}

/** `19-Aug-26` — the scroller's compact form, so four fit without wrapping. */
function chartChip(stored: string): string {
  const full = chartLabel(stored);
  return full.replace(/-(\d{2})(\d{2})$/, "-$2");
}

function ymdToStored(ymd: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return "";
  const [, y, mo, d] = m;
  return `${d}/${mo}/${y}`;
}

/** Today as `yyyy-mm-dd` in local time — the date a new chart is stamped with. */
function todayYmd(): string {
  const n = new Date();
  const mo = String(n.getMonth() + 1).padStart(2, "0");
  const d = String(n.getDate()).padStart(2, "0");
  return `${n.getFullYear()}-${mo}-${d}`;
}

const MONTH_FULL = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function chartName(stored: string): string {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(stored.trim());
  if (!m) return "Interpersonal Balance";
  const mi = Number(m[2]) - 1;
  if (mi < 0 || mi > 11) return "Interpersonal Balance";
  return `${MONTH_FULL[mi]} Interpersonal Balance`;
}

/**
 * CALENDAR quarter — Jan-Mar = Q1 … Oct-Dec = Q4. Deliberately NOT the Apr-Mar
 * financial year the salary module uses. Mirrors `quarterOf` in
 * lib/accounts/vasa-report so screen and report never label a chart differently.
 */
function quarterOfStored(stored: string): { q: number; year: number } | null {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/.exec(stored.trim());
  if (!m) return null;
  const mo = Number(m[2]);
  if (mo < 1 || mo > 12) return null;
  const y = m[3]!.length === 2 ? Number(`20${m[3]}`) : Number(m[3]);
  return { q: Math.floor((mo - 1) / 3) + 1, year: y };
}

interface Quarter { q: number; year: number }
const qKey = (x: Quarter) => `Q${x.q} ${x.year}`;
/** `Q2-26` — the scroller chip, matching the brief's own shorthand. */
const qChip = (x: Quarter) => `Q${x.q}-${String(x.year).slice(-2)}`;
const qIndex = (x: Quarter) => x.year * 4 + (x.q - 1);
const qSame = (a: Quarter, b: Quarter) => a.q === b.q && a.year === b.year;

function currentQuarter(): Quarter {
  const n = new Date();
  return { q: Math.floor(n.getMonth() / 3) + 1, year: n.getFullYear() };
}

function stepQuarter(cur: Quarter, by: number): Quarter {
  const idx = qIndex(cur) + by;
  return { q: (idx % 4) + 1, year: Math.floor(idx / 4) };
}

/** How many items each scroller shows at once. Both are "current + previous 3". */
const WINDOW = 4;

/**
 * Vasa Family Interpersonal — the who-owes-whom matrix, one CHART (as-on date)
 * at a time. Parties are both the rows and the columns; a cell is the balance
 * between them and its mirror auto-negates.
 *
 * Navigation is two permanent scrollers rather than a dropdown (Sir): a quarter
 * strip picks the period, a chart strip picks the date inside it. A dropdown
 * hid how many charts existed and how recent they were behind a click; the
 * strips put the four that matter on the page and keep the rest in List view.
 */
export function VasaBalances({
  cells, snapshots, partyOptions,
}: {
  cells: VasaCell[]; snapshots: string[]; partyOptions: LookupOption[];
}) {
  const router = useRouter();
  const [asOn, setAsOn] = React.useState(snapshots[0] ?? "");
  const [busy, setBusy] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [newParty, setNewParty] = React.useState("");
  const [, startTransition] = React.useTransition();

  const [tab, setTab] = React.useState<"sheet" | "list">("sheet");
  const [saveState, setSaveState] = React.useState<"idle" | "saving" | "saved">("idle");
  const [savedAt, setSavedAt] = React.useState<Date | null>(null);
  const [mailing, setMailing] = React.useState(false);
  const [sharing, setSharing] = React.useState(false);

  // ── Quarter strip ──────────────────────────────────────────────────────
  // `qEnd` is the NEWEST quarter in the visible strip; the strip runs back three
  // from it. It never advances past the running quarter — there is nothing to
  // see in the future, and letting it drift there is how a user ends up staring
  // at four empty periods wondering where their charts went.
  const today = React.useMemo(() => currentQuarter(), []);
  const [qEnd, setQEnd] = React.useState<Quarter>(today);
  const [quarter, setQuarter] = React.useState<Quarter>(today);

  const quarterStrip = React.useMemo(
    () => Array.from({ length: WINDOW }, (_, i) => stepQuarter(qEnd, -i)),
    [qEnd],
  );

  /** Charts in the selected quarter, newest first (the server already sorts). */
  const quarterCharts = React.useMemo(
    () =>
      snapshots.filter((s) => {
        const q = quarterOfStored(s);
        return q && qSame(q, quarter);
      }),
    [snapshots, quarter],
  );

  // ── Chart strip ────────────────────────────────────────────────────────
  // A 4-wide window over the quarter's charts, newest first. `chartFrom` is the
  // index of the leftmost visible chip; 0 means "the four latest", which is
  // where it resets whenever the quarter or the underlying list changes.
  const [chartFrom, setChartFrom] = React.useState(0);
  React.useEffect(() => { setChartFrom(0); }, [quarter, snapshots.length]);
  const chartStrip = quarterCharts.slice(chartFrom, chartFrom + WINDOW);

  // Keep the open chart inside the visible quarter. Scrolling to a quarter and
  // still seeing another quarter's grid is the bug this prevents.
  React.useEffect(() => {
    if (quarterCharts.length === 0) {
      if (asOn) setAsOn("");
      return;
    }
    if (!quarterCharts.includes(asOn)) setAsOn(quarterCharts[0]!);
  }, [quarterCharts, asOn]);

  // Cell values keyed by asOn|row|col, seeded from props + local optimistic edits.
  const [edits, setEdits] = React.useState<Record<string, string>>({});
  React.useEffect(() => { setEdits({}); }, [cells]);
  const baseMap = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const c of cells) if (c.asOn) m.set(key(c.asOn, c.party, c.counterparty), Number(c.amount));
    return m;
  }, [cells]);

  const parties = React.useMemo(() => partyOptions.map((o) => o.name), [partyOptions]);
  const partyOptByName = React.useMemo(() => new Map(partyOptions.map((o) => [o.name, o])), [partyOptions]);

  function cellValue(row: string, col: string): string {
    const k = key(asOn, row, col);
    if (k in edits) return edits[k]!;
    const v = baseMap.get(k);
    return v === undefined ? "" : String(v);
  }

  /**
   * AUTO-SAVE one cell. Every committed cell writes through immediately — there
   * is no Save action on this screen and never was one; what was missing was any
   * sign that a write had happened, which the status line beside the toolbar now
   * gives. Scoped to `asOn` at the moment of the edit, so a write can never
   * reach a different chart even if the user scrolls away mid-request.
   *
   * It writes ONLY the cell it was given. The opposite direction is a separate
   * hand-entered figure, and the two are compared rather than copied — see
   * lib/accounts/vasa-match.ts.
   */
  function saveCell(row: string, col: string, rawInput: string) {
    const trimmed = rawInput.replace(/[,\s₹]/g, "").trim();
    const num = trimmed === "" || trimmed === "-" ? 0 : Number(trimmed);
    if (!Number.isFinite(num)) { fireToast({ message: "Enter a number.", type: "error" }); return; }
    const target = asOn;
    // ONE cell. This used to set the opposite cell to -num as well, matching
    // what the server then wrote; both halves are now typed by hand, so
    // touching the mirror here would overwrite a value somebody entered.
    setEdits((p) => ({
      ...p,
      [key(target, row, col)]: num === 0 ? "" : String(num),
    }));
    setBusy(true);
    setSaveState("saving");
    startTransition(async () => {
      const res = await saveVasaCell({ asOn: target, rowParty: row, colParty: col, amount: num });
      setBusy(false);
      if (!res.ok) {
        setSaveState("idle");
        fireToast({ message: res.error, type: "error" });
      } else {
        setSaveState("saved");
        setSavedAt(new Date());
      }
      router.refresh();
    });
  }

  /** EMAIL — send THIS chart as a PDF to the standing recipient. */
  function emailChart() {
    if (!asOn) { fireToast({ message: "Open a chart first.", type: "error" }); return; }
    setMailing(true);
    startTransition(async () => {
      const res = await emailVasaSnapshot({ asOn });
      setMailing(false);
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      fireToast({ message: `${chartLabel(asOn)} emailed as PDF to ${res.sentTo}.`, type: "success" });
    });
  }

  /**
   * WHATSAPP — hand the .xlsx to the OS share sheet.
   *
   * `navigator.share` with a file opens the native sheet, where WhatsApp is one
   * of the targets — the same flow a photo app uses. Deliberately NOT an
   * in-app contact picker: this screen has no business holding a contact list,
   * and WhatsApp's own picker is the one the user already trusts.
   *
   * Where the browser cannot share files (most desktop Firefox, older Safari)
   * it falls back to downloading the sheet and opening WhatsApp with a message,
   * so the user still ends up in the same place with the file in hand.
   */
  function shareWhatsApp() {
    if (!asOn) { fireToast({ message: "Open a chart first.", type: "error" }); return; }
    const url = `/accounts/vasa-family-interpersonal/export?asOn=${encodeURIComponent(asOn)}&format=xlsx`;
    const name = `Vasa-Interpersonal-${chartLabel(asOn).replace(/[^A-Za-z0-9-]/g, "")}.xlsx`;
    const text = `Vasa Family Interpersonal Balance - ${chartLabel(asOn)}`;
    setSharing(true);
    void (async () => {
      try {
        const res = await fetch(url);
        if (!res.ok) throw new Error("Could not build the Excel file.");
        const blob = await res.blob();
        const file = new File([blob], name, { type: blob.type });
        const nav = navigator as Navigator & { canShare?: (d: unknown) => boolean };
        if (typeof nav.share === "function" && nav.canShare?.({ files: [file] })) {
          await nav.share({ files: [file], title: text, text });
          return;
        }
        // Fallback: save the file, then open WhatsApp with the message.
        const href = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = href; a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(href);
        window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
        fireToast({ message: "Excel downloaded - attach it in WhatsApp.", type: "info" });
      } catch (err) {
        // An abort is the user closing the share sheet; that is not an error.
        if (err instanceof Error && err.name === "AbortError") return;
        fireToast({ message: err instanceof Error ? err.message : "Could not share.", type: "error" });
      } finally {
        setSharing(false);
      }
    })();
  }

  function addParty() {
    const name = newParty.trim();
    if (!name) { setAdding(false); return; }
    setBusy(true);
    startTransition(async () => {
      const res = await addAccountsLookup("vasa_party", name);
      setBusy(false); setNewParty(""); setAdding(false);
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      fireToast({ message: `Added ${name}.`, type: "success" });
      router.refresh();
    });
  }

  function removeParty(opt: LookupOption) {
    if (!window.confirm(`Remove ${opt.name} from the party roster?`)) return;
    setBusy(true);
    startTransition(async () => {
      const res = await softDeleteAccountsLookup(opt.id);
      setBusy(false);
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      fireToast({ message: `Removed ${opt.name}.`, type: "info" });
      router.refresh();
    });
  }

  /**
   * NEW CHART — blank, stamped with TODAY, opened immediately.
   *
   * Nothing is copied from the chart on screen: a new chart is a fresh
   * reckoning, and pre-filling it with last month's figures makes stale numbers
   * look like this month's entered ones.
   *
   * NO DUPLICATES. If today's chart already exists the call is turned into a
   * "go there" instead — otherwise pressing C twice, or clicking while the
   * first request is still in flight, would either error or create a second
   * chart for the same date.
   */
  const creatingRef = React.useRef(false);
  const createChart = React.useCallback(() => {
    if (creatingRef.current) return;
    const stored = ymdToStored(todayYmd());
    if (!stored) return;

    const existing = snapshots.includes(stored);
    if (existing) {
      const q = quarterOfStored(stored);
      if (q) { setQuarter(q); setQEnd((e) => (qIndex(q) > qIndex(e) ? q : e)); }
      setAsOn(stored);
      setTab("sheet");
      fireToast({ message: `${chartLabel(stored)} already exists - opened it.`, type: "info" });
      return;
    }

    creatingRef.current = true;
    setBusy(true);
    startTransition(async () => {
      const res = await addVasaSnapshot({ newAsOn: stored });
      setBusy(false);
      creatingRef.current = false;
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      // Move the strips to wherever the new chart lives before opening it, so
      // the blank grid and its highlighted chip appear together.
      const q = quarterOfStored(stored);
      if (q) { setQuarter(q); setQEnd((e) => (qIndex(q) > qIndex(e) ? q : e)); }
      setChartFrom(0);
      setAsOn(stored);
      setTab("sheet");
      setSaveState("saved");
      setSavedAt(new Date());
      fireToast({ message: `Chart ${chartLabel(stored)} created - empty and ready.`, type: "success" });
      router.refresh();
    });
  }, [snapshots, router]);

  /**
   * "C" creates a chart — but only on this screen and only when the user is not
   * typing. The listener is mounted by THIS component, so it cannot leak to
   * another page; the target check is what stops a "c" typed into a party name,
   * a matrix cell or the browser's own find bar from silently creating a chart.
   */
  React.useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== "c" && e.key !== "C") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return; // Ctrl+C is a copy
      const el = e.target as HTMLElement | null;
      if (el) {
        const tag = el.tagName;
        if (
          tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" ||
          el.isContentEditable ||
          el.closest('[contenteditable="true"],[role="textbox"],[role="combobox"],[role="searchbox"]')
        ) return;
      }
      e.preventDefault();
      createChart();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [createChart]);

  function rowTotal(row: string): number {
    let t = 0;
    for (const col of parties) { if (col === row) continue; const v = cellValue(row, col); if (v) t += Number(v); }
    return t;
  }

  const stripBtn =
    "inline-flex size-8 items-center justify-center rounded-lg text-ink-soft transition-colors hover:bg-surface-soft hover:text-altus-red disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-ink-soft";

  return (
    <>
      <PageCommandBar
        title="Vasa Family Interpersonal Balance"
        hint="Who owes what between family entities, with the net position per party."
        actions={
          /* The ONE New Chart button on this screen, in the header bar's own
             action slot. There is deliberately no second copy in the toolbar —
             two buttons doing the same thing is how you get two charts. */
          <button
            type="button"
            onClick={createChart}
            disabled={busy}
            title="New chart, dated today (shortcut: C)"
            className="inline-flex items-center gap-2 rounded-xl px-4 py-2 text-[13.5px] font-bold text-white shadow-sm transition-opacity hover:opacity-90 disabled:opacity-50"
            style={{ background: "var(--color-altus-red)" }}
          >
            <FilePlus2 size={15} strokeWidth={2.6} /> New Chart
            <kbd
              aria-hidden
              className="ml-0.5 rounded px-1.5 py-0.5 text-[10.5px] font-bold"
              style={{ background: "rgba(255,255,255,0.22)" }}
            >
              C
            </kbd>
          </button>
        }
      />

      <section className="flex flex-col gap-4">
        {/* ── Scrollers ─────────────────────────────────────────────────── */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-3">
            {/* QUARTER STRIP — running quarter + the previous three. */}
            <div className="inline-flex items-center gap-1 rounded-xl border border-hairline-strong bg-white p-1">
              <button
                type="button"
                onClick={() => setQEnd((e) => stepQuarter(e, -1))}
                aria-label="Older quarters"
                className={stripBtn}
              >
                <ChevronLeft size={17} strokeWidth={2.6} />
              </button>
              {quarterStrip.map((x) => {
                const on = qSame(x, quarter);
                return (
                  <button
                    key={qKey(x)}
                    type="button"
                    onClick={() => setQuarter(x)}
                    aria-pressed={on}
                    title={qKey(x)}
                    className="rounded-lg px-3 py-1.5 text-[13px] font-bold tabular-nums transition-colors"
                    style={
                      on
                        ? { background: "var(--color-altus-red)", color: "#fff" }
                        : { color: "var(--color-ink-soft)" }
                    }
                  >
                    {qChip(x)}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setQEnd((e) => (qIndex(e) >= qIndex(today) ? e : stepQuarter(e, 1)))}
                disabled={qIndex(qEnd) >= qIndex(today)}
                aria-label="Newer quarters"
                title={qIndex(qEnd) >= qIndex(today) ? "Already at the running quarter" : "Newer quarters"}
                className={stripBtn}
              >
                <ChevronRight size={17} strokeWidth={2.6} />
              </button>
            </div>

            {/* CHART STRIP — the four most recent charts in this quarter. */}
            <div className="inline-flex items-center gap-1 rounded-xl border border-hairline-strong bg-white p-1">
              <button
                type="button"
                onClick={() => setChartFrom((f) => Math.min(f + 1, Math.max(0, quarterCharts.length - WINDOW)))}
                disabled={chartFrom >= quarterCharts.length - WINDOW}
                aria-label="Older charts"
                className={stripBtn}
              >
                <ChevronLeft size={17} strokeWidth={2.6} />
              </button>
              {chartStrip.length === 0 ? (
                <span className="px-3 py-1.5 text-[12.5px] font-semibold text-ink-subtle">
                  No charts in {qKey(quarter)}
                </span>
              ) : (
                chartStrip.map((s) => {
                  const on = s === asOn;
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setAsOn(s)}
                      aria-pressed={on}
                      title={`Open ${chartLabel(s)}`}
                      className="rounded-lg px-3 py-1.5 text-[13px] font-bold tabular-nums transition-colors"
                      style={
                        on
                          ? { background: "var(--color-altus-red)", color: "#fff" }
                          : { color: "var(--color-ink-soft)" }
                      }
                    >
                      {chartChip(s)}
                    </button>
                  );
                })
              )}
              <button
                type="button"
                onClick={() => setChartFrom((f) => Math.max(0, f - 1))}
                disabled={chartFrom === 0}
                aria-label="Newer charts"
                className={stripBtn}
              >
                <ChevronRight size={17} strokeWidth={2.6} />
              </button>
            </div>
          </div>

          <div className="inline-flex items-center rounded-xl border border-hairline-strong bg-white p-1">
            {(["sheet", "list"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                aria-pressed={tab === t}
                className="rounded-lg px-4 py-1.5 text-[13px] font-bold capitalize transition-colors"
                style={
                  tab === t
                    ? { background: "var(--color-altus-red)", color: "#fff" }
                    : { color: "var(--color-ink-soft)" }
                }
              >
                {t}
              </button>
            ))}
          </div>
        </div>

        {tab === "sheet" ? (
          <>
            {/* Toolbar — no chart picker here any more; the strips above are it. */}
            <div className="flex flex-wrap items-center gap-2">
              <span
                aria-live="polite"
                className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold tabular-nums text-ink-subtle"
              >
                {saveState === "saving" ? (
                  <><Loader2 size={13} className="animate-spin" aria-hidden /> Saving…</>
                ) : saveState === "saved" ? (
                  <>
                    <CloudCheck size={13} strokeWidth={2.4} aria-hidden style={{ color: "var(--color-green-deep)" }} />
                    {savedAt
                      ? `Saved ${savedAt.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" })}`
                      : "Saved"}
                  </>
                ) : (
                  "Auto-saves as you type"
                )}
              </span>

              <div className="ml-auto flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={emailChart}
                  disabled={mailing || !asOn}
                  title="Email this chart as a PDF"
                  className="inline-flex items-center gap-2 rounded-xl border border-hairline-strong bg-white py-2 px-3.5 text-[13.5px] font-bold text-ink-strong transition-colors hover:border-[color:var(--color-altus-red)] hover:text-altus-red disabled:opacity-50"
                >
                  {mailing ? <Loader2 size={15} className="animate-spin" /> : <Mail size={15} strokeWidth={2.4} />}
                  Email
                </button>

                <button
                  type="button"
                  onClick={shareWhatsApp}
                  disabled={sharing || !asOn}
                  title="Share this chart's Excel file on WhatsApp"
                  className="inline-flex items-center gap-2 rounded-xl border border-hairline-strong bg-white py-2 px-3.5 text-[13.5px] font-bold text-ink-strong transition-colors hover:border-[color:var(--color-altus-red)] hover:text-altus-red disabled:opacity-50"
                >
                  {sharing ? <Loader2 size={15} className="animate-spin" /> : <Share2 size={15} strokeWidth={2.4} />}
                  WhatsApp
                </button>

                <a
                  href={asOn ? `/accounts/vasa-family-interpersonal/export?asOn=${encodeURIComponent(asOn)}` : "/accounts/vasa-family-interpersonal/export"}
                  className="inline-flex items-center gap-2 rounded-xl border border-hairline-strong bg-white py-2 px-3.5 text-[13.5px] font-bold text-ink-strong transition-colors hover:border-[color:var(--color-altus-red)] hover:text-altus-red"
                  title={asOn ? `Download ${chartLabel(asOn)} as Excel` : "Download every chart as Excel"}
                >
                  <Download size={15} strokeWidth={2.4} /> Excel
                </a>
              </div>
            </div>

            <p className="text-[12.5px] font-semibold text-ink-subtle">
              A cell is what the <span className="font-bold text-ink-soft">row party</span> is owed by the column party (negative = the row party owes). Editing a cell auto-updates its mirror and saves. Hover any figure for the exact amount in words. {parties.length} parties · {snapshots.length} chart{snapshots.length === 1 ? "" : "s"}.
            </p>

            {/* Matrix */}
            <div className="overflow-x-auto rounded-section border border-hairline bg-surface-card" style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}>
              <table className="border-collapse text-right text-[13px]" style={{ minWidth: 720 }}>
                <thead>
                  <tr>
                    <th className="sticky left-0 z-20 px-3 py-2.5 text-left text-[11px] font-bold uppercase tracking-[0.04em] text-ink-subtle" style={{ background: "var(--color-surface-soft)", minWidth: 140 }}>Party</th>
                    {parties.map((col) => (
                      <th key={col} className="group px-2.5 py-2.5 text-right text-[11.5px] font-bold text-ink-soft whitespace-nowrap" style={{ background: "var(--color-surface-soft)", minWidth: 118 }}>
                        <span className="inline-flex items-center gap-1">
                          {col}
                          {partyOptByName.get(col) && (
                            <button type="button" onClick={() => removeParty(partyOptByName.get(col)!)} disabled={busy} title={`Remove ${col}`} className="opacity-0 group-hover:opacity-100 text-ink-subtle hover:text-altus-red transition-opacity"><X size={12} strokeWidth={2.6} /></button>
                          )}
                        </span>
                      </th>
                    ))}
                    <th className="px-3 py-2.5 text-right text-[11px] font-bold uppercase tracking-[0.04em] text-ink-subtle" style={{ background: "var(--color-surface-soft)", minWidth: 118 }}>Net</th>
                  </tr>
                </thead>
                <tbody>
                  {parties.length === 0 && (
                    <tr><td colSpan={2} className="px-5 py-12 text-center text-[14px] font-semibold text-ink-muted">No parties yet - add one to start the matrix.</td></tr>
                  )}
                  {parties.map((row) => {
                    const net = rowTotal(row);
                    return (
                      <tr key={row} className="hover:bg-surface-soft" style={{ borderTop: "1px solid var(--color-hairline)" }}>
                        <th className="sticky left-0 z-10 px-3 py-1.5 text-left font-bold text-ink-strong whitespace-nowrap" style={{ background: "var(--color-surface-card)", minWidth: 140 }}>{row}</th>
                        {parties.map((col) => {
                          if (row === col) return <td key={col} className="px-1 py-1 text-center text-ink-subtle" style={{ background: "color-mix(in srgb, var(--color-ink-subtle) 6%, transparent)" }}>-</td>;
                          // The opposite cell is what this one is checked
                          // against — read live, so correcting either side
                          // re-colours both without a reload.
                          return <td key={col} className="px-1 py-1"><MatrixCell value={cellValue(row, col)} mirror={cellValue(col, row)} rowParty={row} colParty={col} disabled={busy} onCommit={(v) => saveCell(row, col, v)} /></td>;
                        })}
                        <td
                          className="px-3 py-1.5 font-bold tabular-nums whitespace-nowrap"
                          title={net === 0 ? undefined : inrTooltip(net)}
                          style={{ color: net > 0 ? "var(--color-green-deep)" : net < 0 ? "var(--color-altus-red)" : "var(--color-ink-subtle)" }}
                        >
                          {net === 0 ? "-" : formatFullInr(net)}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Add party */}
            <div className="flex items-center gap-2">
              {adding ? (
                <>
                  <input autoFocus value={newParty} onChange={(e) => setNewParty(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addParty(); if (e.key === "Escape") { setAdding(false); setNewParty(""); } }} placeholder="New party name…" className="rounded-lg border border-hairline-strong bg-white px-3 py-2 text-[14px] font-semibold text-ink-strong outline-none focus:border-[color:var(--color-altus-red)]" />
                  <button type="button" onClick={addParty} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[13.5px] font-bold text-white disabled:opacity-50" style={{ background: "var(--color-altus-red)" }}><Check size={15} strokeWidth={2.6} /> Add</button>
                  <button type="button" onClick={() => { setAdding(false); setNewParty(""); }} className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-white px-3 py-2 text-[13.5px] font-bold text-ink-muted"><X size={15} /> Cancel</button>
                </>
              ) : (
                <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-2 rounded-xl border border-solid border-hairline-strong bg-white py-2 px-3.5 text-[13.5px] font-bold text-ink-soft transition-colors hover:border-[color:var(--color-altus-red)] hover:text-altus-red">
                  <Plus size={15} strokeWidth={2.6} /> Add Party
                </button>
              )}
            </div>
          </>
        ) : (
          /* LIST VIEW — the complete history for this quarter, and the only
             place a chart can be deleted. Each row acts on ITS OWN chart. */
          <VasaSnapshotList
            snapshots={quarterCharts}
            cells={cells}
            parties={parties}
            labelOf={chartLabel}
            nameOf={chartName}
            quarterOf={(x) => {
              const q = quarterOfStored(x);
              return q ? qKey(q) : "-";
            }}
            onOpen={(s) => { setAsOn(s); setTab("sheet"); }}
            onDelete={async (s) => {
              const res = await deleteVasaSnapshot({ asOn: s });
              if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
              fireToast({ message: `Chart ${chartLabel(s)} deleted.`, type: "info" });
              if (s === asOn) setAsOn(snapshots.find((x) => x !== s) ?? "");
              router.refresh();
            }}
          />
        )}
      </section>
    </>
  );
}

/**
 * One editable matrix cell — a hand-entered figure, coloured by whether it
 * agrees with the same debt as recorded from the other side.
 *
 * GREEN   this figure equals the negation of the opposite cell.
 * RED     it does not — the two parties' books disagree.
 * NEUTRAL the opposite cell is blank, so there is nothing to check against.
 *
 * The colour used to encode the SIGN (owed green, owes red), which the figure
 * itself already says. It now carries the thing the sheet exists to find.
 *
 * ── WHY THE HOVER TEXT SPELLS OUT THE DIFFERENCE ───────────────────────────
 * Figures render as whole rupees, and the real disagreements in this data are
 * paise: 26,19,630.00 against 26,19,630.22 draws two identical-looking numbers,
 * one green and one red. Without the delta on hover that reads as a broken
 * comparison rather than a found one.
 *
 * Idle it shows the readable figure; focused it swaps to the raw number so it
 * can still be typed and edited as a number.
 */
function MatrixCell({
  value, mirror, rowParty, colParty, disabled, onCommit,
}: {
  value: string;
  /** The opposite cell (colParty -> rowParty), as stored. "" when blank. */
  mirror: string;
  rowParty: string;
  colParty: string;
  disabled: boolean;
  onCommit: (v: string) => void;
}) {
  const [focused, setFocused] = React.useState(false);
  const [draft, setDraft] = React.useState(value);
  React.useEffect(() => { if (!focused) setDraft(value); }, [value, focused]);

  const num = value === "" ? 0 : Number(value);
  const mine = value === "" ? null : num;
  const theirs = mirror === "" ? null : Number(mirror);
  const state = vasaCellState(mine, theirs);
  const expected = vasaExpected(theirs);
  const delta = vasaDelta(mine, theirs);

  const display = focused ? draft : value === "" ? "" : formatFullInr(num);

  const tone =
    state === "match"
      ? { fg: "var(--color-green-deep)", bg: "color-mix(in srgb, var(--color-green) 12%, #fff)", border: "color-mix(in srgb, var(--color-green-deep) 35%, transparent)" }
      : state === "mismatch"
        ? { fg: "var(--color-altus-red-deep)", bg: "color-mix(in srgb, var(--color-altus-red) 11%, #fff)", border: "var(--color-altus-red)" }
        : state === "unpaired"
          ? { fg: "var(--color-ink-strong)", bg: "#fff", border: "var(--color-hairline-strong)" }
          : { fg: "var(--color-ink-subtle)", bg: "#fff", border: "var(--color-hairline)" };

  const title =
    state === "empty"
      ? undefined
      : state === "match"
        ? `${inrTooltip(num)}\nAgrees with ${colParty} \u2192 ${rowParty}.`
        : state === "unpaired"
          ? `${inrTooltip(num)}\nNothing entered for ${colParty} \u2192 ${rowParty} yet, so this figure is unchecked.`
          : `${inrTooltip(num)}\nDoes not agree with ${colParty} \u2192 ${rowParty}.\n${colParty}'s side implies ${formatPreciseInr(expected ?? 0)} \u2014 a difference of ${formatPreciseInr(Math.abs(delta ?? 0))}.`;

  return (
    <input
      value={display}
      disabled={disabled}
      inputMode="numeric"
      title={title}
      aria-label={`${rowParty} to ${colParty}`}
      // Announced as well as coloured: red and green alone say nothing to a
      // screen reader, or to anyone who cannot tell them apart.
      aria-invalid={state === "mismatch"}
      onFocus={() => { setFocused(true); setDraft(value); }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => { setFocused(false); if (draft !== value) onCommit(draft); }}
      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
      className="w-full rounded-md border bg-white px-1.5 py-1 text-right text-[12.5px] font-semibold tabular-nums outline-none transition-colors focus:border-[color:var(--color-altus-red)] disabled:opacity-60"
      style={{ minWidth: 132, color: tone.fg, borderColor: tone.border, background: tone.bg }}
    />
  );
}
