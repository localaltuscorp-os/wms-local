"use client";

import * as React from "react";
import {
  AlertTriangle,
  CalendarClock,
  Check,
  CloudUpload,
  FileArchive,
  FolderOpen,
  HardDrive,
  Loader2,
  RefreshCw,
  Search,
  Unplug,
  X,
} from "lucide-react";
import { fireToast } from "@/lib/toast";
import { describeSchedule } from "@/lib/hr/records-export/schedule";
import type { DriveStatus } from "@/lib/hr/records-export/status";
import type { RunSummary } from "@/lib/hr/records-export/types";
import type { SyncRunResult } from "@/lib/hr/records-export/sync";
import {
  disconnectDriveAction,
  refreshDriveStatusAction,
  updateDriveScheduleAction,
} from "@/app/(app)/hr/records-backup/actions";
import { downloadRecordsZip } from "./download-records-zip";

export interface BackupPerson {
  id: string;
  name: string;
  email: string;
  isActive: boolean;
  department: string | null;
}

const RED = "#E10600";
const RED_DEEP = "#A80400";
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/**
 * "15 Sep 2026, 3:00 am" in India time. Computed by hand rather than with
 * toLocaleString so the server render and the browser agree to the character.
 */
function istDateTime(iso: string | null, withTime = true): string {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return "—";
  const d = new Date(t + 330 * 60 * 1000);
  const date = `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  if (!withTime) return date;
  const h = d.getUTCHours();
  return `${date}, ${h % 12 === 0 ? 12 : h % 12}:${String(d.getUTCMinutes()).padStart(2, "0")} ${h < 12 ? "am" : "pm"}`;
}

function noticeFor(code: string, expected: string, as: string | null): { tone: "ok" | "warn"; text: string } | null {
  switch (code) {
    case "connected":
      return { tone: "ok", text: `Google Drive connected. Records will be saved to “HR Records” in ${expected}'s Drive.` };
    case "denied":
      return { tone: "warn", text: "Google sign-in was cancelled, so Drive is not connected." };
    case "no-scope":
      return { tone: "warn", text: "Drive access wasn't allowed on the Google screen. Connect again and tick the Google Drive permission." };
    case "wrong-account":
      return { tone: "warn", text: `You signed in as ${as ?? "a different account"}. Connect again and choose ${expected}.` };
    case "unconfigured":
      return { tone: "warn", text: "Google sign-in isn't set up on this server (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET)." };
    case "forbidden":
      return { tone: "warn", text: "Only HR admins can connect the Drive backup." };
    case "error":
      return { tone: "warn", text: "Couldn't connect Google Drive. Please try again." };
    default:
      return null;
  }
}

