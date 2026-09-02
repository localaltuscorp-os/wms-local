"use client";

import { useState, useTransition } from "react";
import { Loader2, CheckCircle2, AlertCircle } from "lucide-react";
import type { IntegrationStatus } from "@/lib/queries/integration-health";
import { sendIntegrationTestAction } from "@/app/(admin)/admin/settings/actions";

const TITLES: Record<IntegrationStatus["channel"], string> = {
  email: "Email (Resend)",
  slack: "Slack",
  whatsapp: "WhatsApp",
  push: "Web Push",
};

export function IntegrationCard({ status }: { status: IntegrationStatus }) {
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<"ok" | "err" | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  function onTest() {
    setResult(null);
    setMsg(null);
    startTransition(async () => {
      const r = await sendIntegrationTestAction(status.channel);
      if (r.ok) {
        setResult("ok");
        setMsg("Sent. Check your inbox / device.");
      } else {
        setResult("err");
        setMsg(r.error);
      }
    });
  }

  return (
    <div className="rounded-2xl border border-[rgba(15,23,42,0.08)] bg-white/70 p-5 backdrop-blur-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-display-2xs">{TITLES[status.channel]}</h3>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
            status.connected
              ? "bg-emerald-100 text-emerald-700"
              : "bg-zinc-100 text-zinc-600"
          }`}
        >
          <span
            className={`h-1.5 w-1.5 rounded-full ${
              status.connected ? "bg-emerald-500" : "bg-zinc-400"
            }`}
          />
          {status.connected ? "Connected" : "Not configured"}
        </span>
      </div>

      <dl className="mt-4 space-y-1 text-sm">
        <div className="flex justify-between">
          <dt className="text-ink-subtle">Credential</dt>
          <dd className="font-mono">{status.maskedKey ?? "—"}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-subtle">Last 24h success</dt>
          <dd className="font-mono">{status.successLast24h}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-ink-subtle">Last sent</dt>
          <dd className="font-mono">
            {/* Deterministic format — bare toLocaleString() differs between
                server and browser locales and hydration-crashed the whole
                settings page (regenerating, and wiping, the General form). */}
            {status.lastSuccessAt
              ? new Intl.DateTimeFormat("en-IN", {
                  timeZone: "Asia/Kolkata",
                  day: "2-digit",
                  month: "short",
                  year: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                  hour12: true,
                }).format(new Date(status.lastSuccessAt))
              : "—"}
          </dd>
        </div>
      </dl>

      <div className="mt-4 flex items-center gap-3">
        <button
          type="button"
          onClick={onTest}
          disabled={!status.connected || pending}
          className="inline-flex items-center gap-1.5 rounded-md border border-[rgba(15,23,42,0.10)] bg-white px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
        >
          {pending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          {pending ? "Sending…" : "Send test to me"}
        </button>
        {result === "ok" && (
          <span className="inline-flex items-center gap-1 text-sm text-emerald-700">
            <CheckCircle2 className="h-4 w-4" /> {msg}
          </span>
        )}
        {result === "err" && (
          <span className="inline-flex items-center gap-1 text-sm text-red-600">
            <AlertCircle className="h-4 w-4" /> {msg}
          </span>
        )}
      </div>
    </div>
  );
}
