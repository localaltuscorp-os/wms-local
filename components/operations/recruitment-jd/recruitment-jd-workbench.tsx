"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Briefcase,
  Check,
  ChevronDown,
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
  UserPlus,
  X,
} from "lucide-react";
import { fireToast } from "@/lib/toast";
import { MastersHeader } from "@/components/operations/masters/masters-header";
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
} from "@/lib/operations/recruitment-jd";
import type { RecruitmentJdRow, RecruitmentJdSendRow } from "@/lib/queries/recruitment-jd";
import {
  addRecruitmentJdRole,
  logRecruitmentJdWhatsApp,
  resetRecruitmentJd,
  restoreRecruitmentJdMaster,
  saveRecruitmentJd,
  sendRecruitmentJdByEmail,
} from "@/app/(app)/operations/masters/recruitment-jd/actions";

/**
 * RECRUITMENT JDs — the page heading with the role dropdown beside it, and the
 * selected role's Recruiter JD, Master JD, Send and History below.
 *
 * `canEdit` (HR staff, resolved by the page) decides what is DRAWN, never what
 * is allowed: every action re-checks for itself in actions.ts. Without it the
 * whole thing reads, which is the point of the section sitting in Operations →
 * Masters — anyone asked to refer a candidate can see what we are advertising
 * without being handed buttons that would refuse them.
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
  canEdit = true,
}: {
  rows: RecruitmentJdRow[];
  sends: RecruitmentJdSendRow[];
  missing: boolean;
  /** HR staff. False = read the JDs, change and send nothing. */
  canEdit?: boolean;
}) {
  const [selectedId, setSelectedId] = React.useState<string>(rows[0]?.slug ?? "");
  const [tab, setTab] = React.useState<Tab>("recruiter");

  const selected = rows.find((r) => r.slug === selectedId) ?? rows[0] ?? null;
  const sendsFor = selected ? sends.filter((s) => s.positionLabel === selected.title) : [];

  return (
    <>
      <MastersHeader
        Icon={UserPlus}
        topic="Job Description"
        title="JD-For Recruitment"
        actions={
          <RolePicker rows={rows} selectedSlug={selected?.slug ?? ""} onChange={setSelectedId} canEdit={canEdit} />
        }
      />

      <div className="flex flex-col gap-4">
        {!canEdit && (
          <p className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13.5px] font-semibold" style={{ background: "#F1F5F9", color: "#334155", boxShadow: "inset 0 0 0 1px #CBD5E1" }}>
            <Lock size={15} className="shrink-0" /> Read-only — HR writes these JDs and sends them. Everything here is yours to read and copy.
          </p>
        )}

        {missing && (
          <p className="flex items-center gap-2 rounded-xl px-4 py-2.5 text-[13.5px] font-semibold" style={{ background: "#FFFBEB", color: "#92400E", boxShadow: "inset 0 0 0 1px #FCD34D" }}>
            <TriangleAlert size={16} className="shrink-0" /> Saving and sending need migration 0236_recruitment_jd_roles.sql applied to the database first.
          </p>
        )}

        {/* ── The selected role ── */}
        {selected ? (
          <section className={`${CARD} min-w-0 p-5 max-md:p-4`} key={selected.slug}>
            <div className="mb-4 flex flex-wrap items-center gap-3">
              <h2 className="text-[20px] font-black tracking-tight text-ink-strong">{selected.title}</h2>
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

            {tab === "recruiter" && <RecruiterTab row={selected} canEdit={canEdit} />}
            {tab === "master" && <MasterTab row={selected} canEdit={canEdit} />}
            {tab === "send" && <SendTab row={selected} canEdit={canEdit} />}
            {tab === "history" && <HistoryTab sends={sendsFor} />}
          </section>
        ) : (
          <section className={`${CARD} p-10 text-center text-[14px] text-ink-subtle`}>
            {canEdit ? "No roles yet — add one from the dropdown above." : "No roles yet."}
          </section>
        )}
      </div>
    </>
  );
}

/* ── Role picker ────────────────────────────────────────────────────────── */

/**
 * WHICH ROLE — the role list as a dropdown beside the page heading (account
 * holder, 2026-09-18). It was a 300px column down the left of the page; like
 * the person picker on JD-Specific Person, it is touched once and then ignored,
 * and it was taking that width away from the JD itself.
 *
 * Built by hand for the same reason as JdPersonPicker — a native <select>
 * cannot carry the search box, the status under each role, or Add role — and
 * with the same keyboard:
 *   ↑ ↓        move the highlight, scrolling it into view
 *   Enter      choose the highlighted role
 *   Escape     close and hand focus back to the button
 *   click-away close
 * Add role sits in the footer, drawn for HR staff only; the action re-checks.
 */
