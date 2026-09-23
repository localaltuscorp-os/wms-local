"use client";

import { useState, useTransition } from "react";
import { AlertTriangle, Check, CloudOff, HardDriveDownload, Loader2, RefreshCw } from "lucide-react";
import { ModuleExportButton } from "@/components/modules/module-export-button";
import {
  continueRuns,
  disconnectDrive,
  grantModuleExport,
  revokeModuleExport,
  runModuleNow,
  setModuleEnabled,
  setScheduleEnabled,
  type ActionResult,
} from "@/app/(admin)/admin/module-backups/actions";

/**
 * MODULE BACKUPS — connect the Drive, see what was saved, decide who may export.
 *
 * The page is deliberately blunt about two things people otherwise discover the
 * hard way:
 *   · which tabs can only report NEW rows, because their tables record no edit
 *     time (employees, leave requests, attendance punches, every audit log);
 *   · that a manual download does not count as the nightly save, so pressing
 *     Export does not make tonight's run skip anything.
 */

export interface ModuleRow {
  id: string;
  label: string;
  tabs: number;
  newRowsOnlyTabs: string[];
  enabled: boolean;
  exportedThrough: string | null;
  lastRunAt: string | null;
  lastFullAt: string | null;
  lastRun: {
    status: string;
    kind: string;
    folderName: string | null;
    files: number;
    skippedFiles: number;
    error: string | null;
    startedAt: string;
    finishedAt: string | null;
  } | null;
  grants: { employeeId: string; name: string; email: string }[];
}

type Person = { id: string; name: string; email: string };

function when(iso: string | null): string {
  if (!iso) return "never";
  return new Date(iso).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Kolkata",
  });
}

const DRIVE_MESSAGES: Record<string, string> = {
  connected: "Google Drive is connected.",
  denied: "You cancelled the Google sign-in.",
  error: "Google refused the connection. Try again.",
  "no-scope": "Drive permission was not granted — tick it on the Google screen.",
  unconfigured: "Google is not configured on this server (GOOGLE_CLIENT_ID / SECRET).",
  forbidden: "You are not allowed to change this connection.",
  "wrong-account": "That is the wrong Google account.",
};

export function ModuleBackupsScreen(props: {
  account: string;
  rootFolder: string;
  connectedAs: string | null;
  connectedAt: string | null;
  scheduleEnabled: boolean;
  runHourIst: number;
  lastError: string | null;
  modules: ModuleRow[];
  roster: Person[];
  driveStatus: string | null;
  attemptedAccount: string | null;
}) {
  const [busy, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(
    props.driveStatus
      ? (DRIVE_MESSAGES[props.driveStatus] ?? null) +
          (props.driveStatus === "wrong-account" && props.attemptedAccount
            ? ` You signed in as ${props.attemptedAccount}; it must be ${props.account}.`
            : "")
      : null,
  );
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<ActionResult>) {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      const result = await action();
      if (result.ok) setMessage(result.message ?? "Done.");
      else setError(result.error);
    });
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6">
      <h1 className="text-2xl font-semibold">Module Backups</h1>
      <p className="mt-1 text-sm" style={{ color: "var(--color-ink-subtle, #64748B)" }}>
        Every module is saved to Google Drive each night — one folder per module, a dated folder
        per run, an Excel workbook and the files its rows point at. The first save carries
        everything; after that, only what changed.
      </p>

      {message && (
        <p role="status" className="mt-4 rounded-lg px-3 py-2 text-sm" style={{ background: "rgba(16,185,129,0.1)" }}>
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 rounded-lg px-3 py-2 text-sm" style={{ background: "rgba(225,6,0,0.1)", color: "#B91C1C" }}>
          {error}
        </p>
      )}

      {/* ── THE CONNECTION ─────────────────────────────────────────────── */}
      <section className="mt-6 rounded-xl border p-4" style={{ borderColor: "rgba(15,23,42,0.12)" }}>
        <h2 className="flex items-center gap-2 text-lg font-medium">
          <HardDriveDownload size={18} aria-hidden /> Google Drive
        </h2>
        {props.connectedAs ? (
          <p className="mt-2 text-sm">
            Connected as <strong>{props.connectedAs}</strong> since {when(props.connectedAt)}. Files
            go to <strong>{props.rootFolder}</strong> in that Drive.
          </p>
        ) : (
          <p className="mt-2 text-sm">
            Not connected. The nightly save cannot run. It must be signed in as{" "}
            <strong>{props.account}</strong> — any other account is refused, so that company records
            never land in a personal Drive.
          </p>
        )}
        {props.lastError && (
          <p className="mt-2 flex items-start gap-2 text-sm" style={{ color: "#B45309" }}>
            <AlertTriangle size={15} className="mt-0.5 shrink-0" aria-hidden />
            {props.lastError}
          </p>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <a
            href="/api/modules/backup/connect"
            className="inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-white"
            style={{ background: "#0F172A" }}
          >
            {props.connectedAs ? "Reconnect" : "Connect Google Drive"}
          </a>
          {props.connectedAs && (
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => disconnectDrive())}
              className="inline-flex items-center gap-2 text-sm underline underline-offset-4 disabled:opacity-60"
            >
              <CloudOff size={15} aria-hidden /> Disconnect
            </button>
          )}
        </div>
      </section>

      {/* ── THE SCHEDULE ───────────────────────────────────────────────── */}
      <section className="mt-4 rounded-xl border p-4" style={{ borderColor: "rgba(15,23,42,0.12)" }}>
        <h2 className="text-lg font-medium">Nightly save</h2>
        <p className="mt-2 text-sm">
          Runs at <strong>{String(props.runHourIst).padStart(2, "0")}:05 IST</strong> every day. A
          save too big for one run keeps its place and carries on.
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => setScheduleEnabled(!props.scheduleEnabled))}
            className="rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-60"
            style={{ borderColor: "rgba(15,23,42,0.12)" }}
          >
            {props.scheduleEnabled ? "Switch off" : "Switch on"}
          </button>
          <span className="text-sm" style={{ color: "var(--color-ink-subtle, #64748B)" }}>
            Currently {props.scheduleEnabled ? "on" : "off"}
          </span>
          <button
            type="button"
            disabled={busy}
            onClick={() => run(() => continueRuns())}
            className="inline-flex items-center gap-2 text-sm underline underline-offset-4 disabled:opacity-60"
          >
            {busy ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <RefreshCw size={15} aria-hidden />}
            Continue anything unfinished
          </button>
        </div>
      </section>

      {/* ── THE MODULES ────────────────────────────────────────────────── */}
      <section className="mt-4 space-y-3">
        {props.modules.map((module) => (
          <ModuleCard
            key={module.id}
            module={module}
            roster={props.roster}
            busy={busy}
            onAction={run}
          />
        ))}
      </section>
    </div>
  );
}

