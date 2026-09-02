import { Suspense } from "react";
import { SetPasswordForm } from "@/components/auth/set-password-form";
import { BrandStack } from "@/components/auth/brand-stack";
import { AuthCard } from "@/components/auth/auth-card";

export default function SetPasswordPage() {
  return (
    <div className="mx-auto w-full max-w-[460px]">
      <BrandStack
        eyebrow="Almost in"
        title="Set your password"
        subtitle="Pick something memorable but tough — you'll use it every day to step into operations."
      />
      <AuthCard>
        <Suspense
          fallback={
            <p
              className="text-center text-[13px]"
              style={{ color: "var(--color-ink-subtle)" }}
            >
              Loading…
            </p>
          }
        >
          <SetPasswordForm />
        </Suspense>
      </AuthCard>
    </div>
  );
}
