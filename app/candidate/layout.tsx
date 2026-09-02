import type { ReactNode } from "react";
import { requireCandidate } from "@/lib/auth/current";
import { CandidateSignOut } from "@/components/hr/candidate/candidate-sign-out";

export const dynamic = "force-dynamic";

/**
 * The candidate route group — OUTSIDE `(app)`, so it never inherits the employee
 * nav/gates. Gated to candidate guest-accounts only (a normal employee is
 * bounced to /hub; a logged-out visitor is bounced to /login by proxy + the
 * requireCandidate session check).
 */
export default async function CandidateLayout({ children }: { children: ReactNode }) {
  const me = await requireCandidate();
  return (
    <div className="min-h-dvh bg-[#faf9fb]">
      {/* A candidate is forked away from every other route, so this bar is the
          ONLY place they can see who they are signed in as and sign out. Without
          it there was no way to end the session at all — which matters most on
          the shared office machine these forms usually get filled on. */}
      <header className="flex items-center justify-between gap-3 border-b border-hairline bg-white/90 px-6 py-3 backdrop-blur max-md:px-4 print:hidden">
        <span className="min-w-0 truncate text-[13px] font-semibold text-ink-muted">
          Signed in as <span className="font-bold text-ink-strong">{me.name || me.email}</span>
        </span>
        <CandidateSignOut />
      </header>
      {children}
    </div>
  );
}
