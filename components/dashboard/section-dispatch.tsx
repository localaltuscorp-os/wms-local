"use client";

import * as React from "react";
import * as Popover from "@radix-ui/react-popover";
import { Loader2, Mail, Search } from "lucide-react";
import { fireToast } from "@/lib/toast";
import {
  reportFilename,
  whatsappMessage,
  whatsappShareUrl,
  type SectionReport,
} from "@/lib/reports/section-report";
import {
  listReportRecipients,
  type ReportRecipient,
} from "@/app/(app)/dashboard/report-recipients";

/**
 * THE TWO SHARE ICONS every dashboard section carries.
 *
 * `report` is a THUNK, not a value. A section's payload describes what it is
 * rendering right now — the search in force, the window selected, the rows
 * expanded — so building it eagerly on every render would be both wasteful and
 * wrong: the snapshot has to be taken at the moment the button is pressed, not
 * at the moment the header last re-rendered.
 *
 * Icon-only by design. These sit in a header that already carries a search box,
 * a window picker, Expand all, Transpose and the fold toggle; two more labelled
 * buttons is where a toolbar stops being scannable.
 */

/** WhatsApp's glyph is not in lucide, and the brand mark is the whole point of
 *  an icon-only control — a generic speech bubble would be unrecognisable. */
function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className={className} aria-hidden>
      <path d="M17.47 14.38c-.3-.15-1.75-.86-2.02-.96-.27-.1-.47-.15-.67.15s-.77.96-.94 1.16c-.17.2-.35.22-.64.07-.3-.15-1.25-.46-2.38-1.47-.88-.78-1.48-1.75-1.65-2.05-.17-.3-.02-.46.13-.6.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.6-.92-2.2-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.79.37-.27.3-1.04 1.02-1.04 2.48s1.06 2.88 1.21 3.08c.15.2 2.1 3.2 5.08 4.49.71.3 1.26.49 1.69.63.71.22 1.36.19 1.87.12.57-.09 1.75-.72 2-1.41.25-.69.25-1.28.17-1.41-.07-.13-.27-.2-.57-.35z" />
      <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.87 9.87 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2zm0 18.13h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.19 8.19 0 0 1-1.26-4.36c0-4.54 3.7-8.23 8.25-8.23 2.2 0 4.27.86 5.83 2.41a8.19 8.19 0 0 1 2.41 5.83c0 4.54-3.7 8.23-8.24 8.23z" />
    </svg>
  );
}

const ICON_BTN =
  "grid size-8 shrink-0 cursor-pointer place-items-center rounded-lg transition-colors disabled:cursor-not-allowed disabled:opacity-50";

