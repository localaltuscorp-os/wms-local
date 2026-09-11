"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  Clock,
  Copy,
  KeyRound,
  ShieldOff,
  UserCheck,
} from "lucide-react";
import { fireToast } from "@/lib/toast";
import {
  DELEGATED_ACCESS_DURATIONS,
  DELEGATED_ACCESS_FLOOR_LABEL,
  delegatedExpiry,
  delegatedExpiryBasis,
  istClockLabel,
} from "@/lib/auth/delegated-expiry";
import {
  grantTemporaryAccess,
  revokeTemporaryAccess,
  activateTemporaryAccess,
} from "@/app/(admin)/admin/temporary-access/actions";

/**
 * TEMPORARY ACCESS — the Admin Panel screen.
 *
 * Three things on one page, because they are one workflow: grant, hand over,
 * and watch. The audit trail is beside the grant form rather than behind a tab,
 * since the whole point of this feature is that borrowed access is visible.
 *
 * ── THE EXPIRY PREVIEW IS THE SAME FUNCTION THE SERVER STORES ──────────────
 * `delegatedExpiry` is pure and imported here directly. The preview a manager
 * reads before clicking Grant is therefore computed by the identical code that
 * computes the stored `expires_at` — it cannot promise 20:30 and store 19:00.
 * The client's clock can differ by a few seconds from the server's, so the
 * preview says "about"; the server's answer is the one that counts and is shown
 * again after the grant is made.
 */

interface Person {
  id: string;
  name: string;
  email: string;
}

export interface GrantView {
  id: string;
  targetName: string;
  targetEmail: string;
  delegateName: string;
  delegateEmail: string;
  grantedByName: string | null;
  revokedByName: string | null;
  reason: string | null;
  durationMinutes: number;
  startsAt: string;
  expiresAt: string;
  revokedAt: string | null;
  firstUsedAt: string | null;
  lastUsedAt: string | null;
  useCount: number;
  state: "live" | "revoked" | "expired";
}

export interface EventView {
  id: string;
  kind: string;
  detail: string | null;
  occurredAt: string;
  targetName: string | null;
  delegateName: string | null;
  actorName: string | null;
}

interface Props {
  targets: Person[];
  delegates: Person[];
  grants: GrantView[];
  events: EventView[];
  /** True when this viewer may grant. False renders the read-only trail only. */
  canGrant: boolean;
}

const CARD =
  "rounded-2xl border border-[#E2E8F0] bg-white p-5 max-md:p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]";
const INPUT =
  "w-full rounded-md border border-[#CBD5E1] px-3 py-2.5 text-[14px] bg-white";
const LABEL = "block text-[13px] font-semibold text-[#0F172A] mb-1.5";

export function TemporaryAccessPanel({
  targets,
  delegates,
  grants,
  events,
  canGrant,
}: Props) {
  return (
    <div className="space-y-5">
      {canGrant && <GrantCard targets={targets} delegates={delegates} />}
      <ActivateCard />
      <GrantsCard grants={grants} />
      <TrailCard events={events} />
    </div>
  );
}

/* ── Grant ────────────────────────────────────────────────────────────────── */