function ModuleCard({
  module,
  roster,
  busy,
  onAction,
}: {
  module: ModuleRow;
  roster: Person[];
  busy: boolean;
  onAction: (action: () => Promise<ActionResult>) => void;
}) {
  const [open, setOpen] = useState(false);
  const [pick, setPick] = useState("");

  return (
    <div className="rounded-xl border p-4" style={{ borderColor: "rgba(15,23,42,0.12)" }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-medium">{module.label}</h3>
          <p className="mt-0.5 text-sm" style={{ color: "var(--color-ink-subtle, #64748B)" }}>
            {module.tabs} tab{module.tabs === 1 ? "" : "s"} · last saved {when(module.lastRunAt)}
            {module.lastRun?.status === "failed" && " · last run failed"}
            {module.lastRun?.status === "pending" && " · part-way through"}
          </p>
        </div>
        <ModuleExportButton moduleId={module.id} moduleLabel={module.label} />
      </div>

      {module.lastRun?.error && (
        <p className="mt-2 text-sm" style={{ color: "#B91C1C" }}>
          {module.lastRun.error}
        </p>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
        <button
          type="button"
          disabled={busy}
          onClick={() => onAction(() => runModuleNow(module.id, false))}
          className="rounded-lg border px-3 py-1.5 disabled:opacity-60"
          style={{ borderColor: "rgba(15,23,42,0.12)" }}
        >
          Save to Drive now
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onAction(() => runModuleNow(module.id, true))}
          className="underline underline-offset-4 disabled:opacity-60"
        >
          Save everything again
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onAction(() => setModuleEnabled(module.id, !module.enabled))}
          className="underline underline-offset-4 disabled:opacity-60"
        >
          {module.enabled ? "Skip in the nightly save" : "Include in the nightly save"}
        </button>
        <button type="button" onClick={() => setOpen((v) => !v)} className="underline underline-offset-4">
          {open ? "Hide details" : "Who can export, and what is covered"}
        </button>
      </div>

      {open && (
        <div className="mt-3 space-y-3 border-t pt-3 text-sm" style={{ borderColor: "rgba(15,23,42,0.08)" }}>
          <div>
            <p className="font-medium">Who may export this module</p>
            <p className="mt-0.5" style={{ color: "var(--color-ink-subtle, #64748B)" }}>
              Super-admins manage this connection, schedule, and module-level export access.
            </p>
            <ul className="mt-2 space-y-1">
              {module.grants.length === 0 && <li style={{ color: "var(--color-ink-subtle, #64748B)" }}>Nobody else.</li>}
              {module.grants.map((g) => (
                <li key={g.employeeId} className="flex items-center gap-2">
                  <Check size={14} aria-hidden /> {g.name}
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onAction(() => revokeModuleExport(module.id, g.employeeId))}
                    className="underline underline-offset-4 disabled:opacity-60"
                  >
                    remove
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <select
                value={pick}
                onChange={(e) => setPick(e.target.value)}
                className="rounded-lg border px-2 py-1.5"
                style={{ borderColor: "rgba(15,23,42,0.12)" }}
                aria-label={`Give someone permission to export ${module.label}`}
              >
                <option value="">Choose a person…</option>
                {roster.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
              <button
                type="button"
                disabled={busy || !pick}
                onClick={() => {
                  onAction(() => grantModuleExport(module.id, pick));
                  setPick("");
                }}
                className="rounded-lg border px-3 py-1.5 disabled:opacity-60"
                style={{ borderColor: "rgba(15,23,42,0.12)" }}
              >
                Give permission
              </button>
            </div>
          </div>

          {module.newRowsOnlyTabs.length > 0 && (
            <div>
              <p className="font-medium">New rows only, on these tabs</p>
              <p className="mt-0.5" style={{ color: "var(--color-ink-subtle, #64748B)" }}>
                These tables do not record when a row was last edited, so a nightly save catches new
                rows but not edits to old ones. Those appear the next time you press &ldquo;Save
                everything again&rdquo;.
              </p>
              <p className="mt-1">{module.newRowsOnlyTabs.join(", ")}</p>
            </div>
          )}

          <p style={{ color: "var(--color-ink-subtle, #64748B)" }}>
            Saved up to {when(module.exportedThrough)} · last full save {when(module.lastFullAt)}
            {module.lastRun?.folderName && ` · last folder "${module.lastRun.folderName}"`}
          </p>
        </div>
      )}
    </div>
  );
}
