"use client";

import { useState, useTransition } from "react";
import { Check, Loader2 } from "lucide-react";
import type { TaskStatus } from "@/db/enums";
import type { StatusDisplay } from "@/lib/queries/status-display";
import { ColorPicker, colorToCss } from "./color-picker";
import { updateStatusSettingAction } from "@/app/(admin)/admin/settings/actions";

type Props = {
  status: TaskStatus;
  initial: StatusDisplay;
  isLast: boolean;
};

export function StatusRowEditor({ status, initial, isLast }: Props) {
  const [label, setLabel] = useState(initial.label);
  const [color, setColor] = useState(initial.color);
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dirty = label !== initial.label || color !== initial.color;

  function onSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const res = await updateStatusSettingAction({ status, label, color });
      if (res.ok) {
        setSaved(true);
        setTimeout(() => setSaved(false), 1500);
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div
      className={`grid grid-cols-[1fr_2fr_auto_auto] items-center gap-4 px-4 py-3 ${
        isLast ? "" : "border-b border-[rgba(15,23,42,0.06)]"
      }`}
    >
      <span
        className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold"
        style={{
          background: `${colorToCss(color)}1a`,
          color: colorToCss(color),
        }}
      >
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ background: colorToCss(color) }}
        />
        {label}
      </span>

      <input
        type="text"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        className="rounded-md border border-[rgba(15,23,42,0.10)] bg-white px-3 py-1.5 text-sm"
        maxLength={32}
      />

      <ColorPicker value={color} onChange={setColor} />

      <button
        type="button"
        onClick={onSave}
        disabled={!dirty || pending}
        className="inline-flex items-center gap-1.5 rounded-md border border-[rgba(15,23,42,0.10)] bg-white px-3 py-1.5 text-sm font-semibold disabled:opacity-50"
      >
        {pending ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : saved ? (
          <Check className="h-3.5 w-3.5 text-emerald-600" />
        ) : null}
        {pending ? "Saving…" : saved ? "Saved" : "Save"}
      </button>

      {error && (
        <p className="col-span-4 text-xs text-red-600">{error}</p>
      )}
    </div>
  );
}
