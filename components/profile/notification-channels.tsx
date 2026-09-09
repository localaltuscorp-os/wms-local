"use client";

import { useState, useTransition } from "react";
import { fireToast } from "@/lib/toast";
import { updateMyChannels } from "@/app/(app)/profile/actions";

interface Current {
  emailOptIn: boolean;
  slackOptIn: boolean;
  whatsappOptedIn: boolean;
  whatsappPhone: string | null;
}

export function NotificationChannels({ current }: { current: Current }) {
  const [email, setEmail] = useState(current.emailOptIn);
  const [slack, setSlack] = useState(current.slackOptIn);
  const [pending, startTransition] = useTransition();

  function flip(channel: "email" | "slack", next: boolean) {
    const patch =
      channel === "email" ? { emailOptIn: next } : { slackOptIn: next };
    startTransition(async () => {
      const res = await updateMyChannels(patch);
      if (!res.ok) {
        fireToast({ message: res.error });
        return;
      }
      if (channel === "email") setEmail(next);
      else setSlack(next);
      fireToast({ message: "Preferences saved." });
    });
  }

  return (
    <fieldset className="space-y-4 rounded-lg border border-[#E2E8F0] bg-white p-5">
      <legend className="px-2 text-[13px] uppercase tracking-wide text-[#94A3B8] font-bold">
        Notification channels
      </legend>
      <Row
        label="Email"
        sub="Delivered to your work email — covers every task event."
        checked={email}
        onChange={(n) => flip("email", n)}
        pending={pending}
      />
      <Row
        label="Slack DM"
        sub="Auto-discovered via your work email if you're in the workspace."
        checked={slack}
        onChange={(n) => flip("slack", n)}
        pending={pending}
      />
      <Row
        label="WhatsApp"
        sub={
          current.whatsappPhone
            ? `On for ${current.whatsappPhone}`
            : "Ask an admin to add your WhatsApp number."
        }
        checked={current.whatsappOptedIn}
        onChange={() => {}}
        pending={pending}
        disabled
      />
      <Row
        label="Web Push"
        sub="Use the 'Enable push' button below to set up this device."
        checked={false}
        onChange={() => {}}
        pending={pending}
        disabled
      />
    </fieldset>
  );
}

function Row(props: {
  label: string;
  sub?: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  pending: boolean;
  disabled?: boolean;
}) {
  return (
    <label
      className={`flex items-start gap-3 text-[15px] ${
        props.disabled ? "opacity-60" : ""
      }`}
      style={{ lineHeight: 1.5 }}
    >
      <input
        type="checkbox"
        checked={props.checked}
        disabled={props.pending || props.disabled}
        onChange={(e) => props.onChange(e.target.checked)}
        className="mt-1.5 h-4 w-4"
      />
      <span>
        <span className="font-semibold text-[#0F172A]">{props.label}</span>
        {props.sub && (
          <span className="block text-[13px] text-[#64748B] mt-0.5">{props.sub}</span>
        )}
      </span>
    </label>
  );
}
