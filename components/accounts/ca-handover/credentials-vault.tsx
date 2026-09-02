"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  Plus,
  Pencil,
  Trash2,
  Eye,
  EyeOff,
  Copy,
  Check,
  Loader2,
  ExternalLink,
  KeyRound,
} from "lucide-react";
import { fireToast } from "@/lib/toast";
import { CA_PORTAL_LABELS, type CaCredentialGroup, type CaCredentialRow } from "@/lib/accounts/ca-constants";
import {
  deleteCredential,
  revealCredentialPassword,
} from "@/app/(app)/accounts/ca-handover/actions";
import { CredentialDialog } from "./credential-dialog";

const FLAGS: { key: keyof CaCredentialRow; label: string }[] = [
  { key: "emailUpdated", label: "Email Updated" },
  { key: "passwordReset", label: "Password Reset" },
  { key: "primaryPhoneUpdated", label: "Primary Phone Updated" },
  { key: "secondaryPhoneUpdated", label: "Secondary Phone Updated" },
];

export function CredentialsVault({ groups }: { groups: CaCredentialGroup[] }) {
  const [editing, setEditing] = React.useState<CaCredentialRow | null>(null);
  const [creatingFor, setCreatingFor] = React.useState<string | null>(null);
  const total = groups.reduce((n, g) => n + g.rows.length, 0);

  return (
    <section>
      <div className="flex items-end justify-between gap-4 flex-wrap mb-4">
        <div>
          <h2
            className="text-ink-strong"
            style={{
              fontFamily: "var(--font-display), system-ui, sans-serif",
              fontWeight: 800,
              fontSize: "clamp(20px, 2vw, 26px)",
              letterSpacing: "-0.02em",
            }}
          >
            Credentials Vault
          </h2>
          <p className="mt-0.5 text-ink-muted font-medium" style={{ fontSize: 13.5 }}>
            {total} login{total === 1 ? "" : "s"} across {groups.filter((g) => g.rows.length).length} portal
            {groups.filter((g) => g.rows.length).length === 1 ? "" : "s"} · passwords masked by default.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-7">
        {groups.map((g) => (
          <PortalGroup
            key={g.portalType}
            group={g}
            onEdit={setEditing}
            onAdd={() => setCreatingFor(g.portalType)}
          />
        ))}
      </div>

      {(editing || creatingFor) && (
        <CredentialDialog
          row={editing}
          defaultPortalType={creatingFor}
          onClose={() => {
            setEditing(null);
            setCreatingFor(null);
          }}
        />
      )}
    </section>
  );
}

