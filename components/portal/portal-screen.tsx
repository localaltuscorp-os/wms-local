"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import type { Route } from "next";
import {
  FileText,
  ShieldCheck,
  IndianRupee,
  Download,
  Printer,
  CircleCheck,
  Circle,
  Loader2,
  ArrowUpRight,
  ArrowLeft,
  X,
  PartyPopper,
  Wallet,
  Award,
  ClipboardList,
  ExternalLink,
  CalendarDays,
} from "lucide-react";
import {
  getMyDocuments,
  getMyPolicies,
  getMyPayslips,
  getMySalaryCertificate,
  getMyOnboarding,
} from "@/app/(app)/portal/actions";
import type {
  PortalDocuments,
  PortalPolicies,
  PortalPayslips,
  PortalPayslip,
  PortalDocument,
  PortalSalaryCertificate,
  PortalOnboarding,
} from "@/app/(app)/portal/portal-types";
import { ONBOARDING_SECTIONS, parseRepeaterRows } from "@/lib/dossier/onboarding-schema";
import { SalaryCertificate } from "@/components/portal/salary-certificate";
import { formatDate } from "@/lib/format";

const RED = "#E10600";
const RED_DEEP = "#A80400";
const DISPLAY = "var(--font-display), system-ui, sans-serif";

const inr = (n: number) => "₹" + Math.round(n).toLocaleString("en-IN");

const ALL_YEARS = "__all__";

/** What the hidden print root should render, if anything. */
type PrintTarget =
  | { kind: "slip"; slip: PortalPayslip }
  | { kind: "year"; fy: string; rows: PortalPayslip[]; total: number }
  | { kind: "certificate"; cert: PortalSalaryCertificate }
  | null;

/**
 * Employee self-service portal UI ("My HR Record"). Loads the current
 * employee's documents, policy compliance, salary slips, salary-certificate
 * snapshot and their own onboarding submission (every loader is server-side +
 * scoped to `me.id`). Renders each section with full loading / empty / error
 * states. Salary slips carry a financial-year filter, per-slip print and a
 * print-the-year action; a Salary Certificate renders on the firm letterhead.
 * Load-neutral (CSS only, no motion lib).
 */
