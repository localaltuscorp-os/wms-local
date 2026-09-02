"use client";

import { Eye, EyeOff } from "lucide-react";

export function PasswordEye({
  visible,
  onToggle,
}: {
  visible: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={visible ? "Hide password" : "Show password"}
      aria-pressed={visible}
      className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-[#64748B] transition-all duration-200 hover:text-[#0F172A] hover:bg-[#0F172A]/[0.04] active:scale-95"
    >
      <span
        className="relative inline-block h-5 w-5 transition-transform duration-300"
        style={{ transform: visible ? "rotateY(180deg)" : "rotateY(0deg)" }}
      >
        <Eye
          className="absolute inset-0 h-5 w-5 transition-opacity duration-200"
          style={{ opacity: visible ? 0 : 1 }}
          aria-hidden
        />
        <EyeOff
          className="absolute inset-0 h-5 w-5 transition-opacity duration-200"
          style={{ opacity: visible ? 1 : 0 }}
          aria-hidden
        />
      </span>
    </button>
  );
}