function GrantCard({ targets, delegates }: { targets: Person[]; delegates: Person[] }) {
  const router = useRouter();
  const [targetId, setTargetId] = useState("");
  const [delegateId, setDelegateId] = useState("");
  const [duration, setDuration] = useState<number>(60);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<{
    token: string;
    expiresAt: string;
    basis: "selected_duration" | "evening_floor";
    delegateName: string;
    targetName: string;
  } | null>(null);
  const [pending, startTransition] = useTransition();

  // Recomputed on every render so it tracks the duration selector. `new Date()`
  // in a render is fine here: this is a preview of a value that depends on
  // "now", it is never persisted, and it is replaced by the server's answer the
  // moment the grant is made.
  const preview = useMemo(() => {
    const now = new Date();
    return {
      expiresAt: delegatedExpiry(now, duration),
      basis: delegatedExpiryBasis(now, duration),
    };
  }, [duration]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!targetId || !delegateId) {
      setError("Choose both the employee and the person who will test the account.");
      return;
    }
    startTransition(async () => {
      const res = await grantTemporaryAccess({
        targetEmployeeId: targetId,
        delegateEmployeeId: delegateId,
        durationMinutes: duration,
        reason: reason.trim() || undefined,
      });
      if (!res.ok) {
        setError(res.error);
        return;
      }
      setIssued({
        token: res.token,
        expiresAt: res.expiresAt,
        basis: res.expiryBasis,
        delegateName: delegates.find((d) => d.id === delegateId)?.name ?? "the delegate",
        targetName: targets.find((t) => t.id === targetId)?.name ?? "the account",
      });
      setReason("");
      router.refresh();
    });
  }

  if (issued) {
    return (
      <div className={CARD}>
        <SectionTitle icon={<KeyRound size={16} strokeWidth={2.2} />} title="Access token issued" />
        <p className="text-[14px] text-[#334155]" style={{ lineHeight: 1.6 }}>
          Give this token to <strong>{issued.delegateName}</strong>. They paste it into
          “Use an access token” below, on their own computer, and the WMS then shows
          them <strong>{issued.targetName}</strong>&apos;s account until{" "}
          <strong>{new Date(issued.expiresAt).toLocaleString()}</strong>.
        </p>
        <TokenBox token={issued.token} />
        <p className="mt-3 text-[13px] text-[#94A3B8]" style={{ lineHeight: 1.55 }}>
          This is the only time the token is shown — it is stored as a hash, exactly
          like a password, so it cannot be looked up again. If it is lost, revoke the
          grant and issue a new one.
        </p>
        <ExpiryNote expiresAt={new Date(issued.expiresAt)} basis={issued.basis} exact />
        <button
          type="button"
          onClick={() => setIssued(null)}
          className="mt-4 rounded-md border border-[#CBD5E1] px-4 py-2 text-[14px] font-medium text-[#334155]"
        >
          Grant another
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className={CARD}>
      <SectionTitle
        icon={<UserCheck size={16} strokeWidth={2.2} />}
        title="Grant temporary access"
        hint="The employee keeps their own password and their own login throughout. Nothing about their account changes."
      />

      <div className="grid grid-cols-2 max-md:grid-cols-1 gap-4">
        <div>
          <label className={LABEL} htmlFor="ta-target">
            Employee — whose account will be accessed
          </label>
          <select
            id="ta-target"
            className={INPUT}
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
          >
            <option value="">Select an employee…</option>
            {targets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.email}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL} htmlFor="ta-delegate">
            Temporary access user — who will test it
          </label>
          <select
            id="ta-delegate"
            className={INPUT}
            value={delegateId}
            onChange={(e) => setDelegateId(e.target.value)}
          >
            <option value="">Select a person…</option>
            {delegates.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} · {p.email}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL} htmlFor="ta-duration">
            Duration
          </label>
          <select
            id="ta-duration"
            className={INPUT}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
          >
            {DELEGATED_ACCESS_DURATIONS.map((d) => (
              <option key={d.minutes} value={d.minutes}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className={LABEL} htmlFor="ta-reason">
            Reason <span className="font-normal text-[#94A3B8]">(optional)</span>
          </label>
          <input
            id="ta-reason"
            className={INPUT}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
            placeholder="Testing the leave approval screen"
          />
        </div>
      </div>

      <ExpiryNote expiresAt={preview.expiresAt} basis={preview.basis} />

      {targets.length === 0 && (
        <Callout tone="warn">
          There is nobody you can grant access over. Access is scoped to your own
          team, read from the reporting hierarchy.
        </Callout>
      )}

      {error && <Callout tone="error">{error}</Callout>}

      <div className="mt-4 flex justify-end">
        <button
          type="submit"
          disabled={pending}
          className="rounded-pill px-5 py-2.5 text-[14px] font-semibold text-white disabled:opacity-50"
          style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}
        >
          {pending ? "Granting…" : "Grant access"}
        </button>
      </div>
    </form>
  );
}

