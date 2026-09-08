"use client";

import * as React from "react";
import {
  ChevronDown,
  Download,
  Share2,
  FileSpreadsheet,
  Mail,
  MessageCircle,
  Link2,
  Loader2,
  Trash2,
  ExternalLink,
  AlertTriangle,
} from "lucide-react";
import { fireToast } from "@/lib/toast";
import type { VasaCell } from "@/lib/queries/accounts-vasa";
import { emailVasaSnapshot } from "@/app/(app)/accounts/vasa-family-interpersonal/actions";
import { formatFullInr, formatPreciseInr, inrTooltip } from "@/lib/accounts/inr-format";
import { vasaCellState, vasaExpected, vasaDelta } from "@/lib/accounts/vasa-match";

/**
 * Per-snapshot download URL, keyed by the ROW's own date.
 *
 * Never by whatever the Sheet view happens to have open — that is the one way a
 * download or share quietly hands over the wrong report, and on a reconciliation
 * sheet a wrong-but-plausible file is worse than no file.
 */
function downloadHref(asOn: string): string {
  const qs = new URLSearchParams({ asOn });
  return `/accounts/vasa-family-interpersonal/export?${qs}`;
}

/**
 * LIST VIEW — every saved snapshot as one row, not one matrix.
 *
 * Created date · sheet name · quarter · Download · Share. A row expands in place
 * to the full matrix for THAT snapshot, so history can be reviewed without
 * leaving the list. Everything here is READ-ONLY by construction: there is no
 * input in this component, so the list can never become a second, unguarded way
 * to edit a historical report.
 */
