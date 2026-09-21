"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, Upload, FileText, Download, Trash2, X, ScrollText, ArrowRight, Check } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { POLICY_CATEGORIES } from "@/lib/hr/policy-types";
import { uploadPolicy, deletePolicy } from "@/app/(app)/policies/actions";
import { formatDateHr } from "@/lib/format";

const RED = "var(--color-altus-red)";
const RED_DEEP = "var(--color-altus-red-deep)";

interface Policy {
  id: string;
  title: string;
  description: string | null;
  category: string;
  fileName: string;
  sizeBytes: number | null;
  signedUrl: string | null;
  uploadedAt: string;
}
/** An authored firm policy (POSH, Exit, …) — a page in the app, not an upload.
 *  Passed from the server so the registry's full policy TEXT never reaches the
 *  client bundle. */
interface PolicyCard {
  key: string;
  title: string;
  blurb: string;
  badge: string;
  status: "ready" | "coming-soon";
  /** ISO signed-at for the VIEWER, or null/absent when they haven't signed it. */
  signedAt?: string | null;
  /** Signed, but an older version — a newer one has since been published. */
  outdated?: boolean;
}
interface Group {
  category: string;
  label: string;
  accent: string;
  hint: string;
  policies: Policy[];
}

function fmtSize(n: number | null): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
function fmtDate(iso: string): string {
  return formatDateHr(iso);
}

