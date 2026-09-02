import { Heading, Link, Text } from "@react-email/components";
import { EmailLayout } from "./_layout";
import { PrimaryButton } from "./_components";

type Props = {
  inviteeName: string;
  inviterName: string;
  link: string;
};

export function InviteEmail({ inviteeName, inviterName, link }: Props) {
  const firstName = inviteeName.split(" ")[0] ?? inviteeName;
  return (
    <EmailLayout preview={`${inviterName} invited you to Altus Corp Dashboard`}>
      <Heading style={{ fontSize: 20, color: "#0F172A", margin: "0 0 16px" }}>
        Hi {firstName},
      </Heading>
      <Text style={{ fontSize: 14, color: "#334155", lineHeight: 1.6, margin: "0 0 16px" }}>
        <strong>{inviterName}</strong> has invited you to the Altus Corp Dashboard —
        the work-management tool the team uses to track tasks day-to-day.
      </Text>
      <Text style={{ fontSize: 14, color: "#334155", lineHeight: 1.6, margin: "0 0 24px" }}>
        Click the button below to set your password and sign in. The link expires in{" "}
        <strong>1 hour</strong>. If it's expired by the time you click, ask {inviterName.split(" ")[0]} to resend it.
      </Text>
      <div style={{ textAlign: "center" }}>
        <PrimaryButton href={link}>Set password and sign in</PrimaryButton>
      </div>
      <Text style={{ fontSize: 12, color: "#64748B", lineHeight: 1.6, margin: "24px 0 0" }}>
        Button not working? Paste this link into your browser:
        <br />
        <Link href={link} style={{ color: "#A80400", wordBreak: "break-all" }}>
          {link}
        </Link>
      </Text>
      <Text style={{ fontSize: 12, color: "#94A3B8", margin: "16px 0 0" }}>
        If you weren't expecting this, you can ignore this email — no account will be created without you signing in.
      </Text>
    </EmailLayout>
  );
}

export default InviteEmail;
