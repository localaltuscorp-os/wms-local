"use client";

import { useState } from "react";
import * as Popover from "@radix-ui/react-popover";
import { STATUS_COLOR_TOKENS, type StatusColorToken } from "@/db/enums";
import { colorTokenSchema } from "@/lib/validators/color-token";

const TOKEN_BG: Record<StatusColorToken, string> = {
  blue:   "#3b82f6",
  green:  "#22c55e",
  amber:  "#f59e0b",
  red:    "#ef4444",
  rose:   "#f43f5e",
  purple: "#a855f7",
  yellow: "#eab308",
  orange: "#f97316",
  slate:  "#64748b",
  brown:  "#92724e",
  stone:  "#9ca3af",
};

function isPresetToken(v: string): v is StatusColorToken {
  return (STATUS_COLOR_TOKENS as readonly string[]).includes(v);
}

export function colorToCss(token: string): string {
  return isPresetToken(token) ? TOKEN_BG[token] : token;
}

type Props = {
  value: string;
  onChange: (next: string) => void;
};

export function ColorPicker({ value, onChange }: Props) {
  const [hex, setHex] = useState(isPresetToken(value) ? "" : value);
  const [hexError, setHexError] = useState<string | null>(null);

  function commitHex(next: string) {
    const result = colorTokenSchema.safeParse(next);
    if (!result.success) {
      setHexError("Not a valid hex like #a855f7");
      return;
    }
    setHexError(null);
    onChange(next);
  }

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          aria-label="Pick color"
          className="h-7 w-7 rounded-full border border-[rgba(15,23,42,0.12)] shadow-sm"
          style={{ background: colorToCss(value) }}
        />
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={8}
          collisionPadding={12}
          className="z-[100] w-64 rounded-xl border border-[rgba(15,23,42,0.10)] bg-white p-3 shadow-lg max-h-[var(--radix-popover-content-available-height)] overflow-y-auto"
        >
          <div className="grid grid-cols-6 gap-2">
            {STATUS_COLOR_TOKENS.map((t) => (
              <button
                key={t}
                type="button"
                aria-label={t}
                onClick={() => onChange(t)}
                className={`h-7 w-7 rounded-full border transition ${
                  value === t
                    ? "border-[var(--color-altus-red)] ring-2 ring-[var(--color-altus-red)]/30"
                    : "border-[rgba(15,23,42,0.12)] hover:scale-110"
                }`}
                style={{ background: TOKEN_BG[t] }}
              />
            ))}
          </div>
          <div className="mt-3 border-t border-[rgba(15,23,42,0.08)] pt-3">
            <label className="block text-[10px] uppercase tracking-[0.18em] text-ink-subtle font-bold mb-1">
              Custom hex
            </label>
            <input
              type="text"
              value={hex}
              onChange={(e) => setHex(e.target.value)}
              onBlur={() => hex && commitHex(hex)}
              placeholder="#a855f7"
              className="w-full rounded-md border border-[rgba(15,23,42,0.12)] px-2 py-1 text-sm"
            />
            {hexError && (
              <p className="mt-1 text-xs text-red-600">{hexError}</p>
            )}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
