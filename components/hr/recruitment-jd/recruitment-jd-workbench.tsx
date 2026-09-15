"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Check,
  Copy,
  History,
  Lock,
  Mail,
  MessageCircle,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  TriangleAlert,
  X,
} from "lucide-react";
import { fireToast } from "@/lib/toast";
import {
  JD_FIELDS,
  WHATSAPP_SOFT_LIMIT,
  effectiveRecruiterJd,
  emptyJdContent,
  isJdBlank,
  isValidEmail,
  jdWhatsAppText,
  normalizeWhatsAppPhone,
  whatsAppLink,
  type JdContent,
} from "@/lib/hr/recruitment-jd";
import type { RecruitmentJdRow, RecruitmentJdSendRow } from "@/lib/queries/recruitment-jd";
import {
  logRecruitmentJdWhatsApp,
  resetRecruitmentJd,
  saveRecruitmentJd,
  sendRecruitmentJdByEmail,
} from "@/app/(app)/hr/recruitment-jd/actions";
import { addInterviewPosition } from "@/app/(app)/hr/candidate-actions";

/**
 * RECRUITMENT JDs — positions on the left; the selected position's Recruiter
 * JD, Master JD, Send and History on the right.
 */

const ACCENT = "#E10600";
const ACCENT_DEEP = "#A80400";
const CARD = "rounded-2xl border border-hairline bg-surface-card";
const INPUT =
  "w-full rounded-xl border border-hairline-strong bg-white px-3 py-2 text-[14px] text-ink-strong outline-none transition focus:border-transparent focus:ring-2 focus:ring-[#E10600]/35";

type Tab = "recruiter" | "master" | "send" | "history";

