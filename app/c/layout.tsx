import type { ReactNode } from "react";
import type { Metadata } from "next";

export const dynamic = "force-dynamic";

/**
 * The PUBLIC candidate route group (`/c/...`) — outside `(app)` and outside
 * `/candidate`, so it inherits neither the employee shell nor `requireCandidate()`.
 * Whoever opens these pages is not signed in and is not supposed to be: the
 * access token in the URL is the entire authentication step (see
 * lib/hr/candidate/access-link.ts), and it is re-resolved server-side on every
 * request and every write.
 *
 * `/c` is listed in proxy.ts's PUBLIC_PATHS — without that the auth middleware
 * would 307 an applicant to /login, which is the exact thing this flow exists to
 * avoid.
 */

export const metadata: Metadata = {
  title: "Altus Corp — Candidate Form",
  // A form URL is a bearer credential. Keeping it out of search indexes and
  // referrer headers is cheap and removes the dumbest way one could leak.
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export default function PublicCandidateLayout({ children }: { children: ReactNode }) {
  return <div className="min-h-dvh bg-[#faf9fb]">{children}</div>;
}
