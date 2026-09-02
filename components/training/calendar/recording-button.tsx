"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Film, Loader2, Check } from "lucide-react";
import { fireToast } from "@/lib/toast";

const ACCENT = "#E10600";

/** Request-for-recording action. `action` is the bound server action passed from
 *  the server component. */
export function RecordingButton({
  sessionId,
  requested,
  action,
}: {
  sessionId: string;
  requested: boolean;
  action: (id: string) => Promise<{ ok: true } | { ok: false; error: string }>;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [done, setDone] = React.useState(requested);

  React.useEffect(() => setDone(requested), [requested]);

  async function onClick() {
    if (pending || done) return;
    setPending(true);
    const res = await action(sessionId);
    setPending(false);
    if (!res.ok) return fireToast({ message: res.error, type: "error" });
    setDone(true);
    fireToast({ message: "Recording requested.", type: "success" });
    router.refresh();
  }

  if (done) {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-xl border border-hairline bg-surface-soft px-4 py-2.5 text-[14px] font-bold text-ink-subtle">
        <Check size={15} strokeWidth={2.6} /> Recording requested
      </span>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={pending}
      className="inline-flex items-center gap-2 rounded-xl border border-hairline-strong bg-white px-4 py-2.5 text-[14px] font-bold text-ink-soft hover:border-ink-subtle disabled:opacity-50"
      style={{ ["--tc" as string]: ACCENT }}
    >
      {pending ? <Loader2 size={15} className="animate-spin" /> : <Film size={15} />} Request Recording
    </button>
  );
}