export function VasaSnapshotList({
  snapshots,
  cells,
  parties,
  labelOf,
  nameOf,
  quarterOf,
  onOpen,
  onDelete,
}: {
  snapshots: string[];
  cells: VasaCell[];
  parties: string[];
  labelOf: (s: string) => string;
  nameOf: (s: string) => string;
  quarterOf: (s: string) => string;
  /** Open this chart in the Sheet tab. */
  onOpen: (asOn: string) => void;
  /** Permanently delete this chart. Confirmed here before it is called. */
  onDelete: (asOn: string) => Promise<void>;
}) {
  const [open, setOpen] = React.useState<string | null>(null);
  const [menu, setMenu] = React.useState<string | null>(null);
  const [sending, setSending] = React.useState<string | null>(null);
  /** The chart awaiting delete confirmation, and the one being deleted. */
  const [confirming, setConfirming] = React.useState<string | null>(null);
  const [deleting, setDeleting] = React.useState<string | null>(null);

  const byKey = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const c of cells) {
      if (c.asOn) m.set(`${c.asOn}|${c.party}|${c.counterparty}`, Number(c.amount));
    }
    return m;
  }, [cells]);

  async function emailIt(asOn: string) {
    setSending(asOn);
    setMenu(null);
    const res = await emailVasaSnapshot({ asOn });
    setSending(null);
    if (!res.ok) {
      fireToast({ message: res.error, type: "error" });
      return;
    }
    fireToast({ message: `${labelOf(asOn)} emailed to ${res.sentTo}.`, type: "success" });
  }

  function shareLink(asOn: string, via: "whatsapp" | "copy") {
    setMenu(null);
    const origin = typeof window === "undefined" ? "" : window.location.origin;
    const url = `${origin}${downloadHref(asOn)}`;
    const text = `Vasa Family Interpersonal Balance - ${labelOf(asOn)} (${quarterOf(asOn)}): ${url}`;
    if (via === "whatsapp") {
      // A LINK, not the file: WhatsApp cannot take an attachment from a URL, and
      // the link resolves to this exact snapshot behind the same access check.
      window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener,noreferrer");
      return;
    }
    void navigator.clipboard?.writeText(text).then(
      () => fireToast({ message: "Link copied.", type: "success" }),
      () => fireToast({ message: "Could not copy.", type: "error" }),
    );
  }

  if (snapshots.length === 0) {
    return (
      <div className="rounded-section border border-hairline bg-surface-card px-6 py-14 text-center">
        <FileSpreadsheet size={22} className="mx-auto mb-3 text-ink-subtle" aria-hidden />
        <p className="text-[15px] font-bold text-ink-strong">No charts in this quarter</p>
        <p className="mt-1 text-[13px] text-ink-subtle">
          Use New Chart in the header to start one.
        </p>
      </div>
    );
  }

  const COLS = "132px 1fr 108px auto";

  return (
    <div
      className="overflow-hidden rounded-section border border-hairline bg-surface-card"
      style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}
    >
      <div
        className="grid items-center gap-3 border-b border-hairline px-4 py-2.5 text-[11px] font-bold uppercase tracking-[0.06em] text-ink-subtle"
        style={{ background: "var(--color-surface-soft)", gridTemplateColumns: COLS }}
      >
        <span>Created</span>
        <span>Sheet</span>
        <span>Period</span>
        <span className="text-right">Actions</span>
      </div>

      <ul>
        {snapshots.map((s) => {
          const expanded = open === s;
          return (
            <li key={s} className="border-b border-hairline last:border-b-0">
              <div
                className="grid items-center gap-3 px-4 py-2.5 transition-colors hover:bg-surface-soft"
                style={{ gridTemplateColumns: COLS }}
              >
                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : s)}
                  aria-expanded={expanded}
                  className="flex items-center gap-1.5 text-left text-[13.5px] font-bold tabular-nums text-ink-strong"
                >
                  <ChevronDown
                    size={14}
                    strokeWidth={2.6}
                    aria-hidden
                    className="shrink-0 text-ink-subtle transition-transform duration-200"
                    style={{ transform: expanded ? "rotate(180deg)" : "none" }}
                  />
                  {labelOf(s)}
                </button>

                <button
                  type="button"
                  onClick={() => setOpen(expanded ? null : s)}
                  className="truncate text-left text-[13.5px] font-semibold text-ink-soft"
                >
                  {nameOf(s)}
                </button>

                <span className="text-[12.5px] font-bold text-ink-subtle">{quarterOf(s)}</span>

                <span className="relative flex items-center justify-end gap-1.5">
                  <a
                    href={downloadHref(s)}
                    title={`Download ${labelOf(s)} as Excel`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-white px-2.5 py-1.5 text-[12.5px] font-bold text-ink-soft transition-colors hover:border-[color:var(--color-altus-red)] hover:text-altus-red"
                  >
                    <Download size={14} strokeWidth={2.4} /> xlsx
                  </a>
                  {/* OPEN — List view is the complete history, so it has to be
                      able to put a chart back on the Sheet tab. */}
                  <button
                    type="button"
                    onClick={() => onOpen(s)}
                    title={`Open ${labelOf(s)}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-white px-2.5 py-1.5 text-[12.5px] font-bold text-ink-soft transition-colors hover:border-[color:var(--color-altus-red)] hover:text-altus-red"
                  >
                    <ExternalLink size={14} strokeWidth={2.4} /> Open
                  </button>

                  <button
                    type="button"
                    onClick={() => setMenu(menu === s ? null : s)}
                    disabled={sending === s}
                    aria-haspopup="menu"
                    aria-expanded={menu === s}
                    title={`Share ${labelOf(s)}`}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-white px-2.5 py-1.5 text-[12.5px] font-bold text-ink-soft transition-colors hover:border-[color:var(--color-altus-red)] hover:text-altus-red disabled:opacity-50"
                  >
                    {sending === s ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Share2 size={14} strokeWidth={2.4} />
                    )}{" "}
                    Share
                  </button>

                  <button
                    type="button"
                    onClick={() => { setMenu(null); setConfirming(s); }}
                    disabled={deleting === s}
                    title={`Delete ${labelOf(s)}`}
                    aria-label={`Delete ${labelOf(s)}`}
                    className="inline-flex items-center justify-center rounded-lg border border-hairline-strong bg-white px-2 py-1.5 text-ink-soft transition-colors hover:border-[color:var(--color-altus-red)] hover:text-altus-red disabled:opacity-50"
                  >
                    {deleting === s ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} strokeWidth={2.4} />}
                  </button>

                  {menu === s && (
                    <>
                      {/* Click-away catcher. A plain overlay rather than a
                          document listener, which would also swallow the first
                          click on another row's Share button. */}
                      <span
                        className="fixed inset-0 z-40"
                        onClick={() => setMenu(null)}
                        aria-hidden
                      />
                      <div
                        role="menu"
                        className="absolute right-0 top-full z-50 mt-1 w-56 overflow-hidden rounded-xl border border-hairline-strong bg-white py-1"
                        style={{ boxShadow: "0 12px 32px rgba(15,23,42,0.16)" }}
                      >
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => void emailIt(s)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] font-semibold text-ink-strong hover:bg-surface-soft"
                        >
                          <Mail size={14} strokeWidth={2.4} /> Email the .xlsx
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => shareLink(s, "whatsapp")}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] font-semibold text-ink-strong hover:bg-surface-soft"
                        >
                          <MessageCircle size={14} strokeWidth={2.4} /> WhatsApp a link
                        </button>
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => shareLink(s, "copy")}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] font-semibold text-ink-strong hover:bg-surface-soft"
                        >
                          <Link2 size={14} strokeWidth={2.4} /> Copy link
                        </button>
                      </div>
                    </>
                  )}
                </span>
              </div>

              {/* DELETE CONFIRMATION — inline, on the row being deleted, so there
                  is no doubt which chart is about to go. The wording is fixed by
                  the brief and must read exactly as written. Cancel leaves the
                  chart untouched; nothing is called until Delete is pressed. */}
              {confirming === s && (
                <div
                  role="alertdialog"
                  aria-label={`Delete ${labelOf(s)}`}
                  className="flex flex-wrap items-center gap-3 border-t border-hairline px-4 py-3"
                  style={{ background: "color-mix(in srgb, var(--color-altus-red) 6%, transparent)" }}
                >
                  <AlertTriangle size={16} strokeWidth={2.4} aria-hidden style={{ color: "var(--color-altus-red)" }} />
                  <p className="min-w-0 flex-1 text-[13px] font-bold text-ink-strong">
                    Are you sure you want to permanently delete this chart? This cannot be undone
                  </p>
                  <button
                    type="button"
                    onClick={() => setConfirming(null)}
                    disabled={deleting === s}
                    className="rounded-lg border border-hairline-strong bg-white px-3 py-1.5 text-[12.5px] font-bold text-ink-soft disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setDeleting(s);
                      void onDelete(s).finally(() => { setDeleting(null); setConfirming(null); });
                    }}
                    disabled={deleting === s}
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[12.5px] font-bold text-white disabled:opacity-50"
                    style={{ background: "var(--color-altus-red)" }}
                  >
                    {deleting === s ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} strokeWidth={2.6} />}
                    Delete
                  </button>
                </div>
              )}

              {expanded && (
                <div
                  className="overflow-x-auto border-t border-hairline px-4 py-3"
                  style={{ background: "var(--color-surface-soft)" }}
                >
                  <table className="border-collapse text-right text-[12.5px]" style={{ minWidth: 640 }}>
                    <thead>
                      <tr>
                        <th
                          className="px-2.5 py-2 text-left text-[11px] font-bold uppercase tracking-[0.04em] text-ink-subtle"
                          style={{ minWidth: 130 }}
                        >
                          Party
                        </th>
                        {parties.map((c) => (
                          <th
                            key={c}
                            className="whitespace-nowrap px-2.5 py-2 text-right text-[11.5px] font-bold text-ink-soft"
                          >
                            {c}
                          </th>
                        ))}
                        <th className="px-2.5 py-2 text-right text-[11px] font-bold uppercase tracking-[0.04em] text-ink-subtle">
                          Net
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {parties.map((row) => {
                        let net = 0;
                        for (const col of parties) {
                          if (col === row) continue;
                          const v = byKey.get(`${s}|${row}|${col}`);
                          if (v !== undefined) net += v;
                        }
                        return (
                          <tr key={row} style={{ borderTop: "1px solid var(--color-hairline)" }}>
                            <th className="whitespace-nowrap px-2.5 py-1.5 text-left font-bold text-ink-strong">
                              {row}
                            </th>
                            {parties.map((col) => {
                              if (row === col) {
                                return (
                                  <td key={col} className="px-2.5 py-1.5 text-center text-ink-subtle">
                                    -
                                  </td>
                                );
                              }
                              const v = byKey.get(`${s}|${row}|${col}`);
                              // Read-only, but coloured by the same rule as the
                              // live sheet (lib/accounts/vasa-match.ts): a
                              // history that greens a pair the sheet reds would
                              // be worse than no colour at all.
                              const mirror = byKey.get(`${s}|${col}|${row}`);
                              const st = vasaCellState(v ?? null, mirror ?? null);
                              const exp = vasaExpected(mirror ?? null);
                              const dlt = vasaDelta(v ?? null, mirror ?? null);
                              return (
                                <td
                                  key={col}
                                  className="px-2.5 py-1.5 tabular-nums"
                                  title={
                                    st === "empty"
                                      ? undefined
                                      : st === "mismatch"
                                        ? `${inrTooltip(v!)}
Does not agree with ${col} → ${row}, which implies ${formatPreciseInr(exp ?? 0)} - a difference of ${formatPreciseInr(Math.abs(dlt ?? 0))}.`
                                        : inrTooltip(v!)
                                  }
                                  style={{
                                    color:
                                      st === "match"
                                        ? "var(--color-green-deep)"
                                        : st === "mismatch"
                                          ? "var(--color-altus-red-deep)"
                                          : "var(--color-ink-strong)",
                                    background:
                                      st === "mismatch"
                                        ? "color-mix(in srgb, var(--color-altus-red) 10%, transparent)"
                                        : st === "match"
                                          ? "color-mix(in srgb, var(--color-green) 10%, transparent)"
                                          : undefined,
                                  }}
                                >
                                  {v === undefined ? "" : formatFullInr(v)}
                                </td>
                              );
                            })}
                            <td
                              className="px-2.5 py-1.5 font-bold tabular-nums"
                              title={net === 0 ? undefined : inrTooltip(net)}
                              style={{
                                color:
                                  net > 0
                                    ? "var(--color-green-deep)"
                                    : net < 0
                                      ? "var(--color-altus-red)"
                                      : "var(--color-ink-subtle)",
                              }}
                            >
                              {net === 0 ? "-" : formatFullInr(net)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
