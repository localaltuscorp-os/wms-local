"use client";

import * as React from "react";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { ArrowLeft, ChevronDown, ClipboardCheck, MessagesSquare, Loader2, ChevronRight } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { getExitRecord, type ExitRecordRow } from "@/app/(app)/hr/exit/exit-actions";
import { formatDate } from "@/lib/format";
import type { ExitRosterEmployee } from "@/lib/hr/exit/schema";
import { ExitStyle } from "./exit-fields";
import { ExitInterviewForm } from "./exit-interview-form";
import { ExitHandoverForm } from "./exit-handover-form";

type EmployeeOpt = ExitRosterEmployee;

type Kind = "interview" | "handover";
type Mode =
  | { screen: "pick" }
  // `status` rides along so a form that was already SUBMITTED opens saying so,
  // rather than defaulting to "Draft saved" over work HR has already received.
  | { screen: Kind; recordId: string | null; initial: unknown; status: "draft" | "submitted" };

const CARDS: { kind: Kind; title: string; desc: string; annex: string; Icon: typeof MessagesSquare }[] = [
  {
    kind: "interview",
    title: "Director Exit Interview",
    desc: "Structured questions, a standardized 5-point experience scale and open feedback — captured confidentially.",
    annex: "Annexure B",
    Icon: MessagesSquare,
  },
  {
    kind: "handover",
    title: "Handover & Clearance Checklist",
    desc: "Reporting Manager, IT and HR clearance items with per-department sign-off before F&F.",
    annex: "Annexure A",
    Icon: ClipboardCheck,
  },
];

export function ExitWorkspace({
  employees,
  recent,
}: {
  employees: EmployeeOpt[];
  recent: ExitRecordRow[];
}) {
  const router = useRouter();
  const [empId, setEmpId] = React.useState<string>("");
  const [mode, setMode] = React.useState<Mode>({ screen: "pick" });
  const [loading, setLoading] = React.useState<Kind | null>(null);

  const emp = employees.find((e) => e.id === empId) ?? null;

  async function openForm(kind: Kind, forEmpId?: string) {
    const id = forEmpId ?? empId;
    if (!id) {
      fireToast({ message: "Select an employee first.", type: "error" });
      return;
    }
    if (forEmpId) setEmpId(forEmpId);
    setLoading(kind);
    try {
      const rec = await getExitRecord(id, kind).catch(() => null);
      setMode({
        screen: kind,
        recordId: rec?.id ?? null,
        initial: rec?.data ?? null,
        status: rec?.status ?? "draft",
      });
    } finally {
      setLoading(null);
    }
  }

  function backToPick() {
    setMode({ screen: "pick" });
    router.refresh();
  }

  const activeEmp = employees.find((e) => e.id === empId) ?? null;

  return (
    <div className="min-h-dvh bg-[#faf9fb]">
      <ExitStyle />

      {/* top bar */}
      <header className="sticky sticky-below-topbar z-30 grid grid-cols-[1fr_auto_1fr] items-center gap-4 border-b border-hairline bg-white/90 px-6 py-3 backdrop-blur max-md:px-4">
        <div className="justify-self-start">
          <button
            onClick={() => (mode.screen === "pick" ? router.push("/hr?open=exit" as Route) : backToPick())}
            className="group inline-flex items-center gap-2 rounded-full px-4 py-2 text-[13px] font-bold text-white transition-transform hover:-translate-x-0.5 max-md:px-3"
            style={{ background: "linear-gradient(120deg, #18181b 0%, #A80400 100%)", boxShadow: "0 12px 26px -12px rgba(168,4,0,0.55)" }}
          >
            <ArrowLeft size={15} strokeWidth={2.6} className="transition-transform group-hover:-translate-x-0.5" />
            <span className="max-md:hidden">{mode.screen === "pick" ? "Back to Exit" : "Choose another form"}</span>
            <span className="md:hidden">Back</span>
          </button>
        </div>
        <img src="/logo.png" alt="Altus Corp" className="h-9 w-auto justify-self-center max-md:h-8" style={{ display: "block" }} />
        <span aria-hidden className="justify-self-end" />
      </header>

      {mode.screen === "pick" ? (
        <PickScreen
          employees={employees}
          empId={empId}
          setEmpId={setEmpId}
          emp={emp}
          loading={loading}
          onOpen={openForm}
          recent={recent}
        />
      ) : mode.screen === "interview" ? (
        <ExitInterviewForm
          key={`interview-${empId}-${mode.recordId ?? "new"}`}
          employeeId={empId}
          employeeName={activeEmp?.name ?? ""}
          roster={employees}
          onEmployeeChange={(id) => openForm("interview", id)}
          recordId={mode.recordId}
          initial={(mode.initial as { fields?: Record<string, string>; ratings?: Record<string, number> }) ?? undefined}
          initialStatus={mode.status}
          onBack={backToPick}
        />
      ) : (
        <ExitHandoverForm
          key={`handover-${empId}-${mode.recordId ?? "new"}`}
          employeeId={empId}
          employeeName={activeEmp?.name ?? ""}
          roster={employees}
          onEmployeeChange={(id) => openForm("handover", id)}
          recordId={mode.recordId}
          initial={(mode.initial as { fields?: Record<string, string>; checked?: Record<string, boolean> }) ?? undefined}
          initialStatus={mode.status}
          onBack={backToPick}
        />
      )}
    </div>
  );
}