export function PortalScreen({ firstName, fullName }: { firstName: string; fullName: string }) {
  const [docs, setDocs] = React.useState<PortalDocuments | null>(null);
  const [policies, setPolicies] = React.useState<PortalPolicies | null>(null);
  const [pay, setPay] = React.useState<PortalPayslips | null>(null);
  const [cert, setCert] = React.useState<PortalSalaryCertificate | null>(null);
  const [onboarding, setOnboarding] = React.useState<PortalOnboarding | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const [slip, setSlip] = React.useState<PortalPayslip | null>(null);
  const [year, setYear] = React.useState<string>(ALL_YEARS);
  const [certOpen, setCertOpen] = React.useState(false);
  const [formOpen, setFormOpen] = React.useState(false);
  const [printTarget, setPrintTarget] = React.useState<PrintTarget>(null);
  const [mounted, setMounted] = React.useState(false);

  React.useEffect(() => setMounted(true), []);

  React.useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [d, p, s, c, o] = await Promise.all([
          getMyDocuments(),
          getMyPolicies(),
          getMyPayslips(),
          getMySalaryCertificate(),
          getMyOnboarding(),
        ]);
        if (!alive) return;
        setDocs(d);
        setPolicies(p);
        setPay(s);
        setCert(c);
        setOnboarding(o);
      } catch {
        if (alive) setError("We couldn't load your portal just now. Please refresh.");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  // Print pipeline — whenever a print target is set, fire the browser print
  // dialog once the hidden print root has rendered, then clear on afterprint.
  React.useEffect(() => {
    if (!printTarget) return;
    const t = window.setTimeout(() => window.print(), 60);
    const done = () => setPrintTarget(null);
    window.addEventListener("afterprint", done);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("afterprint", done);
    };
  }, [printTarget]);

  const pendingPolicies = policies?.rows.filter((r) => r.status !== "signed").length ?? 0;

  // Financial-year options (newest-first) come straight off the annual aggregate.
  const fyOptions = pay?.annual.map((a) => a.fy) ?? [];
  const visibleRows =
    year === ALL_YEARS ? pay?.rows ?? [] : (pay?.rows ?? []).filter((r) => r.fy === year);
  const visibleTotal =
    year === ALL_YEARS
      ? pay?.grandTotal ?? 0
      : pay?.annual.find((a) => a.fy === year)?.total ?? 0;

  return (
    <>
      <style>{CSS}</style>
      <main className="portal-noprint mx-auto w-full max-w-[1080px] px-6 max-md:px-4 pb-24 pt-8">
        {/* Back nav — this page renders WITHOUT the app rail/header, so a normal
            employee (who reaches it from the HR home) needs an explicit way out.
            HR Home is the primary target; Hub is the whole-app front door. */}
        <div className="portal-fade mb-5 flex flex-wrap items-center gap-2">
          <Link
            href={"/hr" as Route}
            className="group inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-bold text-white transition-transform hover:-translate-x-0.5"
            style={{ background: "linear-gradient(120deg, #18181b 0%, #A80400 100%)", boxShadow: "0 12px 26px -12px rgba(168,4,0,0.55)" }}
          >
            <ArrowLeft size={15} strokeWidth={2.6} aria-hidden /> HR Home
          </Link>
          <Link
            href={"/hub" as Route}
            className="inline-flex items-center gap-1.5 rounded-full border border-hairline-strong bg-white px-4 py-2 text-[13px] font-bold text-ink-strong transition-colors hover:border-altus-red"
          >
            Hub
          </Link>
        </div>

        {/* Hero */}
        <div className="portal-fade mb-6">
          <span
            className="inline-flex items-center gap-2 rounded-pill px-3 py-1 text-[11px] font-bold uppercase tracking-[0.2em] text-white"
            style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}
          >
            <Wallet size={13} strokeWidth={2.6} /> My HR Record
          </span>
          <h1
            className="mt-2 text-ink-strong"
            style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: "clamp(28px,3.4vw,44px)", letterSpacing: "-0.03em", lineHeight: 1.02 }}
          >
            Hi {firstName} 👋
          </h1>
          <p className="mt-1.5 max-w-[70ch] text-[15px] font-medium text-ink-muted">
            Everything that&apos;s yours, in one place — your letters &amp; correspondence, the policies
            you&apos;ve signed, your salary slips &amp; certificate, and the forms you submitted.
          </p>
          {pendingPolicies > 0 && (
            <p className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-bold" style={{ background: "color-mix(in srgb, var(--color-altus-red) 10%, white)", color: RED_DEEP }}>
              <ShieldCheck size={14} /> You have {pendingPolicies} {pendingPolicies === 1 ? "policy" : "policies"} awaiting your signature.
            </p>
          )}
        </div>

        {error ? (
          <ErrorCard message={error} />
        ) : loading ? (
          <LoadingCard />
        ) : (
          <div className="grid grid-cols-12 gap-5">
            {/* Documents */}
            <section className="portal-fade col-span-12 lg:col-span-7">
              <Card n={1} icon={<FileText size={18} />} title="My Documents" sub="Your letters and correspondence on file.">
                <DocGroup label="Letters" docs={docs?.letters ?? []} />
                <div className="mt-4">
                  <DocGroup label="Correspondence" docs={docs?.correspondence ?? []} icon={<PartyPopper size={13} />} />
                </div>
              </Card>
            </section>

            {/* Policies */}
            <section className="portal-fade col-span-12 lg:col-span-5">
              <Card n={2} icon={<ShieldCheck size={18} />} title="My Policies" sub="Read and sign the policies that apply to you.">
                {(policies?.rows.length ?? 0) === 0 ? (
                  <Empty text="No policies assigned yet." />
                ) : (
                  <div className="grid gap-2">
                    {policies!.rows.map((p) => {
                      const signed = p.status === "signed";
                      return (
                        <Link
                          key={p.key}
                          href={`/hr/policies/${p.key}` as Route}
                          className="group flex items-center gap-2.5 rounded-xl border px-3.5 py-2.5 transition-all hover:shadow-md"
                          style={{
                            borderColor: signed ? "color-mix(in srgb, #16a34a 30%, white)" : "color-mix(in srgb, var(--color-altus-red) 30%, white)",
                            background: signed ? "color-mix(in srgb, #16a34a 6%, white)" : "color-mix(in srgb, var(--color-altus-red) 5%, white)",
                          }}
                        >
                          {signed ? (
                            <CircleCheck size={17} strokeWidth={2.4} style={{ color: "#15803d" }} className="shrink-0" />
                          ) : (
                            <Circle size={17} strokeWidth={2} className="shrink-0 text-ink-subtle" />
                          )}
                          <span className="min-w-0 flex-1 truncate text-[13.5px] font-semibold text-ink-strong">{p.title}</span>
                          <span className="shrink-0 text-[11px] font-bold uppercase tracking-[0.06em]" style={{ color: signed ? "#15803d" : RED_DEEP }}>
                            {signed ? "Signed" : "Sign now"}
                          </span>
                          <ArrowUpRight size={14} className="shrink-0 text-ink-subtle transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                        </Link>
                      );
                    })}
                  </div>
                )}
              </Card>
            </section>

            {/* Salary Slips */}
            <section className="portal-fade col-span-12">
              <Card n={3} icon={<IndianRupee size={18} />} title="Salary Slips" sub="Your monthly take-home, with annual totals — filter by year and print any slip.">
                {(pay?.rows.length ?? 0) === 0 ? (
                  <Empty text="No salary slips on file yet." />
                ) : (
                  <>
                    {/* Annual summary cards */}
                    <div className="mb-4 flex flex-wrap gap-3">
                      {pay!.annual.map((a) => (
                        <button
                          key={a.fy}
                          type="button"
                          onClick={() => setYear((y) => (y === a.fy ? ALL_YEARS : a.fy))}
                          className="rounded-xl border px-4 py-3 text-left transition-all hover:shadow-md focus-visible:outline-none focus-visible:ring-2"
                          style={{
                            borderColor: year === a.fy ? RED : "var(--color-hairline)",
                            background: year === a.fy ? "color-mix(in srgb, var(--color-altus-red) 6%, white)" : "var(--color-surface-soft)",
                            "--tw-ring-color": RED,
                          } as React.CSSProperties}
                          aria-pressed={year === a.fy}
                        >
                          <p className="text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft">{a.fy}</p>
                          <p className="mt-0.5 text-[19px] font-black tabular-nums text-ink-strong" style={{ fontFamily: DISPLAY }}>{inr(a.total)}</p>
                          <p className="text-[11px] font-medium text-ink-muted">{a.count} {a.count === 1 ? "slip" : "slips"}</p>
                        </button>
                      ))}
                      <div className="rounded-xl px-4 py-3 text-white" style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}>
                        <p className="text-[11px] font-bold uppercase tracking-[0.12em] opacity-85">All-time net</p>
                        <p className="mt-0.5 text-[19px] font-black tabular-nums" style={{ fontFamily: DISPLAY }}>{inr(pay!.grandTotal)}</p>
                      </div>
                    </div>

                    {/* Year filter toolbar */}
                    <div className="mb-3 flex flex-wrap items-center gap-3">
                      <label className="inline-flex items-center gap-2 rounded-xl border border-hairline bg-surface-soft px-3 py-1.5">
                        <CalendarDays size={15} className="text-ink-soft" />
                        <span className="text-[12px] font-bold uppercase tracking-[0.08em] text-ink-soft">Year</span>
                        <select
                          value={year}
                          onChange={(e) => setYear(e.target.value)}
                          className="bg-transparent text-[13.5px] font-bold text-ink-strong focus:outline-none"
                        >
                          <option value={ALL_YEARS}>All Years</option>
                          {fyOptions.map((fy) => (
                            <option key={fy} value={fy}>{fy}</option>
                          ))}
                        </select>
                      </label>
                      <span className="text-[13px] font-medium text-ink-muted">
                        {visibleRows.length} {visibleRows.length === 1 ? "slip" : "slips"} ·{" "}
                        <strong className="font-bold tabular-nums text-ink-strong">{inr(visibleTotal)}</strong> net
                      </span>
                      <button
                        type="button"
                        disabled={visibleRows.length === 0}
                        onClick={() =>
                          setPrintTarget({
                            kind: "year",
                            fy: year === ALL_YEARS ? "All Years" : year,
                            rows: visibleRows,
                            total: visibleTotal,
                          })
                        }
                        className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-white px-3 py-1.5 text-[12.5px] font-bold text-ink-strong transition-colors hover:bg-surface-soft disabled:opacity-40"
                      >
                        <Download size={13} /> Download {year === ALL_YEARS ? "all" : "this year"}
                      </button>
                    </div>

                    {/* Monthly slips table */}
                    <div className="overflow-x-auto rounded-xl border border-hairline">
                      <table className="w-full border-collapse text-left">
                        <thead>
                          <tr className="bg-surface-soft text-[11px] font-bold uppercase tracking-[0.08em] text-ink-soft">
                            <th className="px-3.5 py-2.5">Month</th>
                            <th className="px-3.5 py-2.5">Entity</th>
                            <th className="px-3.5 py-2.5 text-right">Net take-home</th>
                            <th className="px-3.5 py-2.5 text-center">Status</th>
                            <th className="px-3.5 py-2.5 text-right">Slip</th>
                          </tr>
                        </thead>
                        <tbody>
                          {visibleRows.map((r) => (
                            <tr key={r.id} className="border-t border-hairline text-[13.5px]">
                              <td className="px-3.5 py-2.5 font-bold text-ink-strong">{r.monthLabel}</td>
                              <td className="px-3.5 py-2.5 text-ink-muted">{r.companyName ?? "—"}</td>
                              <td className="px-3.5 py-2.5 text-right font-bold tabular-nums text-ink-strong">{inr(r.net)}</td>
                              <td className="px-3.5 py-2.5 text-center">
                                <span
                                  className="inline-flex items-center rounded-pill px-2 py-0.5 text-[11px] font-bold"
                                  style={r.paid
                                    ? { background: "color-mix(in srgb, #16a34a 12%, white)", color: "#15803d" }
                                    : { background: "var(--color-surface-muted)", color: "var(--color-ink-subtle)" }}
                                >
                                  {r.paid ? "Paid" : "Pending"}
                                </span>
                              </td>
                              <td className="px-3.5 py-2.5">
                                <div className="flex items-center justify-end gap-1.5">
                                  <button
                                    type="button"
                                    onClick={() => setSlip(r)}
                                    className="inline-flex items-center gap-1 rounded-lg border border-hairline-strong bg-white px-2.5 py-1 text-[12px] font-bold text-ink-strong transition-colors hover:bg-surface-soft"
                                  >
                                    View
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setPrintTarget({ kind: "slip", slip: r })}
                                    aria-label={`Print ${r.monthLabel} salary slip`}
                                    title="Print / Save PDF"
                                    className="inline-flex items-center gap-1 rounded-lg border border-hairline-strong bg-white px-2 py-1 text-[12px] font-bold text-ink-strong transition-colors hover:bg-surface-soft"
                                  >
                                    <Printer size={13} />
                                  </button>
                                </div>
                              </td>
                            </tr>
                          ))}
                          {visibleRows.length === 0 && (
                            <tr>
                              <td colSpan={5} className="px-3.5 py-8 text-center text-[13px] font-medium text-ink-subtle">
                                No slips for {year}.
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </Card>
            </section>

            {/* Salary Certificate */}
            <section className="portal-fade col-span-12 lg:col-span-6">
              <Card n={4} icon={<Award size={18} />} title="Salary Certificate" sub="Generate an employment & remuneration certificate on the firm letterhead.">
                {cert ? (
                  <div className="flex flex-wrap items-center gap-4 rounded-xl border border-hairline bg-surface-soft p-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-[13.5px] font-bold text-ink-strong">{cert.entity.legalName}</p>
                      <p className="mt-0.5 text-[12.5px] font-medium text-ink-muted">
                        {cert.designation ?? "Employee"} · Annual CTC{" "}
                        <strong className="tabular-nums text-ink-strong">{inr(cert.annualCtc)}</strong>
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCertOpen(true)}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-bold text-white"
                      style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}
                    >
                      <Award size={14} /> Generate Certificate
                    </button>
                  </div>
                ) : (
                  <Empty text="A salary certificate becomes available once your salary records are on file." />
                )}
              </Card>
            </section>

            {/* Forms you submitted */}
            <section className="portal-fade col-span-12 lg:col-span-6">
              <Card n={5} icon={<ClipboardList size={18} />} title="Forms You Submitted" sub="The details you filled during onboarding — view or update them.">
                <div className="rounded-xl border border-hairline bg-surface-soft p-4">
                  {onboarding?.exists ? (
                    <>
                      <div className="flex items-center gap-2.5">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-white" style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}>
                          <ClipboardList size={16} />
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-[13.5px] font-bold text-ink-strong">Onboarding Form</p>
                          <p className="text-[12px] font-medium capitalize text-ink-muted">
                            {onboarding.status === "submitted"
                              ? `Submitted${onboarding.submittedAt ? " · " + formatDate(onboarding.submittedAt) : ""}`
                              : "Draft — not yet submitted"}
                          </p>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => setFormOpen(true)}
                          className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[12.5px] font-bold text-white"
                          style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}
                        >
                          <FileText size={13} /> View Your Answers
                        </button>
                        <Link
                          href={"/dossier/onboarding" as Route}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-white px-3.5 py-2 text-[12.5px] font-bold text-ink-strong transition-colors hover:bg-surface-soft"
                        >
                          Update Form <ArrowUpRight size={13} />
                        </Link>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-[13.5px] font-medium text-ink-muted">
                        You haven&apos;t submitted your onboarding form yet. It captures your personal,
                        bank, ID and background details.
                      </p>
                      <Link
                        href={"/dossier/onboarding" as Route}
                        className="mt-3 inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[12.5px] font-bold text-white"
                        style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}
                      >
                        Fill Your Onboarding Form <ArrowUpRight size={13} />
                      </Link>
                    </>
                  )}
                </div>
              </Card>
            </section>
          </div>
        )}
      </main>

      {slip && <SlipModal slip={slip} fullName={fullName} onClose={() => setSlip(null)} onPrint={(s) => setPrintTarget({ kind: "slip", slip: s })} />}
      {certOpen && cert && <CertificateModal cert={cert} onClose={() => setCertOpen(false)} onPrint={() => setPrintTarget({ kind: "certificate", cert })} />}
      {formOpen && onboarding && <OnboardingModal data={onboarding} fullName={fullName} onClose={() => setFormOpen(false)} />}

      {/* Hidden print root — a document.body portal so it becomes a direct body
          child; in print every OTHER body child (app chrome, sidebar) is hidden
          and only this prints. Off-screen on screen so it never flashes. */}
      {mounted && printTarget &&
        createPortal(
          <div data-portal-print className="portal-print-root">
            {printTarget.kind === "slip" && <PrintSlip slip={printTarget.slip} fullName={fullName} />}
            {printTarget.kind === "year" && <PrintYear fy={printTarget.fy} rows={printTarget.rows} total={printTarget.total} fullName={fullName} />}
            {printTarget.kind === "certificate" && <SalaryCertificate cert={printTarget.cert} />}
          </div>,
          document.body,
        )}
    </>
  );
}

