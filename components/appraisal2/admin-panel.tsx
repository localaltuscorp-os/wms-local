"use client";

/**
 * Appraisal v2 — ADMIN PANEL (ROLE-BASED, client).
 *
 * Left rail: department filter + searchable employee picker. Right: the selected
 * person's scorecard config — the ROLE CLASS (Manager | Non-Manager, which
 * selects the dimension set + weights) and the manager (advisory) + management
 * (final) assignees. Every mutation calls a "use server" admin action; on
 * success we refresh the server props so the panel reflects the saved truth.
 * Brand tokens only, keyboard-friendly (each editor is a submittable form).
 */

import * as React from "react";
import { useRouter } from "next/navigation";
import type { Route } from "next";
import { Search, Save, Loader2, Check, UserCog } from "lucide-react";
import { EmployeeAvatar } from "@/components/ui/employee-avatar";
import { fireToast } from "@/lib/toast";
import { MACRO_BUCKETS, ROLE_CLASSES, type RoleClass } from "@/lib/appraisal2/types";
import { setAssignees, setRoleClass } from "@/app/(app)/appraisal/admin-actions";

const RED = "var(--color-altus-red)";
const RED_DEEP = "var(--color-altus-red-deep)";
const CARD_SHADOW =
  "inset 0 0 0 1px var(--color-hairline), inset 0 1px 0 rgba(255,255,255,0.7), 0 10px 28px -20px rgba(15,23,42,0.35)";

const INPUT =
  "rounded-xl border border-hairline bg-surface-soft px-3 py-2 text-[14px] font-semibold text-ink-strong outline-none focus:border-[color:var(--color-altus-red)] w-full";

export interface AdminEmployee {
  id: string;
  name: string;
  department: string | null;
  designation: string | null;
  avatarUrl: string | null;
}

export interface EmployeeConfig {
  employeeId: string;
  roleClass: RoleClass;
  managerId: string | null;
  managementId: string | null;
}

// ─── section shell ────────────────────────────────────────────────────────────

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-surface-card p-5" style={{ boxShadow: CARD_SHADOW }}>
      <div className="mb-3.5">
        <h3
          className="text-ink-strong"
          style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800, fontSize: 17 }}
        >
          {title}
        </h3>
        {hint && <p className="mt-0.5 text-[12.5px] font-medium text-ink-subtle">{hint}</p>}
      </div>
      {children}
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[11px] font-bold uppercase tracking-[0.1em] text-ink-subtle">{children}</span>
  );
}

