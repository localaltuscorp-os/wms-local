import type { Metadata } from "next";
import { LegalShell } from "@/components/legal/legal-shell";

export const metadata: Metadata = {
  title: "Privacy Policy · Altus Corp Dashboard",
  description:
    "How the Altus Corp operations dashboard collects, stores, and shares personal data — written for the staff and contractors who use it daily.",
};

export default function PrivacyPage() {
  return (
    <LegalShell
      eyebrow="Altus Corp · Legal"
      title="Privacy Policy"
      lastUpdated="2026-05-14"
      intro="This policy explains what personal data flows through the Altus Corp dashboard, why it's collected, where it sits, and what controls you have. Written plainly so you can read it once and trust what's happening behind the chrome."
    >
      <h2>1 · The short version</h2>
      <p>
        The dashboard collects your name, work email, role, department, and a
        record of the tasks you create, edit, or work on. Data sits in Supabase
        (Singapore) and Firebase Auth (US). We send you email notifications via
        Resend and — if your admin enables it — Slack DMs, WhatsApp messages,
        and Web Push notifications. We do not sell, rent, or share your data
        with anyone outside Altus Corp's narrow list of operational
        sub-processors. You can request a copy of your data or have it
        deactivated by writing to your administrator.
      </p>

      <h2>2 · Who controls the data</h2>
      <p>
        <strong>Data controller:</strong> Altus Corp — the operational data
        (tasks, comments, assignments, statuses) is theirs.
      </p>
      <p>
        Altus Corp operates the dashboard for internal use only. We do not
        use your data for any purpose other than running the dashboard.
      </p>

      <h2>3 · What we collect</h2>
      <h3>Account identity</h3>
      <ul>
        <li>Full name (as entered by the inviting admin)</li>
        <li>Work email (used as your sign-in identifier)</li>
        <li>Role on the team (doer, initiator, or both)</li>
        <li>Department (free-text legacy column + canonical FK; admin-managed)</li>
        <li>Whether you're an administrator (boolean flag, admin-toggled)</li>
        <li>Firebase UID (issued automatically by Firebase Authentication)</li>
        <li>Avatar URL, if you have one (optional)</li>
        <li>Account state — invited at, joined at, active / deactivated</li>
      </ul>
      <h3>Operational content</h3>
      <ul>
        <li>Tasks you create, edit, or are assigned (title, subject, description, internal notes)</li>
        <li>Status changes you make and the timeline of every action on a task</li>
        <li>Comments you post on tasks</li>
        <li>Notifications generated for you (in-app rows, email send receipts, delivered channel array)</li>
      </ul>
      <h3>Channel-specific identifiers (only if enabled)</h3>
      <ul>
        <li>Slack member ID — looked up automatically by email when Slack notifications are enabled at the workspace level</li>
        <li>WhatsApp phone number in E.164 format — entered by an admin with your consent</li>
        <li>Web Push browser subscription endpoint + per-device encryption keys — captured when you click "Enable push notifications" on /profile</li>
      </ul>
      <h3>Technical metadata</h3>
      <ul>
        <li>Authentication session cookie (the magic <code>__session</code> cookie, signed with our cookie secrets)</li>
        <li>Server logs (request paths, status codes, error stacks) retained for debugging — never enriched with operational content</li>
      </ul>

      <h2>4 · Why we collect it</h2>
      <ul>
        <li><strong>To let you sign in.</strong> Email + Firebase UID; nothing more.</li>
        <li><strong>To run the operations workflow.</strong> Tasks, assignments, status transitions, approvals — the dashboard's core purpose.</li>
        <li><strong>To notify the right people at the right time.</strong> The fan-out matrix is locked in code; you don't get notifications for events you aren't a participant in.</li>
        <li><strong>To audit who did what, when.</strong> Every task event is logged for Altus Corp's internal compliance.</li>
        <li><strong>To deliver on the channels you've consented to.</strong> Email is on by default; Slack auto-discovers via email; WhatsApp requires explicit admin-recorded consent; Web Push requires your browser permission.</li>
      </ul>

      <h2>5 · Where it sits — sub-processors</h2>
      <p>
        We use a small, named set of third parties. None of them get more data
        than they need to deliver their narrow function:
      </p>
      <ul>
        <li>
          <strong>Supabase</strong> (Postgres database, Singapore region) —
          stores all operational data behind row-level security policies that
          gate every read and write to the signed-in employee or admin.
        </li>
        <li>
          <strong>Firebase Authentication</strong> (US region) — stores your
          email, password hash, and session metadata. Note: Firebase Auth
          cannot currently be hosted in <code>asia-south1</code>; this is a
          compliance flag we are tracking against India's DPDP Act 2027
          deadline.
        </li>
        <li>
          <strong>Vercel</strong> — application hosting + edge-runtime
          middleware. Reads only the auth cookie + the request body for each
          page render.
        </li>
        <li>
          <strong>Resend</strong> — transactional email delivery (invites,
          notifications, daily digest). Sees email address + body of each
          message.
        </li>
        <li>
          <strong>Slack</strong> (if your workspace enables it) — the bot
          token + your Slack user ID + the body of each notification message.
          Workspace install scopes are read-only beyond <code>chat:write</code>{" "}
          and <code>users:read.email</code>.
        </li>
        <li>
          <strong>Meta WhatsApp Cloud API</strong> (if enabled) — your phone
          number + the parameter values that fill the approved utility
          templates. Each message is bound to a Meta-approved template; we
          cannot send freeform content.
        </li>
        <li>
          <strong>Google / Mozilla / Apple Push Services</strong> (if you
          enable Web Push) — the encrypted notification payload, routed to
          your device via the browser vendor's push service. We never see
          the device-level identifier; we only hold the W3C subscription
          endpoint.
        </li>
      </ul>

      <h2>6 · What we DON'T do</h2>
      <ul>
        <li>We don't sell your data to anyone, ever.</li>
        <li>We don't run ads or analytics tracking on the dashboard.</li>
        <li>We don't share your information with other parties outside the sub-processors listed above.</li>
        <li>We don't profile you for marketing.</li>
      </ul>

      <h2>7 · How long we keep it</h2>
      <p>
        Active accounts: indefinitely, while the engagement is live. Deactivated
        accounts: the row is preserved with{" "}
        <code>is_active = false</code> so historical attributions on tasks
        remain accurate — Altus Corp's audit needs require this. Hard
        deletion is not exposed in the dashboard; if you want a row purged,
        that becomes a manual ops runbook with Altus Corp's legal point of
        contact.
      </p>
      <p>
        Server logs: 30 days at the Vercel layer. Email send receipts: 30 days
        at Resend.
      </p>

      <h2>8 · Your rights</h2>
      <p>
        Under India's Digital Personal Data Protection Act 2023 (DPDP Act,
        enforced from May 2027) and as a matter of good faith now, you have:
      </p>
      <ul>
        <li>
          <strong>The right to know.</strong> Ask your Altus Corp
          administrator for a copy of the data the dashboard holds about you.
          We support CSV exports on the employees + tasks tables out of the
          box.
        </li>
        <li>
          <strong>The right to correct.</strong> Name, email, role, department,
          channel preferences — all editable. Either edit them in{" "}
          <code>/profile</code> yourself or ask an admin.
        </li>
        <li>
          <strong>The right to deactivate.</strong> Ask an admin to deactivate
          your account; further sign-in is blocked immediately.
        </li>
        <li>
          <strong>The right to withdraw consent.</strong> WhatsApp opt-in can be
          flipped off by replying STOP to any WhatsApp notification — the
          webhook flips your flag within seconds. Web Push opt-in is revoked
          via your browser's notification settings. Email + in-app inbox
          delivery cannot be fully suppressed without deactivation, because
          they are part of the operational record.
        </li>
      </ul>

      <h2>9 · Cookies</h2>
      <p>
        We set exactly one cookie: <code>__session</code>, an HTTP-only,
        sameSite=lax, signed JWT cookie that represents your Firebase session.
        It expires after 5 days of inactivity and is revoked the moment an
        admin deactivates your account. No analytics cookies, no advertising
        cookies, no third-party trackers.
      </p>

      <h2>10 · Security</h2>
      <p>
        Authentication is gated by Firebase Authentication's standard
        protections (password hashing, rate-limited sign-in, revocable
        sessions). Every database read and write passes through Supabase's
        row-level security policies. Service-role credentials are server-only,
        never exposed to the browser. The session cookie is signed with two
        rotating secrets to allow key rotation without forcing global sign-out.
      </p>
      <p>
        If you spot a security issue, please write to{" "}
        <a href="mailto:heteshvichare927@gmail.com">heteshvichare927@gmail.com</a>{" "}
        before disclosing it publicly. We will reply within 72 hours.
      </p>

      <h2>11 · Changes</h2>
      <p>
        We may update this policy as the dashboard evolves, particularly as
        we cut over to DPDP-compliant Indian data residency before May 2027.
        Material changes will be announced in the dashboard's notification
        feed and via email to all active users.
      </p>

      <h2>12 · Contact</h2>
      <p>
        Privacy questions:{" "}
        <a href="mailto:heteshvichare927@gmail.com">heteshvichare927@gmail.com</a>.
        Operational data requests (export your row, deactivate your account,
        correct a record): your Altus Corp administrator.
      </p>
    </LegalShell>
  );
}
