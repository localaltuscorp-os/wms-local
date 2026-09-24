"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Check, FileText, Loader2, Minus, Upload } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { formatDateHr } from "@/lib/format";
import { getSupabaseClient } from "@/lib/supabase/browser";
import { validateUpload } from "@/lib/hr/upload";
import {
  mintDeclarationScanUrl,
  openDeclarationScan,
  saveDeclarationScan,
  type DeclarationStatusRow,
} from "@/app/(app)/hr/declaration/actions";

/**
 * WHO HAS RETURNED A SIGNED DECLARATION — every active employee, including the
 * ones who have done nothing.
 *
 * TWO COLUMNS, NOT ONE VERDICT. "Confirmed" is the employee ticking the box in
 * the app; "Signed copy" is the scanned sheet with their handwriting on it. Only
 * the second is worth anything in a dispute, so they are shown separately — a
 * single green tick would let the cheap half stand in for the expensive one.
 */
export function DeclarationTracker({
  rows,
  version,
}: {
  rows: DeclarationStatusRow[];
  version: string;
}) {
  const router = useRouter();
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const fileRef = React.useRef<HTMLInputElement | null>(null);
  const targetRef = React.useRef<string | null>(null);

  /**
   * Optimistic patches, laid OVER the server rows rather than copied from them.
   *
   * Holding a `useState(rows)` copy and re-syncing it in an effect looks simpler
   * and is a trap: the effect runs a render late, so a refresh that arrives
   * mid-upload briefly shows stale data, and the copy silently wins over the
   * server for as long as the component is mounted. An overlay cannot go stale
   * - `router.refresh()` brings the truth back and the patch stops mattering.
   */
  const [patch, setPatch] = React.useState<Record<string, Partial<DeclarationStatusRow>>>({});
  const state = React.useMemo(
    () => rows.map((r) => ({ ...r, ...(patch[r.employeeId] ?? {}) })),
    [rows, patch],
  );

  const done = state.filter((r) => r.hasScan).length;
  const outstanding = state.length - done;

  function pickFile(employeeId: string) {
    targetRef.current = employeeId;
    fileRef.current?.click();
  }

  async function onFile(file: File) {
    const employeeId = targetRef.current;
    if (!employeeId) return;

    // Checked here for a fast, kind error; checked again on the server, which is
    // what actually decides — this one can be skipped by anyone who wants to.
    const valid = validateUpload(file);
    if (!valid.ok) {
      fireToast({ message: valid.error, type: "error" });
      return;
    }

    setBusyId(employeeId);
    try {
      const signed = await mintDeclarationScanUrl(employeeId, {
        fileName: file.name,
        mime: file.type || null,
        size: file.size,
      });
      if (!signed.ok) {
        fireToast({ message: signed.error, type: "error" });
        return;
      }

      // Straight to Supabase — the bytes never enter a Server Action body.
      const { error } = await getSupabaseClient()
        .storage.from(signed.bucket)
        .uploadToSignedUrl(signed.path, signed.token, file, {
          contentType: file.type || "application/octet-stream",
        });
      if (error) {
        fireToast({ message: error.message, type: "error" });
        return;
      }

      const saved = await saveDeclarationScan(employeeId, {
        path: signed.path,
        fileName: file.name,
        mime: file.type || null,
        size: file.size,
      });
      if (!saved.ok) {
        fireToast({ message: saved.error, type: "error" });
        return;
      }

      setPatch((p) => ({
        ...p,
        [employeeId]: { hasScan: true, scanFileName: file.name, uploadedAt: new Date(), uploadedByName: "you" },
      }));
      fireToast({ message: "Signed copy filed.", type: "success" });
      // Replace the guess with what the server actually stored - including the
      // uploader's real name, which the patch above only approximates.
      router.refresh();
    } finally {
      setBusyId(null);
      targetRef.current = null;
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function open(employeeId: string) {
    const res = await openDeclarationScan(employeeId);
    if (!res.ok) {
      fireToast({ message: res.error, type: "error" });
      return;
    }
    window.open(res.url, "_blank", "noopener,noreferrer");
  }

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".pdf,image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onFile(f);
        }}
      />

      <div className="mb-3 flex flex-wrap items-center gap-2 text-[13px]">
        <span className="rounded-pill bg-surface-soft px-3 py-1 font-bold text-ink-soft">
          Wording v{version}
        </span>
        <span className="font-semibold text-ink-muted">
          {done} of {state.length} filed
          {outstanding > 0 ? (
            <>
              {" · "}
              <strong className="text-altus-red-deep">{outstanding} outstanding</strong>
            </>
          ) : null}
        </span>
      </div>

      <div className="w-full overflow-x-auto rounded-2xl border border-hairline bg-surface-card">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-hairline text-[11px] font-bold uppercase tracking-wide text-ink-subtle">
              <th className="whitespace-nowrap py-3 pl-4 pr-5">Employee</th>
              <th className="whitespace-nowrap px-5 py-3">Confirmed in app</th>
              <th className="whitespace-nowrap px-5 py-3">Signed copy</th>
              <th className="w-full py-3 pl-5 pr-4">Filed by</th>
              <th className="whitespace-nowrap py-3 pl-2 pr-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {state.map((r) => (
              <tr key={r.employeeId} className="border-b border-hairline last:border-0 hover:bg-surface-muted/50">
                <td className="whitespace-nowrap py-3 pl-4 pr-5 text-[14px] font-bold text-ink-strong">
                  {r.name}
                </td>
                <td className="whitespace-nowrap px-5 py-3">
                  <Mark on={Boolean(r.acknowledgedAt)} title={r.acknowledgedAt ? formatDateHr(r.acknowledgedAt) : undefined} />
                </td>
                <td className="whitespace-nowrap px-5 py-3">
                  <Mark on={r.hasScan} title={r.scanFileName ?? undefined} />
                </td>
                <td className="w-full py-3 pl-5 pr-4 text-[12.5px] text-ink-muted">
                  {r.hasScan ? (
                    <>
                      {r.uploadedByName ?? "—"}
                      {r.uploadedAt ? <span className="text-ink-subtle"> · {formatDateHr(r.uploadedAt)}</span> : null}
                    </>
                  ) : (
                    <span className="text-ink-subtle">—</span>
                  )}
                </td>
                <td className="whitespace-nowrap py-3 pl-2 pr-4">
                  <span className="inline-flex items-center gap-1.5">
                    {r.hasScan ? (
                      <button
                        type="button"
                        onClick={() => void open(r.employeeId)}
                        title="Open the signed copy"
                        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-hairline-strong bg-white px-2.5 text-[12.5px] font-bold text-ink-strong"
                      >
                        <FileText size={14} /> Open
                      </button>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => pickFile(r.employeeId)}
                      disabled={busyId === r.employeeId}
                      title={r.hasScan ? "Replace the signed copy" : "Upload the signed copy"}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-hairline-strong bg-white px-2.5 text-[12.5px] font-bold text-ink-strong disabled:opacity-60"
                    >
                      {busyId === r.employeeId ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Upload size={14} />
                      )}
                      {r.hasScan ? "Replace" : "Upload"}
                    </button>
                  </span>
                </td>
              </tr>
            ))}
            {state.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-[13px] text-ink-subtle">
                  No active employees.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** A tick or a dash. A blank cell reads as "not loaded", which is not the same. */
function Mark({ on, title }: { on: boolean; title?: string }) {
  return on ? (
    <span
      title={title}
      className="inline-flex items-center gap-1 rounded-pill px-2.5 py-0.5 text-[11px] font-bold"
      style={{ background: "color-mix(in srgb, var(--color-green) 18%, white)", color: "#166534" }}
    >
      <Check size={12} strokeWidth={3} /> Yes
    </span>
  ) : (
    <span className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-ink-subtle">
      <Minus size={12} /> Not yet
    </span>
  );
}