function SaveButton({ busy, ok, label = "Save" }: { busy: boolean; ok: boolean; label?: string }) {
  return (
    <button
      type="submit"
      disabled={busy}
      className="wg-btn inline-flex items-center gap-1.5 rounded-pill px-4 py-2 text-[13px] font-bold text-white disabled:opacity-60"
      style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})`, boxShadow: `0 8px 20px -12px ${RED_DEEP}` }}
    >
      {busy ? <Loader2 size={14} className="animate-spin" /> : ok ? <Check size={14} strokeWidth={2.6} /> : <Save size={14} strokeWidth={2.4} />}
      {busy ? "Saving…" : ok ? "Saved" : label}
    </button>
  );
}

/** Small hook: run a server action inside a transition, toast + refresh. */
function useAction() {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [ok, setOk] = React.useState(false);
  const run = React.useCallback(
    async (
      fn: () => Promise<{ ok: true } | { ok: false; error: string }>,
      successMsg: string,
    ): Promise<boolean> => {
      setBusy(true);
      setOk(false);
      const res = await fn();
      setBusy(false);
      if (!res.ok) {
        fireToast({ message: res.error, type: "error" });
        return false;
      }
      setOk(true);
      setTimeout(() => setOk(false), 1600);
      fireToast({ message: successMsg, type: "success" });
      router.refresh();
      return true;
    },
    [router],
  );
  return { busy, ok, run };
}

// ─── role class ─────────────────────────────────────────────────────────────

function RoleEditor({ config }: { config: EmployeeConfig }) {
  const { busy, ok, run } = useAction();
  const [role, setRole] = React.useState<RoleClass>(config.roleClass);
  const buckets = MACRO_BUCKETS[role];

  return (
    <Section
      title="Role Class"
      hint="Manager or Non-Manager — this selects the scorecard's dimension set and weights."
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void run(() => setRoleClass({ employeeId: config.employeeId, roleClass: role }), "Role class saved");
        }}
      >
        <div className="flex flex-wrap gap-2">
          {ROLE_CLASSES.map((r) => {
            const on = role === r.value;
            return (
              <button
                key={r.value}
                type="button"
                onClick={() => setRole(r.value)}
                className="rounded-xl px-4 py-2 text-[13.5px] font-bold transition"
                style={{
                  background: on ? `linear-gradient(135deg, ${RED}, ${RED_DEEP})` : "var(--color-surface-soft)",
                  color: on ? "#fff" : "var(--color-ink-muted)",
                  boxShadow: on ? "none" : "inset 0 0 0 1px var(--color-hairline)",
                }}
              >
                {r.label}
              </button>
            );
          })}
        </div>

        {/* Read-only weight preview for the chosen role. */}
        <div className="mt-4 grid gap-1.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}>
          {buckets.map((b) => (
            <div
              key={b.id}
              className="flex items-center justify-between rounded-xl bg-surface-soft px-3 py-1.5"
              style={{ boxShadow: "inset 0 0 0 1px var(--color-hairline)" }}
            >
              <span className="truncate text-[12px] font-semibold text-ink-strong">{b.label}</span>
              <span className="tabular-nums ml-2 shrink-0 text-[12.5px] font-black" style={{ color: RED_DEEP }}>
                {b.weight}
              </span>
            </div>
          ))}
        </div>

        <div className="mt-4 flex items-center justify-between">
          <span className="text-[12px] font-semibold text-ink-subtle">
            KPI drives the incentive · dimensions sum to 100.
          </span>
          <SaveButton busy={busy} ok={ok} />
        </div>
      </form>
    </Section>
  );
}

// ─── assignees ────────────────────────────────────────────────────────────────

function AssigneesEditor({ config, people }: { config: EmployeeConfig; people: AdminEmployee[] }) {
  const { busy, ok, run } = useAction();
  const [managerId, setManagerId] = React.useState(config.managerId ?? "");
  const [managementId, setManagementId] = React.useState(config.managementId ?? "");

  const options = people.filter((p) => p.id !== config.employeeId);

  return (
    <Section title="Assignees" hint="Manager advises · Management is the final score that counts.">
      <form
        className="grid grid-cols-2 gap-3 max-md:grid-cols-1"
        onSubmit={(e) => {
          e.preventDefault();
          void run(
            () =>
              setAssignees({
                employeeId: config.employeeId,
                managerId: managerId || null,
                managementId: managementId || null,
              }),
            "Assignees updated",
          );
        }}
      >
        <label className="flex flex-col gap-1.5">
          <Label>Manager (Advisory)</Label>
          <select className={INPUT} value={managerId} onChange={(e) => setManagerId(e.target.value)}>
            <option value="">— None —</option>
            {options.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <Label>Management (Final)</Label>
          <select className={INPUT} value={managementId} onChange={(e) => setManagementId(e.target.value)}>
            <option value="">— None —</option>
            {options.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <div className="col-span-2 flex justify-end max-md:col-span-1">
          <SaveButton busy={busy} ok={ok} />
        </div>
      </form>
    </Section>
  );
}

// ─── left rail (picker) ───────────────────────────────────────────────────────

function Picker({
  people,
  departments,
  selectedId,
}: {
  people: AdminEmployee[];
  departments: string[];
  selectedId: string | null;
}) {
  const router = useRouter();
  const [dept, setDept] = React.useState<string | null>(null);
  const [q, setQ] = React.useState("");

  const filtered = people.filter((p) => {
    if (dept && p.department !== dept) return false;
    if (q && !p.name.toLowerCase().includes(q.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="rounded-2xl bg-surface-card p-4" style={{ boxShadow: CARD_SHADOW }}>
      <div className="relative mb-3">
        <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Local search — people" title="Local search — filters only the list on this page" aria-label="Local search — people — this page only"
          className="w-full rounded-xl border border-hairline bg-surface-soft py-2 pl-9 pr-3 text-[14px] font-semibold text-ink-strong outline-none focus:border-[color:var(--color-altus-red)]"
        />
      </div>

      <div className="mb-3 flex flex-wrap gap-1.5">
        <DeptPill label="All" active={dept === null} onClick={() => setDept(null)} />
        {departments.map((d) => (
          <DeptPill key={d} label={d} active={dept === d} onClick={() => setDept(d)} />
        ))}
      </div>

      <div className="flex max-h-[560px] flex-col gap-1 overflow-y-auto pr-1">
        {filtered.map((p) => {
          const on = p.id === selectedId;
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => router.push(`/appraisal/admin?emp=${p.id}` as Route)}
              className="flex items-center gap-3 rounded-xl px-2.5 py-2 text-left transition"
              style={{
                background: on ? `color-mix(in srgb, ${RED} 10%, transparent)` : "transparent",
                boxShadow: on ? `inset 0 0 0 1.5px ${RED}` : "none",
              }}
            >
              <EmployeeAvatar name={p.name} size="sm" />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-bold text-ink-strong">{p.name}</div>
                <div className="truncate text-[12px] text-ink-subtle">
                  {p.designation || p.department || "—"}
                </div>
              </div>
            </button>
          );
        })}
        {filtered.length === 0 && (
          <p className="px-2 py-6 text-center text-[13px] text-ink-subtle">No matches.</p>
        )}
      </div>
    </div>
  );
}

function DeptPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-pill px-2.5 py-1 text-[12px] font-bold transition"
      style={{
        background: active ? `linear-gradient(135deg, ${RED}, ${RED_DEEP})` : "var(--color-surface-soft)",
        color: active ? "#fff" : "var(--color-ink-muted)",
        boxShadow: active ? "none" : "inset 0 0 0 1px var(--color-hairline)",
      }}
    >
      {label}
    </button>
  );
}

// ─── panel ────────────────────────────────────────────────────────────────────

export function AdminPanel({
  people,
  departments,
  selectedId,
  config,
}: {
  people: AdminEmployee[];
  departments: string[];
  selectedId: string | null;
  config: EmployeeConfig | null;
}) {
  const selected = selectedId ? people.find((p) => p.id === selectedId) ?? null : null;

  return (
    <div className="grid grid-cols-[340px_1fr] gap-5 max-lg:grid-cols-1">
      <Picker people={people} departments={departments} selectedId={selectedId} />

      {config && selected ? (
        <div className="flex flex-col gap-4" key={selected.id}>
          <div
            className="flex items-center gap-4 rounded-2xl bg-surface-card p-4"
            style={{ boxShadow: CARD_SHADOW }}
          >
            <EmployeeAvatar name={selected.name} size="lg" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[18px] font-black text-ink-strong">{selected.name}</div>
              <div className="text-[13px] text-ink-subtle">
                {[selected.designation, selected.department].filter(Boolean).join(" · ") || "—"}
              </div>
            </div>
          </div>

          <RoleEditor config={config} />
          <AssigneesEditor config={config} people={people} />
        </div>
      ) : (
        <div
          className="grid place-items-center rounded-2xl bg-surface-card p-16 text-center"
          style={{ boxShadow: CARD_SHADOW }}
        >
          <div>
            <div
              className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-2xl text-white"
              style={{ background: `linear-gradient(135deg, ${RED}, ${RED_DEEP})` }}
            >
              <UserCog size={26} strokeWidth={2.2} />
            </div>
            <p className="text-[15px] font-bold text-ink-strong">Pick a person to configure</p>
            <p className="mt-1 text-[13px] font-medium text-ink-subtle">
              Choose from the list to set their role class and assignees.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
