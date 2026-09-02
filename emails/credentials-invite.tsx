import { Heading, Link, Text } from "@react-email/components";
import { EmailLayout } from "./_layout";

type Props = {
  inviteeName: string;
  inviterName: string;
  email: string;
  password: string;
  loginUrl: string;
};

export function CredentialsInviteEmail({
  inviteeName,
  inviterName,
  email,
  password,
  loginUrl,
}: Props) {
  const firstName = inviteeName.split(" ")[0] ?? inviteeName;
  const inviterFirst = inviterName.split(" ")[0] ?? inviterName;
  return (
    <EmailLayout preview={`${inviterName} added you to Altus Corp Dashboard`}>
      <Heading style={{ fontSize: 20, color: "#0F172A", margin: "0 0 16px" }}>
        Hi {firstName},
      </Heading>
      <Text style={{ fontSize: 14, color: "#334155", lineHeight: 1.6, margin: "0 0 16px" }}>
        <strong>{inviterName}</strong> has added you to the Altus Corp Dashboard —
        the work-management tool the team uses to track tasks day-to-day. Sign in
        with the details below.
      </Text>
      <div
        style={{
          background: "#F8FAFC",
          border: "1px solid #E2E8F0",
          borderRadius: 8,
          padding: 16,
          margin: "0 0 20px",
        }}
      >
        <Text style={{ fontSize: 13, color: "#64748B", margin: "0 0 4px" }}>Email</Text>
        <Text style={{ fontSize: 15, color: "#0F172A", fontWeight: 600, margin: "0 0 12px" }}>
          {email}
        </Text>
        <Text style={{ fontSize: 13, color: "#64748B", margin: "0 0 4px" }}>Password</Text>
        <Text
          style={{
            fontSize: 15,
            color: "#0F172A",
            fontWeight: 600,
            fontFamily: "monospace",
            margin: 0,
          }}
        >
          {password}
        </Text>
      </div>
      <Text style={{ fontSize: 14, color: "#334155", lineHeight: 1.6, margin: "0 0 16px" }}>
        Sign in here:{" "}
        <Link href={loginUrl} style={{ color: "#A80400" }}>
          {loginUrl}
        </Link>
      </Text>
      <Text style={{ fontSize: 13, color: "#334155", lineHeight: 1.6, margin: "0 0 16px" }}>
        You can change your password anytime from your Profile. If you've already
        set your own password, keep using it — this message just confirms your
        account is ready.
      </Text>
      <Text style={{ fontSize: 12, color: "#94A3B8", margin: "16px 0 0" }}>
        If you weren't expecting this, contact {inviterFirst} or your administrator.
      </Text>
    </EmailLayout>
  );
}

export default CredentialsInviteEmail;
