/**
 * Tall brand stack for the auth surface — mirrors the dashboard header's
 * Altus Corp wordmark + brand pill treatment but stacked vertically
 * and right-sized for centered card layouts.
 */
export function BrandStack({
  eyebrow,
  title,
  subtitle,
}: {
  eyebrow: string;
  title: string;
  subtitle?: string;
}) {
  return (
    <div
      className="mb-8 text-center"
      style={{ animation: "brandFadeIn 700ms cubic-bezier(0.2, 0.7, 0.3, 1) both" }}
    >
      <div className="mb-6 flex items-center justify-center">
        <img
          src="/logo.png"
          alt="Altus Corp"
          style={{ height: 110, width: "auto", display: "block" }}
        />
      </div>

      <div
        className="mx-auto mt-5 mb-3 h-px w-16"
        style={{
          background:
            "linear-gradient(90deg, transparent, rgba(225, 6, 0, 0.45), transparent)",
        }}
      />

      <div
        className="text-table-head"
        style={{ color: "rgb(168, 4, 0)", letterSpacing: "0.14em" }}
      >
        {eyebrow}
      </div>

      <h2
        className="mt-3 font-serif text-[#0F172A]"
        style={{
          fontStyle: "italic",
          fontSize: 30,
          lineHeight: 1.05,
          letterSpacing: "-0.02em",
          fontWeight: 400,
        }}
      >
        {title}
      </h2>

      {subtitle && (
        <p
          className="mt-2 mx-auto max-w-[360px] text-[14px] leading-[1.55]"
          style={{ color: "var(--color-ink-subtle)" }}
        >
          {subtitle}
        </p>
      )}
    </div>
  );
}
