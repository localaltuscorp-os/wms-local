"use client";

import { useState, useTransition } from "react";
import * as Dialog from "@radix-ui/react-dialog";
import { Laptop, Smartphone } from "lucide-react";
import { registerThisDeviceAction } from "@/lib/security/device-registration-actions";
import type { DevicePlatform } from "@/lib/security/device-registration-rules";

/**
 * FIRST-LOGIN DEVICE REGISTRATION MODAL (0222).
 *
 * ── WHY IT CANNOT BE DISMISSED ─────────────────────────────────────────────
 * `onOpenChange` is not passed and every Radix escape hatch is closed:
 * `onEscapeKeyDown`, `onPointerDownOutside` and `onInteractOutside` are all
 * prevented, and there is no close button. A dismissible version would be
 * decorative — the employee would simply close it and carry on, and the device
 * would stay unregistered.
 *
 * This is NOT the security boundary and is not pretending to be one. The gate
 * is server-side in `resolveDeviceContext`; this modal is the means of
 * collecting a device name and a consent record from somebody who has already passed
 * that gate. Someone who deletes the node from the DOM has bypassed a form, not
 * an access control.
 *
 * ── WHAT IS NOT COLLECTED ──────────────────────────────────────────────────
 * No canvas hash, no font enumeration, no screen metrics, no CPU or memory
 * probe, no timezone. The platform line is read from the user-agent the browser
 * volunteers and is shown back to the employee for recognition only.
 */