function fmtWhen(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toLocaleString("en-IN", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function statusOf(r: RecruitmentJdRow): { label: string; tone: string } {
  if (!r.master && !r.recruiter) return { label: "No JD yet", tone: "#94A3B8" };
  if (r.recruiter) return { label: "Recruiter edited", tone: "#B45309" };
  return { label: "Master", tone: "#15803D" };
}

export function RecruitmentJdWorkbench({
  rows,
  sends,
  missing,
}: {
  rows: RecruitmentJdRow[];
  sends: RecruitmentJdSendRow[];
  missing: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string>(rows[0]?.positionId ?? "");
  const [tab, setTab] = React.useState<Tab>("recruiter");
  const [adding, setAdding] = React.useState(false);
  const [newLabel, setNewLabel] = React.useState("");
  const [pending, start] = React.useTransition();

  const shown = rows.filter((r) => r.label.toLowerCase().includes(query.trim().toLowerCase()));
  const selected = rows.find((r) => r.positionId === selectedId) ?? rows[0] ?? null;
  const sendsFor = selected ? sends.filter((s) => s.positionLabel === selected.label) : [];

  function addPosition() {
    const label = newLabel.trim();
    if (!label) return;
    start(async () => {
      const res = await addInterviewPosition(label);
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: `${label} added.`, type: "success" });
      setNewLabel("");
      setAdding(false);
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[13.5px] text-ink-muted">
        The job descriptions recruiters send candidates — one per position. Each has a locked <b>Master</b> and a{" "}
        <b>Recruiter</b> copy you can edit freely. Separate from the internal Job Description module.
      </p>

      {missing && (
        <p className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13.5px] font-semibold" style={{ background: "#FFFBEB", color: "#92400E", boxShadow: "inset 0 0 0 1px #FCD34D" }}>
          <TriangleAlert size={16} className="shrink-0" /> Saving and sending need migration 0232 applied to the database first.
        </p>
      )}

      <div className="grid grid-cols-[300px_1fr] gap-4 max-lg:grid-cols-1">
        {/* ── Positions ── */}
        <aside className={`${CARD} flex flex-col p-3`}>
          <label className="relative mb-2 block">
            <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search positions" className={`${INPUT} pl-9`} aria-label="Search positions" />
          </label>
          <ul className="flex max-h-[60vh] flex-col gap-1 overflow-y-auto max-lg:max-h-[240px]">
            {shown.map((r) => {
              const on = r.positionId === selected?.positionId;
              const st = statusOf(r);
              return (
                <li key={r.positionId}>
                  <button
                    type="button"
                    onClick={() => setSelectedId(r.positionId)}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left transition-colors hover:bg-black/[0.03]"
                    style={on ? { background: `color-mix(in srgb, ${ACCENT} 8%, transparent)`, boxShadow: `inset 0 0 0 1px color-mix(in srgb, ${ACCENT} 30%, transparent)` } : undefined}
                    aria-current={on ? "true" : undefined}
                  >
                    <span className="min-w-0 flex-1 truncate text-[14px] font-bold text-ink-strong">{r.label}</span>
                    <span className="size-2 shrink-0 rounded-full" style={{ background: st.tone }} title={st.label} />
                  </button>
                </li>
              );
            })}
            {shown.length === 0 && <li className="px-3 py-4 text-center text-[13px] text-ink-subtle">No position matches.</li>}
          </ul>

          {adding ? (
            <div className="mt-2 flex gap-1.5">
              <input autoFocus value={newLabel} onChange={(e) => setNewLabel(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addPosition()} placeholder="New position" className={INPUT} aria-label="New position" />
              <button type="button" onClick={addPosition} disabled={pending || !newLabel.trim()} className="rounded-xl px-3 text-white disabled:opacity-50" style={{ background: ACCENT }} aria-label="Add position">
                <Check size={16} />
              </button>
              <button type="button" onClick={() => setAdding(false)} className="rounded-xl px-2 text-ink-subtle hover:bg-black/5" aria-label="Cancel">
                <X size={16} />
              </button>
            </div>
          ) : (
            <button type="button" onClick={() => setAdding(true)} className="mt-2 inline-flex items-center gap-1.5 self-start rounded-lg px-2 py-1.5 text-[13px] font-bold" style={{ color: ACCENT }}>
              <Plus size={14} strokeWidth={2.6} /> Add position
            </button>
          )}
          <p className="mt-2 px-1 text-[11.5px] text-ink-subtle">Positions are the Candidate Interview Form&apos;s list — adding one here adds it there too.</p>
        </aside>

        {/* ── The selected position ── */}
        {selected ? (
          <section className={`${CARD} min-w-0 p-5 max-md:p-4`} key={selected.positionId}>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <h2 className="text-[20px] font-black tracking-tight text-ink-strong">{selected.label}</h2>
              <span className="rounded-full px-2.5 py-0.5 text-[12px] font-bold" style={{ background: `color-mix(in srgb, ${statusOf(selected).tone} 14%, transparent)`, color: statusOf(selected).tone }}>
                {statusOf(selected).label}
              </span>
            </div>

            <div className="mb-4 flex flex-wrap gap-1 border-b border-hairline" role="tablist">
              {(
                [
                  { id: "recruiter", label: "Recruiter JD", Icon: Pencil },
                  { id: "master", label: "Master JD", Icon: Lock },
                  { id: "send", label: "Send", Icon: MessageCircle },
                  { id: "history", label: `History (${sendsFor.length})`, Icon: History },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                  className="-mb-px inline-flex items-center gap-1.5 border-b-2 px-3 py-2 text-[13.5px] font-bold transition-colors"
                  style={tab === t.id ? { borderColor: ACCENT, color: ACCENT_DEEP } : { borderColor: "transparent", color: "var(--color-ink-soft)" }}
                >
                  <t.Icon size={14} /> {t.label}
                </button>
              ))}
            </div>

            {tab === "recruiter" && <RecruiterTab row={selected} />}
            {tab === "master" && <MasterTab row={selected} />}
            {tab === "send" && <SendTab row={selected} />}
            {tab === "history" && <HistoryTab sends={sendsFor} />}
          </section>
        ) : (
          <section className={`${CARD} p-10 text-center text-[14px] text-ink-subtle`}>Add a position to start.</section>
        )}
      </div>
    </div>
  );
}

/* ── Recruiter JD ───────────────────────────────────────────────────────── */

function RecruiterTab({ row }: { row: RecruitmentJdRow }) {
  const router = useRouter();
  const base = effectiveRecruiterJd(row.master, row.recruiter) ?? emptyJdContent(row.label);
  const [pending, start] = React.useTransition();

  function save(content: JdContent) {
    start(async () => {
      const res = await saveRecruitmentJd({ positionId: row.positionId, which: "recruiter", content });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: "Recruiter JD saved. The master is unchanged.", type: "success" });
      router.refresh();
    });
  }
  function reset() {
    if (!window.confirm("Throw away the recruiter edits and go back to the master JD?")) return;
    start(async () => {
      const res = await resetRecruitmentJd({ positionId: row.positionId });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: "Back to the master JD.", type: "success" });
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-ink-muted">
        {row.recruiter
          ? `Edited from the master${row.recruiterUpdatedBy ? ` by ${row.recruiterUpdatedBy}` : ""}${row.recruiterUpdatedAt ? `, ${fmtWhen(row.recruiterUpdatedAt)}` : ""}. This is what gets sent.`
          : row.master
            ? "Same as the master right now. Edit freely — the master stays as it is."
            : "No JD written yet. Write it here, or fill the Master JD first."}
      </p>
      <JdEditor initial={base} pending={pending} saveLabel="Save recruiter JD" onSave={save}>
        {row.recruiter && row.master && (
          <button type="button" onClick={reset} disabled={pending} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13.5px] font-bold text-ink-soft hover:bg-black/5">
            <RotateCcw size={14} /> Reset to master
          </button>
        )}
      </JdEditor>
    </div>
  );
}

