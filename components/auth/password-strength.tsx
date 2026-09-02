"use client";

type Tier = {
  score: 0 | 1 | 2 | 3 | 4;
  label: string;
  color: string;
  hint: string;
};

export function scorePassword(pw: string): Tier {
  if (pw.length === 0) {
    return { score: 0, label: "", color: "transparent", hint: "" };
  }
  let s = 0;
  if (pw.length >= 8) s += 1;
  if (pw.length >= 12) s += 1;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) s += 1;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) s += 1;

  const tiers: ReadonlyArray<Tier> = [
    { score: 0, label: "Too short", color: "var(--color-altus-red)", hint: "At least 8 characters." },
    { score: 1, label: "Weak", color: "var(--color-altus-red)", hint: "Add length or a mix of cases." },
    { score: 2, label: "OK", color: "var(--color-amber)", hint: "Sprinkle in a number or symbol." },
    { score: 3, label: "Good", color: "var(--color-green)", hint: "Nice and sturdy." },
    { score: 4, label: "Strong", color: "var(--color-purple)", hint: "A fortress." },
  ];
  return tiers[s] ?? tiers[0]!;
}

export function PasswordStrength({ password }: { password: string }) {
  const tier = scorePassword(password);
  const segments = [0, 1, 2, 3];

  return (
    <div className="pt-1">
      <div className="flex items-center gap-1.5">
        {segments.map((i) => {
          const active = tier.score > i;
          return (
            <div
              key={i}
              className="h-[5px] flex-1 rounded-full overflow-hidden"
              style={{ background: "rgba(15, 23, 42, 0.08)" }}
            >
              <div
                className="h-full"
                style={{
                  width: active ? "100%" : "0%",
                  background: tier.color,
                  transition:
                    "width 360ms cubic-bezier(0.2, 0.7, 0.3, 1), background 220ms ease",
                  transitionDelay: `${i * 40}ms`,
                  boxShadow: active
                    ? `0 0 12px 0 color-mix(in srgb, ${tier.color} 60%, transparent)`
                    : "none",
                }}
              />
            </div>
          );
        })}
      </div>
      <div
        className="mt-2 flex items-center justify-between text-[12.5px] font-medium"
        style={{ minHeight: 16 }}
      >
        <span
          style={{
            color: tier.score >= 3 ? tier.color : "var(--color-ink-subtle)",
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            fontWeight: 700,
          }}
        >
          {tier.label}
        </span>
        <span style={{ color: "var(--color-ink-subtle)" }}>{tier.hint}</span>
      </div>
    </div>
  );
}