function PortalGroup({
  group,
  onEdit,
  onAdd,
}: {
  group: CaCredentialGroup;
  onEdit: (r: CaCredentialRow) => void;
  onAdd: () => void;
}) {
  return (
    <div className="rounded-section border border-hairline bg-surface-card overflow-hidden" style={{ boxShadow: "0 1px 3px rgba(15,23,42,0.05)" }}>
      <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-hairline">
        <div className="flex items-center gap-2.5">
          <span
            className="grid place-items-center rounded-lg"
            style={{ width: 34, height: 34, background: "rgba(225,6,0,0.08)", color: "var(--color-altus-red-deep)" }}
            aria-hidden
          >
            <KeyRound size={17} strokeWidth={2.4} />
          </span>
          <h3 className="text-ink-strong" style={{ fontFamily: "var(--font-display), system-ui, sans-serif", fontWeight: 800, fontSize: 18, letterSpacing: "-0.01em" }}>
            {group.label}
          </h3>
          <span className="rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums" style={{ background: "var(--color-surface-muted, #f6f1e6)", color: "var(--color-ink-soft)" }}>
            {group.rows.length}
          </span>
        </div>
        <button
          type="button"
          onClick={onAdd}
          className="wg-btn cursor-pointer inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[12.5px] font-bold border border-hairline bg-surface-card text-ink-strong hover:border-hairline-strong"
        >
          <Plus size={14} strokeWidth={2.6} /> Add Login
        </button>
      </div>

      {group.rows.length === 0 ? (
        <p className="px-5 py-6 text-ink-subtle font-medium text-center" style={{ fontSize: 13.5 }}>
          No {group.label} logins yet.
        </p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse" style={{ minWidth: 980 }}>
            <thead>
              <tr className="text-left">
                {["Entity", "Username / ID", "Password", "Phone", "Default email", "Website", "Status", ""].map((h, i) => (
                  <th
                    key={i}
                    className="px-4 py-2.5 text-[11px] font-black uppercase tracking-[0.08em] text-ink-subtle whitespace-nowrap"
                    style={{ background: "var(--color-surface-soft)" }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {group.rows.map((r) => (
                <CredentialRow key={r.id} row={r} onEdit={() => onEdit(r)} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function CredentialRow({ row, onEdit }: { row: CaCredentialRow; onEdit: () => void }) {
  const router = useRouter();
  const [deleting, setDeleting] = React.useState(false);

  function remove() {
    if (!confirm(`Delete the ${CA_PORTAL_LABELS[row.portalType] ?? row.portalType} login for "${row.entityName}"?`)) return;
    setDeleting(true);
    deleteCredential(row.id)
      .then((res) => {
        setDeleting(false);
        if (!res.ok) return fireToast({ message: res.error, type: "error" });
        fireToast({ message: "Login deleted." });
        router.refresh();
      })
      .catch((e) => {
        setDeleting(false);
        fireToast({ message: e instanceof Error ? e.message : "Failed.", type: "error" });
      });
  }

  return (
    <tr className="border-t group align-top" style={{ borderColor: "var(--color-hairline)" }}>
      <td className="px-4 py-3 font-bold text-ink-strong" style={{ fontSize: 14 }}>
        {row.entityName}
        {row.note && (
          <div className="text-ink-subtle font-medium mt-0.5" style={{ fontSize: 12, lineHeight: 1.4 }}>{row.note}</div>
        )}
      </td>
      <td className="px-4 py-3 text-ink-soft" style={{ fontSize: 13.5 }}>
        <CopyText value={row.username} mono />
      </td>
      <td className="px-4 py-3">
        <PasswordCell id={row.id} hasPassword={row.hasPassword} />
      </td>
      <td className="px-4 py-3 text-ink-soft tabular-nums" style={{ fontSize: 13.5 }}>
        <CopyText value={row.phone} />
      </td>
      <td className="px-4 py-3 text-ink-soft" style={{ fontSize: 13.5 }}>
        <CopyText value={row.defaultEmail} />
      </td>
      <td className="px-4 py-3" style={{ fontSize: 13.5 }}>
        {row.websiteLink ? (
          <a
            href={row.websiteLink}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-semibold text-altus-red hover:underline"
          >
            Open <ExternalLink size={13} strokeWidth={2.4} />
          </a>
        ) : (
          <span className="text-ink-subtle">—</span>
        )}
      </td>
      <td className="px-4 py-3">
        <div className="flex flex-wrap gap-1">
          {FLAGS.map((f) =>
            row[f.key] ? (
              <span
                key={f.key}
                className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-bold"
                style={{ background: "rgba(16,122,87,0.10)", color: "var(--color-green-deep)" }}
              >
                <Check size={10} strokeWidth={3} /> {f.label}
              </span>
            ) : null,
          )}
          {FLAGS.every((f) => !row[f.key]) && (
            <span className="text-ink-subtle" style={{ fontSize: 12 }}>—</span>
          )}
        </div>
      </td>
      <td className="px-4 py-3 whitespace-nowrap">
        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
          <button type="button" onClick={onEdit} aria-label="Edit login" className="rounded-md p-1.5 text-ink-subtle hover:text-altus-red hover:bg-black/[0.04] cursor-pointer">
            <Pencil size={15} />
          </button>
          <button type="button" onClick={remove} disabled={deleting} aria-label="Delete login" className="rounded-md p-1.5 text-ink-subtle hover:text-altus-red hover:bg-black/[0.04] cursor-pointer disabled:opacity-50">
            {deleting ? <Loader2 size={15} className="animate-spin" /> : <Trash2 size={15} />}
          </button>
        </div>
      </td>
    </tr>
  );
}

/** A masked password cell that reveals exactly one password on demand. */
function PasswordCell({ id, hasPassword }: { id: string; hasPassword: boolean }) {
  const [revealed, setRevealed] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [copied, setCopied] = React.useState(false);

  if (!hasPassword) {
    return <span className="text-ink-subtle" style={{ fontSize: 13 }}>— not set —</span>;
  }

  function toggle() {
    if (revealed !== null) {
      setRevealed(null);
      return;
    }
    setLoading(true);
    revealCredentialPassword(id)
      .then((res) => {
        setLoading(false);
        if (!res.ok) return fireToast({ message: res.error, type: "error" });
        setRevealed(res.password);
      })
      .catch((e) => {
        setLoading(false);
        fireToast({ message: e instanceof Error ? e.message : "Reveal failed.", type: "error" });
      });
  }

  async function copy() {
    let value = revealed;
    if (value === null) {
      setLoading(true);
      const res = await revealCredentialPassword(id);
      setLoading(false);
      if (!res.ok) return fireToast({ message: res.error, type: "error" });
      value = res.password;
      setRevealed(value);
    }
    try {
      await navigator.clipboard.writeText(value ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
      fireToast({ message: "Password copied.", type: "success" });
    } catch {
      fireToast({ message: "Couldn't copy to clipboard.", type: "error" });
    }
  }

  return (
    <div className="flex items-center gap-2">
      <span
        className="font-mono tabular-nums select-text"
        style={{ fontSize: 13.5, color: revealed !== null ? "var(--color-ink-strong)" : "var(--color-ink-soft)", letterSpacing: revealed !== null ? 0 : "0.12em" }}
      >
        {revealed !== null ? (revealed || "(empty)") : "••••••••"}
      </span>
      <button type="button" onClick={toggle} disabled={loading} aria-label={revealed !== null ? "Hide password" : "Reveal password"} className="rounded-md p-1 text-ink-subtle hover:text-altus-red hover:bg-black/[0.04] cursor-pointer disabled:opacity-50">
        {loading ? <Loader2 size={14} className="animate-spin" /> : revealed !== null ? <EyeOff size={14} strokeWidth={2.2} /> : <Eye size={14} strokeWidth={2.2} />}
      </button>
      <button type="button" onClick={() => void copy()} disabled={loading} aria-label="Copy password" className="rounded-md p-1 text-ink-subtle hover:text-altus-red hover:bg-black/[0.04] cursor-pointer disabled:opacity-50">
        {copied ? <Check size={14} strokeWidth={2.6} style={{ color: "var(--color-green-deep)" }} /> : <Copy size={14} strokeWidth={2.2} />}
      </button>
    </div>
  );
}

/** Plain value cell with a hover copy affordance. */
function CopyText({ value, mono }: { value: string | null; mono?: boolean }) {
  const [copied, setCopied] = React.useState(false);
  if (!value) return <span className="text-ink-subtle">—</span>;
  async function copy() {
    try {
      await navigator.clipboard.writeText(value ?? "");
      setCopied(true);
      setTimeout(() => setCopied(false), 1400);
    } catch {
      /* ignore */
    }
  }
  return (
    <span className="inline-flex items-center gap-1.5 group/cp">
      <span className={mono ? "font-mono" : ""}>{value}</span>
      <button type="button" onClick={() => void copy()} aria-label="Copy" className="rounded p-0.5 text-ink-subtle opacity-0 group-hover/cp:opacity-100 hover:text-altus-red cursor-pointer transition-opacity">
        {copied ? <Check size={12} strokeWidth={2.6} style={{ color: "var(--color-green-deep)" }} /> : <Copy size={12} strokeWidth={2.2} />}
      </button>
    </span>
  );
}
