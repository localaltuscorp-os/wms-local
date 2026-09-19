"use client";

import * as React from "react";
import type { EmployeeMasterDetail } from "@/lib/employees/master-query";
import {
  adoptCode,
  codeSuggestion,
  confirmIntern,
  issueCode,
  retireCode,
} from "@/app/(admin)/admin/employee-master/actions";
import { isInternPrefix, parseEmployeeCode } from "@/lib/employees/employee-code";

/**
 * THE EMPLOYEE CODE panel, inside the workspace's Overview.
 *
 * ── WHY IT IS A PANEL AND NOT A TEXT FIELD ─────────────────────────────────
 * Because a code is ALLOCATED, not typed. The scheme has two rules that a plain
 * editable field cannot honour:
 *
 *   · a number is never reused, even after its holder leaves, so the next value
 *     is a server decision over the whole registry rather than something a
 *     browser can work out;
 *   · confirming an intern MOVES them from UI-nnn to the next free U-nnn and
 *     retires the old code — two registry rows, not an edit of one.
 *
 * So the panel offers the three real operations — issue, adopt an existing
 * code, confirm an intern — and shows the history, rather than pretending the
 * code is free text. `adopt` exists precisely because the roster already has
 * codes on paper, and those must enter the registry to count toward allocation.
 *
 * ── STYLING ────────────────────────────────────────────────────────────────
 * Aura, via the workspace's scoped stylesheet. One rule shapes the buttons
 * here: never more than one red element per pane (§5). Issuing a code is the
 * action this panel exists for, so Issue carries the accent and everything
 * else — confirm, retire, record — is quiet. Retire is the destructive one,
 * but it is also the rarest, and a screen with two reds has no urgency at all.
 * Its confirm prompt does the work the colour would have.
 */
export function CodePanel({
  detail,
  onChanged,
}: {
  detail: EmployeeMasterDetail;
  onChanged: () => Promise<void>;
}) {
  const employeeId = detail.row.id;
  const current = detail.row.employeeCode;
  const active = detail.codeHistory.find((h) => h.status === "active");
  const currentIsIntern = active ? isInternPrefix(parseEmployeeCode(active.code)?.prefix ?? "") : false;

  const [open, setOpen] = React.useState(false);
  const [prefix, setPrefix] = React.useState("");
  const [preview, setPreview] = React.useState<string | null>(null);
  const [manual, setManual] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const [msg, setMsg] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    let alive = true;
    codeSuggestion(employeeId).then((s) => {
      if (!alive) return;
      if (s.prefix) setPrefix(s.prefix);
      setPreview(s.nextCode);
    });
    return () => { alive = false; };
  }, [open, employeeId]);

  async function run(fn: () => Promise<{ ok: boolean; error?: string }>, done: string) {
    setBusy(true); setMsg(null);
    const res = await fn();
    setBusy(false);
    setMsg(res.ok ? done : (res.error ?? "Failed."));
    if (res.ok) { setOpen(false); await onChanged(); }
  }

  return (
    <section className="glass px-5 py-4">
      <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
        <div>
          <span className="label mb-1.5 block">Employee Code</span>
          {/* The code is the number this pane is about, so when there IS one it
              is set as one (§4). When there is not, it is set as a sentence —
              a 30px em-dash reads as a rule someone drew, not as an absence. */}
          {current ? (
            <div className="stat">
              <b>{current}</b>
              <span>allocated</span>
            </div>
          ) : (
            <div className="muted text-[15px] font-semibold">Not issued</div>
          )}
        </div>

        <div className="ml-auto flex flex-wrap gap-2">
          {currentIsIntern && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (!window.confirm(
                  `Confirm this intern into a job?\n\n${active!.code} will be RETIRED PERMANENTLY and can never be reissued. ` +
                  `A new code in the entity's own series will be issued instead.`,
                )) return;
                void run(() => confirmIntern(employeeId), "Confirmed — a new code was issued.");
              }}
              className="btn-quiet"
            >
              Confirm intern → job
            </button>
          )}
          <button type="button" onClick={() => setOpen((v) => !v)} className="btn-quiet">
            {current ? "Reissue / change" : "Issue a code"}
          </button>
          {current && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                const reason = window.prompt(
                  `Retire ${current}?\n\nThe NUMBER IS RETIRED PERMANENTLY and can never be given to anyone else. Reason:`,
                  "Left the organisation",
                );
                if (reason === null) return;
                void run(() => retireCode({ employeeId, reason }), "Code retired.");
              }}
              className="btn-quiet"
            >
              Retire
            </button>
          )}
        </div>
      </div>

      {msg && <p className="muted mt-2.5 text-[12.5px] font-semibold">{msg}</p>}

      {open && (
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div>
            <span className="label mb-1.5 block">Issue the next code</span>
            <div className="flex gap-2">
              <input
                value={prefix}
                onChange={(e) => setPrefix(e.target.value.toUpperCase().slice(0, 2))}
                placeholder="A"
                aria-label="Code prefix"
                className="ctl num w-16 text-center uppercase"
              />
              <button
                type="button"
                disabled={busy || !prefix}
                onClick={() => void run(() => issueCode({ employeeId, prefix }), "Code issued.")}
                className="btn"
              >
                Issue
              </button>
            </div>
            <p className="quiet mt-1.5 text-[11.5px]">
              {preview
                ? <>Next in this series: <b className="num" style={{ color: "var(--ink)" }}>{preview}</b></>
                : "Pick a prefix — A, U, K, M, J, or UI for an intern."}
            </p>
          </div>

          <div>
            <span className="label mb-1.5 block">Or record a code they already have</span>
            <div className="flex gap-2">
              <input
                value={manual}
                onChange={(e) => setManual(e.target.value.toUpperCase())}
                placeholder="A-101"
                aria-label="Existing code"
                className="ctl num w-28 uppercase"
              />
              <button
                type="button"
                disabled={busy || !manual}
                onClick={() => void run(() => adoptCode({ employeeId, code: manual }), "Code recorded.")}
                className="btn-quiet"
              >
                Record
              </button>
            </div>
            <p className="quiet mt-1.5 text-[11.5px]">
              Enters it in the registry so allocation counts it from now on.
            </p>
          </div>
        </div>
      )}

      {detail.codeHistory.length > 0 && (
        <div className="mt-4">
          <span className="label mb-1.5 block">Code history</span>
          <ul className="flex flex-col gap-1">
            {detail.codeHistory.map((h) => (
              <li key={h.code} className="flex flex-wrap items-baseline gap-2 text-[12.5px]">
                <span className="num" style={{ color: "var(--ink)" }}>{h.code}</span>
                <span className={`pill state ${h.status === "active" ? "ok" : "idle"}`}>
                  {h.status === "active" ? "active" : "retired"}
                </span>
                {h.retiredReason && <span className="quiet">{h.retiredReason}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