export function DeviceRegistrationModal({
  kind,
  platform,
  needsDeviceName,
  deviceNameHelp,
}: {
  kind: "laptop" | "phone";
  platform: DevicePlatform;
  needsDeviceName: boolean;
  deviceNameHelp: { label: string; primary: string; secondary?: string };
}) {
  const [deviceName, setDeviceName] = useState("");
  const [manufacturer, setManufacturer] = useState("");
  const [model, setModel] = useState("");
  const [consent, setConsent] = useState(false);
  const [fieldError, setFieldError] = useState<{ field: string; error: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const isLaptop = kind === "laptop";
  const title = isLaptop ? "Register Your Laptop" : "Register Your Device";
  const cta = isLaptop ? "Register Laptop" : "Register Device";
  const Icon = isLaptop ? Laptop : Smartphone;

  // Consent gates the button, exactly as specified. The device name is NOT part
  // of this condition on purpose: an empty name should produce a sentence under
  // the field explaining what is wrong, not a button that silently never works.
  const canSubmit = consent && !pending;

  function submit() {
    setFieldError(null);
    startTransition(async () => {
      const res = await registerThisDeviceAction({
        deviceName: needsDeviceName ? deviceName : null,
        manufacturer: manufacturer || null,
        model: model || null,
        consent,
      });
      if (res.ok) {
        // A full reload, not a router.refresh(): the device cookie may have
        // just been set on this response, and every server component on the
        // page resolved its device context before that existed.
        window.location.reload();
        return;
      }
      setFieldError({ field: res.field, error: res.error });
    });
  }

  const nameError = fieldError?.field === "deviceName" ? fieldError.error : null;
  const consentError = fieldError?.field === "consent" ? fieldError.error : null;
  const formError = fieldError?.field === "form" ? fieldError.error : null;

  return (
    <Dialog.Root open>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/50 z-[200]" />
        <Dialog.Content
          className="fixed left-1/2 top-1/2 z-[210] -translate-x-1/2 -translate-y-1/2 w-full max-w-[500px] rounded-xl bg-white border border-[#E2E8F0] p-6 shadow-lg max-h-[calc(100dvh-32px)] overflow-y-auto"
          onEscapeKeyDown={(e) => e.preventDefault()}
          onPointerDownOutside={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <div className="flex items-start gap-3">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#EFF6FF] text-[#1D4ED8]">
              <Icon size={18} aria-hidden />
            </span>
            <div className="min-w-0">
              <Dialog.Title className="font-serif text-xl text-[#0F172A]">{title}</Dialog.Title>
              <Dialog.Description className="text-[13.5px] text-[#64748B] mt-1" style={{ lineHeight: 1.5 }}>
                This is your first login from this {isLaptop ? "laptop" : "device"}. Register it to
                secure access to WMS.
              </Dialog.Description>
            </div>
          </div>

          {/* What we detected, shown back so the employee recognises the device
              they are registering. Display only — never a security identifier. */}
          <p className="mt-3 text-[12.5px] text-[#64748B]">
            {platform.hardware} · {platform.browser} · {platform.os}
          </p>

          {needsDeviceName && (
            <div className="mt-5">
              <label htmlFor="device-name" className="block text-[12px] font-semibold tracking-wide text-[#334155] uppercase">
                Device Name <span className="text-[#DC2626]">*</span>
              </label>
              <input
                id="device-name"
                value={deviceName}
                onChange={(e) => {
                  setDeviceName(e.target.value);
                  if (nameError) setFieldError(null);
                }}
                placeholder="e.g. DESKTOP-2874MGH"
                autoComplete="off"
                spellCheck={false}
                aria-invalid={nameError ? true : undefined}
                aria-describedby={nameError ? "device-name-error" : "device-name-help"}
                className={`mt-1.5 w-full rounded-lg border px-3 py-2 text-[14px] text-[#0F172A] outline-none focus:ring-2 focus:ring-[#BFDBFE] ${
                  nameError ? "border-[#DC2626]" : "border-[#CBD5E1]"
                }`}
              />
              {nameError && (
                <p id="device-name-error" className="mt-1.5 text-[12.5px] text-[#DC2626]">
                  {nameError}
                </p>
              )}

              <div id="device-name-help" className="mt-2 text-[12px] text-[#64748B]">
                <span className="font-semibold text-[#475569]">How to find it</span>
                <div className="mt-1">{deviceNameHelp.label}</div>
                <code className="mt-1 block rounded bg-[#F1F5F9] px-2 py-1 font-mono text-[11.5px] text-[#334155] break-all">
                  {deviceNameHelp.primary}
                </code>
                {deviceNameHelp.secondary && (
                  <code className="mt-1 block rounded bg-[#F1F5F9] px-2 py-1 font-mono text-[11.5px] text-[#334155] break-all">
                    {deviceNameHelp.secondary}
                  </code>
                )}
              </div>

              {/* Optional, and manual. A browser cannot read any of these — see
                  the Phase 1 limitation — so asking is the only honest route.
                  They exist so an administrator can match a name to a machine. */}
              <div className="mt-3 grid grid-cols-2 gap-2">
                <input
                  value={manufacturer}
                  onChange={(e) => setManufacturer(e.target.value)}
                  placeholder="Manufacturer (optional)"
                  autoComplete="off"
                  className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-[13px] text-[#0F172A] outline-none focus:ring-2 focus:ring-[#BFDBFE]"
                />
                <input
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="Model (optional)"
                  autoComplete="off"
                  className="w-full rounded-lg border border-[#CBD5E1] px-3 py-2 text-[13px] text-[#0F172A] outline-none focus:ring-2 focus:ring-[#BFDBFE]"
                />
              </div>
            </div>
          )}

          <hr className="my-5 border-[#E2E8F0]" />

          <label className="flex items-start gap-2.5 cursor-pointer">
            <input
              type="checkbox"
              checked={consent}
              onChange={(e) => {
                setConsent(e.target.checked);
                if (consentError) setFieldError(null);
              }}
              className="mt-0.5 h-4 w-4 shrink-0 accent-[#1D4ED8]"
            />
            <span className="text-[13px] text-[#0F172A] font-medium" style={{ lineHeight: 1.45 }}>
              I understand and consent to WMS device registration and access control.
            </span>
          </label>
          <p className="mt-1.5 ml-[26px] text-[12px] text-[#64748B]" style={{ lineHeight: 1.45 }}>
            Your device information is used only for WMS security and device access. For more
            information, contact HR or Manan Vasa.
          </p>
          {consentError && <p className="mt-1.5 ml-[26px] text-[12.5px] text-[#DC2626]">{consentError}</p>}

          {formError && <p className="mt-3 text-[12.5px] text-[#DC2626]">{formError}</p>}

          <button
            type="button"
            onClick={submit}
            disabled={!canSubmit}
            className="mt-5 w-full rounded-lg bg-[#1D4ED8] px-4 py-2.5 text-[14px] font-semibold text-white transition disabled:cursor-not-allowed disabled:bg-[#CBD5E1] disabled:text-[#64748B] hover:bg-[#1E40AF]"
          >
            {pending ? "Registering…" : cta}
          </button>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
