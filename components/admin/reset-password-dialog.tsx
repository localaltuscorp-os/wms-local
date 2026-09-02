"use client";

import { useState, useTransition } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Eye, EyeOff, Sparkles, KeyRound } from "lucide-react";
import { fireToast } from "@/lib/toast";
import { generatePassword } from "@/lib/auth/generate-password";
import { resetEmployeePassword } from "@/app/(admin)/admin/employees/actions";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employee: { id: string; name: string };
}

export function ResetPasswordDialog({ open, onOpenChange, employee }: Props) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [pending, start] = useTransition();

  const tooShort = password.length > 0 && password.length < 8;
  const mismatch = confirm.length > 0 && confirm !== password;
  const canSubmit = password.length >= 8 && confirm === password && !pending;

  function handleGenerate() {
    const pw = generatePassword(16);
    setPassword(pw);
    setConfirm(pw);
    setShow(true);
  }

  function handleSubmit() {
    if (!canSubmit) return;
    start(async () => {
      const res = await resetEmployeePassword(employee.id, password);
      if (res.ok) {
        fireToast({
          message:
            res.warning ??
            `Password reset for ${employee.name} — they've been signed out and emailed.`,
        });
        setPassword("");
        setConfirm("");
        setShow(false);
        onOpenChange(false);
      } else {
        fireToast({ message: res.error ?? "Could not reset password." });
      }
    });
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/40 z-[90]" />
        <Dialog.Content className="fixed left-1/2 top-1/2 z-[100] -translate-x-1/2 -translate-y-1/2 w-full max-w-md rounded-xl bg-white border border-[#E2E8F0] p-6 shadow-lg max-h-[calc(100dvh-32px)] overflow-y-auto">
          <div className="flex items-start gap-3 mb-3">
            <span
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full"
              style={{ background: "rgba(225, 6, 0, 0.10)", color: "#A80400" }}
              aria-hidden
            >
              <KeyRound size={18} strokeWidth={2.3} />
            </span>
            <div className="min-w-0">
              <Dialog.Title className="font-serif text-xl text-[#0F172A]">
                Reset password for {employee.name}
              </Dialog.Title>
              <Dialog.Description
                className="text-[13.5px] text-[#64748B] mt-1"
                style={{ lineHeight: 1.5 }}
              >
                Sets a new password and <strong>signs them out of all devices</strong>.
                Share the new password with them directly — they'll also get an
                email letting them know it was changed.
              </Dialog.Description>
            </div>
          </div>

          <div className="space-y-3 mt-4">
            <label className="block">
              <span className="block text-[13px] font-semibold text-[#334155] mb-1.5">
                New password
              </span>
              <div className="relative">
                <input
                  type={show ? "text" : "password"}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full rounded-md border border-[#CBD5E1] px-3 py-2 pr-10 text-[14px] outline-none focus:border-[#0F172A] focus:ring-2 focus:ring-[#0F172A]/20"
                  disabled={pending}
                />
                <button
                  type="button"
                  onClick={() => setShow((v) => !v)}
                  aria-label={show ? "Hide password" : "Show password"}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-[#64748B] hover:text-[#0F172A]"
                >
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {tooShort && (
                <span className="block text-[12px] text-[#A80400] mt-1">
                  Must be at least 8 characters.
                </span>
              )}
            </label>

            <label className="block">
              <span className="block text-[13px] font-semibold text-[#334155] mb-1.5">
                Confirm password
              </span>
              <input
                type={show ? "text" : "password"}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="w-full rounded-md border border-[#CBD5E1] px-3 py-2 text-[14px] outline-none focus:border-[#0F172A] focus:ring-2 focus:ring-[#0F172A]/20"
                disabled={pending}
              />
              {mismatch && (
                <span className="block text-[12px] text-[#A80400] mt-1">
                  Passwords don't match.
                </span>
              )}
            </label>

            <button
              type="button"
              onClick={handleGenerate}
              disabled={pending}
              className="inline-flex items-center gap-1.5 text-[13px] font-medium text-[#A80400] hover:underline"
            >
              <Sparkles size={14} />
              Generate strong password
            </button>
          </div>

          <div className="flex justify-end gap-2 pt-5">
            <Dialog.Close asChild>
              <button
                type="button"
                className="px-4 py-2.5 text-[14px] font-medium text-[#64748B]"
                disabled={pending}
              >
                Cancel
              </button>
            </Dialog.Close>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="rounded-md py-2.5 px-5 text-[14px] font-semibold text-white disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: "linear-gradient(135deg, #E10600, #A80400)" }}
            >
              {pending ? "Resetting…" : "Reset password"}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
