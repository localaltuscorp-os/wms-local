import { Button as REmailButton } from "@react-email/components";
import type { ReactNode } from "react";

export function PrimaryButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <REmailButton
      href={href}
      style={{
        background: "linear-gradient(135deg, #E10600, #A80400)",
        color: "#ffffff",
        padding: "12px 24px",
        borderRadius: 8,
        fontSize: 14,
        fontWeight: 500,
        textDecoration: "none",
        display: "inline-block",
      }}
    >
      {children}
    </REmailButton>
  );
}
