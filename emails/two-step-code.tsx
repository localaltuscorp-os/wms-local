import { Heading, Text } from "@react-email/components";
import { EmailLayout } from "./_layout";

type Props = {
  code: string;
  minutes: number;
  recipientName?: string;
};

export function TwoStepCodeEmail({ code, minutes, recipientName }: Props) {
  const greeting = recipientName ? `Hi ${recipientName.split(" ")[0]},` : "Your sign-in code";
  return (
    <EmailLayout preview={`${code} is your Altus Corp sign-in code`}>
      <Heading style={{ fontSize: 20, color: "#0F172A", margin: "0 0 16px" }}>
        {greeting}
      </Heading>
      <Text style={{ fontSize: 14, color: "#334155", lineHeight: 1.6, margin: "0 0 16px" }}>
        Enter this code to finish signing in to Altus Corp Dashboard:
      </Text>
      <Text
        style={{
          fontSize: 32,
          fontWeight: 700,
          letterSpacing: "0.3em",
          color: "#0F172A",
          textAlign: "center",
          margin: "0 0 16px",
          fontFamily: "Menlo, Consolas, monospace",
        }}
      >
        {code}
      </Text>
      <Text style={{ fontSize: 14, color: "#334155", lineHeight: 1.6, margin: "0 0 16px" }}>
        It expires in <strong>{minutes} minutes</strong>. Once you enter it, this browser won&apos;t
        ask again until tomorrow.
      </Text>
      <Text style={{ fontSize: 12, color: "#94A3B8", margin: "16px 0 0" }}>
        Didn&apos;t try to sign in? Someone has your password. Don&apos;t share this code — change
        your password and tell your admin.
      </Text>
    </EmailLayout>
  );
}

export default TwoStepCodeEmail;
