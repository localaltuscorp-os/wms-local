export function DashboardFooter() {
  return (
    <footer
      className="mt-32"
      style={{
        background:
          "linear-gradient(180deg, var(--color-ink-strong) 0%, #020617 100%)",
        color: "#ffffff",
      }}
    >
      <div className="mx-auto max-w-[1600px] px-12 py-10 max-md:px-4 text-center">
        <div className="inline-flex items-center justify-center mb-4">
          <div
            className="inline-flex items-center rounded-lg bg-white px-3 py-2"
            style={{ boxShadow: "0 4px 14px rgba(0, 0, 0, 0.25)" }}
          >
            <img
              src="/logo.png"
              alt="Altus Corp"
              style={{ height: 40, width: "auto", display: "block" }}
            />
          </div>
        </div>
        <p
          className="mt-3 text-xs"
          style={{ color: "rgba(255, 255, 255, 0.55)" }}
        >
          © Altus Corp 2025–2035 · All rights reserved
        </p>
      </div>
    </footer>
  );
}
