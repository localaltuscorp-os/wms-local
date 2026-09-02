import { Heading, Text } from "@react-email/components";
import { EmailLayout } from "./_layout";

type Props = {
  recipientName?: string;
};

export function AdminResetPasswordEmail({ recipientName }: Props) {
  const greeting = recipientName
    ? `Hi ${recipientName.split(" ")[0]},`
    : "Your password was reset";
  return (
    <EmailLayout preview="An administrator reset your Altus Corp password">
      <Heading style={{ fontSize: 20, color: "#0F172A", margin: "0 0 16px" }}>
        {greeting}
      </Heading>
      <Text style={{ fontSize: 14, color: "#334155", lineHeight: 1.6, margin: "0 0 16px" }}>
        An administrator has reset the password for your Altus Corp Dashboard
        account. For your security, you've been signed out of all devices.
      </Text>
      <Text style={{ fontSize: 14, color: "#334155", lineHeight: 1.6, margin: "0 0 16px" }}>
        Please sign in using the new password your administrator shared with you.
      </Text>
      <Text style={{ fontSize: 12, color: "#94A3B8", margin: "16px 0 0" }}>
        If you didn't expect this change, contact your administrator or support
        right away.
      </Text>
    </EmailLayout>
  );
}

export default AdminResetPasswordEmail;
