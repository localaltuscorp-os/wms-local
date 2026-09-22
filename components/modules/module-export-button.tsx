"use client";

import { useState } from "react";
import { Download, Loader2 } from "lucide-react";

/**
 * EXPORT THIS MODULE — the button asked for on 21 Sep, on every module's page.
 *
 * Downloads a ZIP: the module's workbook (a tab per dataset) and the files its
 * rows point at. Rendered only for people allowed to export THIS module, which
 * the page decides — the route checks again, because a hidden button is not a
 * permission.
 *
 * ── WHY fetch AND NOT A PLAIN LINK ─────────────────────────────────────────
 * A big module takes a while to build. A link gives no sign that anything is
 * happening, so people press it again and start a second build. This shows
 * progress, and it can read the header that says some files were left out of a
 * very large archive — which a link cannot.
 */
export function ModuleExportButton({
  moduleId,
  moduleLabel,
  className,
}: {
  moduleId: string;
  moduleLabel: string;
  className?: string;
}) {
  const [busy, setBusy] = useState<null | "all" | "new">(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function download(scope: "all" | "new") {
    setBusy(scope);
    setError(null);
    setNote(null);
    try {
      const res = await fetch(`/api/modules/${encodeURIComponent(moduleId)}/export?scope=${scope}`);
      if (!res.ok) {
        const payload = (await res.json().catch(() => ({}))) as { message?: string };
        setError(payload.message ?? "The export could not be built. Try again in a minute.");
        return;
      }
      const skipped = Number(res.headers.get("X-Files-Skipped") ?? "0");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download =
        res.headers.get("Content-Disposition")?.match(/filename="(.+)"/)?.[1] ??
        `${moduleLabel}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      if (skipped > 0) {
        setNote(
          `${skipped} file${skipped === 1 ? "" : "s"} left out — one download carries a limited number. The nightly save to Drive has them all.`,
        );
      }
    } catch {
      setError("Network hiccup. Check your connection and try once more.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className={className}>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => download("all")}
          disabled={busy !== null}
          className="inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-60"
          style={{ borderColor: "var(--color-border, rgba(15,23,42,0.12))" }}
          title={`Download everything in ${moduleLabel} as Excel, with its files`}
        >
          {busy === "all" ? (
            <Loader2 size={15} className="animate-spin" aria-hidden />
          ) : (
            <Download size={15} aria-hidden />
          )}
          {busy === "all" ? "Preparing…" : "Export"}
        </button>
        <button
          type="button"
          onClick={() => download("new")}
          disabled={busy !== null}
          className="text-sm underline underline-offset-4 disabled:opacity-60"
          style={{ color: "var(--color-ink-subtle, #64748B)" }}
          title="Only what has changed since the last automatic save"
        >
          {busy === "new" ? "Preparing…" : "Only new"}
        </button>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-sm" style={{ color: "#B91C1C" }}>
          {error}
        </p>
      )}
      {note && !error && (
        <p role="status" className="mt-2 text-sm" style={{ color: "var(--color-ink-subtle, #64748B)" }}>
          {note}
        </p>
      )}
    </div>
  );
}