/* ── Master JD ──────────────────────────────────────────────────────────── */

function MasterTab({ row }: { row: RecruitmentJdRow }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [pending, start] = React.useTransition();

  function save(content: JdContent) {
    start(async () => {
      const res = await saveRecruitmentJd({ positionId: row.positionId, which: "master", content });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: "Master JD saved.", type: "success" });
      setEditing(false);
      router.refresh();
    });
  }

  if (editing) {
    return (
      <div className="flex flex-col gap-3">
        <p className="flex items-center gap-2 rounded-xl px-3 py-2 text-[13px] font-semibold" style={{ background: "#FEF2F2", color: "#991B1B" }}>
          <TriangleAlert size={15} /> You are editing the MASTER. {row.recruiter ? "The recruiter copy keeps its own edits." : "Recruiters will send the new version."}
        </p>
        <JdEditor initial={row.master ?? emptyJdContent(row.label)} pending={pending} saveLabel="Save master" onSave={save}>
          <button type="button" onClick={() => setEditing(false)} className="rounded-xl px-3 py-2 text-[13.5px] font-bold text-ink-soft hover:bg-black/5">
            Cancel
          </button>
        </JdEditor>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-[13px] text-ink-muted">
          {row.master
            ? `The original${row.masterUpdatedBy ? ` — last changed by ${row.masterUpdatedBy}` : ""}${row.masterUpdatedAt ? `, ${fmtWhen(row.masterUpdatedAt)}` : ""}.`
            : "No master yet. Paste the original JD here once it arrives."}
        </p>
        <button
          type="button"
          onClick={() => {
            if (!row.master || window.confirm("Edit the MASTER JD? Recruiters normally edit their own copy instead.")) setEditing(true);
          }}
          className="ml-auto inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13.5px] font-bold text-ink-soft"
          style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)" }}
        >
          <Lock size={14} /> {row.master ? "Edit master" : "Write master"}
        </button>
      </div>
      {row.master ? <JdPreview content={row.master} /> : null}
    </div>
  );
}

/* ── Send ───────────────────────────────────────────────────────────────── */

