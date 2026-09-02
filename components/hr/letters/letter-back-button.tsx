"use client";

import { useRouter } from "next/navigation";
import { ArrowLeft } from "lucide-react";

/**
 * "Back" — returns to the page the letter was opened from (the CTC Workbench,
 * a Management-Assessment outcome, the All-Letters library, …) so the user can
 * pick up editing exactly where they left. Uses history back rather than a fixed
 * href so it is correct for every entry point; the Workbench self-restores its
 * draft from localStorage on return.
 */
export function LetterBackButton() {
  const router = useRouter();
  return (
    <button
      type="button"
      onClick={() => router.back()}
      className="inline-flex items-center gap-1.5 rounded-full border border-hairline-strong bg-white px-3.5 py-2 text-[13px] font-bold text-ink-strong transition-colors hover:border-ink-muted max-md:px-2.5"
      title="Back to the previous page"
    >
      <ArrowLeft size={15} strokeWidth={2.4} />
      <span className="max-md:hidden">Back</span>
    </button>
  );
}

export default LetterBackButton;
