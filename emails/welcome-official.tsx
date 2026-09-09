import { Heading, Link, Text } from "@react-email/components";
import { EmailLayout } from "./_layout";

type Props = {
  employeeName: string;
  /** The newly provisioned firstname.lastname@company address. */
  officialEmail: string;
  /** The email they sign in to the dashboard with (their account email). */
  loginEmail: string;
  /** A fresh login password — only rendered when present (delivered to the
   *  employee's OWN personal inbox). Null => omit the credentials box. */
  password?: string | null;
  loginUrl: string;
  /** The HR desk address for questions. */
  hrEmail: string;
};

/**
 * The post-joining WELCOME email — sent to the employee's PERSONAL inbox the
 * moment HR provisions their official company address. Carries their official
 * email, their dashboard login credentials, and a short induction guide so a
 * new joiner can get set up in one read. Modelled on <CredentialsInviteEmail>.
 */
export function WelcomeOfficialEmail({
  employeeName,
  officialEmail,
  loginEmail,
  password,
  loginUrl,
  hrEmail,
}: Props) {
  const firstName = employeeName.split(" ")[0] ?? employeeName;
  return (
    <EmailLayout preview={`Welcome to Altus Corp — your official email is ${officialEmail}`}>
      <Heading style={{ fontSize: 20, color: "#0F172A", margin: "0 0 16px" }}>
        Welcome aboard, {firstName}🎉
      </Heading>
      <Text style={{ fontSize: 14, color: "#334155", lineHeight: 1.6, margin: "0 0 16px" }}>
        We&apos;re delighted to have you at <strong>Altus Corp</strong>. Your
        official company email address is ready — this is the address to use for
        all work correspondence going forward.
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
        <Text style={{ fontSize: 13, color: "#64748B", margin: "0 0 4px" }}>
          Your official company email
        </Text>
        <Text style={{ fontSize: 15, color: "#0F172A", fontWeight: 600, margin: 0 }}>
          {officialEmail}
        </Text>
      </div>

      <Text style={{ fontSize: 14, color: "#334155", lineHeight: 1.6, margin: "0 0 12px" }}>
        Sign in to the Altus Corp Dashboard — the tool the team uses day-to-day —
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
        <Text style={{ fontSize: 13, color: "#64748B", margin: "0 0 4px" }}>Login email</Text>
        <Text style={{ fontSize: 15, color: "#0F172A", fontWeight: 600, margin: password ? "0 0 12px" : 0 }}>
          {loginEmail}
        </Text>
        {password ? (
          <>
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
          </>
        ) : null}
      </div>

      <Text style={{ fontSize: 14, color: "#334155", lineHeight: 1.6, margin: "0 0 16px" }}>
        Sign in here:{" "}
        <Link href={loginUrl} style={{ color: "#A80400" }}>
          {loginUrl}
        </Link>
        {password ? " — change your password anytime from your Profile." : " — use “Forgot password” on the login page to set your password."}
      </Text>

      <Heading style={{ fontSize: 15, color: "#0F172A", margin: "24px 0 8px" }}>
        Your first few days
      </Heading>
      <Text style={{ fontSize: 13.5, color: "#334155", lineHeight: 1.7, margin: "0 0 8px" }}>
        1. Sign in and complete your profile.<br />
        2. Read &amp; sign your company policies from the HR section.<br />
        3. Confirm your induction details (address, bank &amp; emergency contacts)
        — pre-filled from your joining form.<br />
        4. Say hello to your team and your reporting manager.
      </Text>

      <Text style={{ fontSize: 12, color: "#94A3B8", margin: "20px 0 0" }}>
        Questions? Reach the HR desk at{" "}
        <Link href={`mailto:${hrEmail}`} style={{ color: "#94A3B8" }}>
          {hrEmail}
        </Link>
        .
      </Text>
    </EmailLayout>
  );
}

export default WelcomeOfficialEmail;