function SendTab({ row }: { row: RecruitmentJdRow }) {
  const router = useRouter();
  const content = effectiveRecruiterJd(row.master, row.recruiter);
  const [waName, setWaName] = React.useState("");
  const [waPhone, setWaPhone] = React.useState("");
  const [mailName, setMailName] = React.useState("");
  const [mailTo, setMailTo] = React.useState("");
  const [note, setNote] = React.useState("");
  const [pending, start] = React.useTransition();

  if (!content || isJdBlank(content)) {
    return <p className="rounded-xl bg-surface-soft px-4 py-6 text-center text-[14px] text-ink-subtle">Write this position&apos;s JD first — there&apos;s nothing to send yet.</p>;
  }

  const text = jdWhatsAppText(content, { recipientName: waName });
  const phone = normalizeWhatsAppPhone(waPhone);
  const phoneProblem = waPhone.trim() && !phone ? "That doesn't look like a phone number." : null;

  function openWhatsApp() {
    // Open from the click itself, or the browser blocks the popup.
    window.open(whatsAppLink(phone, text), "_blank", "noopener,noreferrer");
    void logRecruitmentJdWhatsApp({ positionId: row.positionId, recipientName: waName, phone: waPhone }).then((res) => {
      if (!res.ok) fireToast({ message: `WhatsApp opened, but the send wasn't recorded: ${res.error}`, type: "error" });
      else router.refresh();
    });
  }

  function sendEmail() {
    if (!isValidEmail(mailTo)) {
      fireToast({ message: "Enter a valid email address.", type: "error" });
      return;
    }
    start(async () => {
      const res = await sendRecruitmentJdByEmail({ positionId: row.positionId, to: mailTo, recipientName: mailName, note });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: `JD emailed to ${mailTo}.`, type: "success" });
      setMailTo("");
      setMailName("");
      setNote("");
      router.refresh();
    });
  }

  return (
    <div className="grid grid-cols-2 gap-4 max-xl:grid-cols-1">
      <div className="flex flex-col gap-4">
        <div className="rounded-xl p-4" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
          <h3 className="mb-3 flex items-center gap-2 text-[14.5px] font-extrabold text-ink-strong">
            <MessageCircle size={16} style={{ color: "#16A34A" }} /> WhatsApp
          </h3>
          <div className="grid grid-cols-2 gap-2 max-sm:grid-cols-1">
            <input value={waName} onChange={(e) => setWaName(e.target.value)} placeholder="Name (optional)" className={INPUT} aria-label="WhatsApp recipient name" />
            <input value={waPhone} onChange={(e) => setWaPhone(e.target.value)} placeholder="Phone (optional)" inputMode="tel" className={INPUT} aria-label="WhatsApp phone" />
          </div>
          <p className="mt-2 text-[12px] text-ink-subtle">
            {phoneProblem ?? (phone ? `Opens a chat with +${phone}.` : "No number? WhatsApp will ask which contact to send it to.")}
          </p>
          {text.length > WHATSAPP_SOFT_LIMIT && (
            <p className="mt-1 text-[12px] font-semibold text-[#B45309]">This JD is long for WhatsApp — some phones may cut it. Consider shortening the recruiter copy.</p>
          )}
          <button
            type="button"
            onClick={openWhatsApp}
            disabled={Boolean(phoneProblem)}
            className="mt-3 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[14px] font-bold text-white disabled:opacity-50"
            style={{ background: "linear-gradient(135deg, #22C55E, #15803D)" }}
          >
            <MessageCircle size={16} /> Open WhatsApp
          </button>
        </div>

        <div className="rounded-xl p-4" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
          <h3 className="mb-3 flex items-center gap-2 text-[14.5px] font-extrabold text-ink-strong">
            <Mail size={16} style={{ color: ACCENT }} /> Email
          </h3>
          <div className="grid grid-cols-2 gap-2 max-sm:grid-cols-1">
            <input value={mailName} onChange={(e) => setMailName(e.target.value)} placeholder="Name (optional)" className={INPUT} aria-label="Email recipient name" />
            <input value={mailTo} onChange={(e) => setMailTo(e.target.value)} placeholder="Email address" type="email" className={INPUT} aria-label="Email address" />
          </div>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Personal note above the JD (optional)" rows={3} className={`${INPUT} mt-2`} aria-label="Personal note" />
          <button
            type="button"
            onClick={sendEmail}
            disabled={pending || !mailTo.trim()}
            className="mt-3 inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-[14px] font-bold text-white disabled:opacity-50"
            style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
          >
            <Mail size={16} /> {pending ? "Sending…" : "Send email"}
          </button>
        </div>
      </div>

      <div className="flex min-w-0 flex-col gap-2">
        <div className="flex items-center gap-2">
          <h3 className="text-[13px] font-extrabold uppercase tracking-[0.08em] text-ink-subtle">What gets sent</h3>
          <button
            type="button"
            onClick={() => {
              void navigator.clipboard.writeText(text).then(() => fireToast({ message: "JD copied.", type: "success" }));
            }}
            className="ml-auto inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[12.5px] font-bold text-ink-soft hover:bg-black/5"
          >
            <Copy size={13} /> Copy text
          </button>
        </div>
        <pre className="max-h-[520px] overflow-auto whitespace-pre-wrap rounded-xl bg-surface-soft p-4 font-sans text-[13px] leading-relaxed text-ink-strong">{text}</pre>
        <p className="text-[12px] text-ink-subtle">{row.recruiter ? "The recruiter copy." : "The master (no recruiter edits)."}</p>
      </div>
    </div>
  );
}

/* ── History ────────────────────────────────────────────────────────────── */

