"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2, Download } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { seedConstitution } from "@/app/(app)/pms/v3/actions";

/** Admin-only: seed the Constitution paragraphs verbatim from the captured Doc. */
export function SeedConstitutionButton({ accent, accentDeep }: { accent: string; accentDeep: string }) {
  const router = useRouter();
  const [pending, start] = React.useTransition();
  return (
    <button
      type="button"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await seedConstitution();
          if (res.ok) { fireToast({ message: "Constitution seeded (29 paragraphs).", type: "success" }); router.refresh(); }
          else fireToast({ message: res.error, type: "error" });
        })
      }
      className="brand-btn wg-btn inline-flex items-center gap-2 rounded-lg px-4 py-2.5 text-[14px] font-bold text-white disabled:opacity-50"
      style={{ background: `linear-gradient(135deg, ${accent}, ${accentDeep})` }}
    >
      {pending ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} strokeWidth={2.4} />}
      Seed Constitution Paragraphs
    </button>
  );
}
