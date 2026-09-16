import { ResumeLinkForm } from "./resume-link-form";

export const dynamic = "force-dynamic";

/** Public: request a fresh interview-form link by email. See ./actions.ts for
 *  why this page cannot tell the visitor whether their address matched. */
export default function ResumeLinkPage() {
  return (
    <div className="grid min-h-dvh place-items-center px-6 py-16">
      <div className="w-full max-w-[440px]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/logo.png" alt="Altus Corp" className="mx-auto mb-7 h-10 w-auto" />
        <div className="rounded-2xl border border-hairline bg-white p-6 shadow-[0_30px_80px_-40px_rgba(15,23,42,0.4)]">
          <h1
            className="text-[22px] font-black text-ink-strong"
            style={{ fontFamily: "var(--font-display), system-ui, sans-serif", letterSpacing: "-0.02em" }}
          >
            Get your form link
          </h1>
          <p className="mt-1.5 text-[13.5px] leading-[1.6] text-ink-muted">
            Enter the email address you gave our HR team. If we have a form waiting for you, we&apos;ll send a
            fresh link to it — no account or password needed.
          </p>
          <ResumeLinkForm />
        </div>
      </div>
    </div>
  );
}
