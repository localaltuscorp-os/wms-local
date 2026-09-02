"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Users } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { setIncentiveSocialEarner } from "@/app/(app)/incentive/actions";

/**
 * Admin control for the permanent default earner of "PS Sold through Social
 * Media" — applied to new entries on every sync. (Individual entries can still
 * be reassigned from each card's Admin · Payout panel.)
 */
export function SocialEarnerSetting({
  current,
  employees,
}: {
  current: string;
  employees: { id: string; name: string }[];
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function save(name: string) {
    if (!name || name === current) return;
    start(async () => {
      const res = await setIncentiveSocialEarner({ name });
      if (!res.ok) { fireToast({ message: res.error, type: "error" }); return; }
      fireToast({ message: "Default social-sale earner updated.", type: "success" });
      router.refresh();
    });
  }

  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-hairline bg-surface-card px-3 py-1.5">
      <Users size={15} className="text-ink-muted" />
      <span className="text-[12.5px] font-bold text-ink-soft whitespace-nowrap">PS-Social earner:</span>
      <select
        value={employees.some((e) => e.name === current) ? current : ""}
        disabled={pending}
        onChange={(e) => save(e.target.value)}
        className="bg-transparent text-[13px] font-bold text-ink-strong outline-none"
      >
        {employees.some((e) => e.name === current) ? null : <option value="">{current}</option>}
        {employees.map((e) => <option key={e.id} value={e.name}>{e.name}</option>)}
      </select>
    </div>
  );
}
