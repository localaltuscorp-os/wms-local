import type { ReactNode } from "react";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden">
      {/* ── Cinematic background — multi-color radial washes that drift ── */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, #FAFBFC 0%, #F5F5F7 60%, #EEF1F6 100%)",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -top-[20%] -left-[10%] w-[70vw] h-[70vw] rounded-full"
        style={{
          background:
            "radial-gradient(closest-side, rgba(225, 6, 0, 0.22), rgba(225, 6, 0, 0) 70%)",
          filter: "blur(8px)",
          animation: "auraDriftA 18s ease-in-out infinite",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-[25%] -right-[15%] w-[80vw] h-[80vw] rounded-full"
        style={{
          background:
            "radial-gradient(closest-side, rgba(168, 85, 247, 0.20), rgba(168, 85, 247, 0) 70%)",
          filter: "blur(8px)",
          animation: "auraDriftB 22s ease-in-out infinite",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute top-[20%] right-[10%] w-[55vw] h-[55vw] rounded-full"
        style={{
          background:
            "radial-gradient(closest-side, rgba(59, 130, 246, 0.16), rgba(59, 130, 246, 0) 70%)",
          filter: "blur(10px)",
          animation: "auraDriftC 26s ease-in-out infinite",
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute bottom-[15%] left-[10%] w-[40vw] h-[40vw] rounded-full"
        style={{
          background:
            "radial-gradient(closest-side, rgba(34, 197, 94, 0.12), rgba(34, 197, 94, 0) 70%)",
          filter: "blur(10px)",
          animation: "auraDriftA 30s ease-in-out infinite reverse",
        }}
      />

      {/* Faint dotted mesh — drifts very slowly for a sense of life */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.35]"
        style={{
          backgroundImage:
            "radial-gradient(rgba(15, 23, 42, 0.08) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
          maskImage:
            "radial-gradient(ellipse 80% 60% at 50% 40%, black 30%, transparent 75%)",
          WebkitMaskImage:
            "radial-gradient(ellipse 80% 60% at 50% 40%, black 30%, transparent 75%)",
          animation: "meshShift 26s ease-in-out infinite",
        }}
      />

      {/* Top accent strip — flows the dashboard's signature multi-color stripe */}
      <div
        aria-hidden
        className="absolute top-0 left-0 right-0 h-[3px]"
        style={{
          background:
            "linear-gradient(90deg, var(--color-altus-red) 0%, var(--color-rose) 20%, var(--color-purple) 40%, var(--color-blue) 60%, var(--color-green) 80%, var(--color-amber) 100%, var(--color-altus-red) 120%)",
          backgroundSize: "200% 100%",
          animation: "accentStripFlow 14s linear infinite",
        }}
      />

      {/* ── Stage ── */}
      <main className="relative z-10 flex min-h-screen items-center justify-center px-6 py-14 max-md:py-10">
        {/* The page decides its own width — login/forgot/set-password stay at
            ~460px; welcome stretches to a wider 720px grid. */}
        <div className="w-full">{children}</div>
      </main>

      {/* Bottom signature mark */}
      <div
        aria-hidden
        className="absolute bottom-4 left-0 right-0 z-10 text-center"
        style={{
          fontFamily: "var(--font-sans)",
          fontSize: 11,
          fontWeight: 600,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          color: "rgba(15, 23, 42, 0.32)",
        }}
      >
        Altus Corp
      </div>
    </div>
  );
}