/** POST the payload and hand the browser the resulting file. */
async function downloadPdf(report: SectionReport): Promise<void> {
  const res = await fetch("/api/reports/section-pdf", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(report),
  });
  if (!res.ok) {
    const msg = await res.json().catch(() => ({ error: "Could not build the report" }));
    throw new Error((msg as { error?: string }).error ?? "Could not build the report");
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = reportFilename(report.title, new Date());
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoked on the next tick, not immediately: Safari cancels an in-flight
  // download if its blob URL is released in the same frame as the click.
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export function SectionDispatch({ report }: { report: () => SectionReport }) {
  const [open, setOpen] = React.useState(false);
  /** Which flow the picker is serving. Both need a person; only the labels and
   *  what happens on pick differ, so one picker serves both. */
  const [mode, setMode] = React.useState<"whatsapp" | "email">("whatsapp");
  const [people, setPeople] = React.useState<ReportRecipient[] | null>(null);
  const [loadError, setLoadError] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [busyId, setBusyId] = React.useState<string | null>(null);

  const load = React.useCallback(() => {
    if (people || loadError) return;
    void listReportRecipients().then((res) => {
      if ("error" in res) setLoadError(res.error);
      else setPeople(res.people);
    });
  }, [people, loadError]);

  function openWith(next: "whatsapp" | "email") {
    setMode(next);
    setQuery("");
    setOpen(true);
    load();
  }

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!people) return [];
    if (!q) return people;
    return people.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.department ?? "").toLowerCase().includes(q),
    );
  }, [people, query]);

  async function onWhatsApp(person: ReportRecipient) {
    if (!person.phone) return;
    const snapshot = report();
    setBusyId(person.id);
    fireToast({ message: "Generating PDF report…", type: "info" });
    try {
      await downloadPdf(snapshot);
      setOpen(false);
      // Opened AFTER the download resolves, so the file is already on disk when
      // the chat window asks for an attachment. Opening first would put the
      // reader in WhatsApp with nothing to attach yet.
      window.open(
        whatsappShareUrl(person.phone, whatsappMessage(person.name, snapshot.title)),
        "_blank",
        "noopener,noreferrer",
      );
      fireToast({
        message: `PDF downloaded — attach it in the WhatsApp chat with ${person.name}.`,
        type: "success",
        duration: 8000,
      });
    } catch (err) {
      fireToast({
        message: err instanceof Error ? err.message : "Could not build the report",
        type: "error",
      });
    } finally {
      setBusyId(null);
    }
  }

  async function onEmail(person: ReportRecipient) {
    if (!person.email) return;
    setBusyId(person.id);
    fireToast({ message: "Generating PDF report…", type: "info" });
    try {
      const res = await fetch("/api/reports/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // The id, never the address: the route re-reads the recipient row so a
        // tampered body cannot turn this into an open relay.
        body: JSON.stringify({ employeeId: person.id, report: report() }),
      });
      const json = (await res.json()) as { ok?: boolean; to?: string; error?: string };
      if (!res.ok || !json.ok) throw new Error(json.error ?? "Send failed");
      setOpen(false);
      fireToast({ message: `Email successfully sent to ${json.to}`, type: "success" });
    } catch (err) {
      fireToast({
        message: err instanceof Error ? err.message : "Could not send the report",
        type: "error",
      });
    } finally {
      setBusyId(null);
    }
  }

  const canSend = (p: ReportRecipient) => (mode === "whatsapp" ? !!p.phone : !!p.email);

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <span className="flex shrink-0 items-center gap-0.5">
        <Popover.Anchor asChild>
          <button
            type="button"
            onClick={() => openWith("whatsapp")}
            title="Export PDF to WhatsApp"
            aria-label="Export PDF to WhatsApp"
            className={`${ICON_BTN} text-emerald-600 hover:bg-emerald-50`}
          >
            <WhatsAppIcon className="size-4" />
          </button>
        </Popover.Anchor>
        <button
          type="button"
          onClick={() => openWith("email")}
          title="Auto-Send PDF via Email"
          aria-label="Auto-Send PDF via Email"
          // Brand crimson, not the generic blue it shipped as. WhatsApp keeps
          // its green: that one is the SERVICE's colour and a reader finds it
          // by that, whereas the mail icon has no brand of its own to borrow.
          className={`${ICON_BTN} text-[#B80D22] hover:bg-red-50`}
        >
          <Mail className="size-4" strokeWidth={2.4} />
        </button>
      </span>

      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="end"
          sideOffset={8}
          className="z-[70] w-[300px] rounded-xl border border-slate-200 bg-white p-2 shadow-2xl"
        >
          <p className="px-1.5 pb-1.5 pt-1 text-[10.5px] font-bold uppercase tracking-wider text-slate-400">
            {mode === "whatsapp" ? "Share on WhatsApp" : "Email this report"}
          </p>

          <div className="relative mb-1.5">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search employee..."
              className="h-8 w-full rounded-lg border border-slate-200 bg-white pl-8 pr-2 text-xs text-slate-900 outline-none placeholder:text-slate-400 focus:ring-1 focus:ring-[var(--color-altus-red)]"
            />
          </div>

          <div className="max-h-[260px] overflow-y-auto">
            {loadError && (
              <p className="px-2 py-6 text-center text-xs font-semibold text-slate-500">
                {loadError}
              </p>
            )}
            {!loadError && !people && (
              <p className="flex items-center justify-center gap-1.5 px-2 py-6 text-xs font-semibold text-slate-500">
                <Loader2 className="size-3.5 animate-spin" /> Loading roster…
              </p>
            )}
            {people && filtered.length === 0 && (
              <p className="px-2 py-6 text-center text-xs font-semibold text-slate-500">
                Nobody matches that search.
              </p>
            )}
            {filtered.map((p) => {
              const sendable = canSend(p);
              return (
                <button
                  key={p.id}
                  type="button"
                  disabled={!sendable || busyId !== null}
                  onClick={() => (mode === "whatsapp" ? onWhatsApp(p) : onEmail(p))}
                  // A person with no number (or no address) still RENDERS, greyed
                  // with the reason under their name. Filtering them out would
                  // leave a reader hunting for someone the list silently dropped.
                  title={
                    sendable
                      ? undefined
                      : mode === "whatsapp"
                        ? "No WhatsApp number on file"
                        : "No email address on file"
                  }
                  className="flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-transparent"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[12.5px] font-bold text-slate-800">
                      {p.name}
                    </span>
                    <span className="block truncate text-[10.5px] font-medium text-slate-400">
                      {sendable
                        ? mode === "whatsapp"
                          ? p.phone
                          : p.email
                        : mode === "whatsapp"
                          ? "No WhatsApp number on file"
                          : "No email address on file"}
                    </span>
                  </span>
                  {busyId === p.id && (
                    <Loader2 className="size-3.5 shrink-0 animate-spin text-slate-400" />
                  )}
                </button>
              );
            })}
          </div>

          {mode === "whatsapp" && (
            <p className="mt-1.5 border-t border-slate-100 px-1.5 pt-1.5 text-[10.5px] font-medium leading-snug text-slate-400">
              The PDF downloads to this device, then WhatsApp opens with the message
              ready — attach the file there.
            </p>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