function PickScreen({
  employees,
  empId,
  setEmpId,
  emp,
  loading,
  onOpen,
  recent,
}: {
  employees: EmployeeOpt[];
  empId: string;
  setEmpId: (v: string) => void;
  emp: EmployeeOpt | null;
  loading: Kind | null;
  onOpen: (kind: Kind, forEmpId?: string) => void;
  recent: ExitRecordRow[];
}) {
  return (
    <main className="mx-auto w-full max-w-[900px] px-6 pb-24 pt-10 max-md:px-4">
      <div className="mb-8">
        <span className="text-[12px] font-bold uppercase tracking-[0.12em] text-ink-muted">Employee Lifecycle · Exit</span>
        <h1
          className="mt-1 text-ink-strong"
          style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800, fontSize: 30, letterSpacing: "-0.015em" }}
        >
          Exit &amp; Clearance
        </h1>
        <p className="mt-2 text-[15px] text-ink-muted">Pick the departing employee, then complete either exit form. Everything autosaves.</p>
      </div>

      {/* employee picker */}
      <div className="mb-8 iwf is-float">
        <select
          className="iwf-control"
          value={empId}
          onChange={(e) => setEmpId(e.target.value)}
          data-autofocus
          aria-label="Select departing employee"
        >
          <option value="">— Select employee —</option>
          {employees.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
        <label className="iwf-label">Departing Employee</label>
        <ChevronDown size={18} className="iwf-caret" aria-hidden />
      </div>

      {/* form cards */}
      <div className="grid grid-cols-2 gap-5 max-md:grid-cols-1">
        {CARDS.map(({ kind, title, desc, annex, Icon }) => {
          const disabled = !empId || loading !== null;
          return (
            <button
              key={kind}
              type="button"
              disabled={disabled}
              onClick={() => onOpen(kind)}
              className="group relative flex flex-col items-start gap-4 rounded-2xl border border-hairline bg-white p-6 text-left transition-all hover:-translate-y-0.5 hover:border-transparent hover:shadow-[0_24px_50px_-24px_rgba(168,4,0,0.4)] disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:translate-y-0 disabled:hover:shadow-none"
            >
              <span className="text-[11px] font-bold uppercase tracking-[0.14em] text-ink-subtle">{annex}</span>
              <span
                className="grid h-12 w-12 place-items-center rounded-xl text-white"
                style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
              >
                {loading === kind ? <Loader2 size={22} className="animate-spin" /> : <Icon size={22} strokeWidth={2.2} />}
              </span>
              <div>
                <h2 className="text-[17px] font-extrabold text-ink-strong">{title}</h2>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink-muted">{desc}</p>
              </div>
              <span className="mt-1 inline-flex items-center gap-1 text-[13px] font-bold" style={{ color: "var(--color-altus-red-deep)" }}>
                {empId ? "Open form" : "Select an employee"}
                <ChevronRight size={15} className="transition-transform group-hover:translate-x-0.5" />
              </span>
            </button>
          );
        })}
      </div>

      {emp && (
        <p className="mt-4 text-[13px] text-ink-muted">
          Filling exit forms for <strong className="text-ink-strong">{emp.name}</strong>. Re-opening a form resumes the saved version.
        </p>
      )}

      {/* recent submissions */}
      {recent.length > 0 && (
        <section className="mt-12">
          <h2 className="mb-3 text-[13px] font-bold uppercase tracking-[0.1em] text-ink-muted">Recent exit records</h2>
          <div className="overflow-hidden rounded-2xl border border-hairline bg-white">
            {recent.map((r, i) => (
              <button
                key={r.id}
                type="button"
                onClick={() => r.employeeId && onOpen(r.kind, r.employeeId)}
                disabled={!r.employeeId || loading !== null}
                className={`flex w-full items-center justify-between gap-3 px-5 py-3.5 text-left transition-colors hover:bg-[color-mix(in_srgb,var(--color-altus-red)_4%,#fff)] disabled:cursor-not-allowed disabled:opacity-60 max-md:px-4 ${i > 0 ? "border-t border-hairline" : ""}`}
              >
                <span className="flex items-center gap-3">
                  <span
                    className="grid h-8 w-8 place-items-center rounded-lg text-white"
                    style={{ background: r.kind === "interview" ? "var(--color-altus-red)" : "#18181b" }}
                  >
                    {r.kind === "interview" ? <MessagesSquare size={15} /> : <ClipboardCheck size={15} />}
                  </span>
                  <span>
                    <span className="block text-[14px] font-bold text-ink-strong">{r.employeeName}</span>
                    <span className="block text-[12px] text-ink-muted">
                      {r.kind === "interview" ? "Director Exit Interview" : "Handover & Clearance Checklist"}
                    </span>
                  </span>
                </span>
                <span className="flex items-center gap-2 text-[12px] text-ink-subtle">
                  {formatDate(r.updatedAt)}
                  <ChevronRight size={15} />
                </span>
              </button>
            ))}
          </div>
        </section>
      )}
    </main>
  );
}