function Card({
  icon,
  title,
  sub,
  children,
  className = "",
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-2xl border border-hairline bg-white p-5 ${className}`}>
      <div className="mb-4 flex items-start gap-3">
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white"
          style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}
        >
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="text-[16px] font-black leading-tight text-ink-strong">{title}</h2>
          <p className="mt-0.5 text-[12.5px] font-medium leading-snug text-ink-muted">{sub}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

const PILL = {
  ok: { bg: "#ecfdf3", fg: "#067647" },
  idle: { bg: "#f4f4f5", fg: "#52525b" },
  warn: { bg: "#fef3f2", fg: "#b42318" },
  busy: { bg: "#eff8ff", fg: "#175cd3" },
} as const;

function Pill({ tone, children }: { tone: keyof typeof PILL; children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-pill px-2.5 py-1 text-[12px] font-bold"
      style={{ background: PILL[tone].bg, color: PILL[tone].fg }}
    >
      {children}
    </span>
  );
}

function summaryText(s: RunSummary): string {
  const bits = [
    `${s.peopleWithFiles} ${s.peopleWithFiles === 1 ? "person" : "people"} with records`,
    `${s.uploaded} new`,
    `${s.updated} updated`,
    `${s.unchanged} unchanged`,
  ];
  if (s.failed) bits.push(`${s.failed} failed`);
  return bits.join(" · ");
}

export function RecordsBackupScreen({
  initialStatus,
  people,
  notice,
  noticeAccount,
}: {
  initialStatus: DriveStatus;
  people: BackupPerson[];
  notice: string | null;
  noticeAccount: string | null;
}) {
  const [status, setStatus] = React.useState(initialStatus);
  const [banner, setBanner] = React.useState(() =>
    notice ? noticeFor(notice, initialStatus.expectedAccount, noticeAccount) : null,
  );
  const [running, setRunning] = React.useState(false);
  const [enabled, setEnabled] = React.useState(initialStatus.scheduleEnabled);
  const [months, setMonths] = React.useState(initialStatus.intervalMonths);
  const [day, setDay] = React.useState(initialStatus.dayOfMonth);
  const [savingSchedule, setSavingSchedule] = React.useState(false);
  const [busy, setBusy] = React.useState<"disconnect" | "refresh" | null>(null);
  const [query, setQuery] = React.useState("");
  const [scope, setScope] = React.useState<"all" | "current" | "former">("all");
  const [zipFor, setZipFor] = React.useState<string | null>(null);
  const mounted = React.useRef(true);

  React.useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  // The ?drive= result is shown once; a refresh should not show it again.
  React.useEffect(() => {
    if (!notice) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("drive");
    url.searchParams.delete("as");
    window.history.replaceState(window.history.state, "", url.toString());
  }, [notice]);

  const scheduleDirty =
    enabled !== status.scheduleEnabled || months !== status.intervalMonths || day !== status.dayOfMonth;

  async function saveNow() {
    if (running) return;
    setRunning(true);
    try {
      // Each call saves for ~45 s and says whether there is more; keep going
      // while it is "partial". Closing the page just pauses the save.
      for (let i = 0; i < 400 && mounted.current; i++) {
        const res = await fetch("/api/hr/records/drive/run", { method: "POST" });
        const json = (await res.json().catch(() => null)) as
          | { ok?: boolean; error?: string; result?: SyncRunResult; status?: DriveStatus }
          | null;
        if (json?.status && mounted.current) setStatus(json.status);
        if (!res.ok || !json?.ok || !json.result) {
          fireToast({ message: json?.error || "Couldn't reach the Drive save. Please sign in again and retry.", type: "error" });
          return;
        }
        const r = json.result;
        if (r.status === "partial") continue;
        if (r.status === "done") {
          fireToast(
            r.summary.failed
              ? { message: `Saved to Drive, but ${r.summary.failed} file(s) couldn't be saved. See the list below.`, type: "error" }
              : { message: "Every record is saved in Google Drive.", type: "success" },
          );
        } else if (r.status === "busy") {
          fireToast({ message: "A save is already running (probably the scheduled one). Check back in a few minutes.", type: "error" });
        } else if (r.status === "not-connected") {
          fireToast({ message: "Connect Google Drive first.", type: "error" });
        } else {
          fireToast({ message: r.error, type: "error" });
        }
        return;
      }
    } catch {
      fireToast({ message: "The connection dropped. The save is paused and continues next time.", type: "error" });
    } finally {
      if (mounted.current) setRunning(false);
    }
  }

  async function saveSchedule() {
    setSavingSchedule(true);
    try {
      const res = await updateDriveScheduleAction({ enabled, intervalMonths: months, dayOfMonth: day });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      setStatus(res.status);
      setEnabled(res.status.scheduleEnabled);
      setMonths(res.status.intervalMonths);
      setDay(res.status.dayOfMonth);
      fireToast({
        message: res.status.scheduleEnabled ? `Schedule saved: ${describeSchedule(res.status.intervalMonths, res.status.dayOfMonth)}.` : "Automatic save turned off.",
        type: "success",
      });
    } finally {
      setSavingSchedule(false);
    }
  }

  async function disconnect() {
    if (!window.confirm(`Disconnect ${status.accountEmail ?? "Google Drive"}? Files already in Drive stay where they are; nothing new is saved until you reconnect.`)) return;
    setBusy("disconnect");
    try {
      const res = await disconnectDriveAction();
      if (!res.ok) fireToast({ message: res.error, type: "error" });
      else {
        setStatus(res.status);
        fireToast({ message: "Google Drive disconnected.", type: "success" });
      }
    } finally {
      setBusy(null);
    }
  }

  async function refresh() {
    setBusy("refresh");
    try {
      const res = await refreshDriveStatusAction();
      if (res.ok) setStatus(res.status);
      else fireToast({ message: res.error, type: "error" });
    } finally {
      setBusy(null);
    }
  }

  async function download(p: BackupPerson) {
    if (zipFor) return;
    setZipFor(p.id);
    try {
      const res = await downloadRecordsZip(p.id, p.name);
      fireToast(res.ok ? { message: `Downloaded “${res.fileName}”.`, type: "success" } : { message: res.error, type: "error" });
    } finally {
      setZipFor(null);
    }
  }

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return people.filter(
      (p) =>
        (scope === "all" || (scope === "current") === p.isActive) &&
        (!q ||
          p.name.toLowerCase().includes(q) ||
          p.email.toLowerCase().includes(q) ||
          (p.department ?? "").toLowerCase().includes(q)),
    );
  }, [people, query, scope]);
  const formerCount = people.filter((p) => !p.isActive).length;

  const summary = status.lastRunSummary;
  const progress =
    status.inProgress && summary && summary.peopleTotal > 0
      ? Math.min(100, Math.round((summary.peopleDone / summary.peopleTotal) * 100))
      : null;

  return (
    <div className="pb-10">
      <div className="mb-5 mt-2">
        <p className="text-[11px] font-black uppercase tracking-[0.14em]" style={{ color: RED }}>
          HR Records
        </p>
        <h1
          className="mt-1 text-[26px] font-black leading-tight text-ink-strong"
          style={{ fontFamily: "var(--font-display), system-ui, sans-serif" }}
        >
          Records Backup
        </h1>
        <p className="mt-1 max-w-3xl text-[13.5px] font-medium leading-relaxed text-ink-muted">
          Download everything on file for a person in one click, or keep every record saved in Google Drive, with one
          folder per person that stays up to date.
        </p>
      </div>

      {banner && (
        <div
          role="status"
          className="mb-4 flex items-start gap-2.5 rounded-xl border px-4 py-3 text-[13px] font-semibold"
          style={
            banner.tone === "ok"
              ? { background: PILL.ok.bg, color: PILL.ok.fg, borderColor: "#abefc6" }
              : { background: PILL.warn.bg, color: PILL.warn.fg, borderColor: "#fecdca" }
          }
        >
          {banner.tone === "ok" ? <Check size={16} className="mt-0.5 shrink-0" /> : <AlertTriangle size={16} className="mt-0.5 shrink-0" />}
          <span className="flex-1">{banner.text}</span>
          <button type="button" aria-label="Dismiss" onClick={() => setBanner(null)} className="shrink-0 opacity-70 hover:opacity-100">
            <X size={15} />
          </button>
        </div>
      )}

      <div className="grid grid-cols-12 gap-5">
        {/* ── Google Drive ──────────────────────────────────────────────── */}
        <Card
          className="col-span-12 lg:col-span-7"
          icon={<HardDrive size={18} />}
          title="Google Drive"
          sub={`Every record is saved to the “HR Records” folder in ${status.expectedAccount}'s Drive.`}
        >
          <div className="flex flex-wrap items-center gap-2">
            {status.connected ? (
              <Pill tone="ok">
                <Check size={13} strokeWidth={3} /> Connected
              </Pill>
            ) : (
              <Pill tone="idle">Not connected</Pill>
            )}
            {status.inProgress && (
              <Pill tone="busy">
                {running ? <Loader2 size={13} className="animate-spin" /> : <CloudUpload size={13} />} Save in progress
              </Pill>
            )}
            {status.lastError && !running && (
              <Pill tone="warn">
                <AlertTriangle size={13} /> Last save stopped
              </Pill>
            )}
            <button
              type="button"
              onClick={() => void refresh()}
              disabled={busy !== null || running}
              className="ml-auto inline-flex items-center gap-1.5 rounded-pill border border-hairline px-3 py-1 text-[12px] font-bold text-ink-muted transition-colors hover:bg-surface-soft disabled:opacity-50"
            >
              <RefreshCw size={12} className={busy === "refresh" ? "animate-spin" : ""} /> Refresh
            </button>
          </div>

          {status.dummyMode && (
            <p className="mt-3 rounded-lg border border-dashed border-hairline-strong bg-surface-soft px-3 py-2 text-[12px] font-medium text-ink-muted">
              Dummy mode: nothing goes to Google. “Drive” is the folder <code className="font-mono">{status.dummyDriveFolder}</code> on this computer.
            </p>
          )}

          {status.connected ? (
            <p className="mt-3 text-[13px] font-medium text-ink-muted">
              <span className="font-bold text-ink-strong">{status.accountEmail}</span>
              {status.connectedAt ? ` · connected ${istDateTime(status.connectedAt, false)}` : ""}
            </p>
          ) : !status.googleConfigured ? (
            <p className="mt-3 text-[13px] font-medium text-ink-muted">
              Google sign-in isn&rsquo;t configured on this server, so Drive can&rsquo;t be connected yet.
            </p>
          ) : (
            <p className="mt-3 text-[13px] font-medium leading-relaxed text-ink-muted">
              Connect once, signed in to Google as <span className="font-bold text-ink-strong">{status.expectedAccount}</span>. The app can only
              see the folder it creates, not the rest of that Drive.
            </p>
          )}

          <div className="mt-4 flex flex-wrap gap-2.5">
            {status.connected ? (
              <>
                <button
                  type="button"
                  onClick={() => void saveNow()}
                  disabled={running}
                  className="inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13.5px] font-bold text-white transition-opacity hover:opacity-95 disabled:opacity-60"
                  style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})`, boxShadow: "0 10px 22px -14px rgba(168,4,0,0.8)" }}
                >
                  {running ? <Loader2 size={15} className="animate-spin" /> : <CloudUpload size={15} />}
                  {running ? "Saving to Drive…" : status.inProgress ? "Continue saving" : "Save to Drive now"}
                </button>
                <button
                  type="button"
                  onClick={() => void disconnect()}
                  disabled={running || busy !== null}
                  className="inline-flex items-center gap-2 rounded-xl border border-hairline-strong bg-white px-4 py-2.5 text-[13px] font-bold text-ink-strong transition-colors hover:bg-surface-soft disabled:opacity-50"
                >
                  <Unplug size={14} /> Disconnect
                </button>
              </>
            ) : (
              // A plain link: the connect route redirects to Google's consent screen.
              <a
                href={status.googleConfigured ? "/api/hr/records/drive/connect" : undefined}
                aria-disabled={!status.googleConfigured}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13.5px] font-bold text-white transition-opacity hover:opacity-95 ${status.googleConfigured ? "" : "pointer-events-none opacity-50"}`}
                style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})`, boxShadow: "0 10px 22px -14px rgba(168,4,0,0.8)" }}
              >
                <HardDrive size={15} /> Connect Google Drive
              </a>
            )}
          </div>

          {progress !== null && (
            <div className="mt-4">
              <div className="mb-1 flex justify-between text-[12px] font-semibold text-ink-muted">
                <span>
                  {summary!.peopleDone} of {summary!.peopleTotal} people checked
                </span>
                <span>{progress}%</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-surface-soft">
                <div className="h-full rounded-full transition-all" style={{ width: `${progress}%`, background: RED }} />
              </div>
            </div>
          )}

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.1em] text-ink-subtle">Last complete save</p>
              <p className="mt-1 text-[14px] font-bold text-ink-strong">{istDateTime(status.lastCompletedAt)}</p>
              {summary && !status.inProgress && <p className="mt-0.5 text-[12.5px] font-medium text-ink-muted">{summaryText(summary)}</p>}
            </div>
            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.1em] text-ink-subtle">Folder layout</p>
              <div className="mt-1 rounded-lg border border-hairline bg-surface-soft px-3 py-2 font-mono text-[11.5px] leading-[1.7] text-ink-muted">
                <div className="flex items-center gap-1.5 font-bold text-ink-strong">
                  <FolderOpen size={12} /> HR Records
                </div>
                <div className="pl-4">└ Employee Name (email)</div>
                <div className="pl-9">├ Forms: filled forms (PDF)</div>
                <div className="pl-9">├ Documents: scans &amp; IDs</div>
                <div className="pl-9">└ Letters: letters &amp; agreements</div>
              </div>
            </div>
          </div>

          {status.lastError && (
            <p className="mt-4 flex items-start gap-2 rounded-lg px-3 py-2 text-[12.5px] font-semibold" style={{ background: PILL.warn.bg, color: PILL.warn.fg }}>
              <AlertTriangle size={14} className="mt-0.5 shrink-0" /> {status.lastError}
            </p>
          )}

          {summary && summary.failures.length > 0 && (
            <details className="mt-3 rounded-lg border border-hairline px-3 py-2">
              <summary className="cursor-pointer text-[12.5px] font-bold text-ink-strong">
                {`${summary.failed} file${summary.failed === 1 ? "" : "s"} couldn’t be saved in the last run. They’re retried on the next save.`}
              </summary>
              <ul className="mt-2 space-y-1.5">
                {summary.failures.map((f, i) => (
                  <li key={i} className="text-[12px] leading-snug text-ink-muted">
                    <span className="font-bold text-ink-strong">{f.person}</span> · {f.file}
                    <span className="block text-ink-subtle">{f.error}</span>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </Card>

        {/* ── Automatic save ────────────────────────────────────────────── */}
        <Card
          className="col-span-12 lg:col-span-5"
          icon={<CalendarClock size={18} />}
          title="Automatic save"
          sub="Save every record to Drive on a schedule. Only new or changed files are uploaded."
        >
          <label className="flex cursor-pointer items-center justify-between gap-3 rounded-xl border border-hairline px-4 py-3">
            <span>
              <span className="block text-[14px] font-bold text-ink-strong">Save automatically</span>
              <span className="block text-[12px] font-medium text-ink-muted">Runs at about 3 am, India time</span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              onClick={() => setEnabled((v) => !v)}
              className="relative h-6 w-11 shrink-0 rounded-full transition-colors"
              style={{ background: enabled ? RED : "#d4d4d8" }}
            >
              <span
                className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all"
                style={{ left: enabled ? "22px" : "2px" }}
              />
            </button>
          </label>

          <div className={`mt-3 flex flex-wrap items-center gap-2 text-[13.5px] font-semibold text-ink-strong ${enabled ? "" : "opacity-50"}`}>
            <span>Every</span>
            <select
              aria-label="How many months between saves"
              value={months}
              disabled={!enabled}
              onChange={(e) => setMonths(Number(e.target.value))}
              className="rounded-lg border border-hairline-strong bg-white px-2.5 py-1.5 text-[13.5px] font-bold"
            >
              {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <span>{months === 1 ? "month" : "months"}, on day</span>
            <select
              aria-label="Day of the month"
              value={day}
              disabled={!enabled}
              onChange={(e) => setDay(Number(e.target.value))}
              className="rounded-lg border border-hairline-strong bg-white px-2.5 py-1.5 text-[13.5px] font-bold"
            >
              {Array.from({ length: 28 }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
          <p className="mt-2 text-[12px] font-medium text-ink-subtle">Days 29–31 aren&rsquo;t offered so February is never skipped.</p>

          <div className="mt-4 rounded-xl bg-surface-soft px-4 py-3">
            <p className="text-[11px] font-black uppercase tracking-[0.1em] text-ink-subtle">Next automatic save</p>
            <p className="mt-1 text-[14px] font-bold text-ink-strong">
              {!status.scheduleEnabled
                ? "Off: records are saved only when you click Save to Drive now"
                : !status.connected
                  ? "Waiting for Google Drive to be connected"
                  : istDateTime(status.nextRunAt)}
            </p>
            {status.scheduleEnabled && (
              <p className="mt-0.5 text-[12px] font-medium text-ink-muted">{describeSchedule(status.intervalMonths, status.dayOfMonth)}</p>
            )}
          </div>

          <button
            type="button"
            onClick={() => void saveSchedule()}
            disabled={!scheduleDirty || savingSchedule}
            className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#18181b] px-4 py-2.5 text-[13px] font-bold text-white transition-colors hover:bg-black disabled:opacity-40"
          >
            {savingSchedule ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />} Save schedule
          </button>
        </Card>

        {/* ── Download ──────────────────────────────────────────────────── */}
        <Card
          className="col-span-12"
          icon={<FileArchive size={18} />}
          title="Download a person's records"
          sub="One ZIP with every filled form (as PDF), scanned document and letter, in the same folders as Drive."
        >
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative min-w-[220px] flex-1">
              <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search by name, email or department"
                className="w-full rounded-xl border border-hairline-strong bg-white py-2 pl-9 pr-3 text-[13.5px] font-medium outline-none focus:border-ink-muted"
              />
            </div>
            <div className="inline-flex rounded-xl border border-hairline p-0.5">
              {(
                [
                  ["all", `All (${people.length})`],
                  ["current", `Current (${people.length - formerCount})`],
                  ["former", `Former (${formerCount})`],
                ] as const
              ).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setScope(key)}
                  className="rounded-lg px-3 py-1.5 text-[12.5px] font-bold transition-colors"
                  style={scope === key ? { background: "#18181b", color: "#fff" } : { color: "#52525b" }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-hairline">
            <table className="w-full min-w-[560px] text-left">
              <thead className="bg-surface-soft text-[11px] font-black uppercase tracking-[0.08em] text-ink-subtle">
                <tr>
                  <th className="px-4 py-2.5">Person</th>
                  <th className="px-4 py-2.5">Department</th>
                  <th className="px-4 py-2.5">Status</th>
                  <th className="px-4 py-2.5 text-right">Records</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => (
                  <tr key={p.id} className="border-t border-hairline">
                    <td className="px-4 py-2.5">
                      <span className="block text-[13.5px] font-bold text-ink-strong">{p.name}</span>
                      <span className="block text-[12px] font-medium text-ink-muted">{p.email}</span>
                    </td>
                    <td className="px-4 py-2.5 text-[13px] font-medium text-ink-muted">{p.department || "—"}</td>
                    <td className="px-4 py-2.5">
                      {p.isActive ? <Pill tone="ok">Current</Pill> : <Pill tone="idle">Former</Pill>}
                    </td>
                    <td className="px-4 py-2.5 text-right">
                      <button
                        type="button"
                        onClick={() => void download(p)}
                        disabled={zipFor !== null}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-white px-3 py-1.5 text-[12.5px] font-bold text-ink-strong transition-colors hover:bg-surface-soft disabled:opacity-50"
                      >
                        {zipFor === p.id ? <Loader2 size={13} className="animate-spin" /> : <FileArchive size={13} />}
                        {zipFor === p.id ? "Preparing…" : "Download ZIP"}
                      </button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-8 text-center text-[13px] font-medium text-ink-muted">
                      Nobody matches that search.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </Card>
      </div>
    </div>
  );
}
