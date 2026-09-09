"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Sparkles, Wand2, Loader2, RefreshCw } from "lucide-react";
import type { AmbassadorDetail } from "@/lib/queries/ambassadors";
import { summarizeAmbassador } from "@/app/(app)/ambassadors/doc-ai-actions";
import { fireToast } from "@/lib/toast";
import { formatDate } from "@/lib/format";

function fmtWhen(iso: string | Date | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return formatDate(d);
}

export function TabAi({ detail }: { detail: AmbassadorDetail }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [summary, setSummary] = useState(detail.ambassador.aiSummary ?? "");
  const [at, setAt] = useState<string | Date | null>(detail.ambassador.aiSummaryAt ?? null);

  function generate() {
    startTransition(async () => {
      const res = await summarizeAmbassador(detail.ambassador.id);
      if (!res.ok) {
        fireToast({ message: res.error });
        return;
      }
      setSummary(res.summary);
      setAt(new Date());
      fireToast({ message: "AI summary generated.", type: "success" });
      router.refresh();
    });
  }

  if (summary && summary.trim()) {
    return (
      <section
        className="relative overflow-hidden rounded-2xl border border-hairline bg-white p-6"
        style={{ boxShadow: "0 10px 30px -24px rgba(0,0,0,0.4)" }}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-24 opacity-70"
          style={{ background: "radial-gradient(80% 100% at 18% 0%, color-mix(in srgb, var(--color-altus-red) 9%, transparent), transparent 70%)" }}
        />
        <div className="relative">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="inline-grid h-9 w-9 place-items-center rounded-xl" style={{ background: "rgba(225,6,0,0.10)" }}>
                <Sparkles size={17} strokeWidth={2.5} style={{ color: "var(--color-altus-red-deep)" }} />
              </span>
              <div>
                <h2 className="text-[15px] font-bold text-ink-strong">AI Relationship Summary</h2>
                {at && <span className="text-[11.5px] font-medium text-ink-soft">Generated {fmtWhen(at)}</span>}
              </div>
            </div>
            <button
              type="button"
              onClick={generate}
              disabled={pending}
              className="inline-flex items-center gap-1.5 rounded-lg border border-hairline-strong bg-white py-2 px-3 text-[13px] font-bold text-ink-strong transition-colors hover:border-[color:var(--color-altus-red)] disabled:opacity-60"
            >
              {pending ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} strokeWidth={2.6} />}
              Regenerate
            </button>
          </div>
          <div
            className="whitespace-pre-wrap text-[15px] font-medium leading-relaxed text-ink-strong"
            style={{ fontFamily: "var(--font-serif), Georgia, serif" }}
          >
            {summary}
          </div>
        </div>
      </section>
    );
  }

  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-hairline bg-white p-10 text-center"
      style={{ boxShadow: "0 10px 30px -24px rgba(0,0,0,0.4)" }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-70"
        style={{ background: "radial-gradient(120% 80% at 50% -10%, color-mix(in srgb, var(--color-altus-red) 8%, transparent), transparent 60%)" }}
      />
      <div className="relative">
        <div className="mx-auto mb-4 inline-grid h-14 w-14 place-items-center rounded-2xl" style={{ background: "rgba(225,6,0,0.10)", boxShadow: "inset 0 0 0 1px color-mix(in srgb, var(--color-altus-red) 18%, transparent)" }}>
          <Sparkles size={24} strokeWidth={2.2} style={{ color: "var(--color-altus-red-deep)" }} />
        </div>
        <h2 className="text-[18px] font-extrabold text-ink-strong" style={{ fontFamily: "var(--font-serif), Georgia, serif" }}>
          No AI Summary Yet
        </h2>
        <p className="mx-auto mt-1.5 max-w-md text-[13.5px] font-medium leading-relaxed text-ink-muted">
          Generate a crisp narrative of this partner&apos;s referrals, conversion, revenue, and momentum —
          drafted from their live data.
        </p>
        <button
          type="button"
          onClick={generate}
          disabled={pending}
          className="mt-4 inline-flex items-center gap-2 rounded-xl py-2.5 px-4 text-[14px] font-bold text-white transition-transform active:scale-[0.99] disabled:opacity-60"
          style={{ background: "linear-gradient(135deg, var(--color-altus-red), var(--color-altus-red-deep))" }}
        >
          {pending ? <Loader2 size={16} className="animate-spin" /> : <Wand2 size={16} strokeWidth={2.6} />}
          {pending ? "Generating…" : "Generate AI Summary"}
        </button>
      </div>
    </div>
  );
}
