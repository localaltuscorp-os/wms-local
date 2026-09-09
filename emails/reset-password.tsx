import { Heading, Link, Text } from "@react-email/components";
import { EmailLayout } from "./_layout";
import { PrimaryButton } from "./_components";

type Props = {
  link: string;
  recipientName?: string;
};

export function ResetPasswordEmail({ link, recipientName }: Props) {
  const greeting = recipientName ? `Hi ${recipientName.split(" ")[0]},` : "Reset your password";
  return (
    <EmailLayout preview="Reset your Altus Corp password">
      <Heading style={{ fontSize: 20, color: "#0F172A", margin: "0 0 16px" }}>
        {greeting}
      </Heading>
      <Text style={{ fontSize: 14, color: "#334155", lineHeight: 1.6, margin: "0 0 16px" }}>
        Someone — likely you — asked to reset the password for your Altus Corp Dashboard account.
        Click the button below to choose a new one.
      </Text>
      <Text style={{ fontSize: 14, color: "#334155", lineHeight: 1.6, margin: "0 0 24px" }}>
        This link expires in <strong>1 hour</strong>. After that, request a fresh one from the sign-in page.
      </Text>
      <div style={{ textAlign: "center" }}>
        <PrimaryButton href={link}>Choose new password</PrimaryButton>
      </div>
      <Text style={{ fontSize: 12, color: "#64748B", lineHeight: 1.6, margin: "24px 0 0" }}>
        Button not working? Paste this link into your browser:
        <br />
        <Link href={link} style={{ color: "#A80400", wordBreak: "break-all" }}>
          {link}
        </Link>
      </Text>
      <Text style={{ fontSize: 12, color: "#94A3B8", margin: "16px 0 0" }}>
        If you didn't request this, you can safely ignore this email — your password won't change.
      </Text>
    </EmailLayout>
  );
}

export default ResetPasswordEmail;
