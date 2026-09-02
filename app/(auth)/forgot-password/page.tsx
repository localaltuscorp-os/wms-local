import Link from "next/link";
import { redirect } from "next/navigation";
import type { Route } from "next";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { BrandStack } from "@/components/auth/brand-stack";
import { AuthCard } from "@/components/auth/auth-card";
import { getCurrentEmployee } from "@/lib/auth/current";

// Never static: this page resolves the current employee (to bounce anyone
// already signed in), which reads the session cookie. Next bails it out to
// dynamic rendering regardless; declaring it skips the pointless static probe
// at build time — and the DYNAMIC_SERVER_USAGE stack trace that probe logs.
export const dynamic = "force-dynamic";

export default async function ForgotPasswordPage() {
  const me = await getCurrentEmployee();
  if (me && me.isActive) {
    redirect("/hub" as Route);
  }

  return (
    <div className="mx-auto w-full max-w-[460px]">
      <BrandStack
        eyebrow="Lost your way?"
        title="Reset your password"
        subtitle="Pop in your work email and we'll send a reset link. The whole thing takes under a minute."
      />
      <AuthCard>
        <ForgotPasswordForm />
        <div
          className="mt-5 pt-5 text-center text-[12px]"
          style={{
            borderTop: "1px solid rgba(15, 23, 42, 0.06)",
            color: "var(--color-ink-subtle)",
          }}
        >
          Remembered it?{" "}
          <Link href={"/login" as Route} className="auth-link font-semibold">
            Back to sign in
          </Link>
        </div>
      </AuthCard>
    </div>
  );
}