function DocGroup({ label, docs, icon }: { label: string; docs: PortalDocument[]; icon?: React.ReactNode }) {
  return (
    <div>
      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft">
        {icon} {label}
      </p>
      {docs.length === 0 ? (
        <Empty text={`No ${label.toLowerCase()} yet.`} small />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {docs.map((d) => (
            <div key={d.id} className="flex items-center gap-2.5 rounded-xl border border-hairline bg-surface-card px-3.5 py-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-white" style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}>
                <FileText size={14} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-bold text-ink-strong">{d.title}</span>
                <span className="block text-[11px] font-medium capitalize text-ink-muted">{d.status}</span>
              </span>
              {d.signedUrl ? (
                <a
                  href={d.signedUrl}
                  className="inline-flex shrink-0 items-center gap-1 rounded-lg px-2.5 py-1 text-[12px] font-bold text-white"
                  style={{ background: "linear-gradient(135deg,#3f3f46,#18181b)" }}
                >
                  <Download size={12} /> PDF
                </a>
              ) : (
                <span className="shrink-0 text-[11px] font-medium text-ink-subtle">—</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function slipRows(slip: PortalPayslip, fullName: string): [string, string][] {
  return [
    ["Employee", fullName],
    ["Designation", slip.designation ?? "—"],
    ["Paying Entity", slip.companyName ?? "—"],
    ["Pay Month", `${slip.monthLabel}  (${slip.fy})`],
    ["Monthly CTC", inr(slip.monthlyCtc)],
    ["Net Take-Home", inr(slip.net)],
    ["Payment Status", slip.paid ? `Paid${slip.paidAt ? " · " + formatDate(slip.paidAt) : ""}` : "Pending"],
  ];
}

function SlipModal({ slip, fullName, onClose, onPrint }: { slip: PortalPayslip; fullName: string; onClose: () => void; onPrint: (s: PortalPayslip) => void }) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const rows = slipRows(slip, fullName);

  return (
    <div
      className="portal-noprint fixed inset-0 z-[120] flex items-center justify-center p-4"
      style={{ background: "rgba(10,10,12,0.5)", backdropFilter: "blur(3px)" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="w-full max-w-[520px] overflow-hidden rounded-[20px] bg-white" style={{ boxShadow: "0 40px 100px -30px rgba(15,23,42,0.55)" }}>
        <div className="relative px-6 pt-6 pb-4" style={{ background: `linear-gradient(180deg, color-mix(in srgb, ${RED} 7%, white), #fff)` }}>
          <button type="button" onClick={onClose} aria-label="Close" className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-soft hover:bg-surface-muted">
            <X size={18} strokeWidth={2.4} />
          </button>
          <span className="text-[10.5px] font-bold uppercase tracking-[0.2em]" style={{ color: RED_DEEP }}>Salary Slip</span>
          <h2 className="mt-1 text-[22px] font-black text-ink-strong" style={{ fontFamily: DISPLAY }}>{slip.monthLabel}</h2>
        </div>
        <div className="px-6 py-5">
          <table className="w-full border-collapse">
            <tbody>
              {rows.map(([k, v]) => (
                <tr key={k} className="border-b border-hairline last:border-0">
                  <th className="w-[45%] py-2 text-left text-[12.5px] font-bold text-ink-muted">{k}</th>
                  <td className="py-2 text-right text-[13.5px] font-semibold text-ink-strong tabular-nums">{v}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-[10.5px] leading-relaxed text-ink-subtle">
            Net take-home reflects the salary table (including any condoned wave-off and pre-payout adjustments). This is a personal record, not a tax document.
          </p>
        </div>
        <div className="flex justify-end gap-2.5 border-t border-hairline px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-hairline-strong bg-white px-4 py-2 text-[13px] font-bold text-ink-strong hover:bg-surface-soft">Close</button>
          <button type="button" onClick={() => onPrint(slip)} className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-bold text-white" style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}>
            <Printer size={14} /> Print / Save PDF
          </button>
        </div>
      </div>
    </div>
  );
}

function CertificateModal({ cert, onClose, onPrint }: { cert: PortalSalaryCertificate; onClose: () => void; onPrint: () => void }) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="portal-noprint fixed inset-0 z-[120] flex flex-col items-center overflow-y-auto p-4"
      style={{ background: "rgba(10,10,12,0.55)", backdropFilter: "blur(3px)" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="my-auto w-full max-w-[860px]">
        <div className="mb-3 flex items-center justify-between gap-3">
          <span className="text-[13px] font-bold text-white/90">Salary Certificate Preview</span>
          <div className="flex items-center gap-2.5">
            <button type="button" onClick={onPrint} className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-bold text-white" style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}>
              <Printer size={14} /> Print / Save PDF
            </button>
            <button type="button" onClick={onClose} aria-label="Close" className="inline-flex h-9 w-9 items-center justify-center rounded-lg bg-white/15 text-white hover:bg-white/25">
              <X size={18} strokeWidth={2.4} />
            </button>
          </div>
        </div>
        <div className="overflow-hidden rounded-xl bg-white">
          <SalaryCertificate cert={cert} />
        </div>
      </div>
    </div>
  );
}

function OnboardingModal({ data, fullName, onClose }: { data: PortalOnboarding; fullName: string; onClose: () => void }) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="portal-noprint fixed inset-0 z-[120] flex flex-col items-center overflow-y-auto p-4"
      style={{ background: "rgba(10,10,12,0.55)", backdropFilter: "blur(3px)" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div className="my-auto w-full max-w-[760px] overflow-hidden rounded-[20px] bg-white" style={{ boxShadow: "0 40px 100px -30px rgba(15,23,42,0.55)" }}>
        <div className="relative px-6 pt-6 pb-4" style={{ background: `linear-gradient(180deg, color-mix(in srgb, ${RED} 7%, white), #fff)` }}>
          <button type="button" onClick={onClose} aria-label="Close" className="absolute right-4 top-4 inline-flex h-9 w-9 items-center justify-center rounded-lg text-ink-soft hover:bg-surface-muted">
            <X size={18} strokeWidth={2.4} />
          </button>
          <span className="text-[10.5px] font-bold uppercase tracking-[0.2em]" style={{ color: RED_DEEP }}>Onboarding form</span>
          <h2 className="mt-1 text-[22px] font-black text-ink-strong" style={{ fontFamily: DISPLAY }}>{fullName}</h2>
          <p className="text-[12px] font-medium text-ink-muted">
            {data.status === "submitted"
              ? `Submitted${data.submittedAt ? " · " + formatDate(data.submittedAt) : ""}`
              : "Draft — not yet submitted"} · read-only
          </p>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-6 py-5">
          {ONBOARDING_SECTIONS.map((section) => (
            <div key={section.key} className="mb-5 last:mb-0">
              <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.12em] text-ink-soft">{section.title}</p>
              <div className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
                {section.fields.map((f) => {
                  if (f.type === "file") {
                    const file = data.files[f.key];
                    return (
                      <div key={f.key} className="min-w-0 border-b border-hairline pb-1.5">
                        <p className="text-[11px] font-medium text-ink-soft">{f.label}</p>
                        {file && (file.signedUrl || file.fileName) ? (
                          file.signedUrl ? (
                            <a href={file.signedUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-[13px] font-bold" style={{ color: RED_DEEP }}>
                              {file.isLink ? <ExternalLink size={12} /> : <Download size={12} />}
                              <span className="truncate">{file.fileName || "Open"}</span>
                            </a>
                          ) : (
                            <p className="truncate text-[13px] font-semibold text-ink-strong">{file.fileName}</p>
                          )
                        ) : (
                          <p className="text-[13px] font-medium text-ink-subtle">Not provided</p>
                        )}
                      </div>
                    );
                  }
                  if (f.type === "repeater") {
                    const rows = parseRepeaterRows(data.fields[f.key]).filter((row) =>
                      (f.sub ?? []).some((s) => String(row?.[s.key] ?? "").trim().length > 0),
                    );
                    return (
                      <div key={f.key} className="min-w-0 border-b border-hairline pb-1.5 sm:col-span-2">
                        <p className="text-[11px] font-medium text-ink-soft">{f.label}</p>
                        {rows.length ? (
                          <ul className="mt-0.5 flex flex-col gap-0.5">
                            {rows.map((row, i) => (
                              <li key={i} className="text-[13px] font-semibold text-ink-strong">
                                {(f.sub ?? []).map((s) => String(row?.[s.key] ?? "").trim() || "—").join(" · ")}
                              </li>
                            ))}
                          </ul>
                        ) : (
                          <p className="text-[13px] font-medium text-ink-subtle">Not provided</p>
                        )}
                      </div>
                    );
                  }
                  const val = data.fields[f.key]?.trim();
                  return (
                    <div key={f.key} className="min-w-0 border-b border-hairline pb-1.5">
                      <p className="text-[11px] font-medium text-ink-soft">{f.label}</p>
                      <p className="truncate text-[13px] font-semibold text-ink-strong">{val || "—"}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        <div className="flex justify-end gap-2.5 border-t border-hairline px-6 py-4">
          <button type="button" onClick={onClose} className="rounded-lg border border-hairline-strong bg-white px-4 py-2 text-[13px] font-bold text-ink-strong hover:bg-surface-soft">Close</button>
          <Link href={"/dossier/onboarding" as Route} className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[13px] font-bold text-white" style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}>
            Update Form <ArrowUpRight size={14} />
          </Link>
        </div>
      </div>
    </div>
  );
}

/** Clean, branded single-slip layout used ONLY inside the hidden print root. */
function PrintSlip({ slip, fullName }: { slip: PortalPayslip; fullName: string }) {
  const rows = slipRows(slip, fullName);
  return (
    <div className="pp-doc">
      <div className="pp-head">
        <div>
          <p className="pp-eyebrow">Salary Slip</p>
          <h1 className="pp-title">{slip.monthLabel}</h1>
        </div>
        <p className="pp-firm">{slip.companyName ?? "Altus Corp"}</p>
      </div>
      <table className="pp-table">
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <th>{k}</th>
              <td>{v}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="pp-note">
        Net take-home reflects the salary records (including any condoned wave-off and pre-payout
        adjustments). This is a personal record, not a tax document.
      </p>
    </div>
  );
}

/** Multi-slip year summary used ONLY inside the hidden print root. */
function PrintYear({ fy, rows, total, fullName }: { fy: string; rows: PortalPayslip[]; total: number; fullName: string }) {
  return (
    <div className="pp-doc">
      <div className="pp-head">
        <div>
          <p className="pp-eyebrow">Salary Statement · {fy}</p>
          <h1 className="pp-title">{fullName}</h1>
        </div>
        <p className="pp-firm">{rows[0]?.companyName ?? "Altus Corp"}</p>
      </div>
      <table className="pp-table pp-table-grid">
        <thead>
          <tr>
            <th>Month</th>
            <th>Entity</th>
            <th style={{ textAlign: "right" }}>Net Take-Home</th>
            <th style={{ textAlign: "center" }}>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td>{r.monthLabel}</td>
              <td>{r.companyName ?? "—"}</td>
              <td style={{ textAlign: "right" }}>{inr(r.net)}</td>
              <td style={{ textAlign: "center" }}>{r.paid ? "Paid" : "Pending"}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td colSpan={2} style={{ fontWeight: 800 }}>Total net ({rows.length} {rows.length === 1 ? "slip" : "slips"})</td>
            <td style={{ textAlign: "right", fontWeight: 800 }}>{inr(total)}</td>
            <td />
          </tr>
        </tfoot>
      </table>
      <p className="pp-note">A personal salary statement generated from your records. Not a tax document.</p>
    </div>
  );
}

function Card({ n, icon, title, sub, children }: { n: number; icon: React.ReactNode; title: string; sub: string; children: React.ReactNode }) {
  return (
    <div className="h-full rounded-2xl border border-hairline bg-white p-5 shadow-[0_10px_30px_-22px_rgba(24,24,27,0.5)]">
      <div className="mb-4 flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-white" style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}>{icon}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[10.5px] font-black tabular-nums text-ink-subtle">{String(n).padStart(2, "0")}</span>
            <h2 className="text-[17px] font-black text-ink-strong" style={{ fontFamily: DISPLAY, letterSpacing: "-0.01em" }}>{title}</h2>
          </div>
          <p className="mt-0.5 text-[13px] font-medium leading-snug text-ink-muted">{sub}</p>
        </div>
      </div>
      {children}
    </div>
  );
}

function Empty({ text, small }: { text: string; small?: boolean }) {
  return <p className={`text-ink-subtle ${small ? "text-[12.5px]" : "text-[13.5px]"} font-medium`}>{text}</p>;
}

function LoadingCard() {
  return (
    <div className="grid place-items-center rounded-2xl border border-hairline bg-white py-24 text-ink-muted">
      <Loader2 className="animate-spin" style={{ color: RED }} />
      <p className="mt-2 text-[13.5px] font-medium">Loading your portal…</p>
    </div>
  );
}

function ErrorCard({ message }: { message: string }) {
  return (
    <div className="grid place-items-center rounded-2xl border px-6 py-16 text-center" style={{ borderColor: "color-mix(in srgb, var(--color-altus-red) 30%, white)", background: "color-mix(in srgb, var(--color-altus-red) 5%, white)" }}>
      <p className="text-[14px] font-semibold text-ink-strong">{message}</p>
    </div>
  );
}

const CSS = `
  .portal-fade { animation: portalFade 0.5s cubic-bezier(0.22,1,0.36,1) both; }
  @keyframes portalFade { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: translateY(0); } }
  @media (prefers-reduced-motion: reduce) { .portal-fade { animation: none !important; } }

  /* Hidden print root — parked off-screen on screen, the ONLY thing printed. */
  .portal-print-root { position: fixed; left: -100000px; top: 0; width: 794px; }
  .pp-doc { font-family: var(--font-display, Georgia, "Times New Roman", serif); color: #111114; }
  .pp-head { display: flex; align-items: flex-end; justify-content: space-between; gap: 16px; border-bottom: 2px solid #E10600; padding-bottom: 12px; margin-bottom: 20px; }
  .pp-eyebrow { margin: 0; font-size: 11px; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: #A80400; }
  .pp-title { margin: 4px 0 0; font-size: 26px; font-weight: 800; letter-spacing: -0.01em; }
  .pp-firm { margin: 0; font-size: 13px; font-weight: 700; color: #3f3f46; }
  .pp-table { width: 100%; border-collapse: collapse; font-size: 14px; }
  .pp-table th, .pp-table td { padding: 8px 4px; text-align: left; }
  .pp-table tbody tr { border-bottom: 1px solid #e4e4e7; }
  .pp-table th { color: #52525b; font-weight: 700; width: 42%; }
  .pp-table td { font-weight: 600; text-align: right; }
  .pp-table-grid th, .pp-table-grid td { border: 1px solid #e4e4e7; padding: 8px 10px; width: auto; text-align: left; }
  .pp-table-grid thead th { background: #faf7f7; }
  .pp-note { margin-top: 16px; font-size: 11px; color: #71717a; }

  @media print {
    html, body { background: #fff; }
    /* Hide the entire app (chrome, sidebar, portal main) — everything except the
       body-portaled print root — so ONLY the slip / statement / certificate prints. */
    body > *:not([data-portal-print]) { display: none !important; }
    .portal-print-root { position: static; left: auto; top: auto; width: auto; }
    .pp-doc { padding: 28px; }
  }
`;

export default PortalScreen;
