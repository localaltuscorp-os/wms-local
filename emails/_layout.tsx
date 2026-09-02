import {
  Body,
  Container,
  Head,
  Hr,
  Html,
  Preview,
  Text,
} from "@react-email/components";
import type { ReactNode } from "react";

export function EmailLayout({
  preview,
  children,
}: {
  preview: string;
  children: ReactNode;
}) {
  return (
    <Html>
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: "#FAFBFC", fontFamily: "Inter, Arial, sans-serif", margin: 0, padding: "32px 0" }}>
        <Container style={{ maxWidth: 560, margin: "0 auto", padding: 0 }}>
          <div style={{ marginBottom: 24, display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{
              display: "inline-block",
              padding: "4px 10px",
              borderRadius: 999,
              backgroundColor: "#E10600",
              color: "#ffffff",
              fontSize: 11,
              fontWeight: 600,
              letterSpacing: "0.05em",
            }}>ALTUS</span>
            <span style={{ color: "#0F172A", fontWeight: 600, fontSize: 16 }}>
              Altus Corp Dashboard
            </span>
          </div>
          <div style={{
            backgroundColor: "#ffffff",
            border: "1px solid #E2E8F0",
            borderRadius: 12,
            padding: 32,
          }}>
            {children}
          </div>
          <Hr style={{ borderColor: "#E2E8F0", margin: "24px 0 16px" }} />
          <Text style={{ fontSize: 12, color: "#64748B", textAlign: "center", margin: 0 }}>
            Altus Corp Dashboard · Mumbai
          </Text>
          <Text style={{ fontSize: 11, color: "#94A3B8", textAlign: "center", margin: "4px 0 0" }}>
            Operational notifications. To stop receiving them, deactivate your account.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