export function PoliciesWorkspace({
  groups,
  isAdmin,
  cards = [],
}: {
  groups: Group[];
  isAdmin: boolean;
  /** The firm's authored policies. Everyone sees these — they bind everyone. */
  cards?: PolicyCard[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const total = groups.reduce((n, g) => n + g.policies.length, 0);

  const ready = cards.filter((c) => c.status === "ready");
  const soon = cards.filter((c) => c.status !== "ready");
  const signedCount = ready.filter((c) => c.signedAt && !c.outdated).length;

  return (
    <div className="space-y-6">
      {isAdmin && (
        <div className="flex justify-end">
          <button
            onClick={() => setOpen(true)}
            className="inline-flex items-center gap-1.5 rounded-pill px-4 py-2 text-[13px] font-bold text-white"
            style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}
          >
            <Upload size={14} /> Upload policy
          </button>
        </div>
      )}

      {cards.length > 0 && (
        <section>
          <div className="mb-2.5 flex items-center gap-2">
            <ScrollText size={15} className="text-[var(--color-altus-red)]" />
            <h2 className="text-[15px] font-bold text-ink-strong">Firm policies</h2>
            <span className="text-[12px] font-semibold text-ink-soft">
              {signedCount}/{ready.length} signed
            </span>
            {/* Every signed policy as ONE pdf. The route archives the exact
                copy each person signed, so this is their own file, not a
                freshly rendered template. */}
            {ready.some((c) => c.signedAt) && (
              <a
                href="/api/hr/policies/download-all"
                className="ml-auto inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg border border-hairline px-2.5 py-1.5 text-[12px] font-bold text-ink-strong transition-colors hover:border-[var(--color-altus-red)]"
              >
                <Download size={13} strokeWidth={2.4} aria-hidden /> Download all
              </a>
            )}
          </div>
          <p className="mb-3 text-[12.5px] text-ink-muted">
            Every policy the firm publishes. Open to everyone — these bind everyone.
          </p>
          <div className="grid grid-cols-2 gap-3 max-md:grid-cols-1">
            {/* THE CARD IS NOT ONE LINK. The Download below is an anchor of its
                own, and an anchor cannot sit inside another anchor — so the
                card is a div, the Link covers the badge/title/blurb, and the
                status column sits beside it. Hovering either still lights the
                whole card (group/card). */}
            {ready.map((c) => {
              const signed = Boolean(c.signedAt) && !c.outdated;
              return (
                <div
                  key={c.key}
                  className="group/card flex items-start gap-3 rounded-2xl border border-hairline bg-surface-card px-4 py-3.5 transition hover:border-[var(--color-altus-red)]"
                >
                  <Link
                    href={`/hr/policies/${c.key}` as never}
                    className="flex min-w-0 flex-1 items-start gap-3"
                  >
                    <span
                      className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg text-[11.5px] font-bold text-white"
                      style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}
                    >
                      {c.badge}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[14px] font-semibold text-ink-strong">{c.title}</span>
                      <span className="mt-0.5 block text-[12px] leading-snug text-ink-muted">{c.blurb}</span>
                      {signed && (
                        <span className="mt-1.5 inline-flex items-center gap-1 text-[11.5px] font-bold text-[#15803d]">
                          <Check size={12} strokeWidth={3} aria-hidden /> Signed · {formatDateHr(c.signedAt!)}
                        </span>
                      )}
                      {c.signedAt && c.outdated && (
                        <span className="mt-1.5 inline-flex items-center gap-1 text-[11.5px] font-bold text-[var(--color-altus-red)]">
                          New version · sign again
                        </span>
                      )}
                    </span>
                  </Link>
                  <span className="flex shrink-0 flex-col items-end gap-1.5">
                    <ArrowRight
                      size={15}
                      className="mt-1 text-ink-subtle transition group-hover/card:text-[var(--color-altus-red)]"
                    />
                    {c.signedAt && (
                      <a
                        href={`/api/hr/policies/download?key=${encodeURIComponent(c.key)}`}
                        title="Download your signed copy"
                        className="inline-flex items-center gap-1 whitespace-nowrap rounded-lg px-1.5 py-0.5 text-[11.5px] font-semibold text-ink-muted transition-colors hover:text-[var(--color-altus-red)]"
                      >
                        <Download size={12} strokeWidth={2.4} aria-hidden /> Download
                      </a>
                    )}
                  </span>
                </div>
              );
            })}
            {soon.map((c) => (
              <div
                key={c.key}
                className="flex items-start gap-3 rounded-2xl border border-dashed border-hairline bg-surface-soft px-4 py-3.5 opacity-70"
              >
                <span className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface-track text-[11.5px] font-bold text-ink-muted">
                  {c.badge}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-semibold text-ink-muted">{c.title}</span>
                  <span className="mt-0.5 block text-[12px] leading-snug text-ink-subtle">Coming soon</span>
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="mb-2.5 flex items-center gap-2">
        <FileText size={15} className="text-ink-muted" />
        <h2 className="text-[15px] font-bold text-ink-strong">Published documents</h2>
        <span className="text-[12px] font-semibold text-ink-soft">{total}</span>
      </div>

      {total === 0 ? (
        <div className="rounded-2xl border border-hairline bg-surface-card px-4 py-14 text-center">
          <ScrollText size={30} className="mx-auto text-ink-soft" />
          <p className="mt-3 text-[14px] font-medium text-ink-muted">
            No uploaded policy documents yet.
            {isAdmin ? " Upload one above." : " Check back soon."}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.category}>
              <div className="mb-2.5 flex items-center gap-2">
                <span className="h-3 w-3 rounded-sm" style={{ background: g.accent }} />
                <h2 className="text-[15px] font-bold text-ink-strong">{g.label}</h2>
                <span className="text-[12px] font-semibold text-ink-soft">{g.policies.length}</span>
              </div>
              <ul className="space-y-2">
                {g.policies.map((p) => (
                  <li key={p.id} className="flex items-center gap-3 rounded-2xl border border-hairline bg-surface-card px-4 py-3">
                    <FileText size={18} className="shrink-0 text-ink-muted" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-[14px] font-semibold text-ink-strong">{p.title}</div>
                      <div className="truncate text-[12px] text-ink-muted">
                        {p.description ? `${p.description} · ` : ""}
                        {p.fileName} {p.sizeBytes ? `· ${fmtSize(p.sizeBytes)}` : ""} · {fmtDate(p.uploadedAt)}
                      </div>
                    </div>
                    <a
                      href={p.signedUrl ?? "#"}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-disabled={!p.signedUrl}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-hairline px-2.5 py-1.5 text-[12.5px] font-semibold text-ink-strong transition hover:border-[var(--color-altus-red)]"
                    >
                      <Download size={13} /> Open
                    </a>
                    {isAdmin && <DeleteButton id={p.id} onDone={() => router.refresh()} />}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {open && <UploadDialog onClose={() => setOpen(false)} onDone={() => { setOpen(false); router.refresh(); }} />}
    </div>
  );
}

function DeleteButton({ id, onDone }: { id: string; onDone: () => void }) {
  const [busy, setBusy] = React.useState(false);
  return (
    <button
      onClick={async () => {
        if (busy) return;
        if (!confirm("Delete this policy for everyone?")) return;
        setBusy(true);
        const res = await deletePolicy(id);
        setBusy(false);
        if (!res.ok) return fireToast({ message: res.error, type: "error" });
        fireToast({ message: "Policy deleted", type: "success" });
        onDone();
      }}
      className="inline-flex items-center rounded-lg border border-hairline px-2 py-1.5 text-ink-muted transition hover:border-[var(--color-altus-red)] hover:text-[var(--color-altus-red)]"
      aria-label="Delete policy"
      disabled={busy}
    >
      {busy ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}
    </button>
  );
}

function UploadDialog({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const [busy, setBusy] = React.useState(false);
  const formRef = React.useRef<HTMLFormElement>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy) return;
    const fd = new FormData(e.currentTarget);
    setBusy(true);
    const res = await uploadPolicy(fd);
    setBusy(false);
    if (!res.ok) return fireToast({ message: res.error, type: "error" });
    fireToast({ message: "Policy uploaded", type: "success" });
    onDone();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="w-full max-w-[460px] rounded-2xl border border-hairline bg-surface-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-[16px] font-bold text-ink-strong">Upload Policy</h3>
          <button onClick={onClose} aria-label="Close" className="text-ink-muted hover:text-ink-strong"><X size={18} /></button>
        </div>
        <form ref={formRef} onSubmit={submit} className="space-y-3">
          <Field label="Title">
            <input name="title" required autoFocus maxLength={200} placeholder="e.g. Leave Policy 2026" className={inputCls} />
          </Field>
          <Field label="Category">
            <select name="category" required defaultValue="hr_general" className={inputCls}>
              {POLICY_CATEGORIES.map((c) => (
                <option key={c.key} value={c.key}>{c.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Description (optional)">
            <input name="description" maxLength={2000} placeholder="Short note or version" className={inputCls} />
          </Field>
          <Field label="File">
            <input name="file" type="file" required className="block w-full text-[13px] text-ink-strong file:mr-3 file:rounded-lg file:border-0 file:bg-surface-soft file:px-3 file:py-1.5 file:text-[12.5px] file:font-semibold" />
          </Field>
          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="rounded-pill border border-hairline px-4 py-2 text-[13px] font-bold text-ink-strong">Cancel</button>
            <button type="submit" disabled={busy} className="inline-flex items-center gap-1.5 rounded-pill px-4 py-2 text-[13px] font-bold text-white disabled:opacity-60" style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />} Upload
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputCls =
  "w-full rounded-lg border border-hairline bg-surface-card px-3 py-2 text-[13.5px] text-ink-strong outline-none focus:border-[var(--color-altus-red)]";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-bold uppercase tracking-[0.06em] text-ink-soft">{label}</span>
      {children}
    </label>
  );
}