/**
 * The expiry explanation.
 *
 * Says WHICH rule decided the time, because "I chose one hour and it says 20:30"
 * is otherwise indistinguishable from a bug. The brief's rule is a floor, not a
 * cap, and this is where a manager finds that out.
 */
function ExpiryNote({
  expiresAt,
  basis,
  exact,
}: {
  expiresAt: Date;
  basis: "selected_duration" | "evening_floor";
  exact?: boolean;
}) {
  return (
    <div
      className="mt-4 flex items-start gap-2.5 rounded-lg px-3.5 py-3"
      style={{ background: "rgba(15,23,42,0.035)" }}
    >
      <Clock size={15} strokeWidth={2.2} className="mt-0.5 shrink-0 text-[#64748B]" />
      <p className="text-[13px] text-[#334155]" style={{ lineHeight: 1.6 }}>
        Access ends {exact ? "" : "about "}
        <strong>{istClockLabel(expiresAt)}</strong> ({expiresAt.toLocaleString()}).
        {basis === "evening_floor" ? (
          <>
            {" "}
            The chosen duration would have ended sooner, so the {DELEGATED_ACCESS_FLOOR_LABEL}{" "}
            floor applies — access always lasts at least until the end of the working
            evening.
          </>
        ) : (
          <>
            {" "}
            The chosen duration runs past {DELEGATED_ACCESS_FLOOR_LABEL}, so the duration
            applies.
          </>
        )}{" "}
        Expiry is enforced on the server on every request, so closing or keeping the
        browser open makes no difference.
      </p>
    </div>
  );
}

function TokenBox({ token }: { token: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="mt-3 flex items-center gap-2">
      <code className="min-w-0 flex-1 overflow-x-auto rounded-md border border-[#CBD5E1] bg-[#F8FAFC] px-3 py-2.5 font-mono text-[13px] text-[#0F172A]">
        {token}
      </code>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard?.writeText(token).then(
            () => {
              setCopied(true);
              fireToast({ message: "Token copied." });
              window.setTimeout(() => setCopied(false), 2000);
            },
            () => fireToast({ message: "Could not copy — select the token and copy it." }),
          );
        }}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-[#CBD5E1] px-3 py-2.5 text-[13px] font-medium text-[#334155]"
      >
        {copied ? <Check size={14} strokeWidth={2.4} /> : <Copy size={14} strokeWidth={2.2} />}
        {copied ? "Copied" : "Copy"}
      </button>
    </div>
  );
}

/* ── Activate ─────────────────────────────────────────────────────────────── */

