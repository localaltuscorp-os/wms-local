"use client";

import * as React from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Check, ChevronRight, Settings2, ShieldCheck, X } from "lucide-react";
import { fetchEmployeeMatrix, setModulePermission } from "@/app/master-admin/actions";
import { effectiveFor, type PermissionOverride } from "@/lib/permissions/effective";
import {
  PERMISSION_ACTION_HINTS,
  PERMISSION_ACTION_LABELS,
  PERMISSION_ACTIONS,
  type PermissionAction,
} from "@/lib/permissions/catalog";

type Access = { show: boolean; view: boolean; edit: boolean };
type Node = { key: string; label: string; depth: number; module: string; ancestors: string[] };
type AccessLevel = "admin" | "employee" | "none" | "custom";
type ModalMode = "set" | "advanced";

const ALL_ALLOWED: Access = { show: true, view: true, edit: true };
const EMPLOYEE_LEVEL: Access = { show: true, view: true, edit: false };

export function PermissionsClient({
  users,
  nodes,
}: {
  users: { id: string; name: string }[];
  nodes: Node[];
}) {
  const [employeeId, setEmployeeId] = React.useState("");
  const [overrides, setOverrides] = React.useState<Record<string, Access>>({});
  const [draft, setDraft] = React.useState<Record<string, Access>>({});
  const [activeModuleKey, setActiveModuleKey] = React.useState<string | null>(null);
  const [mode, setMode] = React.useState<ModalMode>("set");
  const [loaded, setLoaded] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [error, setError] = React.useState("");

  const modules = React.useMemo(() => nodes.filter((node) => node.depth === 1), [nodes]);
  const activeModule = modules.find((module) => module.key === activeModuleKey) ?? null;
  const activeNodes = React.useMemo(
    () => activeModule
      ? nodes.filter((node) => node.key === activeModule.key || node.ancestors[0] === activeModule.key)
      : [],
    [activeModule, nodes],
  );

  React.useEffect(() => {
    if (!employeeId) return;
    setLoaded(false);
    setError("");
    void fetchEmployeeMatrix(employeeId).then((result) => {
      if (result.ok) setOverrides(result.overrides);
      else setError(result.error);
      setLoaded(true);
    });
  }, [employeeId]);

  function openModule(moduleKey: string, nextMode: ModalMode = "set") {
    setActiveModuleKey(moduleKey);
    setMode(nextMode);
    setDraft({ ...overrides });
    setError("");
  }

  function closeModal() {
    if (!saving) setActiveModuleKey(null);
  }

  async function persist(nextOverrides: Record<string, Access>): Promise<boolean> {
    if (!employeeId || !activeModule) return false;
    setSaving(true);
    setError("");
    try {
      for (const node of activeNodes) {
        const before = overrides[node.key] ?? ALL_ALLOWED;
        const next = nextOverrides[node.key] ?? ALL_ALLOWED;
        if (sameAccess(before, next)) continue;
        const result = await setModulePermission({ employeeId, nodeKey: node.key, ...next });
        if (!result.ok) {
          setError(result.error ?? "Could not save permission.");
          return false;
        }
      }
      setOverrides(nextOverrides);
      return true;
    } finally {
      setSaving(false);
    }
  }

  async function savePreset(level: "admin" | "employee") {
    if (!activeModule) return;
    const next = { ...overrides };
    for (const node of activeNodes) {
      const access = node.key === activeModule.key && level === "employee"
        ? EMPLOYEE_LEVEL
        : ALL_ALLOWED;
      setStoredAccess(next, node.key, access);
    }
    if (await persist(next)) closeModal();
  }

  function toggleDraft(nodeKey: string, action: PermissionAction, value: boolean) {
    const current = draft[nodeKey] ?? ALL_ALLOWED;
    const next = { ...current, [action]: value };
    if (action === "view" && !value) next.edit = false;
    if (action === "edit" && value) next.view = true;
    const updated = { ...draft };
    setStoredAccess(updated, nodeKey, next);
    setDraft(updated);
  }

  async function saveAdvanced() {
    if (await persist(draft)) closeModal();
  }

  return (
    <div className="space-y-3">
      {error && <p className="rounded-chip border border-altus-red bg-altus-red-soft px-3 py-2 text-[12.5px] font-semibold text-altus-red">{error}</p>}

      <div className="flex flex-wrap items-end gap-3 rounded-section border border-hairline bg-surface-card px-3 py-2">
        <label className="flex min-w-[260px] max-w-md flex-1 flex-col gap-1">
          <span className="text-[11px] font-black uppercase tracking-[0.08em] text-ink-muted">Employee</span>
          <select
            value={employeeId}
            onChange={(event) => setEmployeeId(event.target.value)}
            className="h-9 rounded-pill border border-hairline bg-surface-card px-3 text-[13px] font-bold text-ink-strong outline-none focus:border-altus-red"
          >
            <option value="">Select employee</option>
            {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
          </select>
        </label>
      </div>

      {!employeeId && <EmptyState text="Choose an employee to view module access." />}
      {employeeId && !loaded && <EmptyState text="Loading module access…" />}
      {employeeId && loaded && (
        <div className="overflow-hidden rounded-2xl border border-hairline bg-surface-card">
          <div className="grid grid-cols-[minmax(0,1fr)_130px_112px] items-center border-b border-hairline bg-surface-soft px-4 py-2">
            <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-subtle">Module</span>
            <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-subtle">Access</span>
            <span />
          </div>
          <div className="divide-y divide-hairline">
            {modules.map((module) => {
              const level = moduleLevel(module, nodes, overrides);
              return (
                <div key={module.key} className="grid grid-cols-[minmax(0,1fr)_130px_112px] items-center gap-2 px-4 py-3 hover:bg-surface-soft">
                  <span className="truncate text-[13.5px] font-bold text-ink-strong">{module.label}</span>
                  <AccessBadge level={level} />
                  <button
                    type="button"
                    onClick={() => openModule(module.key)}
                    className="inline-flex h-8 items-center justify-center gap-1 rounded-pill border border-hairline bg-surface-card px-3 text-[12px] font-bold text-ink-soft transition-colors hover:border-hairline-strong hover:text-ink-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/60"
                  >
                    Set access <ChevronRight size={13} strokeWidth={2.4} />
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <Dialog.Root open={activeModule !== null} onOpenChange={(open) => !open && closeModal()}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/25 backdrop-blur-[1px]" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-50 w-[calc(100%-2rem)] max-w-[680px] -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-hairline bg-surface-card p-5 shadow-[0_18px_44px_-30px_rgba(15,23,42,0.22)] outline-none">
            {activeModule && (mode === "set" ? (
              <SetAccessDialog
                module={activeModule}
                saving={saving}
                onClose={closeModal}
                onEmployee={() => void savePreset("employee")}
                onAdmin={() => void savePreset("admin")}
                onCustomize={() => setMode("advanced")}
              />
            ) : (
              <AdvancedDialog
                nodes={activeNodes}
                overrides={draft}
                saving={saving}
                onClose={closeModal}
                onBack={() => setMode("set")}
                onToggle={toggleDraft}
                onSave={() => void saveAdvanced()}
              />
            ))}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}

function SetAccessDialog({
  module,
  saving,
  onClose,
  onEmployee,
  onAdmin,
  onCustomize,
}: {
  module: Node;
  saving: boolean;
  onClose: () => void;
  onEmployee: () => void;
  onAdmin: () => void;
  onCustomize: () => void;
}) {
  return (
    <>
      <DialogHeader title={"Set " + module.label + " access"} description="Choose preset. Existing module permission rules remain in effect." saving={saving} onClose={onClose} />
      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <AccessChoice
          title="Employee Level"
          description="Can view module. Current permission model blocks all module writes, including create, edit, and delete."
          icon={<ShieldCheck size={18} strokeWidth={2.4} />}
          onClick={onEmployee}
          disabled={saving}
        />
        <AccessChoice
          title="Admin Level"
          description="Removes module restrictions. Existing authorization still controls any additional administrative gates."
          icon={<Check size={18} strokeWidth={2.6} />}
          onClick={onAdmin}
          disabled={saving}
          selected
        />
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-hairline pt-3">
        <p className="text-[12px] text-ink-subtle">Need a different mix?</p>
        <button type="button" disabled={saving} onClick={onCustomize} className="inline-flex h-9 items-center gap-1.5 rounded-pill border border-hairline bg-surface-card px-3.5 text-[13px] font-bold text-ink-soft hover:border-hairline-strong hover:text-ink-strong">
          <Settings2 size={14} strokeWidth={2.4} /> Customize
        </button>
      </div>
    </>
  );
}

function AdvancedDialog({
  nodes,
  overrides,
  saving,
  onClose,
  onBack,
  onToggle,
  onSave,
}: {
  nodes: Node[];
  overrides: Record<string, Access>;
  saving: boolean;
  onClose: () => void;
  onBack: () => void;
  onToggle: (nodeKey: string, action: PermissionAction, value: boolean) => void;
  onSave: () => void;
}) {
  return (
    <>
      <DialogHeader title="Customize access" description="Existing Show, View, and Edit permissions for this module." saving={saving} onClose={onClose} />
      <div className="mt-4 max-h-[55vh] overflow-y-auto rounded-xl border border-hairline">
        <div className="grid grid-cols-[minmax(0,1fr)_repeat(3,52px)] items-center border-b border-hairline bg-surface-soft px-3 py-2">
          <span className="text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-subtle">Page</span>
          {PERMISSION_ACTIONS.map((action) => <span key={action} className="text-center text-[10.5px] font-bold uppercase tracking-[0.1em] text-ink-subtle">{PERMISSION_ACTION_LABELS[action]}</span>)}
        </div>
        <div className="divide-y divide-hairline">
          {nodes.map((node) => <AdvancedRow key={node.key} node={node} overrides={overrides} onToggle={onToggle} />)}
        </div>
      </div>
      <div className="mt-4 flex justify-between gap-2">
        <button type="button" disabled={saving} onClick={onBack} className="inline-flex h-9 items-center rounded-pill border border-hairline bg-surface-card px-3.5 text-[13px] font-bold text-ink-soft hover:border-hairline-strong">Back</button>
        <button type="button" disabled={saving} onClick={onSave} className="pastel-cta wg-btn inline-flex h-9 items-center gap-1.5 rounded-pill px-3.5 text-[13px] font-bold disabled:opacity-50"><Check size={14} strokeWidth={2.8} /> {saving ? "Saving…" : "Save access"}</button>
      </div>
    </>
  );
}

function DialogHeader({ title, description, saving, onClose }: { title: string; description: string; saving: boolean; onClose: () => void }) {
  return <div className="flex items-start justify-between gap-3">
    <div><Dialog.Title className="text-[22px] font-bold tracking-[-0.01em] text-ink-strong">{title}</Dialog.Title><Dialog.Description className="mt-1 text-[13px] text-ink-muted">{description}</Dialog.Description></div>
    <button type="button" aria-label="Close" disabled={saving} onClick={onClose} className="size-9 rounded-lg border border-hairline-strong bg-surface-card text-ink-muted"><X className="mx-auto" size={15} strokeWidth={2.4} /></button>
  </div>;
}

function AdvancedRow({ node, overrides, onToggle }: { node: Node; overrides: Record<string, Access>; onToggle: (nodeKey: string, action: PermissionAction, value: boolean) => void }) {
  const effective = effectiveFor(node.key, overridesToMap(overrides));
  return <div className="grid grid-cols-[minmax(0,1fr)_repeat(3,52px)] items-center px-3 py-2" style={{ paddingLeft: 12 + (node.depth - 1) * 14 }}>
    <span className={node.depth === 1 ? "truncate font-bold text-ink-strong" : "truncate text-[12.5px] text-ink-soft"}>{node.label}</span>
    {PERMISSION_ACTIONS.map((action) => {
      const allowed = action === "show" ? effective.show : action === "view" ? effective.view : effective.edit;
      const inherited = effective.deniedBy?.[action] && effective.deniedBy[action] !== node.key;
      return <label key={action} className="flex justify-center"><input aria-label={PERMISSION_ACTION_LABELS[action] + " " + node.label} title={inherited ? "Restricted by " + effective.deniedBy?.[action] : PERMISSION_ACTION_HINTS[action]} type="checkbox" checked={allowed} disabled={Boolean(inherited)} onChange={(event) => onToggle(node.key, action, event.target.checked)} className="size-3.5 accent-[var(--color-altus-red)] disabled:opacity-30" /></label>;
    })}
  </div>;
}

function AccessChoice({ title, description, icon, onClick, disabled, selected }: { title: string; description: string; icon: React.ReactNode; onClick: () => void; disabled: boolean; selected?: boolean }) {
  const tone = selected ? "border-altus-red bg-altus-red-soft" : "border-hairline bg-surface-card hover:border-hairline-strong hover:bg-surface-soft";
  return <button type="button" onClick={onClick} disabled={disabled} className={"rounded-2xl border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-altus-red)]/60 disabled:opacity-50 " + tone}><span className={"mb-3 inline-flex size-9 items-center justify-center rounded-xl " + (selected ? "bg-surface-card text-altus-red" : "bg-surface-soft text-ink-muted")}>{icon}</span><span className="block text-[16px] font-extrabold text-ink-strong">{title}</span><span className="mt-1 block text-[12.5px] leading-5 text-ink-muted">{description}</span></button>;
}

function AccessBadge({ level }: { level: AccessLevel }) {
  const config: Record<AccessLevel, { label: string; fill: string; ink: string }> = {
    admin: { label: "Admin Level", fill: "var(--color-green)", ink: "var(--color-green-deep)" },
    employee: { label: "Employee Level", fill: "var(--color-blue)", ink: "var(--color-blue-deep)" },
    none: { label: "No Access", fill: "var(--color-slate)", ink: "var(--color-slate-deep)" },
    custom: { label: "Custom", fill: "var(--color-amber)", ink: "var(--color-amber-deep)" },
  };
  const item = config[level];
  return <span className="inline-flex w-fit items-center rounded-pill px-2 py-0.5 text-[11px] font-bold" style={{ color: item.ink, background: item.fill }}>{item.label}</span>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="rounded-2xl border border-hairline bg-surface-card px-8 py-14 text-center" style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.04)" }}><ShieldCheck size={30} strokeWidth={2.2} className="mx-auto mb-4 text-altus-red" /><p className="text-[14px] font-medium text-ink-muted">{text}</p></div>;
}

function moduleLevel(module: Node, nodes: Node[], overrides: Record<string, Access>): AccessLevel {
  const root = effectiveFor(module.key, overridesToMap(overrides));
  if (!root.show && !root.view && !root.edit) return "none";
  const hasCustomChild = nodes.some((node) => node.key !== module.key && node.ancestors[0] === module.key && Boolean(overrides[node.key]));
  if (hasCustomChild) return "custom";
  if (root.show && root.view && root.edit) return "admin";
  if (root.show && root.view && !root.edit) return "employee";
  return "custom";
}

function overridesToMap(overrides: Record<string, Access>): Map<string, PermissionOverride> {
  return new Map(Object.entries(overrides).map(([key, access]) => [key, { canShow: access.show, canView: access.view, canEdit: access.edit }]));
}

function setStoredAccess(overrides: Record<string, Access>, nodeKey: string, access: Access) {
  if (sameAccess(access, ALL_ALLOWED)) delete overrides[nodeKey];
  else overrides[nodeKey] = access;
}

function sameAccess(a: Access, b: Access) {
  return a.show === b.show && a.view === b.view && a.edit === b.edit;
}