function RolePicker({
  rows,
  selectedSlug,
  onChange,
  canEdit,
}: {
  rows: RecruitmentJdRow[];
  selectedSlug: string;
  onChange: (slug: string) => void;
  canEdit: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [active, setActive] = React.useState(0);
  const [adding, setAdding] = React.useState(false);
  const [newTitle, setNewTitle] = React.useState("");
  const [pending, start] = React.useTransition();

  const rootRef = React.useRef<HTMLDivElement>(null);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const searchRef = React.useRef<HTMLInputElement>(null);
  const listRef = React.useRef<HTMLUListElement>(null);

  const selected = rows.find((r) => r.slug === selectedSlug) ?? null;
  const list = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? rows.filter((r) => r.title.toLowerCase().includes(q)) : rows;
  }, [rows, query]);

  // Derived, not corrected by an effect — see JdPersonPicker.
  const activeIdx = list.length === 0 ? -1 : Math.min(active, list.length - 1);

  const close = React.useCallback(() => {
    setOpen(false);
    setQuery("");
    setAdding(false);
    setNewTitle("");
  }, []);

  React.useEffect(() => {
    if (!open) return;
    function onPointerDown(e: PointerEvent) {
      if (!rootRef.current?.contains(e.target as Node)) close();
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open, close]);

  React.useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => searchRef.current?.focus(), 0);
    return () => window.clearTimeout(t);
  }, [open]);

  React.useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-idx="${activeIdx}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [activeIdx, open]);

  function openNow() {
    const at = list.findIndex((r) => r.slug === selectedSlug);
    setActive(at >= 0 ? at : 0);
    setOpen(true);
  }

  function choose(slug: string) {
    onChange(slug);
    close();
    buttonRef.current?.focus();
  }

  function onSearchKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") {
      e.preventDefault();
      if (list.length === 0) return;
      const from = activeIdx < 0 ? 0 : activeIdx;
      setActive(e.key === "ArrowDown" ? (from + 1) % list.length : (from - 1 + list.length) % list.length);
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const r = activeIdx >= 0 ? list[activeIdx] : undefined;
      if (r) choose(r.slug);
    }
  }

  function addRole() {
    const label = newTitle.trim();
    if (!label) return;
    start(async () => {
      const res = await addRecruitmentJdRole({ title: label });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: `${label} added.`, type: "success" });
      // Open the new role: it lands in `rows` once the refresh arrives.
      onChange(res.slug);
      close();
      router.refresh();
    });
  }


  return (
    <div ref={rootRef} className="relative max-w-full">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? close() : openNow())}
        onKeyDown={(e) => {
          // Arrowing from the closed trigger opens it, as a select does.
          if (!open && (e.key === "ArrowDown" || e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            openNow();
          }
        }}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls="rjd-role-listbox"
        aria-label={selected ? `Showing ${selected.title}. Change role` : "Choose a role"}
        className="inline-flex w-[340px] max-w-full items-center gap-2.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-left shadow-sm transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
      >
        {/* The same trigger as JD-Specific Person's picker — circle, SHOWING,
            name, chevron — so the two JD pages read as one family. */}
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600">
          <Briefcase className="h-4 w-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-500">Showing</span>
          <span className="block truncate text-[14px] font-bold text-slate-900">
            {selected ? selected.title : rows.length > 0 ? "Choose a role" : "No roles yet"}
          </span>
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              close();
              buttonRef.current?.focus();
            }
          }}
          className="absolute right-0 z-50 mt-1.5 w-[380px] max-w-[calc(100vw-32px)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
        >
          <div className="border-b border-slate-100 p-2.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                ref={searchRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onSearchKeyDown}
                placeholder={`Search ${rows.length} roles`}
                aria-label="Search roles"
                aria-controls="rjd-role-listbox"
                className="w-full rounded-lg border border-slate-300 py-2 pl-8 pr-3 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200"
              />
            </div>
          </div>

          {/* max-h in rem, not vh, so the popover cannot outgrow a laptop screen
              and lose its Add role footer. */}
          <ul
            ref={listRef}
            id="rjd-role-listbox"
            role="listbox"
            aria-label="Roles"
            className="max-h-[22rem] overflow-y-auto overscroll-contain p-1.5"
          >
            {list.map((r, i) => {
              const s = statusOf(r);
              const isSelected = r.slug === selectedSlug;
              return (
                <li key={r.slug}>
                  <button
                    type="button"
                    data-idx={i}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => choose(r.slug)}
                    onPointerMove={() => setActive(i)}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${
                      i === activeIdx ? "bg-slate-100" : ""
                    } ${isSelected ? "ring-1 ring-red-200" : ""}`}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[13px] font-semibold text-slate-800">{r.title}</span>
                      <span className="mt-0.5 flex items-center gap-1.5 text-[11px] text-slate-500">
                        <span className="size-1.5 shrink-0 rounded-full" style={{ background: s.tone }} />
                        {s.label}
                      </span>
                    </span>
                    {isSelected && <Check className="h-4 w-4 shrink-0 text-red-600" />}
                  </button>
                </li>
              );
            })}
            {list.length === 0 && (
              <li className="px-2 py-6 text-center text-[12.5px] text-slate-500">
                {rows.length === 0 ? "No roles yet." : "No role matches."}
              </li>
            )}
          </ul>

          {canEdit && (
            <div className="border-t border-slate-100 p-2">
              {adding ? (
                <div className="flex gap-1.5">
                  <input
                    autoFocus
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        addRole();
                      } else if (e.key === "Escape") {
                        // Cancel the new role, not the whole dropdown.
                        e.preventDefault();
                        e.stopPropagation();
                        setAdding(false);
                        setNewTitle("");
                      }
                    }}
                    placeholder="New role"
                    aria-label="New role"
                    className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-[13px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-200"
                  />
                  <button type="button" onClick={addRole} disabled={pending || !newTitle.trim()} className="rounded-lg px-3 text-white disabled:opacity-50" style={{ background: ACCENT }} aria-label="Add role">
                    <Check size={16} />
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAdding(false);
                      setNewTitle("");
                    }}
                    className="rounded-lg px-2 text-slate-400 hover:bg-slate-100"
                    aria-label="Cancel"
                  >
                    <X size={16} />
                  </button>
                </div>
              ) : (
                <button type="button" onClick={() => setAdding(true)} className="inline-flex w-full items-center gap-1.5 rounded-lg px-2.5 py-2 text-[13px] font-bold hover:bg-slate-50" style={{ color: ACCENT }}>
                  <Plus size={14} strokeWidth={2.6} /> Add role
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Recruiter JD ───────────────────────────────────────────────────────── */

function RecruiterTab({ row, canEdit }: { row: RecruitmentJdRow; canEdit: boolean }) {
  const router = useRouter();
  const base = effectiveRecruiterJd(row.master, row.recruiter) ?? emptyJdContent(row.title);
  const [pending, start] = React.useTransition();

  function save(content: JdContent) {
    start(async () => {
      const res = await saveRecruitmentJd({ slug: row.slug, which: "recruiter", content });
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
      const res = await resetRecruitmentJd({ slug: row.slug });
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
      {!canEdit ? (
        isJdBlank(base) ? (
          <p className="rounded-xl bg-surface-soft px-4 py-6 text-center text-[14px] text-ink-subtle">No JD written for this role yet.</p>
        ) : (
          <JdPreview content={base} />
        )
      ) : (
      <JdEditor initial={base} pending={pending} saveLabel="Save recruiter JD" onSave={save}>
        {row.recruiter && row.master && (
          <button type="button" onClick={reset} disabled={pending} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13.5px] font-bold text-ink-soft hover:bg-black/5">
            <RotateCcw size={14} /> Reset to master
          </button>
        )}
      </JdEditor>
      )}
    </div>
  );
}

/* ── Master JD ──────────────────────────────────────────────────────────── */

function MasterTab({ row, canEdit }: { row: RecruitmentJdRow; canEdit: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = React.useState(false);
  const [pending, start] = React.useTransition();

  /* THE ORIGINAL IS NEVER LOST. The seed in lib/operations/recruitment-jd-seed.ts is
     applied on first load and never again, so an edit here is safe to make and
     safe to undo — which is the whole point of keeping a master at all. */
  function restore() {
    if (!window.confirm(`Replace the master with the original ${row.title} JD? Any edits made to the master are lost. The recruiter copy is untouched.`)) return;
    start(async () => {
      const res = await restoreRecruitmentJdMaster({ slug: row.slug });
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return;
      }
      fireToast({ message: "Master restored to the original.", type: "success" });
      router.refresh();
    });
  }

  function save(content: JdContent) {
    start(async () => {
      const res = await saveRecruitmentJd({ slug: row.slug, which: "master", content });
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
        <JdEditor initial={row.master ?? emptyJdContent(row.title)} pending={pending} saveLabel="Save master" onSave={save}>
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
        {canEdit && (
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
        )}
        {canEdit && row.hasSeed && (
          <button
            type="button"
            onClick={restore}
            disabled={pending}
            title="Put the master back to the JD this section shipped with"
            className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-[13.5px] font-bold text-ink-soft disabled:opacity-50"
            style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline-strong)" }}
          >
            <RotateCcw size={14} /> Restore the original
          </button>
        )}
      </div>
      {row.master ? <JdPreview content={row.master} /> : null}
    </div>
  );
}

/* ── Send ───────────────────────────────────────────────────────────────── */

function SendTab({ row, canEdit }: { row: RecruitmentJdRow; canEdit: boolean }) {
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
    void logRecruitmentJdWhatsApp({ slug: row.slug, recipientName: waName, phone: waPhone }).then((res) => {
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
      const res = await sendRecruitmentJdByEmail({ slug: row.slug, to: mailTo, recipientName: mailName, note });
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
    <div className={`grid gap-4 ${canEdit ? "grid-cols-2 max-xl:grid-cols-1" : "grid-cols-1"}`}>
      {canEdit && (
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
      )}

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