function ActivateCard() {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    startTransition(async () => {
      const res = await activateTemporaryAccess(token);
      if (!res.ok) {
        setError(res.error ?? "Could not use that token.");
        return;
      }
      fireToast({ message: `You are now acting as ${res.targetName}.` });
      setToken("");
      // A full reload, not `router.refresh()`: the identity behind every cached
      // segment on this page has just changed, and a soft refresh can serve a
      // segment rendered for the previous one.
      window.location.assign("/hub");
    });
  }

  return (
    <form onSubmit={onSubmit} className={CARD}>
      <SectionTitle
        icon={<KeyRound size={16} strokeWidth={2.2} />}
        title="Use an access token"
        hint="Paste a token you were given to act as that account on THIS computer. Your own login stays exactly as it is."
      />
      <div className="flex items-end gap-2 max-md:flex-col max-md:items-stretch">
        <div className="min-w-0 flex-1">
          <label className={LABEL} htmlFor="ta-token">
            Access token
          </label>
          <input
            id="ta-token"
            className={`${INPUT} font-mono`}
            value={token}
            onChange={(e) => setToken(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            placeholder="Paste the token here"
          />
        </div>
        <button
          type="submit"
          disabled={pending || !token.trim()}
          className="rounded-md border border-[#CBD5E1] px-4 py-2.5 text-[14px] font-semibold text-[#334155] disabled:opacity-50"
        >
          {pending ? "Checking…" : "Start session"}
        </button>
      </div>
      {error && <Callout tone="error">{error}</Callout>}
      <button type="button" hidden onClick={() => router.refresh()} />
    </form>
  );
}

/* ── Grants list ──────────────────────────────────────────────────────────── */

function GrantsCard({ grants }: { grants: GrantView[] }) {
  const live = grants.filter((g) => g.state === "live");
  const past = grants.filter((g) => g.state !== "live");

  return (
    <div className={CARD}>
      <SectionTitle
        icon={<ShieldOff size={16} strokeWidth={2.2} />}
        title="Grants"
        hint={`${live.length} live · ${past.length} finished`}
      />
      {grants.length === 0 ? (
        <p className="text-[14px] text-[#94A3B8]">No temporary access has been granted yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse text-[13px]">
            <thead>
              <tr className="text-left text-[11.5px] font-semibold uppercase tracking-wide text-[#94A3B8]">
                <th className="border-b border-[#E2E8F0] py-2 pr-3">Account</th>
                <th className="border-b border-[#E2E8F0] py-2 pr-3">Accessed by</th>
                <th className="border-b border-[#E2E8F0] py-2 pr-3">Granted by</th>
                <th className="border-b border-[#E2E8F0] py-2 pr-3">Started</th>
                <th className="border-b border-[#E2E8F0] py-2 pr-3">Expires</th>
                <th className="border-b border-[#E2E8F0] py-2 pr-3">Used</th>
                <th className="border-b border-[#E2E8F0] py-2 pr-3">State</th>
                <th className="border-b border-[#E2E8F0] py-2" />
              </tr>
            </thead>
            <tbody>
              {[...live, ...past].map((g) => (
                <GrantRow key={g.id} g={g} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function GrantRow({ g }: { g: GrantView }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function revoke() {
    startTransition(async () => {
      const res = await revokeTemporaryAccess(g.id);
      if (!res.ok) {
        fireToast({ message: res.error ?? "Could not revoke." });
        return;
      }
      fireToast({ message: "Access revoked. It stops on the next request." });
      router.refresh();
    });
  }

  return (
    <tr className="align-top">
      <Td>
        <span className="font-medium text-[#0F172A]">{g.targetName}</span>
        <Sub>{g.targetEmail}</Sub>
        {g.reason && <Sub>“{g.reason}”</Sub>}
      </Td>
      <Td>
        <span className="font-medium text-[#0F172A]">{g.delegateName}</span>
        <Sub>{g.delegateEmail}</Sub>
      </Td>
      <Td>{g.grantedByName ?? "—"}</Td>
      <Td>{new Date(g.startsAt).toLocaleString()}</Td>
      <Td>
        {new Date(g.expiresAt).toLocaleString()}
        <Sub>
          chose {g.durationMinutes} min
          {g.revokedAt ? ` · revoked ${new Date(g.revokedAt).toLocaleString()}` : ""}
          {g.revokedByName ? ` by ${g.revokedByName}` : ""}
        </Sub>
      </Td>
      <Td>
        {g.firstUsedAt ? (
          <>
            {g.useCount}×<Sub>first {new Date(g.firstUsedAt).toLocaleString()}</Sub>
          </>
        ) : (
          <span className="text-[#94A3B8]">never</span>
        )}
      </Td>
      <Td>
        <StateBadge state={g.state} />
      </Td>
      <Td>
        {g.state === "live" && (
          <button
            type="button"
            onClick={revoke}
            disabled={pending}
            className="rounded-md border border-[#FECACA] px-3 py-1.5 text-[12.5px] font-semibold text-[#A80400] disabled:opacity-50"
          >
            {pending ? "Revoking…" : "Revoke"}
          </button>
        )}
      </Td>
    </tr>
  );
}

function StateBadge({ state }: { state: GrantView["state"] }) {
  const style =
    state === "live"
      ? { bg: "var(--color-green-bg)", fg: "var(--color-green-deep)", label: "Live" }
      : state === "revoked"
        ? { bg: "#FEF2F2", fg: "#A80400", label: "Revoked" }
        : { bg: "rgba(15,23,42,0.05)", fg: "#64748B", label: "Expired" };
  return (
    <span
      className="inline-flex items-center rounded-pill px-2.5 py-1 text-[12px] font-semibold"
      style={{ background: style.bg, color: style.fg }}
    >
      {style.label}
    </span>
  );
}

/* ── Audit trail ──────────────────────────────────────────────────────────── */

const EVENT_LABELS: Record<string, { label: string; tone: "ok" | "warn" | "bad" | "mute" }> = {
  granted: { label: "Granted", tone: "ok" },
  started: { label: "Session started", tone: "ok" },
  expired: { label: "Expired", tone: "mute" },
  revoked: { label: "Revoked", tone: "warn" },
  denied_after_expiry: { label: "Refused after expiry", tone: "bad" },
  denied: { label: "Refused", tone: "bad" },
};

function TrailCard({ events }: { events: EventView[] }) {
  return (
    <div className={CARD}>
      <SectionTitle
        icon={<AlertTriangle size={16} strokeWidth={2.2} />}
        title="Audit trail"
        hint="Every grant, session start, expiry, revocation and refused attempt. Append-only."
      />
      {events.length === 0 ? (
        <p className="text-[14px] text-[#94A3B8]">Nothing recorded yet.</p>
      ) : (
        <ol className="space-y-2.5">
          {events.map((e) => {
            const meta = EVENT_LABELS[e.kind] ?? { label: e.kind, tone: "mute" as const };
            const fg =
              meta.tone === "ok"
                ? "var(--color-green-deep)"
                : meta.tone === "bad"
                  ? "#A80400"
                  : meta.tone === "warn"
                    ? "#B45309"
                    : "#64748B";
            return (
              <li key={e.id} className="flex gap-3 text-[13px]">
                <span
                  className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
                  style={{ background: fg }}
                />
                <div className="min-w-0">
                  <span className="font-semibold" style={{ color: fg }}>
                    {meta.label}
                  </span>
                  <span className="text-[#94A3B8]">
                    {" · "}
                    {new Date(e.occurredAt).toLocaleString()}
                  </span>
                  <p className="text-[#334155]" style={{ lineHeight: 1.5 }}>
                    {[
                      e.delegateName ? `${e.delegateName}` : null,
                      e.targetName ? `→ ${e.targetName}` : null,
                      e.actorName ? `(by ${e.actorName})` : null,
                    ]
                      .filter(Boolean)
                      .join(" ")}
                  </p>
                  {e.detail && (
                    <p className="text-[12.5px] text-[#64748B]" style={{ lineHeight: 1.5 }}>
                      {e.detail}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

/* ── Small shared bits ────────────────────────────────────────────────────── */

function SectionTitle({
  icon,
  title,
  hint,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: string;
}) {
  return (
    <div className="mb-4">
      <h2 className="flex items-center gap-2 text-[15px] font-semibold text-[#0F172A]">
        <span className="text-[#64748B]">{icon}</span>
        {title}
      </h2>
      {hint && (
        <p className="mt-1 text-[13px] text-[#64748B]" style={{ lineHeight: 1.55 }}>
          {hint}
        </p>
      )}
    </div>
  );
}

function Callout({
  tone,
  children,
}: {
  tone: "error" | "warn";
  children: React.ReactNode;
}) {
  const s =
    tone === "error"
      ? { border: "#FECACA", bg: "#FEF2F2", fg: "#A80400" }
      : { border: "#FDE68A", bg: "#FFFBEB", fg: "#92400E" };
  return (
    <div
      role="alert"
      className="mt-4 rounded-md px-3 py-2 text-[13px]"
      style={{ border: `1px solid ${s.border}`, background: s.bg, color: s.fg, lineHeight: 1.55 }}
    >
      {children}
    </div>
  );
}

function Td({ children }: { children?: React.ReactNode }) {
  return <td className="border-b border-[#F1F5F9] py-2.5 pr-3 text-[#334155]">{children}</td>;
}

function Sub({ children }: { children: React.ReactNode }) {
  return <div className="text-[12px] text-[#94A3B8]">{children}</div>;
}
