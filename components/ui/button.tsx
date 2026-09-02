"use client";
import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

type Variant = "primary" | "ghost" | "outline";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  asChild?: boolean;
}

// Brand-red across the board (per Sir 2026-07-17): every labeled button reads
// as the Altus red. `primary` is the full solid gradient; `outline`/`ghost` are
// still solid red but a touch softer so a Cancel next to a Save isn't a
// carbon-copy. Icon-only / pill / tab controls do NOT use this component.
const variantClass: Record<Variant, string> = {
  primary: "brand-btn text-white",
  ghost: "brand-btn text-white",
  outline: "brand-btn text-white",
};

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "outline", asChild, className, children, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2 px-4 h-10 text-sm font-medium rounded-chip focus-visible:outline-2 disabled:opacity-50",
          variantClass[variant],
          className,
        )}
        // Focus ring follows the module accent (amber inside the Goals shell,
        // Altus red everywhere else — goals-redesign design §6).
        style={{ outlineColor: "var(--module-accent, var(--color-altus-red))" }}
        {...props}
      >
        {children}
      </Comp>
    );
  },
);
Button.displayName = "Button";
