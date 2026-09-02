"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { UploadCloud } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { uploadSalaryPolicy } from "@/app/(app)/salary/policy/actions";

/**
 * Admin control to publish (or replace) the current salary-policy PDF with a
 * version label. Calls the `uploadSalaryPolicy` server action; on success it
 * refreshes so the new current policy renders.
 */
export function PolicyUploadForm({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const form = new FormData(e.currentTarget);
      const res = await uploadSalaryPolicy(form);
      if (!res.ok) {
        fireToast({ message: res.error });
        return;
      }
      fireToast({ message: "Salary policy published." });
      formRef.current?.reset();
      router.refresh();
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form
      ref={formRef}
      onSubmit={onSubmit}
      className="rounded-section border border-hairline bg-surface-card p-6"
    >
      <div className="flex items-center gap-2 mb-3">
        <UploadCloud size={16} strokeWidth={2.2} className="text-ink-soft" />
        <h3 className="text-[15px] font-bold text-ink-strong">
          {compact ? "Publish a new version" : "Publish the salary policy"}
        </h3>
      </div>

      <div className="flex flex-col gap-3 max-w-md">
        <label className="block">
          <span className="text-[13px] font-medium text-ink-soft">Version label</span>
          <input
            name="version"
            type="text"
            required
            maxLength={40}
            placeholder="e.g. v1.0 (Apr 2026)"
            className="mt-1 w-full rounded-md border border-hairline bg-surface-card py-2.5 px-3.5 text-[14px] text-ink-strong"
          />
        </label>

        <label className="block">
          <span className="text-[13px] font-medium text-ink-soft">Policy PDF</span>
          <input
            name="file"
            type="file"
            accept="application/pdf"
            required
            className="mt-1 block w-full text-[13px] text-ink-soft file:mr-3 file:rounded-md file:border file:border-hairline file:bg-surface-card file:px-3.5 file:py-2 file:text-[13px] file:font-medium file:text-ink-strong"
          />
        </label>
      </div>

      <button
        type="submit"
        disabled={submitting}
        className="mt-5 inline-flex items-center gap-1.5 rounded-md py-2.5 px-5 text-[14px] font-medium text-white disabled:opacity-50"
        style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}
      >
        <UploadCloud size={15} strokeWidth={2.2} />
        {submitting ? "Publishing…" : "Publish policy"}
      </button>
      {compact ? (
        <p className="mt-2 text-[12px] text-ink-subtle">
          Publishing a new version supersedes the current one; employees re-sign.
        </p>
      ) : null}
    </form>
  );
}