function HistoryTab({ sends }: { sends: RecruitmentJdSendRow[] }) {
  if (sends.length === 0) return <p className="rounded-xl bg-surface-soft px-4 py-6 text-center text-[14px] text-ink-subtle">Not sent to anyone yet.</p>;
  return (
    <div className="overflow-x-auto rounded-xl" style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}>
      <table className="w-full min-w-[640px] text-[13.5px]">
        <thead>
          <tr className="border-b border-hairline bg-surface-soft text-left text-[10.5px] font-bold uppercase tracking-wider text-ink-subtle">
            <th className="px-3 py-2.5">When</th>
            <th className="px-3 py-2.5">To</th>
            <th className="px-3 py-2.5">How</th>
            <th className="px-3 py-2.5">Status</th>
            <th className="px-3 py-2.5">By</th>
          </tr>
        </thead>
        <tbody>
          {sends.map((s) => (
            <tr key={s.id} className="border-b border-hairline last:border-b-0">
              <td className="px-3 py-2.5 tabular-nums text-ink-soft">{fmtWhen(s.sentAt)}</td>
              <td className="px-3 py-2.5">
                <div className="font-semibold text-ink-strong">{s.recipientName || "—"}</div>
                <div className="text-[12px] text-ink-subtle">{s.channel === "email" ? s.recipientEmail : s.recipientPhone ? `+${s.recipientPhone.replace(/^\+/, "")}` : "Contact picked in WhatsApp"}</div>
              </td>
              <td className="px-3 py-2.5">{s.channel === "email" ? "Email" : "WhatsApp"}</td>
              <td className="px-3 py-2.5">
                {s.status === "sent" ? (
                  <span className="font-bold text-[#15803D]">Sent</span>
                ) : s.status === "opened" ? (
                  <span className="font-bold text-[#15803D]" title="WhatsApp was opened with the JD typed in">Opened in WhatsApp</span>
                ) : (
                  <span className="font-bold text-altus-red" title={s.error ?? undefined}>Failed</span>
                )}
              </td>
              <td className="px-3 py-2.5 text-ink-soft">{s.sentBy ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ── Editor + preview ───────────────────────────────────────────────────── */

function JdEditor({
  initial,
  pending,
  saveLabel,
  onSave,
  children,
}: {
  initial: JdContent;
  pending: boolean;
  saveLabel: string;
  onSave: (c: JdContent) => void;
  children?: React.ReactNode;
}) {
  const [c, setC] = React.useState<JdContent>(initial);
  const dirty = JD_FIELDS.some((f) => c[f.key] !== initial[f.key]);

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
        {JD_FIELDS.map((f) => (
          <label key={f.key} className={f.kind === "line" ? "block" : "col-span-2 block max-md:col-span-1"}>
            <span className="mb-1 block text-[12.5px] font-bold text-ink-strong">
              {f.label}
              {f.kind === "list" && <span className="ml-1.5 font-medium text-ink-subtle">— one per line</span>}
            </span>
            {f.kind === "line" ? (
              <input value={c[f.key]} onChange={(e) => setC({ ...c, [f.key]: e.target.value })} placeholder={f.placeholder} className={INPUT} />
            ) : (
              <textarea
                value={c[f.key]}
                onChange={(e) => setC({ ...c, [f.key]: e.target.value })}
                placeholder={f.placeholder}
                rows={f.kind === "list" ? 5 : 3}
                className={INPUT}
              />
            )}
          </label>
        ))}
      </div>
      <div className="sticky bottom-0 flex flex-wrap items-center gap-2 border-t border-hairline bg-surface-card pt-3">
        {children}
        <span className="ml-auto text-[12.5px] text-ink-subtle">{dirty ? "Unsaved changes" : ""}</span>
        <button
          type="button"
          onClick={() => onSave(c)}
          disabled={pending || !dirty}
          className="inline-flex items-center gap-1.5 rounded-xl px-4 py-2 text-[14px] font-bold text-white disabled:opacity-50"
          style={{ background: `linear-gradient(135deg, ${ACCENT}, ${ACCENT_DEEP})` }}
        >
          <Check size={15} /> {pending ? "Saving…" : saveLabel}
        </button>
      </div>
    </div>
  );
}

function JdPreview({ content }: { content: JdContent }) {
  return (
    <div className="flex flex-col gap-3 rounded-xl bg-surface-soft p-4">
      <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 max-md:grid-cols-1">
        {JD_FIELDS.filter((f) => f.kind === "line" && content[f.key].trim()).map((f) => (
          <div key={f.key} className="text-[13.5px]">
            <span className="text-ink-subtle">{f.label}: </span>
            <span className="font-semibold text-ink-strong">{content[f.key]}</span>
          </div>
        ))}
      </div>
      {JD_FIELDS.filter((f) => f.kind !== "line" && content[f.key].trim()).map((f) => (
        <div key={f.key}>
          <h4 className="mb-1 text-[13px] font-extrabold text-ink-strong">{f.label}</h4>
          <p className="whitespace-pre-wrap text-[13.5px] leading-relaxed text-ink-soft">{content[f.key]}</p>
        </div>
      ))}
    </div>
  );
}
